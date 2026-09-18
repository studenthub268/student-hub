"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Privacy-safe analytics.
 *
 * Counts page views per path + referrer host into first-party storage via
 * the /api/analytics route. No cookies, no fingerprinting, no third-party
 * requests, no personal data — so it needs no consent gate and keeps
 * /terms#cookies ("no analytics cookies") true.
 *
 * ponytail: one aggregated row per path+day. Swap in Umami/Plausible
 * (self-hosted) only when funnels or sessions are actually needed.
 */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    // Referrer host only — full URLs can carry personal data in query strings.
    const ref = document.referrer;
    let refHost: string | null = null;
    if (ref) {
      try {
        const refUrl = new URL(ref);
        if (refUrl.host !== location.host) refHost = refUrl.host;
      } catch {}
    }
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, referrer: refHost }),
      keepalive: true,
    }).catch(() => {
      /* analytics must never surface an error to the visitor */
    });
  }, [pathname]);

  return null;
}
