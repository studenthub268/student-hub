import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { CLERK_APPEARANCE } from "@/lib/clerk-theme";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Sign up — Student Hub",
  robots: { index: false, follow: true },
};

// The Clerk sign-up page, hosted in the pre-Clerk split-panel card.
// signInUrl keeps the "Log in" action on our themed page instead of
// Clerk's hosted default.
export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12 px-4">
      <AuthShell mode="sign-up" title="Create an account" subtitle="Join the student hub today">
        <SignUp
          appearance={CLERK_APPEARANCE}
          signInUrl="/sign-in"
          signInForceRedirectUrl="/"
          fallback={<div className="h-96" aria-busy="true" />}
        />
      </AuthShell>
    </div>
  );
}
