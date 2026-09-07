"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { verifyEmail } from "@/lib/actions/auth";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">(token ? "loading" : "error");
  // Unverified users can be signed in while they verify (nag-banner flow),
  // so the success CTA depends on whether a session already exists.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((session) => setSignedIn(!!session?.user))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    verifyEmail(token).then((result) => {
      if (result?.error) {
        setStatus("error");
        toast.error(result.error);
      } else {
        setStatus("success");
        toast.success("Email verified! You can now log in.");
      }
    });
  }, [token]);

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-6 bg-white selection:bg-[#0D9488]">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border-2 border-black bg-[#0D9488] p-8 sm:p-10 shadow-[4px_4px_0px_0px_#111]">

        <div className="mb-8 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-black">
            {status === "loading" && "Verifying..."}
            {status === "success" && "Email Verified!"}
            {status === "error" && "Verification Failed"}
          </h2>
          <p className="text-base text-black/60 font-medium tracking-wider mt-2">
            {status === "loading" && "Please wait while we verify your email."}
            {status === "success" && "Your account is now active. You can log in and start exploring."}
            {status === "error" && (
              token
                ? "This verification link is invalid or has expired."
                : "No verification token found in the URL."
            )}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {status === "success" && (
            <Link
              href={signedIn ? "/" : "/login"}
              className="w-full text-center text-lg h-16 flex items-center justify-center rounded-full border-2 border-black bg-[#111] text-white font-bold tracking-wider hover:-translate-y-1 hover:bg-black hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all"
            >
              {signedIn ? "Go to Home" : "Go to Login"}
            </Link>
          )}
          {status === "error" && (
            <>
              <Link
                href="/signup"
                className="w-full text-center text-lg h-16 flex items-center justify-center rounded-full border-2 border-black bg-[#111] text-white font-bold tracking-wider hover:-translate-y-1 hover:bg-black hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all"
              >
                Sign Up Again
              </Link>
              <Link
                href="/login"
                className="w-full text-center text-lg h-14 flex items-center justify-center rounded-full border-2 border-black bg-white text-black font-bold tracking-wider hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all"
              >
                Go to Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
