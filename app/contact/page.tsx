"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, CheckCircle, Loader2, Clock, MessageCircle, ShieldCheck, Zap, ChevronDown } from "lucide-react";
import { toast } from "react-hot-toast";
import { sendMessage } from "@/lib/actions/messages";
import { getErrorMessage } from "@/lib/utils";

/**
 * Contact page — one centered conversation card, not a two-column split.
 *
 * The old layout duplicated the navbar's brand identity (an "about the
 * developer" panel) beside the form; on phones that pushed the actual form
 * below a full screen of decoration. Now: a compact ink header strip with the
 * response-time promise and a mailto chip, the form as the hero, and a slim
 * reassurance row under it. Same server action, honeypot and stale-action
 * recovery as before — only the presentation changed.
 */
/**
 * The questions that actually fill the inbox. Kept in one array so the
 * visible accordions and the FAQPage structured data (below) can't drift
 * apart — search engines and visitors always see the same answers.
 */
const FAQ_ITEMS = [
  {
    q: "Do I need an account to download resources?",
    a: "No. Anyone can browse and download everything on Student Hub without signing in. An account is only needed to upload, like, or manage your own materials.",
  },
  {
    q: "What file types can I upload?",
    a: "PDF, PNG, JPG, and DOCX files up to 4 MB. The limit keeps uploads fast on mobile data — if your scan is larger, compress it first or split multi-paper bundles.",
  },
  {
    q: "I uploaded a resource — where is it?",
    a: "Uploads appear on Browse immediately, there's no approval queue. If yours is missing, it was likely an unsupported file type; sign in and check your upload page, or send us a message below.",
  },
  {
    q: "How do I report a wrong or harmful resource?",
    a: "Open the resource and use the \"Report Issue\" link in its sidebar — reports go straight to the admin queue and are reviewed quickly. You don't need an account to report.",
  },
  {
    q: "Can I request material that isn't on the site yet?",
    a: "Yes — send the course name and what you need through this form. Requests with the most demand get priority when contributors upload.",
  },
] as const;

export default function ContactPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot: hidden from humans (CSS), left empty by humans. Bots that fill
  // every input get rejected server-side — no captcha needed for a form this
  // small, and real users never solve a puzzle. Never announce it in HTML
  // comments; the field must look like ordinary markup.
  const [website, setWebsite] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  // Per-field client errors (server re-validates with the same rules).
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});

  const validate = () => {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Please enter your name (at least 2 characters).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) next.email = "Please enter a valid email address.";
    if (message.trim().length < 10) next.message = "Please write a message of at least 10 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot tripped: pretend success so the bot doesn't adapt.
    if (website) {
      setIsSent(true);
      return;
    }

    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    setIsSending(true);

    try {
      await sendMessage({
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        website, // honeypot — normally ""
      });

      setIsSent(true);
      toast.success("Message sent successfully!");
      setName("");
      setEmail("");
      setMessage("");
    } catch (error) {
      // A deploy between "page loaded" and "submit" invalidates the server
      // action ID baked into this page's HTML — Next reports it as "Server
      // Action ... was not found". The typed message is still in local
      // state, so DON'T reload: refresh the router (pulls the new action ID
      // in the background) and ask for one more tap of Send.
      const msg = String((error as Error)?.message || "");
      if (msg.includes("Server Action") && msg.includes("was not found")) {
        router.refresh();
        toast.error("The site just updated — please press Send again. Your message is safe.");
      } else {
        toast.error(getErrorMessage(error, "Failed to send message. Please try again."));
      }
    } finally {
      setIsSending(false);
    }
  };

  const fieldInput =
    "w-full rounded-xl border-2 border-ink bg-surface px-4 text-base font-medium text-foreground shadow-hard-sm transition-all placeholder:text-foreground/50 focus:outline-none focus:shadow-hard";
  const fieldLabel = "mb-2 block text-sm font-bold tracking-wider text-foreground";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12 lg:px-8">
      {/* Compact header: what this is + how fast we answer. */}
      <header className="overflow-hidden rounded-[2rem] border-2 border-ink bg-ink on-ink shadow-hard">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-background/30 bg-accent text-accent-contrast">
              <MessageCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Get in Touch</h1>
              <p className="mt-1 text-sm font-medium opacity-70">
                Questions, feedback, or a resource to flag — it all lands in the admin inbox.
              </p>
            </div>
          </div>
          <a
            href="mailto:abubakartanveer826@gmail.com"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border-2 border-background/30 bg-background/10 px-4 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:bg-background/20 sm:self-center"
          >
            <Mail size={15} strokeWidth={2.25} aria-hidden />
            Email us directly
          </a>
        </div>
      </header>

      {/* Form card — the hero. */}
      <div className="mt-6 rounded-[2rem] border-2 border-ink bg-surface p-6 shadow-hard sm:mt-7 sm:p-10">
        {isSent ? (
          <div className="flex flex-col items-center justify-center py-14 text-center sm:py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink bg-accent">
              <CheckCircle className="h-10 w-10 text-accent-contrast" strokeWidth={2} aria-hidden />
            </div>
            <h2 className="mt-6 text-2xl font-black tracking-tight text-foreground">Message Sent!</h2>
            <p className="mt-3 max-w-xs font-medium text-foreground/60">
              Thank you for reaching out — you&apos;ll hear back at the email you left.
            </p>
            <button
              onClick={() => setIsSent(false)}
              className="mt-8 rounded-full border-2 border-ink bg-ink on-ink px-6 py-3 text-sm font-bold tracking-wider transition-all hover:-translate-y-1 hover:shadow-hard-accent"
            >
              Send Another
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Send a Message</h2>
            <p className="mt-1.5 text-sm font-medium text-foreground/60">
              We usually reply within a day.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5 sm:space-y-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
                <div>
                  <label htmlFor="contact-name" className={fieldLabel}>
                    Your Name <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    className={`${fieldInput} h-14`}
                    aria-invalid={!!errors.name}
                  />
                  {errors.name && <p className="mt-2 text-xs font-bold text-red-600">{errors.name}</p>}
                </div>

                <div>
                  <label htmlFor="contact-email" className={fieldLabel}>
                    Your Email <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu"
                    required
                    className={`${fieldInput} h-14`}
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && <p className="mt-2 text-xs font-bold text-red-600">{errors.email}</p>}
                </div>
              </div>

              {/* Honeypot — visually hidden, keyboard/sr reachable semantics
                  not wanted: it must stay unfilled by humans. */}
              <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor="website">Website</label>
                <input
                  type="text"
                  id="website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="contact-message" className={fieldLabel}>
                  Message <span className="text-red-500" aria-hidden>*</span>
                </label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={6}
                  required
                  className={`${fieldInput} resize-none px-4 py-3`}
                  aria-invalid={!!errors.message}
                />
                {errors.message && <p className="mt-2 text-xs font-bold text-red-600">{errors.message}</p>}
              </div>

              <button
                type="submit"
                disabled={isSending}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-accent text-base font-bold tracking-wider text-accent-contrast shadow-hard transition-all hover:-translate-y-1 hover:shadow-hard-lg disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-hard sm:h-16 sm:text-lg"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" aria-hidden />
                    Send Message
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Reassurance row: three quiet promises, wraps on phones. */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {[
          { icon: Clock, title: "Fast replies", text: "Most messages answered within 24 hours." },
          { icon: ShieldCheck, title: "No account needed", text: "Report issues or ask anything, anonymously." },
          { icon: Zap, title: "Goes to a real inbox", text: "Delivered straight to the maintainer's email." },
        ].map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="flex items-center gap-3.5 rounded-2xl border-2 border-ink bg-surface px-4 py-3.5 shadow-hard-sm"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-surface-muted">
              <Icon size={16} strokeWidth={2.25} className="text-foreground" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{title}</p>
              <p className="text-xs leading-snug font-medium text-foreground/60">{text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* FAQ — native <details> accordions: keyboard/screen-reader friendly
          with zero JS, and one open at a time reads calmer than a wall of
          text. Segoe-style quote via the name attribute (Chrome/Safari 17+);
          older browsers just allow multiple open, which is fine. */}
      <section className="mt-10 sm:mt-14" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Frequently asked questions
        </h2>
        <p className="mt-2 text-sm font-medium text-foreground/60 sm:text-base">
          Quick answers to what people ask most — the form below is still there if yours isn&apos;t covered.
        </p>

        <div className="mt-6 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.q}
              name="contact-faq"
              className="group rounded-2xl border-2 border-ink bg-surface shadow-hard-sm open:shadow-hard"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-bold text-foreground transition-colors hover:bg-surface-muted sm:text-base [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  size={18}
                  strokeWidth={2.5}
                  aria-hidden
                  className="shrink-0 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <p className="border-t-2 border-ink/10 px-5 py-4 text-sm leading-relaxed font-medium text-foreground/70">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
      {/* FAQPage structured data — generated from the same array as the
          visible accordions. html-safe: answers are authored constants, not
          user content. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_ITEMS.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
    </div>
  );
}
