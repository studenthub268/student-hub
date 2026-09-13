"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Search, Users } from "lucide-react";
import { useSignIn, useSignUp } from "@clerk/nextjs";

/** Black brand panel — mirrors the homepage hero card. */
function BrandPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative hidden overflow-hidden bg-[#111] p-6 sm:p-8 lg:flex flex-col text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#0D9488]/40 via-[#111] to-[#111]" />
      <div className="relative z-10 flex h-full flex-col justify-between gap-y-5">{children}</div>
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
  { icon: BookOpen, text: "Notes, past papers & quizzes" },
  { icon: Search, text: "Find material in seconds" },
  { icon: Users, text: "Shared by students, for students" },
];

function PerkList() {
  return (
    <ul className="space-y-4">
      {PERKS.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-white/25 bg-white/5">
            <Icon className="w-5 h-5 text-[#2DD4BF]" strokeWidth={2.5} />
          </span>
          <span className="text-sm font-medium text-white/85">{text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Shared OAuth buttons (GitHub + Google), stacked — routed through Clerk. */
function ClerkOAuthButtons({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const start = (provider: "github" | "google") => {
    const strategy: "oauth_github" | "oauth_google" = provider === "github" ? "oauth_github" : "oauth_google";
    // Redirect flow: provider bounces back to /sso-callback, which completes
    // the session via <AuthenticateWithRedirectCallback/> and lands on "/".
    const opts = { strategy, redirectUrl: "/", redirectCallbackUrl: "/sso-callback" };
    // Both helpers exist in both modes; prefer the one matching this page so
    // Clerk creates the right kind of session. Falls back to signIn.
    if (mode === "sign-up" && signUp) return signUp.sso(opts);
    return signIn?.sso(opts);
  };

  const base =
    "w-full h-14 flex items-center justify-center gap-3 rounded-full border-2 border-black bg-white text-black font-bold text-sm tracking-wider hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_#0D9488] transition-all whitespace-nowrap";

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => start("github")} className={base}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        Continue with GitHub
      </button>
      <button type="button" onClick={() => start("google")} className={base}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continue with Google
      </button>
    </div>
  );
}

/**
 * The pre-Clerk split-panel auth card: teal form side + black brand panel.
 * `children` is the Clerk <SignIn/>/<SignUp/> (pass it its own `fallback`);
 * it renders into the form side and is skinned by `.clerk-form-side` CSS
 * (globals.css) so fields/buttons match the old form.
 */
export function AuthShell({
  mode,
  title,
  subtitle,
  children,
}: {
  mode: "sign-in" | "sign-up";
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const isSignUp = mode === "sign-up";
  const switchHref = isSignUp ? "/sign-in" : "/sign-up";
  const switchLabel = isSignUp ? "Log in" : "Sign up";
  const switchPrompt = isSignUp ? "Already have an account?" : "Don't have an account?";
  const oauthLabel = isSignUp ? "OR SIGN UP WITH" : "OR CONTINUE WITH";

  return (
    <div className="mx-auto w-full max-w-4xl rounded-[2rem] border-2 border-black bg-[#0D9488] shadow-[6px_6px_0px_0px_#111] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Form side — Clerk renders here, skinned to match the old form */}
        <div className="clerk-form-side p-6 sm:p-8 lg:p-9 flex flex-col justify-center">
          <div className="mb-7">
            <h2 className="text-3xl sm:text-[2.75rem] font-extrabold leading-none tracking-tight text-black">{title}</h2>
            <p className="text-sm sm:text-base text-black/60 font-medium tracking-wider mt-2">{subtitle}</p>
          </div>
          <div data-clerk-mount>
            {children}
          </div>
        </div>

        {/* Brand side — black hero panel */}
        <BrandPanel>
          <div className="flex flex-col gap-4">
            <BrandMark />
            <p className="text-3xl sm:text-[2.75rem] font-extrabold leading-[0.95] tracking-tight uppercase text-white">
              <span className="whitespace-nowrap">Study smarter.</span>
              <br />
              <span className="text-[#2DD4BF] whitespace-nowrap">Share more.</span>
            </p>
          </div>

          <div className="flex flex-col">
            <PerkList />
          </div>

          <div className="flex flex-col gap-3">
            <div className="h-px bg-white/15" />
            <p className="text-center text-xs font-bold tracking-widest text-white/50">{oauthLabel}</p>
            <ClerkOAuthButtons mode={mode} />
            <p className="text-center text-sm font-medium text-white/70 pt-0.5">
              {switchPrompt}{" "}
              <Link href={switchHref} className="font-bold text-white underline underline-offset-4 hover:text-[#2DD4BF] transition-colors">
                {switchLabel}
              </Link>
            </p>
          </div>
        </BrandPanel>
      </div>

      {/* Mobile-only OAuth + toggle — the black brand panel is hidden on small screens */}
      <div className="lg:hidden flex flex-col gap-4 border-t-2 border-black/20 p-6 sm:p-8">
        <p className="text-center text-xs font-bold tracking-widest text-black/60">{oauthLabel}</p>
        <ClerkOAuthButtons mode={mode} />
        <p className="text-center text-sm font-medium text-black/70">
          {switchPrompt}{" "}
          <Link href={switchHref} className="font-bold text-black underline underline-offset-4 hover:text-white transition-colors">
            {switchLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
