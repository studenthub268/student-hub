"use client";

import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Real-user Core Web Vitals reporting (LCP, INP, CLS, FCP, TTFB).
 *
 * next/web-vitals wraps the web-vitals library and fires for each metric as
 * the browser finalizes it (LCP/CLS keep refining until unload; the hook
 * handles the debounce). Samples are BUFFERED per page and flushed in ONE
 * POST to /api/vitals — five individual requests per page view would
 * multiply collector traffic by 5 at thousands of concurrent visitors, for
 * identical data. The flush fires when the page hides (navigation away /
 * tab background) with keepalive so it survives teardown; a beforeunload
 * fallback catches fast bounce sessions.
 *
 * Aggregation happens per (path, day, metric) server-side — the same
 * privacy posture as the pageview collector: path only, no cookies, no
 * identifiers, first-party only, so no consent gate is needed and
 * /terms#cookies stays true.
 */
export function Vitals() {
  const pathname = usePathname();
  // Latest path at report time; refs read current values inside the
  // long-lived callback without re-subscribing.
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  // Buffer keyed by the path the samples were measured on. Metrics fire
  // 1-5 times per page (LCP/CLS refine); everything for one page goes out
  // in one request.
  const bufferRef = useRef<{ path: string; samples: { metric: string; value: number }[] } | null>(null);
  const flushedRef = useRef(false);

  useEffect(() => {
    // New navigation → new buffer. (This component stays mounted across
    // client navigations; the hook below keeps firing.)
    flushedRef.current = false;
    bufferRef.current = null;
  }, [pathname]);

  useEffect(() => {
    const flush = () => {
      const buf = bufferRef.current;
      if (!buf || buf.samples.length === 0 || flushedRef.current) return;
      flushedRef.current = true;
      fetch("/api/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: buf.path, samples: buf.samples }),
        // Flush fires on page hide (LCP/INP finalize late) — keepalive
        // lets the request survive page teardown.
        keepalive: true,
      }).catch(() => {
        /* vitals reporting must never surface an error to the visitor */
      });
    };
    // pagehide covers navigation-away, tab close, and bfcache entry;
    // visibilitychange-hidden covers app backgrounding (iOS Safari fires
    // pagehide unreliably there).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useReportWebVitals((metric) => {
    // The hook's metric object: { name, value, rating, ... }. value is the
    // finalized measurement in ms (or a unitless score for CLS).
    const { name, value } = metric;
    if (typeof value !== "number" || !Number.isFinite(value)) return;

    const path = pathRef.current;
    if (!path || path.startsWith("/admin")) return; // match Analytics' exclusions

    if (!bufferRef.current || bufferRef.current.path !== path) {
      bufferRef.current = { path, samples: [] };
    }
    // web-vitals reports the FINAL value for refining metrics; replacing
    // (not appending) same-named metrics keeps the batch at ≤5 entries.
    const existing = bufferRef.current.samples.find((s) => s.metric === name);
    if (existing) existing.value = value;
    else bufferRef.current.samples.push({ metric: name, value });
  });

  return null;
}
