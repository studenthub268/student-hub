"use client";

import { useEffect } from "react";

/**
 * Deploy-refresh: when a new service worker is waiting (i.e. a deploy just
 * happened), tell it to take over and reload the page once so users always
 * see the latest UI — no stale-HTML confusion after deploys.
 * The reload is guarded by sessionStorage so it can never loop.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        // ?swv cache-buster: browsers that already pinned a year-long immutable
        // copy of /sw.js (the old header bug) would never re-fetch it — the
        // buster forces this one fetch of the fixed, no-cache worker.
        const reg = await navigator.serviceWorker.register("/sw.js?swv=7");

        // If a new worker is already waiting, activate it now
        if (reg.waiting) {
          sendSkipAndReload(reg);
          return;
        }

        // Otherwise watch for one arriving (deploy happened mid-session)
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              sendSkipAndReload(reg);
            }
          });
        });
      } catch {
        // SW registration failed — non-critical
      }
    };

    const sendSkipAndReload = (reg: ServiceWorkerRegistration) => {
      if (sessionStorage.getItem("sw-reloaded")) return;
      sessionStorage.setItem("sw-reloaded", "1");
      reg.waiting?.postMessage("SKIP_WAITING");
      // Give the message a beat to land, then reload into the new world
      setTimeout(() => window.location.reload(), 200);
    };

    register();
  }, []);

  return null;
}
