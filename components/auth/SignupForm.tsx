"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "react-hot-toast";
import { signUp } from "@/lib/actions/auth";
import { signIn } from "next-auth/react";
import { BookOpen, Search, Users } from "lucide-react";
import { validatePasswordStrength } from "@/lib/password";
import { getErrorMessage } from "@/lib/utils";
import { PasswordInput } from "@/components/ui/PasswordInput";

/** Black brand panel — mirrors the homepage hero card. Fills the card height. */
function BrandPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-[#111] p-6 sm:p-8 flex flex-col text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#0D9488]/40 via-[#111] to-[#111]" />
      <div className="relative z-10 flex h-full flex-col justify-between">{children}</div>
    </div>
  );
}

/** Shared OAuth buttons (GitHub + Google), stacked. */
function OAuthButtons({ onProvider }: { onProvider?: (provider: "github" | "google") => void }) {
  const start = (provider: "github" | "google") =>
    onProvider ? onProvider(provider) : signIn(provider, { callbackUrl: "/" });
  const base =
    "w-full h-14 flex items-center justify-center gap-3 rounded-full border-2 border-black bg-white text-black font-bold text-sm tracking-wider hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_#0D9488] transition-all whitespace-nowrap";

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => start("github")} className={base}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        Continue with GitHub
      </button>
      <button type="button" onClick={() => start("google")} className={base}>
        <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continue with Google
      </button>
    </div>
  );
}

/** Logo on a white chip so the dark glyph stays visible on the black panel. */
function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-black bg-white shadow-[2px_2px_0px_0px_#0D9488]">
        <Image src="/logo.png" alt="" width={64} height={64} className="w-7 h-7 object-contain" />
      </span>
      <span className="text-xl font-bold tracking-tighter">Student Hub</span>
    </div>
  );
}

const PERKS = [
  { icon: BookOpen, title: "Everything in one place", text: "Notes, past papers, quizzes & assignments" },
  { icon: Search, title: "Find it in seconds", text: "Filter by subject, type or professor" },
  { icon: Users, title: "By students, for students", text: "Real material from real courses" },
];

function PerkList() {
  return (
    <ul className="space-y-5">
      {PERKS.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-white/25 bg-white/5">
            <Icon className="w-5 h-5 text-[#2DD4BF]" strokeWidth={2.5} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">{title}</span>
            <span className="text-xs font-medium text-white/60">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    setLoading(true);

    try {
      // Submitting the form IS accepting the policies (the consent line is
      // shown right above the button). Server stamps the audit trail.
      const result = await signUp({
        email,
        password,
        name,
        acceptedPolicy: true,
      });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      setSubmitted(true);
    } catch (error) {
      toast.error(getErrorMessage(error, "Something went wrong"));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto w-full max-w-md rounded-[2rem] border-2 border-black bg-[#0D9488] p-8 sm:p-10 shadow-[6px_6px_0px_0px_#111]">
        <div className="text-center space-y-6">
          <div className="bg-white rounded-2xl border-2 border-black p-6 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <p className="text-lg font-bold text-black tracking-tight mb-2">Check your inbox</p>
            <p className="text-sm font-medium text-black/70">
              We&apos;ve sent a verification link to <span className="font-bold text-black">{email}</span>.
              Click the link to activate your account — the link expires in 24 hours.
            </p>
          </div>
          <button
            onClick={() => {
              setSubmitted(false);
              setEmail("");
              setName("");
              setPassword("");
              setConfirmPassword("");
            }}
            className="text-sm font-bold text-black underline underline-offset-4 hover:text-black/60 transition-colors"
          >
            Didn&apos;t get the email? Try again
          </button>
          <Link
            href="/login"
            className="block text-sm font-bold text-black/60 hover:text-black transition-colors"
          >
            Already verified? Log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl rounded-[2rem] border-2 border-black bg-[#0D9488] shadow-[6px_6px_0px_0px_#111] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Form side */}
        <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
          <div className="mb-7">
            <h2 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-black">Create an account</h2>
            <p className="text-sm sm:text-base text-black/60 font-medium tracking-wider mt-2">Join the student hub today</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-black tracking-widest">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                required
                className="w-full h-14 px-4 rounded-xl border-2 border-black bg-white text-base font-medium text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all placeholder:text-black/40"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-black tracking-widest">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                required
                className="w-full h-14 px-4 rounded-xl border-2 border-black bg-white text-base font-medium text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all placeholder:text-black/40"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-black tracking-widest">Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-black tracking-widest">Confirm Password</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>

            {/* Passive consent — submitting the form accepts the policies */}
            <p className="text-xs font-medium text-black/70 leading-snug text-center px-2">
              By signing up, you accept our{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-black underline underline-offset-2 hover:text-[#0D9488] transition-colors"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="/terms#privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-black underline underline-offset-2 hover:text-[#0D9488] transition-colors"
              >
                Privacy Policy
              </a>
            </p>

            <button
              type="submit"
              className="w-full text-lg h-14 rounded-full border-2 border-black bg-[#111] text-white font-bold tracking-widest hover:-translate-y-1 hover:bg-black hover:shadow-[4px_4px_0px_0px_#fff] transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>
          </form>
        </div>

        {/* Brand side — black hero panel */}
        <BrandPanel>
          <div className="flex flex-col gap-5">
            <BrandMark />

            <p className="text-3xl sm:text-4xl font-bold leading-[0.95] tracking-[-0.02em] uppercase text-white">
              <span className="whitespace-nowrap">Study smarter.</span>
              <br />
              <span className="text-[#2DD4BF] whitespace-nowrap">Share more.</span>
            </p>
          </div>

          <div className="flex flex-col">
            <PerkList />
          </div>

          <div className="flex flex-col gap-4">
            <div className="h-px bg-white/15" />

            <p className="text-center text-xs font-bold tracking-widest text-white/50">OR SIGN UP WITH</p>
            <OAuthButtons />

            <p className="text-center text-sm font-medium text-white/70 pt-1">
              Already have an account?{" "}
              <Link href="/login" className="font-bold text-white underline underline-offset-4 hover:text-[#2DD4BF] transition-colors">
                Log in
              </Link>
            </p>
          </div>
        </BrandPanel>
      </div>
    </div>
  );
}
