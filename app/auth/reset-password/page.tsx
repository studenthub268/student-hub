"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "react-hot-toast";
import { resetPassword } from "@/lib/actions/auth";
import { validatePasswordStrength } from "@/lib/password";
import { getErrorMessage } from "@/lib/utils";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      toast.error("Invalid or expired reset link. Please request a new one.");
      router.push("/login/forgot-password");
    }
  }, [token, router]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) return;

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    setLoading(true);

    try {
      const result = await resetPassword(token, password);

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Password updated successfully!");
      router.push("/login");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update password"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center p-6 bg-white selection:bg-[#0D9488]">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border-2 border-black bg-[#0D9488] p-8 sm:p-10 shadow-[4px_4px_0px_0px_#111]">

        <div className="mb-8 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-black">New Password</h2>
          <p className="text-base text-black/60 font-medium tracking-wider mt-2">
            Set a strong new password for your account
          </p>
        </div>

        <form onSubmit={handlePasswordReset} noValidate className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-bold text-black tracking-wider">New Password</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-black tracking-wider">Confirm New Password</label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full text-lg h-16 mt-4 rounded-full border-2 border-black bg-[#111] text-white font-bold tracking-wider hover:-translate-y-1 hover:bg-black hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            disabled={loading}
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
