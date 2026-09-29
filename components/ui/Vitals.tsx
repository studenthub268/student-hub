"use client";

import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Real-user Core Web Vitals reporting (LCP, INP, CLS, FCP, TTFB).
 *
 * next/web-vitals wraps the web-vitals library and fires for each metric as
 * the browser finalizes it (LCP/CLS keep refining until unload; the hook
 * handles the debounce). Each sample is POSTed to /api/vitals, which
 * aggregates per (path, day, metric) — the same privacy posture as the
 * pageview collector: path only, no cookies, no identifiers, first-party
 * only, so no consent gate is needed and /terms#cookies stays true.
 *
 * The path is captured at mount and reused for every metric the hook
 * reports. Client-side navigations remount this component? No — it sits in
 * the root layout, so it stays mounted across navigations and the hook
 * keeps firing; pathname in a ref avoids re-registering the callback (and
 * without the ref, a metric finalized after a navigation would be
 * attributed to the stale closure's path).
 */
export function Vitals() {
  const pathname = usePathname();
  // Latest path at report time; refs read current values inside the
  // long-lived callback without re-subscribing.
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useReportWebVitals((metric) => {
    // The hook's metric object: { name, value, rating, ... }. value is the
    // finalized measurement in ms (or a unitless score for CLS).
    const { name, value } = metric;
    if (typeof value !== "number" || !Number.isFinite(value)) return;

    const path = pathRef.current;
    if (!path || path.startsWith("/admin")) return; // match Analytics' exclusions

    fetch("/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, metric: name, value }),
      // Metrics often fire during/after unload (LCP finalizes on the last
      // paint, INP on the last interaction) — keepalive lets the request
      // survive page teardown.
      keepalive: true,
    }).catch(() => {
      /* vitals reporting must never surface an error to the visitor */
    });
  });

  return null;
}
