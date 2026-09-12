import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Sign up — Student Hub",
  robots: { index: false, follow: true },
};

// The Clerk sign-up page. NextAuth was removed in the cutover, so this is
// the only sign-up route; the legacy /signup path redirects here.
export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12 px-4">
      <SignUp />
    </div>
  );
}
