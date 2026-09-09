"use client";

import { useState, useEffect, useRef } from "react";
import { WifiOff } from "lucide-react";

/**
 * Offline banner — styled like the verification banner (top bar).
 *
 * Detection is ACTIVE, not just passive:
 *  - the browser's `offline`/`online` events fire instantly on interface
 *    changes (wifi drop),
 *  - but `navigator.onLine` stays true when wifi is up while the internet
 *    is down (router/campus outage). So we also probe /api/ping (no-store,
 *    never SW-cached) whenever `online` is claimed, re-checking on the
 *    events, on window focus, and every 30s while offline is suspected.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const probingRef = useRef(false);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    // A "connected" verdict requires both the interface up AND a real
    // round-trip. onLine=false short-circuits straight to offline.
    const check = async () => {
      if (probingRef.current) return;
      probingRef.current = true;
      try {
        if (!navigator.onLine) {
          setOffline(true);
          return;
        }
        const res = await fetch("/api/ping", {
          cache: "no-store",
          // Abort quickly so the banner never hangs in limbo
          signal: AbortSignal.timeout(5000),
          // Low priority: connectivity probes must never compete with real
          // page content for bandwidth.
          priority: "low",
        } as RequestInit & { priority: "low" });
        setOffline(!res.ok);
      } catch {
        setOffline(true);
      } finally {
        probingRef.current = false;
      }
    };

    /* eslint-disable react-hooks/set-state-in-effect -- syncing with an
       external system (connectivity); listeners keep state live */
    setOffline(!navigator.onLine);
    void check();

    const goOffline = () => {
      setOffline(true);
      if (pollInterval) clearInterval(pollInterval);
      // Keep polling while offline so reconnect is caught fast
      pollInterval = setInterval(check, 30_000);
    };
    const goOnline = () => {
      // Optimistically hide, then verify with a real probe
      setOffline(false);
      void check();
    };
    const onFocus = () => void check();

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener("focus", onFocus);
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("focus", onFocus);
      if (pollInterval) clearInterval(pollInterval);
    };
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
