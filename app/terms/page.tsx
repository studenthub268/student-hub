import Link from "next/link";
import { LAST_UPDATED, POLICY_VERSION } from "@/lib/generated/deploy-version";

export const metadata = {
  title: "Terms of Service — Student Hub",
  description:
    "Terms of Service for Student Hub: accounts, acceptable use, your content, copyright and takedowns, academic integrity, and liability.",
  alternates: { canonical: "/terms" },
};

// LAST_UPDATED and POLICY_VERSION are generated from package.json + its last
// commit date at build time — a release is one `npm version` bump.

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

export default function TermsPage() {
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
                Terms of Service
              </h1>
              <p className="mt-4 max-w-xl leading-relaxed opacity-80">
                Student Hub is a student-run platform where university students share
                study material — notes, past papers, quizzes, and assignments.
                These terms cover the rules of the platform; how we handle your
                data is covered separately in the{" "}
                {/* Dark-card link variant: the standard C() is teal on this ink
                    surface (1.6:1), so links inside the hero use the light
                    text colour and let the underline carry the affordance. */}
                <Link
                  href="/privacy"
                  className="font-bold text-background underline decoration-background/40 underline-offset-2 transition-colors hover:decoration-background"
                >
                  privacy policy
                </Link>
                . Together they apply to everyone who visits or uses the site.
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

        <H id="about">1. About these terms</H>
        <P>
          By creating an account or using Student Hub in any way, you agree to
          these terms. If you do not agree with any part of them, please
          don&apos;t use the platform. We may update these terms from time to
          time; the version number and date at the top of this page tell you
          whether something has changed, and continuing to use the site after a
          change means you accept it.
        </P>

        <H id="accounts">2. Accounts and eligibility</H>
        <P>To create an account you must:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI>use a valid email address that you control, and verify it before signing in;</LI>
          <LI>be a student, educator, or otherwise using the platform for personal, non-commercial study purposes;</LI>
          <LI>keep your password confidential and take responsibility for activity under your account; and</LI>
          <LI>accept these terms and the <C href="/privacy">privacy policy</C> — we record the date and policy version of your acceptance.</LI>
        </ul>
        <P>
          You may sign in with Google or GitHub instead of a password. If you
          do, the policy consent shown before sign-in applies, and we receive
          only your basic profile from the provider: your name, verified email
          address, and profile picture. One person, one account — duplicate
          accounts, impersonation, and automated access are not allowed.
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
          We enforce these rules with automated measures such as rate limiting
          and attack-pattern detection; deliberately circumventing them may
          result in immediate blocking. Using a VPN or proxy is fine — we judge
          behavior, not privacy tools.
        </P>

        <H id="content">4. Your content</H>
        <P>
          You keep ownership of everything you upload. By uploading a resource,
          you grant Student Hub a non-exclusive, worldwide, royalty-free license
          to host, store, and serve that file to other students through the
          platform, for as long as you keep it uploaded. You confirm that you
          own the content or have permission to share it publicly, and that
          uploading it doesn&apos;t violate any law, license, or your
          university&apos;s policies.
        </P>
        <P>
          You can delete your uploads at any time. We may remove content that
          violates these terms, that is the subject of a valid copyright
          complaint, or that we reasonably consider harmful to the community.
        </P>

        <H id="copyright">5. Copyright and takedowns</H>
        <P>Users are <Bold>strictly prohibited</Bold> from uploading:</P>
        <ul className="list-disc pl-5 space-y-1.5">
          <LI>commercial textbooks or any pirated published material;</LI>
          <LI>proprietary course material from paid platforms (Chegg, CourseHero, and similar); or</LI>
          <LI>content that violates your university&apos;s intellectual property policies.</LI>
        </ul>
        <P>
          If you believe a file on Student Hub infringes your copyright, contact
          us via the <C href="/contact">contact page</C> with (a) identification
          of the copyrighted work, (b) the URL of the infringing resource, (c)
          your contact information, and (d) a good-faith belief statement — or
          simply use the Report button on the resource page. We remove validly
          reported content within 48 hours and may terminate repeat
          infringers&apos; accounts.
        </P>

        <H id="integrity">6. Academic integrity</H>
        <P>
          Student Hub is for studying, not for academic dishonesty. Do not share
          current or upcoming exam answers, leaked papers, or any material whose
          distribution would violate your university&apos;s code of conduct.
          How you use downloaded material — practice, revision, citation — is
          your responsibility. We cooperate with institutions investigating
          misconduct to the extent required by law.
        </P>

        <H id="termination">7. Suspension and termination</H>
        <P>
          We may suspend or terminate an account, and remove its content, for
          serious or repeated violations — for example uploading pirated
          material, attacking the platform, or harassment. You may stop using
          the platform at any time and delete your account yourself (see the{" "}
          <C href="/privacy#your-rights">privacy policy</C>).
        </P>

        <H id="liability">8. Disclaimers and liability</H>
        <P>
          Student Hub is provided <Bold>&ldquo;as is&rdquo;</Bold> and{" "}
          <Bold>&ldquo;as available.&rdquo;</Bold> Resources are uploaded by
          students and are not reviewed by us for accuracy or completeness —
          always verify material against your own course before relying on it.
          We make no warranties about content, availability, or fitness for a
          particular purpose.
        </P>
        <P>
          To the maximum extent permitted by law, Student Hub and its operators
          are not liable for indirect, incidental, or consequential damages
          arising from your use of the platform. Where law does not allow
          certain disclaimers, our liability is limited to the smallest amount
          the law permits.
        </P>

        <H id="changes">9. Changes to these terms</H>
        <P>
          We may update these terms as the platform evolves. Material changes
          are reflected in the date and version at the top of this page.
          Questions about any of this can go through the{" "}
          <C href="/contact">contact page</C>.
        </P>

        <div className="mt-14 pt-8 border-t-2 border-ink text-sm font-medium">
          <C href="/privacy">Read the Privacy Policy</C>
          <span className="mx-2 text-foreground/60">·</span>
          <C href="/">Return to Student Hub</C>
        </div>
      </div>
    </div>
  );
}
