"use client";

/**
 * Lazy toast facade — the subset of react-hot-toast's `toast` API the layout
 * components use, with the library dynamically imported on first CALL
 * instead of at import time.
 *
 * Layout-level components (OfflineBanner, VerificationBanner) only toast on
 * rare events ("back online", "verification email sent"), yet a static
 * import pulled the whole ~76 KB library into the shared layout chunk that
 * every visitor downloads before first paint. Route-level components that
 * toast on core flows (upload, auth forms) can keep their static imports —
 * those chunks are already code-split per route and are expected there.
 */

type ToastLib = typeof import("react-hot-toast").toast;
type ToastMessage = Parameters<ToastLib>[0];
type ToastOptions = Parameters<ToastLib>[1];
type PromiseMsgs = Parameters<ToastLib["promise"]>[1];

let libPromise: Promise<ToastLib> | null = null;

function load(): Promise<ToastLib> {
  if (!libPromise) {
    libPromise = import("react-hot-toast").then((mod) => mod.toast);
  }
  return libPromise;
}

// Fire-and-forget: a toast must never surface an import error to the
// caller, and a failed load simply drops the message.
function run(fn: (toast: ToastLib) => void) {
  void load().then(fn, () => {});
}

export const toast = {
  success(message: ToastMessage, opts?: ToastOptions) {
    run((t) => t.success(message, opts));
  },
  error(message: ToastMessage, opts?: ToastOptions) {
    run((t) => t.error(message, opts));
  },
  loading(message: ToastMessage, opts?: ToastOptions) {
    run((t) => t.loading(message, opts));
  },
  dismiss(toastId?: string) {
    run((t) => t.dismiss(toastId));
  },
  promise<T>(promise: Promise<T>, msgs: PromiseMsgs, opts?: ToastOptions) {
    // Return the caller's promise either way so await-sites keep working
    // even if the library chunk failed to load.
    return load()
      .then((t) => t.promise(promise, msgs, opts))
      .catch(() => promise);
  },
};
