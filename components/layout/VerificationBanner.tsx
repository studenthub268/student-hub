"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { MailWarning } from "lucide-react";
import { resendVerificationEmail } from "@/lib/actions/auth";

/**
 * Warning bar at the very top of the page for signed-in users whose email
 * is not yet verified, with a one-click resend. Hidden for guests and
 * verified users. Status comes from /api/check-verified (one lightweight
 * request, mirroring the /api/check-admin pattern).
 */
export function VerificationBanner() {
  const [state, setState] = useState<"loading" | "hidden" | "show">("loading");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/check-verified")
      .then((res) => res.json())
      .then((data) => {
        setState(data?.authenticated && data?.verified === false ? "show" : "hidden");
      })
      .catch(() => setState("hidden"));
  }, []);

  if (state !== "show") return null;

  const handleResend = async () => {
    setSending(true);
    try {
      const result = await resendVerificationEmail();
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Verification email sent — check your inbox!");
      }
    } catch {
      toast.error("Failed to send the email. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-amber-400 border-b-2 border-black px-4 py-2.5 text-center text-sm font-bold text-black">
      <span className="inline-flex flex-wrap items-center justify-center gap-2">
        <MailWarning className="h-4 w-4 shrink-0" />
        <span>Please verify your email address to fully activate your account.</span>
        <button
          onClick={handleResend}
          disabled={sending}
          className="underline underline-offset-2 hover:no-underline disabled:opacity-50 disabled:no-underline"
        >
          {sending ? "Sending..." : "Resend verification email"}
        </button>
      </span>
    </div>
  );
}
