"use client";

import { useState, useEffect, useRef } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "react-hot-toast";

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
  // Mirror of `offline` readable inside the probe callbacks, plus a flag
  // that survives the optimistic online-hide: the toast must fire on the
  // VERIFIED recovery, which lands after `online` already hid the banner.
  const offlineRef = useRef(false);
  const seenOfflineRef = useRef(false);

  // Single funnel for every verdict so the transition lives in one place.
  const apply = (next: boolean) => {
    if (next) seenOfflineRef.current = true;
    offlineRef.current = next;
    setOffline(next);
  };

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    // A "connected" verdict requires both the interface up AND a real
    // round-trip. onLine=false short-circuits straight to offline.
    const check = async () => {
      if (probingRef.current) return;
      probingRef.current = true;
      try {
        if (!navigator.onLine) {
          apply(true);
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
        // Toast only on a VERIFIED recovery: the probe succeeded after the
        // banner has shown offline at some point (seenOfflineRef survives
        // the optimistic `online`-event hide, and the optimistic path
        // itself never toasts — on flaky Wi-Fi it fires before the
        // internet is actually back).
        if (res.ok && seenOfflineRef.current) {
          seenOfflineRef.current = false;
          toast.success(
            "Back online — showing the latest content.",
            { duration: 2500 }
          );
        }
        apply(!res.ok);
      } catch {
        apply(true);
      } finally {
        probingRef.current = false;
      }
    };

    /* eslint-disable react-hooks/set-state-in-effect -- syncing with an
       external system (connectivity); listeners keep state live */
    apply(!navigator.onLine);
    void check();

    const goOffline = () => {
      apply(true);
      if (pollInterval) clearInterval(pollInterval);
      // Keep polling while offline so reconnect is caught fast
      pollInterval = setInterval(check, 30_000);
    };
    const goOnline = () => {
      // Optimistically hide, then verify with a real probe
      apply(false);
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
    /* Sticky pill, not a full-width bar: it sits under the floating navbar
       (same z-plane, same rounded ink-card language) instead of shoving the
       whole page down. Sticky keeps it visible while scrolling — on mobile
       the scrolled-away bar was exactly when users needed the "why is
       nothing loading" explanation. Animated via .offline-banner (slide+
       settle), dot via .offline-dot; both are killed by the
       prefers-reduced-motion clamp in globals.css. */
    <div
      role="status"
      aria-live="polite"
      className="sticky top-[4.75rem] sm:top-[5.25rem] lg:top-24 z-[60] flex justify-center px-4 pointer-events-none"
    >
      <div className="offline-banner pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border-2 border-ink bg-ink on-ink py-2 pl-3 pr-4 shadow-hard">
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400/15" aria-hidden="true">
          <WifiOff className="h-3.5 w-3.5 text-amber-400" />
          {/* Pulsing ring: "still trying" without extra words. */}
          <span className="offline-dot absolute inset-0 rounded-full border-2 border-amber-400/60" />
        </span>
        <span className="text-sm font-semibold tracking-tight">
          You&apos;re offline
          <span className="hidden font-medium opacity-70 sm:inline">
            {" "}— showing saved pages. Reconnect for the latest.
          </span>
          <span className="font-medium opacity-70 sm:hidden"> — saved pages only</span>
        </span>
      </div>
    </div>
  );
}
