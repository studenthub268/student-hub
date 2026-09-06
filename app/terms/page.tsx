import Link from "next/link";
import { Shield, Scale, Info, Flag, FileText, Lock, Cookie, Database, UserCheck, Mail } from "lucide-react";

export const metadata = {
  title: "Terms & Privacy — Student Hub",
  description:
    "Terms of Service and Privacy Policy for Student Hub: accounts, acceptable use, copyright, data collection, cookies, and your rights.",
};

const LAST_UPDATED = "September 6, 2026";
const POLICY_VERSION = "0.1.2";

function Section({
  id,
  icon: Icon,
  tone,
  title,
  children,
}: {
  id?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="p-8 bg-white rounded-[2rem] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] scroll-mt-24">
      <div className={`flex items-center gap-3 mb-6 ${tone}`}>
        <Icon className="h-6 w-6" />
        <h2 className="text-2xl font-bold tracking-tight text-black">{title}</h2>
      </div>
      <div className="space-y-4 text-black/80 font-medium leading-relaxed">{children}</div>
    </section>
  );
}

function Tldr({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0D9488] p-4 rounded-xl border border-black text-sm font-bold tracking-wide text-black">
      <span className="uppercase tracking-widest text-black/70 text-xs mr-2">TL;DR</span>
      {children}
    </div>
  );
}

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-4xl selection:bg-[#0D9488]">
      <div className="mb-12">
        <h1 className="text-5xl font-black tracking-tighter text-black mb-4">Terms &amp; Privacy</h1>
        <p className="text-lg text-black/60 font-medium">
          The rules of the platform and how we handle your data — written to be read, not just to exist.
        </p>
        <p className="mt-3 text-sm font-bold text-black/50 tracking-wide">
          Last updated: {LAST_UPDATED} · Version {POLICY_VERSION}
        </p>
      </div>

      <div className="space-y-12">
        {/* ─────────────────────────── TERMS OF SERVICE ─────────────────────────── */}

        <div className="flex items-center gap-3 pt-4">
          <FileText className="h-7 w-7 text-[#111]" />
          <h2 className="text-3xl font-black tracking-tight text-black uppercase">Terms of Service</h2>
        </div>

        <Section id="intro" icon={Info} tone="text-[#111]" title="1. About These Terms">
          <p>
            Student Hub is a peer-to-peer platform that helps university students share study materials — notes,
            past papers, quizzes, and assignments — and succeed together. By creating an account or using the
            platform in any way, you agree to these Terms of Service and our Privacy Policy.
          </p>
          <p>
            If you do not agree with any part of these terms, please do not use Student Hub. We may update these
            terms from time to time (see <a href="#changes" className="underline font-bold hover:text-[#0D9488]">Section 9</a>).
          </p>
          <Tldr>Don&apos;t upload things you don&apos;t have rights to, and don&apos;t use this for cheating.</Tldr>
        </Section>

        <Section id="accounts" icon={UserCheck} tone="text-[#111]" title="2. Accounts & Eligibility">
          <p>To create an account you must:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide a valid email address that you control, and verify it before signing in.</li>
            <li>Be a student, educator, or otherwise using the platform for personal, non-commercial study purposes.</li>
            <li>Keep your password confidential and accept responsibility for all activity under your account.</li>
            <li>Accept our Terms and Privacy Policy — we record the date and policy version of your acceptance.</li>
          </ul>
          <p>
            You may sign in with GitHub or Google instead of a password. If you do, the policy acceptance shown
            before sign-in applies, and we receive only your basic profile (name, email, avatar) from the provider.
          </p>
          <p>
            One person, one account. Creating duplicate accounts, impersonating others, or automating access is
            prohibited.
          </p>
        </Section>

        <Section id="acceptable-use" icon={Flag} tone="text-orange-600" title="3. Acceptable Use">
          <p>When using Student Hub, you agree <strong>not</strong> to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Upload malware, scrapers, or attempt to attack, overload, or reverse-engineer the platform.</li>
            <li>Harass, threaten, or impersonate other students, or post hateful or discriminatory content.</li>
            <li>Share content related to academic dishonesty (see <a href="#integrity" className="underline font-bold hover:text-[#0D9488]">Section 6</a>).</li>
            <li>Upload files you do not own or have rights to share (see <a href="#dmca" className="underline font-bold hover:text-[#0D9488]">Section 5</a>).</li>
            <li>Misuse the report system to target content or users maliciously.</li>
            <li>Attempt to access data belonging to other users, or scrape the platform at scale.</li>
          </ul>
          <p>
            We use automated security measures (rate limiting and attack-pattern detection) to enforce these
            rules. Deliberately circumventing them may result in immediate blocking. Using a VPN or proxy is
            allowed — we block behavior, not privacy tools.
          </p>
        </Section>

        <Section id="content" icon={Database} tone="text-[#111]" title="4. Your Content">
          <p>
            You retain ownership of anything you upload. By uploading a resource, you grant Student Hub a
            non-exclusive, worldwide, royalty-free license to host, store, and serve that file to other students
            through the platform — for as long as you keep it uploaded.
          </p>
          <p>You confirm that:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>You own the content or have permission to share it publicly.</li>
            <li>Uploading it does not violate any law, license, or your university&apos;s policies.</li>
          </ul>
          <p>
            You can delete your uploads at any time. We may remove any content that violates these terms, that is
            the subject of a valid copyright complaint, or that we reasonably deem harmful to the community.
          </p>
        </Section>

        <Section id="dmca" icon={Scale} tone="text-red-600" title="5. Copyright & DMCA">
          <p>We respect copyright law and expect users to do the same. Users are strictly prohibited from uploading:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Commercial textbooks (PDFs) or any pirated published material.</li>
            <li>Proprietary course materials from paid platforms (Chegg, CourseHero, etc.).</li>
            <li>Any content that violates your university&apos;s intellectual property policies.</li>
          </ul>
          <p>
            <strong>Notice of Infringement:</strong> If you believe a file on Student Hub violates your copyright,
            reach us through the <Link href="/contact" className="underline font-bold hover:text-[#0D9488]">contact
            page</Link> with (a) identification of the copyrighted work, (b) the URL of the infringing resource,
            (c) your contact information, and (d) a statement of good-faith belief — or simply use the
            <strong> Report</strong> button on the resource page.
          </p>
          <p>We will remove validly reported content within <strong>48 hours</strong> and may terminate repeat infringers&apos; accounts.</p>
        </Section>

        <Section id="integrity" icon={Flag} tone="text-orange-600" title="6. Academic Integrity">
          <p>
            Student Hub is for <strong>studying</strong>, not for academic dishonesty. Do not use this platform to
            share current or upcoming exam answers, leaked papers, or any material whose distribution would violate
            your university&apos;s code of conduct.
          </p>
          <p>
            How you use downloaded materials (practice, revision, citation) is your responsibility. We cooperate
            with institutions investigating misconduct to the extent required by law.
          </p>
        </Section>

        <Section id="termination" icon={UserCheck} tone="text-[#111]" title="7. Suspension & Termination">
          <p>
            We may suspend or terminate your account, and remove your content, if you seriously or repeatedly
            violate these terms — for example: uploading pirated material, attacking the platform, or harassment.
          </p>
          <p>
            You may stop using the platform at any time and request account deletion (see{" "}
            <a href="#your-rights" className="underline font-bold hover:text-[#0D9488]">Section 14</a>).
          </p>
        </Section>

        <Section id="disclaimers" icon={Info} tone="text-[#111]" title="8. Disclaimers & Liability">
          <p>
            Student Hub is provided &quot;as is&quot; and &quot;as available.&quot; Resources are uploaded by
            students, not reviewed by us for accuracy or completeness — <strong>always verify material against your
            own course before relying on it.</strong> We make no warranties about the content, availability, or
            fitness for a particular purpose.
          </p>
          <p>
            To the maximum extent permitted by law, Student Hub and its operators are not liable for indirect,
            incidental, or consequential damages arising from your use of the platform, including loss of data,
            study time, or grades. Some jurisdictions do not allow certain disclaimers; in that case, our
            liability is limited to the smallest amount permitted by law.
          </p>
        </Section>

        <Section id="changes" icon={FileText} tone="text-[#111]" title="9. Changes to These Terms">
          <p>
            We may update these terms as the platform evolves. Material changes will be reflected in the
            &quot;Last updated&quot; date and version number at the top of this page. Continuing to use Student Hub
            after changes take effect means you accept the updated terms.
          </p>
          <Tldr>Check back occasionally — the version number at the top tells you if this changed.</Tldr>
        </Section>

        {/* ─────────────────────────── PRIVACY POLICY ─────────────────────────── */}

        <div id="privacy" className="flex items-center gap-3 pt-8 scroll-mt-24">
          <Shield className="h-7 w-7 text-blue-600" />
          <h2 className="text-3xl font-black tracking-tight text-black uppercase">Privacy Policy</h2>
        </div>

        <Section icon={Lock} tone="text-blue-600" title="10. Data We Collect">
          <p>We collect the minimum needed to run the platform:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Account data:</strong> name, email address, password (stored only as a bcrypt hash), and profile image if you sign in with GitHub or Google.</li>
            <li><strong>Content data:</strong> the resources you upload (file, title, subject, type, description) and likes/reports you make.</li>
            <li><strong>Consent data:</strong> when you accepted these terms and which policy version applied.</li>
            <li><strong>Security data:</strong> IP address (for rate limiting and abuse blocking), plus automatic logs of blocked attack attempts.</li>
            <li><strong>Email metadata:</strong> delivery events (sent, delivered, bounced) so we can detect broken addresses and pause mailings to them.</li>
          </ul>
          <p>We do <strong>not</strong> collect payment information, precise location, or use advertising trackers.</p>
        </Section>

        <Section icon={Database} tone="text-blue-600" title="11. How We Use Your Data">
          <ul className="list-disc pl-6 space-y-2">
            <li>Operate your account, sessions, and uploads.</li>
            <li>Send transactional email: verification, password reset, and important service notices.</li>
            <li>Keep the platform safe: detect attacks, block abusive IPs, and enforce rate limits.</li>
            <li>Show aggregate platform statistics (e.g. total resources) — never your individual data.</li>
          </ul>
          <p>We never sell your data, ever. Your email is used only for account security and service communication.</p>
        </Section>

        <Section id="cookies" icon={Cookie} tone="text-blue-600" title="12. Cookies & Local Storage">
          <p>We use strictly necessary cookies only:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Session cookies</strong> (<code>authjs.session-token</code>, CSRF, callback) — to keep you signed in securely.</li>
            <li><strong>Preferences</strong> in browser local storage where needed for the app to function offline (PWA).</li>
          </ul>
          <p>No analytics, advertising, or third-party tracking cookies are set.</p>
        </Section>

        <Section icon={Database} tone="text-blue-600" title="13. Data Sharing & Processors">
          <p>Your data is processed only by the services that make the platform work:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Neon</strong> — hosted PostgreSQL database.</li>
            <li><strong>Cloudflare R2</strong> — file storage for uploaded resources.</li>
            <li><strong>Resend</strong> — transactional email delivery.</li>
            <li><strong>GitHub / Google</strong> — if you choose OAuth sign-in, they authenticate you and share your basic profile with us.</li>
            <li><strong>Vercel</strong> — application hosting.</li>
          </ul>
          <p>
            We may disclose information if required by law or to protect the rights, property, or safety of the
            platform and its users.
          </p>
        </Section>

        <Section id="your-rights" icon={UserCheck} tone="text-blue-600" title="14. Your Rights & Data Retention">
          <p>You have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
            <li><strong>Correction</strong> — fix inaccurate profile information.</li>
            <li><strong>Deletion</strong> — delete your account and personal data yourself, anytime, from the Danger Zone on your <Link href="/profile" className="underline font-bold hover:text-[#0D9488]">profile page</Link>. Deleting your account removes your profile, uploads, likes, and reports; audit/security records (e.g. blocked IPs) are retained only as long as needed for security.</li>
            <li><strong>Objection</strong> — object to processing by deleting your account or specific content.</li>
          </ul>
          <p>
            Verification and password-reset tokens expire automatically (24 hours and 1 hour respectively).
            Email delivery events are retained for 90 days, then deleted.
          </p>
        </Section>

        <Section icon={Shield} tone="text-blue-600" title="15. Children's Privacy">
          <p>
            Student Hub is intended for university students and is not directed at children under 13 (or under 16
            in the EEA/UK). We do not knowingly collect personal data from children. If you believe a child has
            created an account, let us know via the <Link href="/contact" className="underline font-bold hover:text-[#0D9488]">contact page</Link> and we will delete it promptly.
          </p>
        </Section>

        <Section icon={Lock} tone="text-blue-600" title="16. Security">
          <p>
            We protect your data with: bcrypt password hashing, encrypted connections (HTTPS/TLS) everywhere,
            strict security headers (CSP, HSTS, frame protection), parameterized database queries, rate limiting
            and automated attack blocking, and least-privilege access to storage and database.
          </p>
          <p>
            No system is perfectly secure. If you discover a vulnerability, please report it responsibly through
            the <Link href="/contact" className="underline font-bold hover:text-[#0D9488]">contact page</Link> — we appreciate it.
          </p>
        </Section>

        <Section id="contact" icon={Mail} tone="text-[#111]" title="17. Contact">
          <p>
            Questions about these terms, your data, or a copyright notice: reach us through the{" "}
            <Link href="/contact" className="underline font-bold hover:text-[#0D9488]">contact page</Link>.
          </p>
          <Tldr>
            Study honestly, share only what&apos;s yours to share, and your data stays yours.
          </Tldr>
        </Section>
      </div>

      <div className="mt-16 text-center">
        <Link href="/" className="text-sm font-bold tracking-wider text-black/60 hover:text-black hover:underline">
          Return to Home
        </Link>
      </div>
    </div>
  );
}
