import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { CLERK_APPEARANCE } from "@/lib/clerk-theme";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Sign in — Student Hub",
  robots: { index: false, follow: true },
};

// The Clerk sign-in page, hosted in the pre-Clerk split-panel card.
// signUpUrl keeps the "Sign up" action on our themed page instead of
// Clerk's hosted default.
export default function SignInPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12 px-4">
      <AuthShell mode="sign-in" title="Welcome back" subtitle="Sign in to your account">
        <SignIn
          appearance={CLERK_APPEARANCE}
          signUpUrl="/sign-up"
          signUpForceRedirectUrl="/"
          fallback={<div className="h-72" aria-busy="true" />}
        />
      </AuthShell>
    </div>
  );
}
