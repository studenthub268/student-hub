"use client";

// Clerk email-link / sign-in-token consumer (documented pattern:
// clerk.com/docs → "Embeddable email links with sign-in tokens").
// A single-use token minted via the Backend API auto-signs the user in.
// Also the E2E/CI sign-in mechanism for the smoke suite.
import { useSignIn, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AcceptTokenClient() {
  const { signIn } = useSignIn();
  const { isSignedIn } = useUser();
  const signInToken = useSearchParams().get("token");
  const next = useSearchParams().get("next") || "/";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signInToken || isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const { error } = await signIn?.create({ strategy: "ticket", ticket: signInToken });
        if (error) {
          if (!cancelled) setError("This sign-in link is invalid or has expired.");
          return;
        }
        // Finalize activates the session when the sign-in is complete. It can
        // 400 on a pending device-trust task even though the session is live,
        // so its failure is non-fatal — the hard navigation below picks up
        // the session cookie either way.
        try {
          await signIn?.finalize();
        } catch {}
        // Navigate UNCONDITIONALLY on success: signIn.create resolving flips
        // isSignedIn, which re-renders this component and trips `cancelled` —
        // so a cancelled check here would skip the navigation forever.
        window.location.replace(next);
      } catch {
        if (!cancelled) setError("This sign-in link is invalid or has expired.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signIn, signInToken, isSignedIn, next]);

  if (isSignedIn && !error) {
    return <p className="p-8 text-center">Signed in. Continue to the site.</p>;
  }
  return (
    <p className="p-8 text-center" role="status">
      {error ?? "Signing you in…"}
    </p>
  );
}
