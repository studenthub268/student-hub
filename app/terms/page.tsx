import Link from "next/link";
import { POLICY_VERSION } from "@/lib/constants";

export const metadata = {
  title: "Terms & Privacy — Student Hub",
  description:
    "Terms of Service and Privacy Policy for Student Hub: accounts, acceptable use, copyright, data collection, cookies, retention, and your rights.",
};

// Single source of truth for the version lives in lib/constants.ts — it is the
// same value recorded with each user's terms acceptance at signup.
const LAST_UPDATED = "September 10, 2026";

function H({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 pt-10 pb-3 text-xl font-bold tracking-tight text-black border-b border-black/10"
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
    <Link href={href} className="text-black underline decoration-black/30 underline-offset-2 hover:decoration-[#0D9488] hover:text-[#0D9488]">
      {children}
    </Link>
  );
}

export default function TermsPage() {
  return (
    <div className="bg-white min-h-screen">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:py-20 text-[15px] text-black/80">

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40">Student Hub</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-black">
          Terms of Service &amp; Privacy Policy
        </h1>
        <p className="mt-4 leading-relaxed">
          Student Hub is a free platform where university students share study material — notes,
          past papers, quizzes, and assignments. This document covers the rules of the platform
          (Part I) and how we handle your data (Part II). It applies to everyone who visits or
          uses the site.
        </p>
        <p className="mt-4 text-sm text-black/50">
          Last updated {LAST_UPDATED} &nbsp;·&nbsp; Version {POLICY_VERSION}
        </p>

        <hr className="my-10 border-black/10" />

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40">Part I</p>
        <h2 className="mt-1 mb-2 text-2xl font-bold tracking-tight text-black">Terms of Service</h2>

        <H id="about">1. About these terms</H>
        <P>
          By creating an account or using Student Hub in any way, you agree to these terms. If you
          do not agree with any part of them, please don&apos;t use the platform. We may update
          these terms from time to time; the version number and date at the top of this page tell
          you whether something has changed, and continuing to use the site after a change means
          you accept it.
        </P>

        <H id="accounts">2. Accounts and eligibility</H>
        <P>To create an account you must:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI>use a valid email address that you control, and verify it before signing in;</LI>
          <LI>be a student, educator, or otherwise using the platform for personal, non-commercial study purposes;</LI>
          <LI>keep your password confidential and take responsibility for activity under your account; and</LI>
          <LI>accept these terms and the privacy policy — we record the date and policy version of your acceptance.</LI>
        </ul>
        <P>
          You may sign in with Google or GitHub instead of a password. If you do, the policy
          consent shown before sign-in applies, and we receive only your basic profile from the
          provider: your name, verified email address, and profile picture. One person, one
          account — duplicate accounts, impersonation, and automated access are not allowed.
        </P>

        <H id="use">3. Acceptable use</H>
        <P>When using Student Hub, you agree not to:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI>upload malware or attempt to attack, overload, or reverse-engineer the platform;</LI>
          <LI>harass, threaten, or impersonate others, or post hateful or discriminatory content;</LI>
          <LI>upload files you do not own or have the right to share (see section 5);</LI>
          <LI>share material related to academic dishonesty (see section 6);</LI>
          <LI>misuse the report system to target content or users maliciously; or</LI>
          <LI>attempt to access other users&apos; data or scrape the platform at scale.</LI>
        </ul>
        <P>
          We enforce these rules with automated measures such as rate limiting and attack-pattern
          detection; deliberately circumventing them may result in immediate blocking. Using a VPN
          or proxy is fine — we judge behavior, not privacy tools.
        </P>

        <H id="content">4. Your content</H>
        <P>
          You keep ownership of everything you upload. By uploading a resource, you grant Student
          Hub a non-exclusive, worldwide, royalty-free license to host, store, and serve that file
          to other students through the platform, for as long as you keep it uploaded. You confirm
          that you own the content or have permission to share it publicly, and that uploading it
          doesn&apos;t violate any law, license, or your university&apos;s policies.
        </P>
        <P>
          You can delete your uploads at any time. We may remove content that violates these
          terms, that is the subject of a valid copyright complaint, or that we reasonably
          consider harmful to the community.
        </P>

        <H id="copyright">5. Copyright and takedowns</H>
        <P>Users are strictly prohibited from uploading:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI>commercial textbooks or any pirated published material;</LI>
          <LI>proprietary course material from paid platforms (Chegg, CourseHero, and similar); or</LI>
          <LI>content that violates your university&apos;s intellectual property policies.</LI>
        </ul>
        <P>
          If you believe a file on Student Hub infringes your copyright, contact us via the{" "}
          <C href="/contact">contact page</C> with (a) identification of the copyrighted work,
          (b) the URL of the infringing resource, (c) your contact information, and (d) a
          good-faith belief statement — or simply use the Report button on the resource page. We
          remove validly reported content within 48 hours and may terminate repeat
          infringers&apos; accounts.
        </P>

        <H id="integrity">6. Academic integrity</H>
        <P>
          Student Hub is for studying, not for academic dishonesty. Do not share current or
          upcoming exam answers, leaked papers, or any material whose distribution would violate
          your university&apos;s code of conduct. How you use downloaded material — practice,
          revision, citation — is your responsibility. We cooperate with institutions
          investigating misconduct to the extent required by law.
        </P>

        <H id="termination">7. Suspension and termination</H>
        <P>
          We may suspend or terminate an account, and remove its content, for serious or repeated
          violations — for example uploading pirated material, attacking the platform, or
          harassment. You may stop using the platform at any time and delete your account
          yourself (see section 14).
        </P>

        <H id="liability">8. Disclaimers and liability</H>
        <P>
          Student Hub is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; Resources
          are uploaded by students and are not reviewed by us for accuracy or completeness —
          always verify material against your own course before relying on it. We make no
          warranties about content, availability, or fitness for a particular purpose.
        </P>
        <P>
          To the maximum extent permitted by law, Student Hub and its operators are not liable
          for indirect, incidental, or consequential damages arising from your use of the
          platform. Where law does not allow certain disclaimers, our liability is limited to the
          smallest amount the law permits.
        </P>

        <H id="changes">9. Changes to these terms</H>
        <P>
          We may update these terms as the platform evolves. Material changes are reflected in
          the date and version at the top of this page. Questions about any of this can go
          through the <C href="/contact">contact page</C>.
        </P>

        <hr className="my-12 border-black/10" />

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/40">Part II</p>
        <h2 className="mt-1 mb-2 text-2xl font-bold tracking-tight text-black">Privacy Policy</h2>
        <P>
          The short version: we collect only what the site needs to work, we never sell your
          data, there are no ads or tracking cookies, and you can delete your account and content
          yourself at any time.
        </P>

        <H id="data">10. Data we collect</H>
        <P>We collect the minimum needed to run the platform:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI><strong>Account data</strong> — your name, email address, and a password stored only as a bcrypt hash; if you sign in with Google or GitHub, your name, verified email, and profile picture from the provider instead.</LI>
          <LI><strong>Content data</strong> — the resources you upload (file, title, subject, type, description) and the likes and reports you make.</LI>
          <LI><strong>Consent data</strong> — when you accepted these terms and which policy version applied.</LI>
          <LI><strong>Security data</strong> — IP addresses, used for rate limiting and abuse blocking, and logs of blocked attack attempts.</LI>
          <LI><strong>Email metadata</strong> — delivery events (sent, delivered, bounced) so we can detect broken addresses and stop mailing them.</LI>
        </ul>
        <P>
          We do not collect payment information or precise location, and we do not use
          advertising trackers.
        </P>

        <H id="data-use">11. How we use your data</H>
        <P>
          To operate your account, sessions, and uploads; to send transactional email such as
          verification, welcome, sign-in alerts, and password resets; to keep the platform safe
          by detecting attacks and blocking abusive traffic; and to show aggregate platform
          statistics — never your individual data. Your email address is used only for account
          security and service communication, never marketing.
        </P>

        <H id="cookies">12. Cookies and local storage</H>
        <P>
          We use strictly necessary cookies only: a session cookie to keep you signed in (30
          days), plus CSRF-protection cookies during sign-in flows, and browser local storage
          where the app needs it to function offline. No analytics, advertising, or third-party
          tracking cookies are set.
        </P>

        <H id="sharing">13. Data sharing and processors</H>
        <P>Your data is processed only by the services that make the platform work:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI><strong>Vercel</strong> — application hosting;</LI>
          <LI><strong>Neon</strong> — hosted PostgreSQL database;</LI>
          <LI><strong>Cloudflare R2</strong> — storage for uploaded files;</LI>
          <LI><strong>Resend</strong> — transactional email delivery; and</LI>
          <LI><strong>Google and GitHub</strong> — if you choose their sign-in, they authenticate you and share your basic profile with us.</LI>
        </ul>
        <P>
          We may disclose information if required by law, or to protect the rights, property, or
          safety of the platform and its users.
        </P>

        <H id="your-rights">14. Your rights and data retention</H>
        <P>You have the right to:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI><strong>Access</strong> — request a copy of the personal data we hold about you;</LI>
          <LI><strong>Correction</strong> — fix inaccurate profile information;</LI>
          <LI><strong>Deletion</strong> — delete your account and data yourself, anytime, from the Danger Zone on your <C href="/profile">profile page</C>. This permanently removes your profile, uploads and their files, likes, and reports; security records such as blocked IPs are kept only as long as needed; and</LI>
          <LI><strong>Objection</strong> — object to processing by deleting your account or specific content.</LI>
        </ul>
        <P>
          Verification and password-reset tokens expire automatically (24 hours and 1 hour
          respectively). Email delivery events are retained for 90 days and then deleted.
        </P>

        <H id="children">15. Children&apos;s privacy</H>
        <P>
          Student Hub is intended for university students and is not directed at children under
          13 (or under 16 in the EEA/UK). We do not knowingly collect personal data from
          children. If you believe a child has created an account, let us know via the{" "}
          <C href="/contact">contact page</C> and we will delete it promptly.
        </P>

        <H id="security">16. Security</H>
        <P>
          We protect your data with bcrypt password hashing, encrypted connections (HTTPS/TLS)
          everywhere, strict security headers, parameterized database queries, rate limiting with
          automated attack blocking, and least-privilege access to storage and database. No
          system is perfectly secure — if you discover a vulnerability, please report it
          responsibly through the <C href="/contact">contact page</C>. We appreciate it.
        </P>

        <H id="contact">17. Contact</H>
        <P>
          Questions about these terms, your data, or a copyright notice: reach us through the{" "}
          <C href="/contact">contact page</C>. In short — study honestly, share only what&apos;s
          yours to share, and your data stays yours.
        </P>

        <div className="mt-14 pt-8 border-t border-black/10 text-sm text-black/50">
          <C href="/">Return to Student Hub</C>
        </div>
      </div>
    </div>
  );
}
