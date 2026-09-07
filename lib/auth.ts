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

        // Block unverified users — they must verify their email first
        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

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
  },
  callbacks: {
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(async () => authConfig);
