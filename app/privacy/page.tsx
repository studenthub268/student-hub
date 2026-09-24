import Link from "next/link";
import { LAST_UPDATED, POLICY_VERSION } from "@/lib/generated/deploy-version";

export const metadata = {
  title: "Privacy Policy — Student Hub",
  description:
    "How Student Hub collects, uses, and protects your data: what we store, cookies, processors, retention, and your rights. No ads, no tracking, no data selling — ever.",
  alternates: { canonical: "/privacy" },
};

// Shared section/paragraph styles with /terms — kept local (duplicated) so
// the two legal pages never couple each other's layout changes.
function H({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 pt-10 pb-3 text-xl font-bold tracking-tight text-foreground border-b border-line"
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="py-2 leading-relaxed">{children}</p>;
}

function LI({ children }: { children: React.ReactNode }) {
  return <li className="leading-relaxed pl-1">{children}</li>;
}

function C({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-bold text-accent underline decoration-accent/30 underline-offset-2 transition-colors hover:decoration-accent"
    >
      {children}
    </Link>
  );
}

function Bold({ children }: { children: React.ReactNode }) {
  return <strong className="font-bold text-foreground">{children}</strong>;
}

export default function PrivacyPage() {
  return (
    <div className="bg-surface min-h-screen">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20 text-base text-foreground/80">

        {/* Hero header */}
        <header>
          <div className="rounded-[2rem] border-2 border-ink bg-ink on-ink p-8 sm:p-12 shadow-hard-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-neutral-800/40 via-ink to-ink opacity-50"></div>
            <div className="relative z-10">
              <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-60">
                Student Hub · Legal
              </p>
              <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
                Privacy Policy
              </h1>
              <p className="mt-4 max-w-xl leading-relaxed opacity-80">
                Student Hub is a student-run platform where university students share
                study material. This policy explains what data we collect, why,
                and the control you have over it. The short version: we collect
                only what the site needs to work, we never sell your data, and
                you can delete your account and content yourself at any time.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-background/30 px-3.5 py-1 text-xs font-bold tracking-wider opacity-90">
                  Last updated {LAST_UPDATED}
                </span>
                <span className="rounded-full bg-accent px-3.5 py-1 text-xs font-bold tracking-wider text-accent-contrast">
                  Version {POLICY_VERSION}
                </span>
              </div>
            </div>
          </div>
        </header>

        <H id="data">1. Data we collect</H>
        <P>We collect the minimum needed to run the platform:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI>
            <Bold>Account data</Bold> — your name, email address, and a
            password stored only as a bcrypt hash; if you sign in with Google
            or GitHub, your name, verified email, and profile picture from the
            provider instead.
          </LI>
          <LI>
            <Bold>Content data</Bold> — the resources you upload (file, title,
            subject, type, description) and the likes and reports you make.
          </LI>
          <LI>
            <Bold>Consent data</Bold> — when you accepted the{" "}
            <C href="/terms">terms of service</C> and which policy version
            applied.
          </LI>
          <LI>
            <Bold>Security data</Bold> — IP addresses, used for rate limiting
            and abuse blocking, and logs of blocked attack attempts.
          </LI>
          <LI>
            <Bold>Email metadata</Bold> — delivery events (sent, delivered,
            bounced) so we can detect broken addresses and stop mailing them.
          </LI>
          <LI>
            <Bold>Aggregate analytics</Bold> — anonymous daily page-view counts
            per page (path only, referrer host only). No cookies, no IP
            addresses, no user identifiers, nothing personal.
          </LI>
        </ul>
        <P>
          We do not collect payment information or precise location, and we do
          not use advertising trackers.
        </P>

        <H id="data-use">2. How we use your data</H>
        <P>
          To operate your account, sessions, and uploads; to send transactional
          email such as verification, welcome, sign-in alerts, and password
          resets; to keep the platform safe by detecting attacks and blocking
          abusive traffic; and to understand overall site usage through
          aggregate statistics — never your individual data. Your email address
          is used only for account security and service communication, never
          marketing.
        </P>

        <H id="cookies">3. Cookies and local storage</H>
        <P>
          We use strictly necessary cookies only: a session cookie to keep you
          signed in (30 days), plus CSRF-protection cookies during sign-in
          flows, and browser local storage where the app needs it to function
          offline and to remember your cookie-banner choice. No analytics,
          advertising, or third-party tracking cookies are set.
        </P>

        <H id="sharing">4. Data sharing and processors</H>
        <P>Your data is processed only by the services that make the platform work:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI>
            <Bold>Vercel</Bold> — application hosting;
          </LI>
          <LI>
            <Bold>Neon</Bold> — hosted PostgreSQL database;
          </LI>
          <LI>
            <Bold>Cloudflare R2</Bold> — storage for uploaded files;
          </LI>
          <LI>
            <Bold>Resend</Bold> — transactional email delivery; and
          </LI>
          <LI>
            <Bold>Google and GitHub</Bold> — if you choose their sign-in, they
            authenticate you and share your basic profile with us.
          </LI>
        </ul>
        <P>
          We may disclose information if required by law, or to protect the
          rights, property, or safety of the platform and its users.
        </P>

        <H id="your-rights">5. Your rights and data retention</H>
        <P>You have the right to:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI>
            <Bold>Access</Bold> — request a copy of the personal data we hold
            about you;
          </LI>
          <LI>
            <Bold>Correction</Bold> — fix inaccurate profile information;
          </LI>
          <LI>
            <Bold>Deletion</Bold> — delete your account and data yourself,
            anytime, from the Danger Zone on your <C href="/profile">profile
            page</C>. This permanently removes your profile, uploads and their
            files, likes, and reports; security records such as blocked IPs are
            kept only as long as needed; and
          </LI>
          <LI>
            <Bold>Objection</Bold> — object to processing by deleting your
            account or specific content.
          </LI>
        </ul>
        <P>
          Verification and password-reset tokens expire automatically (24 hours
          and 1 hour respectively). Email delivery events are retained for 90
          days and then deleted.
        </P>

        <H id="children">6. Children&apos;s privacy</H>
        <P>
          Student Hub is intended for university students and is not directed
          at children under 13 (or under 16 in the EEA/UK). We do not knowingly
          collect personal data from children. If you believe a child has
          created an account, let us know via the <C href="/contact">contact
          page</C> and we will delete it promptly.
        </P>

        <H id="security">7. Security</H>
        <P>
          We protect your data with bcrypt password hashing, encrypted
          connections (HTTPS/TLS) everywhere, strict security headers,
          parameterized database queries, rate limiting with automated attack
          blocking, and least-privilege access to storage and database. No
          system is perfectly secure — if you discover a vulnerability, please
          report it responsibly through the <C href="/contact">contact page</C>
          . We appreciate it.
        </P>

        <H id="contact">8. Contact</H>
        <P>
          Questions about your data or this policy: reach us through the{" "}
          <C href="/contact">contact page</C>. In short — your data stays
          yours.
        </P>

        <div className="mt-14 pt-8 border-t-2 border-ink text-sm font-medium">
          <C href="/terms">Read the Terms of Service</C>
          <span className="mx-2 text-foreground/60">·</span>
          <C href="/">Return to Student Hub</C>
        </div>
      </div>
    </div>
  );
}
