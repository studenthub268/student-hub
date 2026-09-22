"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { Trash2, AlertTriangle, X } from "lucide-react";
import { deleteMyAccount } from "@/lib/actions/auth";
import { getErrorMessage } from "@/lib/utils";
import { PasswordInput } from "@/components/ui/PasswordInput";

/**
 * Danger zone — account deletion (privacy-policy "right to erasure").
 * Two-step guard: explicit modal + typed confirmation ("DELETE MY ACCOUNT"),
 * then server-side password re-auth for credentials accounts.
 */
export function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const armed = confirmText.trim().toUpperCase() === "DELETE MY ACCOUNT" && (!hasPassword || password.length > 0);

  const handleDelete = async () => {
    if (!armed || loading) return;
    setLoading(true);
    try {
      const result = await deleteMyAccount(hasPassword ? password : undefined);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Your account and data have been deleted.");
      // Session is revoked server-side; hard navigation clears client state.
      window.location.href = "/";
    } catch (error) {
      toast.error(getErrorMessage(error, "Something went wrong"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="rounded-[2rem] border-2 border-red-600 bg-surface p-5 sm:p-8 shadow-[4px_4px_0px_0px_rgba(220,38,38,1)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="max-w-xl">
            <h2 className="text-xl font-black tracking-tight text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Delete your account
            </h2>
            <p className="mt-2 text-sm font-medium text-foreground/70 leading-relaxed">
              Permanently delete your account and all personal data: your profile, uploads (including the files
              themselves), likes, and reports. <strong>This process cannot be undone.</strong> Resources shared with the
              community will be removed for everyone.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-red-600 px-6 py-3 text-sm font-bold tracking-wider text-background hover:-translate-y-1 hover:shadow-hard transition-all sm:w-auto sm:flex-shrink-0"
          >
            <Trash2 className="h-4 w-4" />
            Delete My Account
          </button>
        </div>
      </div>

      {/* Confirmation modal */}
      {open && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-foreground/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2rem] border-2 border-ink bg-surface p-5 sm:p-8 shadow-hard-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 id="delete-account-title" className="text-xl sm:text-2xl font-black tracking-tight text-red-600">
                Delete your account?
              </h3>
              <button
                onClick={() => !loading && setOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-muted transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-foreground" />
              </button>
            </div>

            <p className="text-sm font-medium text-foreground/70 leading-relaxed mb-5 sm:mb-6">
              Everything goes: profile, uploads and their files, likes, and reports.
              <strong> This process cannot be undone.</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="delete-confirm" className="mb-2 block text-xs font-bold tracking-widest text-foreground">
                  TYPE &quot;DELETE MY ACCOUNT&quot; TO CONFIRM
                </label>
                <input
                  id="delete-confirm"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE MY ACCOUNT"
                  autoComplete="off"
                  className="w-full h-12 px-4 rounded-xl border-2 border-ink bg-surface text-sm font-bold text-foreground shadow-hard-sm focus:outline-none focus:shadow-hard transition-all placeholder:text-foreground/70"
                />
              </div>

              {hasPassword && (
                <div>
                  <label htmlFor="delete-password" className="mb-2 block text-xs font-bold tracking-widest text-foreground">
                    YOUR PASSWORD
                  </label>
                  <PasswordInput
                    id="delete-password"
                    size="md"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
              )}
            </div>

            {/* Stacked full-width on mobile (side-by-side pills overflow a
                390px viewport — "Delete Forever" can't shrink below its text),
                row on sm+. Destructive action sits at the bottom, away from
                accidental thumb taps. */}
            <div className="mt-6 sm:mt-8 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                onClick={() => !loading && setOpen(false)}
                disabled={loading}
                className="w-full sm:flex-1 h-12 rounded-full border-2 border-ink bg-surface text-sm font-bold tracking-wider text-foreground hover:bg-surface-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!armed || loading}
                className="w-full sm:flex-1 h-12 rounded-full border-2 border-ink bg-red-600 text-sm font-bold tracking-wider text-background hover:-translate-y-0.5 hover:shadow-hard transition-all disabled:border-line-strong disabled:bg-red-600/50 disabled:text-background/90 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                {loading ? "Deleting…" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
