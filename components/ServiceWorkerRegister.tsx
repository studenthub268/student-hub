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
        const reg = await navigator.serviceWorker.register("/sw.js");

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
