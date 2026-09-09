"use client";

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

/**
 * Offline banner — styled like the verification banner (top bar). Shows
 * whenever the browser reports no connectivity; disappears the moment
 * the connection returns. Uses the `online`/`offline` window events plus
 * the navigator.onLine initial value.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reads a live
       external system (navigator connectivity); events keep it in sync */
    setOffline(!navigator.onLine);

    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-red-500 border-b-2 border-black px-4 py-2.5 text-center text-sm font-bold text-white"
    >
      <span className="inline-flex flex-wrap items-center justify-center gap-2">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>You&apos;re offline — showing saved pages. Reconnect to load the latest content.</span>
      </span>
    </div>
  );
}
