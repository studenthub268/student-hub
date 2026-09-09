"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Neo-brutalist confirmation dialog — replaces native window.confirm()
 * so destructive actions match the site theme everywhere.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busyLabel = "Working…",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, busy, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={() => !busy && onCancel()}
      />

      {/* Card */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-[2rem] border-2 border-black bg-white p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] scale-in"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border-2 border-black bg-red-500 text-white">
          <AlertTriangle className="h-6 w-6" strokeWidth={2} />
        </div>
        <h2 className="text-center text-xl font-black tracking-tight text-black">{title}</h2>
        <p className="mt-3 text-center text-sm font-medium leading-relaxed text-black/60">{message}</p>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-full border-2 border-black bg-white px-5 py-3 text-sm font-bold tracking-wider text-black transition-all hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className="flex-1 rounded-full border-2 border-black bg-red-500 px-5 py-3 text-sm font-bold tracking-wider text-white transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#111] disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
