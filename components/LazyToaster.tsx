"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// react-hot-toast (~72 KB with its portal machinery) shipped on every page
// but only renders when something actually calls toast(). Loading it
// dynamically means toasts fired before the chunk lands still queue —
// the library buffers calls made while it is not yet mounted — and the
// first meaningful paint no longer pays for it.
const Toaster = dynamic(
  () => import("react-hot-toast").then((mod) => mod.Toaster),
  { ssr: false }
);

const TOAST_OPTIONS = {
  className: "sh-toast sh-toast-default",
  success: { className: "sh-toast sh-toast-success" },
  error: { className: "sh-toast sh-toast-error" },
} as const;

/**
 * Mounts the Toaster only once the browser is idle (or after a short delay
 * on browsers without requestIdleCallback), so toast JS never competes with
 * hydration of the actual page.
 */
export function LazyToaster() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => setReady(true);
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(load, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(load, 1500);
    return () => clearTimeout(t);
  }, []);

  // Not ready yet: nothing rendered, nothing fetched. toast() calls made
  // before mount are buffered by the library and replayed on mount.
  if (!ready) return null;

  return (
    <Toaster
      position="bottom-right"
      toastOptions={TOAST_OPTIONS}
    />
  );
}
