import Link from "next/link";
import { Database, Cookie, Shield, Share2, Trash2, Eye, RefreshCw, Mail } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — Student Hub",
  description:
    "How Student Hub collects, uses, stores, and protects your data: account info, uploaded files, third-party services, cookies, retention, and your rights.",
};

const LAST_UPDATED = "September 7, 2026";

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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f4f4f5]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-8">
        {/* Hero */}
        <div className="p-8 sm:p-10 bg-[#0D9488] rounded-[2rem] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-black">Privacy Policy</h1>
          <p className="mt-3 text-black/70 font-medium">
            Last updated: {LAST_UPDATED} · Applies to student-hub-uet.vercel.app (&ldquo;Student Hub&rdquo;)
          </p>
        </div>

        <Section id="overview" icon={Eye} tone="text-black" title="The short version">
          <Tldr>
            We collect only what the site needs to work: your account details, the files you
            upload, and basic engagement counts. We don&apos;t sell data, we don&apos;t run ads,
            and you can delete your account and files at any time from your profile.
          </Tldr>
        </Section>

        <Section id="collect" icon={Database} tone="text-black" title="What we collect">
          <p>Account data, depending on how you sign up:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Email &amp; password accounts:</strong> your name (optional), email address, and a securely hashed password (we never store the password itself).</li>
            <li><strong>Google / GitHub sign-in:</strong> your name, email address, and profile picture as provided by the provider. Passwordless — we never see your provider password.</li>
          </ul>
          <p>Content you contribute: uploaded files (PDF, DOCX, images), plus the title, subject, department, and professor you attach to them.</p>
          <p>Engagement data: likes and download counts on resources, and report submissions.</p>
          <p>Operational data: your IP address (rate limiting and attack blocking only), email delivery events, and sign-in timestamps.</p>
        </Section>

        <Section id="use" icon={Eye} tone="text-black" title="How we use it">
          <ul className="list-disc pl-6 space-y-1">
            <li>To operate your account and the resource library.</li>
            <li>To send essential emails: verification, welcome, sign-in alerts, password reset.</li>
            <li>To keep the platform safe: rate limiting, detecting and blocking abuse.</li>
            <li>To show engagement stats (likes, download counts) that help students find good material.</li>
          </ul>
          <p>We do not sell your data, and there is no advertising on Student Hub.</p>
        </Section>

        <Section id="third-parties" icon={Share2} tone="text-black" title="Third-party services we rely on">
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Google &amp; GitHub</strong> — if you use &ldquo;Continue with Google/GitHub&rdquo;, those providers authenticate you and share your basic profile (name, verified email, avatar) under their own privacy policies.</li>
            <li><strong>Cloudflare R2</strong> — stores the files you upload.</li>
            <li><strong>Neon (PostgreSQL)</strong> — stores account and resource records.</li>
            <li><strong>Resend</strong> — delivers our transactional emails.</li>
          </ul>
          <p>These services process data only on our behalf to run the platform.</p>
        </Section>

        <Section id="cookies" icon={Cookie} tone="text-black" title="Cookies & sign-in sessions">
          <p>
            We use a single essential session cookie so you stay signed in (valid for 30 days),
            plus CSRF-protection cookies during sign-in flows. We do not use advertising or
            tracking cookies.
          </p>
        </Section>

        <Section id="retention" icon={Trash2} tone="text-black" title="Retention & deletion">
          <p>
            Email delivery logs are pruned after 90 days. Uploaded files stay until you or an
            admin remove the resource.
          </p>
          <p>
            You can delete your account yourself from <strong>Profile → Delete Account</strong>.
            This permanently removes your account, your uploaded resources and their files, your
            likes, and your reports. It cannot be undone.
          </p>
        </Section>

        <Section id="security" icon={Shield} tone="text-black" title="How we protect your data">
          <ul className="list-disc pl-6 space-y-1">
            <li>Passwords are hashed with bcrypt — never stored in readable form.</li>
            <li>Sessions use signed, HTTP-only JWT cookies; admin areas are re-checked server-side on every action.</li>
            <li>Strict security headers (CSP, frame protection, no-sniff) and automatic blocking of common attack patterns.</li>
            <li>OAuth linking only happens with provider-verified email addresses.</li>
          </ul>
        </Section>

        <Section id="rights" icon={RefreshCw} tone="text-black" title="Your rights">
          <p>
            You can access and update your information on your profile page, download what you
            uploaded at any time, and erase your account and content via Delete Account. For
            anything else — a copy of your data, a correction, a complaint — contact us and
            we&apos;ll help.
          </p>
        </Section>

        <Section id="contact" icon={Mail} tone="text-black" title="Questions or requests">
          <p>
            Reach us through the{" "}
            <Link href="/contact" className="text-[#0D9488] font-bold underline underline-offset-2">
              contact page
            </Link>
            . See also our{" "}
            <Link href="/terms" className="text-[#0D9488] font-bold underline underline-offset-2">
              Terms of Service
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
