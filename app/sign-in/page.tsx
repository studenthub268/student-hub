import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { CLERK_APPEARANCE } from "@/lib/clerk-theme";

export const metadata: Metadata = {
  title: "Sign in — Student Hub",
  robots: { index: false, follow: true },
};

// The Clerk sign-in page. NextAuth was removed in the cutover, so this is
// the only sign-in route; the legacy /login path redirects here.
export default function SignInPage() {
  return (
    <div className="clerk-brutalist flex min-h-[calc(100vh-4rem)] items-center justify-center py-12 px-4">
      <SignIn appearance={CLERK_APPEARANCE} />
    </div>
  );
}
