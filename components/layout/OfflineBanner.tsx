"use client";

import { useState, useEffect, useRef } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * Offline banner — shown ONLY when the connection is verifiably down, not
 * merely slow.
 *
 * The old version flipped to "You're offline" after a single probe with a
 * 5-second timeout — but a working 3G connection routinely takes 6-10s for
 * a round trip, so a large share of the site's on-campus/prepaid audience
 * saw "You're offline" WHILE pages were actually loading. Three changes:
 *
 *  1. The probe timeout scales to the connection: 5s on fast links, up to
 *     15s when `navigator.connection` reports a slow effective type.
 *  2. Slow-but-alive probes (the timeout fired but the OS link is up) are
 *     treated as ONLINE — a slow site beats a false "offline" claim.
 *  3. A true outage requires the OS to agree (navigator.onLine false) OR
 *     two consecutive dead probes — one dropped packet on flaky mobile
 *     data no longer shows the banner.
 *
 * Detection is still ACTIVE (probes /api/ping, never SW-cached), because
 * `online`/`offline` events can't see "wifi up, internet down".
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const probingRef = useRef(false);
  // Mirror of `offline` readable inside the probe callbacks, plus a flag
  // that survives the optimistic online-hide: the toast must fire on the
  // VERIFIED recovery, which lands after `online` already hid the banner.
  const offlineRef = useRef(false);
  const seenOfflineRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);

  // Single funnel for every verdict so the transition lives in one place.
  const apply = (next: boolean) => {
    if (next) seenOfflineRef.current = true;
    offlineRef.current = next;
    setOffline(next);
  };

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    // Slow links get a longer leash: a 3G round trip regularly exceeds 5s,
    // and declaring that "offline" is worse than useless — it makes users
    // distrust the banner entirely.
    const probeTimeoutMs = () => {
      const conn = (
        navigator as Navigator & {
          connection?: { effectiveType?: string; saveData?: boolean };
        }
      ).connection;
      switch (conn?.effectiveType) {
        case "slow-2g":
        case "2g":
          return 15_000;
        case "3g":
          return 12_000;
        default:
          return 5_000;
      }
    };

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
        try {
          const res = await fetch("/api/ping", {
            cache: "no-store",
            signal: AbortSignal.timeout(probeTimeoutMs()),
            // Low priority: connectivity probes must never compete with
            // real page content for bandwidth.
            priority: "low",
          } as RequestInit & { priority: "low" });
          if (res.ok) {
            consecutiveFailuresRef.current = 0;
            // Toast only on a VERIFIED recovery after a real outage.
            if (seenOfflineRef.current) {
              seenOfflineRef.current = false;
              toast.success("Back online — showing the latest content.", {
                duration: 2500,
              });
            }
            apply(false);
          } else {
            throw new Error("probe failed");
          }
        } catch {
          // Timeout or network error. If the OS still says we're online,
          // this is much more likely a SLOW link (or one dropped request)
          // than a dead one — don't scare the user off a site that's
          // merely crawling. Only two consecutive dead probes (or the OS
          // giving up on the interface) earn the banner.
          consecutiveFailuresRef.current += 1;
          if (!navigator.onLine || consecutiveFailuresRef.current >= 2) {
            apply(true);
          } else {
            apply(false); // slow, not down — stay quiet
          }
        }
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
      consecutiveFailuresRef.current = 0;
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

  // Fixed pill, not a full-width bar: the navbar is sticky top-4 at every
  // scroll position, so a FIXED banner at a constant offset below it stays
  // glued to the bar whether the page is scrolled or at the top.
  // top-[5.75rem] = 92px: navbar bottom edge (72px) + 4px shadow + 16px gap.
  // Animated via .offline-banner (slide+settle), dot via .offline-dot; both
  // are killed by the prefers-reduced-motion clamp in globals.css.
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-[5.75rem] z-[60] flex justify-center px-4 pointer-events-none"
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
