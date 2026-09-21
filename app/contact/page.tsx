"use client";

import { useState } from "react";
import { Mail, User, Send, CheckCircle, Loader2, Globe, Clock } from "lucide-react";
import { toast } from "react-hot-toast";
import { sendMessage } from "@/lib/actions/messages";
import { getErrorMessage } from "@/lib/utils";

export default function ContactPage() {
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
      toast.error(getErrorMessage(error, "Failed to send message. Please try again."));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-16 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium tracking-tight text-foreground">
          Get in Touch
        </h1>
        <p className="mt-4 text-lg text-foreground/60 font-medium max-w-xl mx-auto">
          Have questions, feedback, or want to collaborate? We&apos;d love to hear from you.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {/* Contact Info Card */}
        <div className="bg-ink on-ink rounded-[2rem] p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-neutral-800/40 via-ink to-ink opacity-50"></div>

          <div className="relative z-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              Contact Information
            </h2>
            <p className="text-background/60 font-medium text-sm tracking-wider">
              Reach out and we&apos;ll respond as soon as we can.
            </p>
          </div>

          <div className="relative z-10 mt-12 space-y-8">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast border-2 border-ink">
                <User className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-background/70 mb-1">Name</p>
                <p className="text-lg font-bold">Muhammad Abubakar</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast border-2 border-ink">
                <Mail className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-background/70 mb-1">Email</p>
                <a href="mailto:abubakartanveer826@gmail.com" className="text-lg font-bold hover:text-accent transition-colors break-all">
                  abubakartanveer826@gmail.com
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast border-2 border-ink">
                <Globe className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-background/70 mb-1">Support</p>
                <p className="text-lg font-bold">24/7 Academic Support</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast border-2 border-ink">
                <Clock className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xs font-bold tracking-wider text-background/70 mb-1">Availability</p>
                <p className="text-lg font-bold">Open to collaborate</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-12 flex gap-2">
            <span className="px-3 py-1 bg-surface/10 rounded-full text-[10px] font-bold tracking-wider text-background/80">
              Student Developer
            </span>
            <span className="px-3 py-1 bg-accent text-accent-contrast rounded-full text-[10px] font-bold tracking-wider">
              Open to Collaborate
            </span>
          </div>
        </div>

        {/* Message Form Card */}
        <div className="rounded-[2rem] border-2 border-ink bg-surface p-8 sm:p-10 shadow-hard">
          {isSent ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent border-2 border-ink mb-6">
                <CheckCircle className="h-10 w-10 text-foreground" strokeWidth={2} />
              </div>
              <h3 className="text-2xl font-black tracking-tight text-foreground">Message Sent!</h3>
              <p className="mt-3 text-foreground/60 font-medium max-w-xs">
                Thank you for reaching out. We&apos;ll get back to you as soon as possible.
              </p>
              <button
                onClick={() => setIsSent(false)}
                className="mt-8 rounded-full border-2 border-ink bg-ink on-ink px-6 py-3 text-sm font-bold tracking-wider hover:-translate-y-1 hover:shadow-hard-accent transition-all"
              >
                Send Another
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold tracking-tight text-foreground mb-8">
                Send a Message
              </h2>

              <form onSubmit={handleSubmit} noValidate className="space-y-6">
                <div>
                  <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Your Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name"
                    required
                    className="w-full h-14 px-4 rounded-xl border-2 border-ink bg-surface text-base font-medium text-foreground shadow-hard-sm focus:outline-none focus:shadow-hard transition-all placeholder:text-foreground/60"
                  />
                  {errors.name && <p className="mt-2 text-xs font-bold text-red-600">{errors.name}</p>}
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
                  <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Your Email <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@university.edu"
                    required
                    className="w-full h-14 px-4 rounded-xl border-2 border-ink bg-surface text-base font-medium text-foreground shadow-hard-sm focus:outline-none focus:shadow-hard transition-all placeholder:text-foreground/60"
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && <p className="mt-2 text-xs font-bold text-red-600">{errors.email}</p>}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Message <span className="text-red-500">*</span></label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Your message here..."
                    rows={5}
                    required
                    className="flex w-full rounded-xl border-2 border-ink bg-surface px-4 py-3 text-base font-medium shadow-hard-sm placeholder:text-foreground/60 focus:outline-none focus:shadow-hard transition-all resize-none"
                    aria-invalid={!!errors.message}
                  />
                  {errors.message && <p className="mt-2 text-xs font-bold text-red-600">{errors.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isSending}
                  className="w-full flex items-center justify-center gap-2 text-lg h-16 rounded-full border-2 border-ink bg-ink on-ink font-bold tracking-wider hover:-translate-y-1 hover:bg-ink hover:shadow-hard-accent transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
