import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { CLERK_APPEARANCE } from "@/lib/clerk-theme";

export const metadata: Metadata = {
  title: "Sign up — Student Hub",
  robots: { index: false, follow: true },
};

// The Clerk sign-up page. NextAuth was removed in the cutover, so this is
// the only sign-up route; the legacy /signup path redirects here.
export default function SignUpPage() {
  return (
    <div className="clerk-brutalist flex min-h-[calc(100vh-4rem)] items-center justify-center py-12 px-4">
      <SignUp appearance={CLERK_APPEARANCE} />
    </div>
  );
}
