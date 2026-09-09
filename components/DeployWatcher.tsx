"use client";

import { useEffect } from "react";
import { DEPLOY_VERSION } from "@/lib/generated/deploy-version";

/**
 * DeployWatcher — keeps open pages fresh without giving up the cache.
 *
 * Every 60s (plus on tab focus) it pings /api/version, which returns the id
 * of the build that is currently deployed. If it differs from the id this
 * page was built with, the page reloads ONCE (session-guarded, never in a
 * loop, never while the user is mid-typing or offline). Combined with the
 * network-first service worker, this means every visitor sees a new deploy
 * within about a minute — no manual refresh — while the cache still makes
 * repeat visits instant and pages available offline.
 */
export function DeployWatcher() {
  useEffect(() => {
    // The id this page loaded with, remembered on first render of this tab.
    // (sessionStorage survives bfcache restores of the same page version.)
    const STORE = "deploy-version-seen";
    const stored = sessionStorage.getItem(STORE);
    const buildId = stored ?? DEPLOY_VERSION;
    if (!stored) sessionStorage.setItem(STORE, buildId);

    // Guard keys: one auto-reload per deploy per tab session.
    const RELOAD_KEY = "deploy-reloaded-for";
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) return;
      // Never yank the page while the user is typing somewhere.
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) return;

      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (!v || v === buildId) return;
        if (sessionStorage.getItem(RELOAD_KEY) === v) return; // already reloaded for this deploy
        sessionStorage.setItem(RELOAD_KEY, v);
        sessionStorage.setItem(STORE, v);
        window.location.reload();
      } catch {
        // offline or transient error — try again next tick
      }
    };

    const interval = setInterval(check, 60_000);
    const onFocus = () => setTimeout(check, 800); // small delay so focus isn't stolen mid-interaction
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
