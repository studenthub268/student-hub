import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Custom auth error page (wired via `pages.error` in lib/auth.ts).
 *
 * Replaces NextAuth's default error page — the bare "Server error" wall users
 * kept hitting on Google/GitHub sign-in. Every failure now lands here with a
 * human explanation, the raw error code (for support reports), and a way
 * forward. The page lives under /auth/*, which the proxy keeps public, so it
 * can never loop back into a redirect.
 */

type ErrorView = {
  heading: string;
  message: string;
};

const ERROR_VIEWS: Record<string, ErrorView> = {
  Configuration: {
    heading: "Sign-in hiccup",
    message:
      "We hit a temporary problem while completing your sign-in. This is usually a blip on our side — please try again in a moment.",
  },
  OAuthCallbackError: {
    heading: "Sign-in couldn't complete",
    message:
      "The sign-in provider didn't finish the handshake. If you cancelled on their page, just start over — otherwise please try again.",
  },
  OAuthAccountNotLinked: {
    heading: "Account already registered",
    message:
      "This email is already registered with a different sign-in method. Please sign in with your email and password instead.",
  },
  AccountNotLinked: {
    heading: "Account already registered",
    message:
      "This email is already registered with a different sign-in method. Please sign in with your email and password instead.",
  },
  AccessDenied: {
    heading: "Access denied",
    message:
      "You don't have permission to sign in with this account. If you think this is a mistake, contact us via the contact page.",
  },
  Verification: {
    heading: "Link expired",
    message:
      "This sign-in link is no longer valid — it may have been used already or has expired. Please start again.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const view = (error && ERROR_VIEWS[error]) || {
    heading: "Sign-in hiccup",
    message: "Something went wrong while signing you in. Please try again.",
  };

  // Surface the failure class in server logs so recurring sign-in issues can
  // be traced on Vercel without reproducing them locally. Logs the error code
  // only — no user data ever reaches this page.
  if (error) {
    console.error(`[auth] sign-in error page shown to user (error=${error})`);
  }

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-6 bg-white selection:bg-[#0D9488]">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border-2 border-black bg-[#0D9488] p-8 sm:p-10 shadow-[4px_4px_0px_0px_#111]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-amber-100">
            <AlertTriangle className="h-7 w-7 text-amber-600" strokeWidth={2} />
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-black">
            {view.heading}
          </h2>
          <p className="text-base text-black/60 font-medium tracking-wider mt-2">
            {view.message}
          </p>
          {error && (
            <p className="mt-3 text-xs font-medium tracking-wider text-black/40">
              Error code: {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Link
            href="/login"
            className="w-full text-center text-lg h-16 flex items-center justify-center rounded-full border-2 border-black bg-[#111] text-white font-bold tracking-wider hover:-translate-y-1 hover:bg-black hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all"
          >
            Try signing in again
          </Link>
          <Link
            href="/"
            className="w-full text-center text-lg h-14 flex items-center justify-center rounded-full border-2 border-black bg-white text-black font-bold tracking-wider hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all"
          >
            Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
