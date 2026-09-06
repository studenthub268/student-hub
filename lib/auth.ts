import NextAuth, { type NextAuthConfig } from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from './db';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { users, accounts, sessions, verificationTokens } from './db/schema';
import { eq } from 'drizzle-orm';
import { checkRateLimit } from './actions/rate-limit';
import { POLICY_VERSION } from './constants';

// No eager AUTH_SECRET throw here: it killed `next build` whenever the var
// was absent (e.g. CI without secrets configured). NextAuth itself raises
// MissingSecret at runtime if auth is actually invoked without one.
const authConfig: NextAuthConfig = {
  get secret() {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error(
        'AUTH_SECRET is missing. Generate one with: openssl rand -base64 32'
      );
    }
    return secret;
  },
  // Table mappings are REQUIRED: without them the adapter invents its own
  // default tables named "user"/"account" (singular), and every OAuth
  // callback dies with AdapterError (42P01) → shown as "Server error".
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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

        const [user] = await db.select().from(users).where(eq(users.email, email));

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
        await db
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

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
