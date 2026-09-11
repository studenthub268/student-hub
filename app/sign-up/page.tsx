import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign up — Student Hub",
  robots: { index: false, follow: true },
};

// Phase 1 of the Clerk migration: live only when Clerk keys are configured;
// otherwise fall back to the current NextAuth signup until cutover.
export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect("/signup");

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12 px-4">
      <SignUp />
    </div>
  );
}
