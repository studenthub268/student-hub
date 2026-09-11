import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign in — Student Hub",
  robots: { index: false, follow: true },
};

// Phase 1 of the Clerk migration: live only when Clerk keys are configured;
// otherwise fall back to the current NextAuth login until cutover.
export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect("/login");

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12 px-4">
      <SignIn />
    </div>
  );
}
