"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { requestPasswordReset } from "@/lib/actions/auth";
import { ChevronLeft } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await requestPasswordReset(email);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      setSubmitted(true);
      toast.success("Password reset link sent to your email!");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to send reset link"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-6 bg-surface selection:bg-accent">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border-2 border-ink bg-accent p-8 sm:p-10 shadow-hard">

        <Link
          href="/login"
          className="inline-flex items-center gap-2 mb-6 text-sm font-bold text-foreground/60 hover:text-foreground transition-colors tracking-wider"
        >
          <ChevronLeft className="h-4 w-4" /> Back to login
        </Link>

        <div className="mb-8 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-foreground">Reset Password</h2>
          <p className="text-base text-foreground/60 font-medium tracking-wider mt-2">
            Enter your email to receive a recovery link
          </p>
        </div>

        {submitted ? (
          <div className="text-center space-y-6">
            <div className="bg-surface rounded-2xl border-2 border-ink p-6 shadow-hard-sm">
              <p className="text-lg font-bold text-foreground tracking-tight mb-2">Check your inbox</p>
              <p className="text-sm font-medium text-foreground/70">
                We&apos;ve sent a password reset link to <span className="font-bold text-foreground">{email}</span>.
                Please follow the link in that email to reset your password.
              </p>
            </div>
            <button
              onClick={() => setSubmitted(false)}
              className="text-sm font-bold text-foreground underline underline-offset-4 hover:text-foreground/60 transition-colors"
            >
              Didn&apos;t get the email? Try again
            </button>
          </div>
        ) : (
          <form onSubmit={handleResetRequest} noValidate className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-bold text-foreground tracking-wider">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                required
                className="w-full h-14 px-4 rounded-xl border-2 border-ink bg-surface text-base font-medium text-foreground shadow-hard-sm focus:outline-none focus:shadow-hard transition-all placeholder:text-foreground/60"
              />
            </div>

            <button
              type="submit"
              className="w-full text-lg h-16 mt-4 rounded-full border-2 border-ink bg-ink on-ink font-bold tracking-wider hover:-translate-y-1 hover:bg-ink hover:shadow-hard-accent transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
