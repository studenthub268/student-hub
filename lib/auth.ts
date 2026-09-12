import NextAuth, { type NextAuthConfig } from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDb } from './db';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { users, accounts, sessions, verificationTokens } from './db/schema';
import { eq } from 'drizzle-orm';
import { checkRateLimit } from './actions/rate-limit';
import { POLICY_VERSION } from './constants';
import { sendSignInNotificationEmail, sendWelcomeEmail } from './email';

// One "new sign-in" notification per user+provider per hour, max — guards
// against rapid re-auth loops without needing a DB table. Module-level, so
// per serverless instance; the daily per-address email limit in lib/email
// backs this up globally.
const SIGNIN_NOTIFY_DEDUPE_MS = 60 * 60 * 1000;
const lastSignInNotified = new Map<string, number>();

// Welcome-email guard: one welcome per user per serverless instance. The
// linkAccount event itself fires only once per provider identity, but a
// user who links BOTH Google and GitHub would otherwise get two welcomes.
const welcomedUserIds = new Set<string>();

// No eager AUTH_SECRET check or adapter construction here: either would
// kill `next build` in environments without secrets (e.g. CI). NextAuth's
// lazy-config form defers everything until the first real request, and
// NextAuth raises MissingSecret at runtime if auth runs without a secret.

/**
 * Retry an adapter call once when Neon's HTTP driver fails with a transient
 * network error (cold start, connection reset, rate limit). This class of
 * failure previously surfaced to users as the bare "Server error" page on
 * Google/GitHub sign-in, so it must never escape the adapter directly.
 */
const TRANSIENT_DB_ERROR =
  /fetch failed|econnreset|etimedout|econnrefused|socket hang up|terminated|unexpected server response|network|internal server error|too many requests/i;

function withTransientRetry<A extends object>(adapter: A): A {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const original: unknown = Reflect.get(target, prop, receiver);
      if (typeof original !== "function") return original;
      const fn = original as (...args: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]) => {
        try {
          return await fn.apply(target, args);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!TRANSIENT_DB_ERROR.test(message)) throw error;
          console.warn(
            `[auth] transient DB error in adapter.${String(prop)} — retrying once: ${message}`
          );
          await new Promise((resolve) => setTimeout(resolve, 250));
          return fn.apply(target, args);
        }
      };
    },
  });
}
const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  get adapter() {
    // Built on access, not at module load. getDb() returns the real
    // NeonHttpDatabase (not the lazy proxy) because DrizzleAdapter's
    // prototype-based `is()` check fails on proxies.
    // Table mappings are REQUIRED: without them the adapter invents its own
    // default tables named "user"/"account" (singular), and every OAuth
    // callback dies with AdapterError (42P01) → shown as an error page.
    // Transient Neon failures are retried once so a blip can't kill sign-in.
    return withTransientRetry(DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }));
  },
  session: { strategy: 'jwt' },
  // SignInError-kind failures (OAuthAccountNotLinked etc.) must land on OUR
  // login page — the default NextAuth sign-in page is an off-brand page with
  // its own provider buttons that confuses visitors. All other auth failures
  // land on our error page instead of the default bare "Server error" wall.
  // /auth/* is public in the proxy, so it can never loop.
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      // Connect the GitHub identity to an existing email/password account
      // with the same address instead of dead-ending on
      // OAuthAccountNotLinked ("sign in with the same account you used
      // originally"). Safe: GitHub only reports VERIFIED emails, and our
      // signup flow verifies email ownership too — both channels have
      // proven control of the address.
      allowDangerousEmailAccountLinking: true,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Same as GitHub — Google always verifies the account email before
      // it can be used for sign-in, so linking by address is safe.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;

        // Rate limit: 10 login attempts per 15 minutes per email
        const isAllowed = await checkRateLimit(`login:${email}`, 10, 900);
        if (!isAllowed) return null;

        const [user] = await getDb().select().from(users).where(eq(users.email, email));

        if (!user || !user.passwordHash) return null;

        // Unverified users MAY sign in: a persistent top-of-page banner nags
        // them to verify on every page and uploads are gated until verified.
        // Blocking login entirely left the banner nothing to show for.

        const isValid = await bcrypt.compare(credentials.password as string, user.passwordHash);

        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  events: {
    // OAuth users never see the signup form, so their policy consent is the
    // moment they first sign in via the provider. Record it exactly once —
    // the Drizzle adapter creates the user, then this stamps consent.
    // Note: users who signed up with email/password keep the consent recorded
    // at signup even if their passwordHash is later removed.
    async createUser({ user }) {
      if (!user.id) return;
      try {
        await getDb()
          .update(users)
          .set({ acceptedTermsAt: new Date(), termsVersion: POLICY_VERSION })
          .where(eq(users.id, user.id));
      } catch (error) {
        console.error('Failed to record policy consent for OAuth user:', error);
      }
    },
    // Professional touch, like the major platforms: email the user on every
    // sign-in (Google, GitHub, or email/password) — "New sign-in to your
    // account". Sessions last 30 days, so this fires rarely — and the dedupe
    // above keeps rapid re-auth loops from spamming. Best-effort: a
    // notification failure must never break or slow-fail the sign-in itself.
    async signIn({ user, account }) {
      if (!account || !user.id || !user.email) return;
      const providerLabel =
        account.provider === 'google' ? 'Google'
        : account.provider === 'github' ? 'GitHub'
        : 'Email & password';

      const key = `${user.id}:${account.provider}`;
      const now = Date.now();
      const last = lastSignInNotified.get(key);
      if (last && now - last < SIGNIN_NOTIFY_DEDUPE_MS) return;
      if (lastSignInNotified.size > 5000) lastSignInNotified.clear();
      lastSignInNotified.set(key, now);

      try {
        const result = await sendSignInNotificationEmail(user.email, providerLabel);
        if (!result.success) {
          console.warn(`[auth] Sign-in notification not sent to ${user.email}: ${result.error}`);
        }
      } catch (error) {
        console.error('[auth] Sign-in notification failed:', error);
      }
    },
    // Fires exactly once per provider identity — a fresh OAuth signup OR an
    // existing password account linking Google/GitHub for the first time.
    // Either way it is the user's activation moment: introduce Student Hub.
    // Best-effort — never break the sign-in because of a welcome email.
    async linkAccount({ user, account }) {
      if (account.provider !== 'google' && account.provider !== 'github') return;
      if (!user.id || !user.email) return;
      if (welcomedUserIds.has(user.id)) return;
      welcomedUserIds.add(user.id);
      try {
        const result = await sendWelcomeEmail(user.email, user.name);
        if (!result.success) {
          console.warn(`[auth] Welcome email not sent to ${user.email}: ${result.error}`);
        }
      } catch (error) {
        console.error('[auth] Welcome email failed:', error);
      }
    },
  },
  callbacks: {
    // Runs with `user` ONLY at sign-in; every other call must return the
    // token untouched.
    async jwt({ token, user, account, profile }) {
      if (user?.id && account && account.provider !== "credentials") {
        // OAuth sign-in: make the provider's avatar authoritative. Critical
        // for accounts LINKED via allowDangerousEmailAccountLinking — their
        // user row was created by email/password signup with image = null,
        // and the adapter never back-fills it, so the Google/GitHub profile
        // picture silently never showed (initials chip instead).
        const oauthProfile = profile as Record<string, unknown> | null | undefined;
        const oauthImage = (oauthProfile?.["picture"] ?? oauthProfile?.["avatar_url"]) as
          | string
          | undefined
          | null;
        const updates: { image?: string; name?: string; emailVerified?: Date } = {};
        if (typeof oauthImage === "string" && oauthImage) {
          // Live in the token too — the default token was built from the DB
          // row, which is null for linked accounts until the write below.
          token.picture = oauthImage;
          if (oauthImage !== user.image) updates.image = oauthImage;
        }
        // OAuth providers only hand out VERIFIED email addresses, so treat
        // the email as verified — otherwise unverified-email checks (login
        // gate, verification banner) wrongly punish OAuth users.
        if (!("emailVerified" in user) || !user.emailVerified) updates.emailVerified = new Date();
        if (!user.name && typeof oauthProfile?.["name"] === "string" && oauthProfile["name"]) {
          token.name = oauthProfile["name"] as string;
          updates.name = oauthProfile["name"] as string;
        }
        if (Object.keys(updates).length > 0) {
          try {
            await getDb().update(users).set(updates).where(eq(users.id, user.id));
          } catch (error) {
            // Never block sign-in because of a profile sync hiccup.
            console.error("[auth] Failed to sync OAuth profile data:", error);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};

// signIn is intentionally not exported from NextAuth: server-side sign-in has
// no caller — login flows use the client helper from next-auth/react. Fewer
// exports on a "use server"-adjacent module = smaller callable surface.
const nextAuth = NextAuth(async () => authConfig);

// ── Clerk migration phase 2 ─────────────────────────────────────────
// Session-source-agnostic auth(): the ONE function all 11 server files
// call, keeping the exact NextAuth shape ({ session: { user: { id, email,
// name, image } } } | null) so call sites stay untouched. With Clerk keys
// configured it reads the Clerk session instead; without keys it is a
// pass-through to NextAuth. The Postgres `users` row remains the source of
// truth for email/name during the migration (Clerk identity → DB lookup by
// email; phase 3 adds a users.clerkId column for the durable mapping).
const clerkEnabled = !!(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

type AppUser = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  expires: string;
};

async function clerkAuth(): Promise<AppUser | null> {
  const { auth: clerkAuthFn } = await import("@clerk/nextjs/server");
  const { userId, sessionClaims } = await clerkAuthFn();
  if (!userId) return null;
  const claimEmail = sessionClaims?.emailAddress;
  const email = typeof claimEmail === "string" ? claimEmail : null;
  if (!email) return null;
  // Map the Clerk identity to the Postgres user row (email join during
  // phase 2; becomes a clerkId lookup in phase 3).
  try {
    const { db } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const row = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!row) return null; // Clerk-signed-in but not yet backfilled → no session
    return {
      user: {
        id: row.id,
        name: row.name ?? null,
        email: row.email,
        image: row.image ?? null,
      },
      // NextAuth's Session shape requires expires; use the Clerk JWT's real
      // exp claim (unix seconds) so consumers see a genuine expiry.
      expires: sessionClaims?.exp
        ? new Date((sessionClaims.exp as number) * 1000).toISOString()
        : new Date(Date.now() + 7 * 86400_000).toISOString(),
    };
  } catch (error) {
    console.error("[auth] Clerk→DB user lookup failed:", error);
    return null;
  }
}

// Dual-read during the migration: a Clerk session wins; otherwise fall
// back to the NextAuth session. Both sign-in paths stay live until the
// phase-3 cutover deletes the NextAuth flow — a user signed in through
// either system gets a session, not just the one that loaded last.
export const auth = async () => {
  if (clerkEnabled) {
    try {
      const clerkUser = await clerkAuth();
      if (clerkUser) return clerkUser;
    } catch (error) {
      // Any Clerk failure (unmounted provider, token issue) must degrade to
      // the NextAuth session, never a 500.
      console.error("[auth] Clerk session read failed; falling back to NextAuth:", error);
    }
  }
  return nextAuth.auth();
};
// Explicit NextAuth session read — for proxy.ts's middleware pipeline, which
// must NOT call Clerk's auth() (it is invalid re-entrant inside
// clerkMiddleware) and keeps gating on the NextAuth session of record until
// phase-3 cutover.
export const nextAuthAuth = nextAuth.auth;
// NextAuth's signOut stays exported for the current client flows until
// cutover (phase 3) deletes it.
export const { handlers, signOut } = nextAuth;
