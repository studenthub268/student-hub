"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, CheckCircle, Loader2, ChevronDown } from "lucide-react";
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16 lg:px-8">
      {/* Editorial header: oversized title with accent underline and a
          two-line lede. Big type carries the page; no boxed strip. */}
      <header>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-foreground/50">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />
          Contact
        </p>
        <h1 className="mt-3 text-4xl font-black leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Talk to the{" "}
          <span className="relative inline-block">
            people
            <span className="absolute inset-x-0 bottom-1 h-3 bg-accent/60 -z-10 sm:h-4" aria-hidden />
          </span>{" "}
          behind it
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed font-medium text-foreground/60 sm:text-lg">
          Student Hub is built and run by students. Questions, feedback, bug
          reports, resource requests — everything lands in a real inbox and
          gets a real reply.
        </p>
      </header>

      {/* Main: form on the ink card (the centerpiece), meta rail beside it
          on desktop, stacked under it on phones. */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 lg:grid-cols-5 lg:gap-6">
        {/* Form card — dark, so it reads as THE object on the page. */}
        <div className="rounded-[2rem] border-2 border-ink bg-ink on-ink p-6 shadow-hard sm:p-8 lg:col-span-3">
          {isSent ? (
            <div className="flex flex-col items-center justify-center py-12 text-center sm:py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-background/30 bg-accent">
                <CheckCircle className="h-10 w-10 text-accent-contrast" strokeWidth={2} aria-hidden />
              </div>
              <h2 className="mt-6 text-2xl font-black tracking-tight">Message Sent!</h2>
              <p className="mt-3 max-w-xs font-medium opacity-70">
                Thank you for reaching out — you&apos;ll hear back at the email you left.
              </p>
              <button
                onClick={() => setIsSent(false)}
                className="mt-8 rounded-full border-2 border-background/40 bg-background/10 px-6 py-3 text-sm font-bold tracking-wider transition-all hover:-translate-y-1 hover:bg-background/20"
              >
                Send Another
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Send a message</h2>
              <p className="mt-1.5 text-sm font-medium opacity-60">
                Usually answered within a day.
              </p>

              <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
                <div>
                  <label htmlFor="contact-name" className="mb-2 block text-xs font-bold uppercase tracking-wider opacity-70">
                    Your Name <span className="text-accent" aria-hidden>*</span>
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="h-13 w-full rounded-xl border-2 border-background/20 bg-background/10 px-4 py-3 text-base font-medium transition-all placeholder:opacity-40 focus:border-background/50 focus:outline-none"
                    aria-invalid={!!errors.name}
                  />
                  {errors.name && <p className="mt-2 text-xs font-bold text-red-400">{errors.name}</p>}
                </div>

                <div>
                  <label htmlFor="contact-email" className="mb-2 block text-xs font-bold uppercase tracking-wider opacity-70">
                    Your Email <span className="text-accent" aria-hidden>*</span>
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu"
                    required
                    className="h-13 w-full rounded-xl border-2 border-background/20 bg-background/10 px-4 py-3 text-base font-medium transition-all placeholder:opacity-40 focus:border-background/50 focus:outline-none"
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && <p className="mt-2 text-xs font-bold text-red-400">{errors.email}</p>}
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
                  <label htmlFor="contact-message" className="mb-2 block text-xs font-bold uppercase tracking-wider opacity-70">
                    Message <span className="text-accent" aria-hidden>*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What's on your mind?"
                    rows={6}
                    required
                    className="w-full resize-none rounded-xl border-2 border-background/20 bg-background/10 px-4 py-3 text-base font-medium transition-all placeholder:opacity-40 focus:border-background/50 focus:outline-none"
                    aria-invalid={!!errors.message}
                  />
                  {errors.message && <p className="mt-2 text-xs font-bold text-red-400">{errors.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isSending}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-accent text-base font-bold tracking-wider text-accent-contrast shadow-hard-sm transition-all hover:-translate-y-1 hover:shadow-hard disabled:opacity-50 disabled:hover:translate-y-0"
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

        {/* Meta rail: the human details, quiet and stacked. */}
        <aside className="flex flex-col gap-5 lg:col-span-2">
          <div className="rounded-[2rem] border-2 border-ink bg-surface p-6 shadow-hard-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">Prefer email?</p>
            <a
              href="mailto:abubakartanveer826@gmail.com"
              className="mt-3 flex items-center gap-2.5 break-all text-sm font-bold text-foreground transition-colors hover:text-accent"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-surface-muted">
                <Mail size={15} strokeWidth={2.25} aria-hidden />
              </span>
              abubakartanveer826@gmail.com
            </a>
          </div>

          <div className="rounded-[2rem] border-2 border-ink bg-surface p-6 shadow-hard-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">What happens next</p>
            <ol className="mt-4 space-y-3.5">
              {[
                "Your message hits the admin inbox instantly.",
                "You get a reply at the email you left, usually within a day.",
                "Reports on resources are reviewed even faster — they're prioritized.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-snug font-medium text-foreground/70">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-accent text-[11px] font-black text-accent-contrast" aria-hidden>
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      {/* FAQ — native <details> accordions: keyboard/screen-reader friendly
          with zero JS, and one open at a time reads calmer than a wall of
          text. Segoe-style quote via the name attribute (Chrome/Safari 17+);
          older browsers just allow multiple open, which is fine. */}
      <section className="mt-12 sm:mt-16" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Frequently asked questions
        </h2>
        <p className="mt-2 text-sm font-medium text-foreground/60 sm:text-base">
          Quick answers to what people ask most — the form above is still there if yours isn&apos;t covered.
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
