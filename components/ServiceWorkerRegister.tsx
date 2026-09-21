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

    // Native notifications: clear leftover "upload failed" bubbles when the
    // user returns to the app (they're stale by then). No-op when the
    // Notifications API is missing.
    const clearNotifications = () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      navigator.serviceWorker.ready
        .then((reg) => reg.getNotifications({ tag: "student-hub-error" }))
        .then((list) => {
          for (const n of list) n.close();
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", clearNotifications);
    window.addEventListener("focus", clearNotifications);

    const register = async () => {
      try {
        // ?swv cache-buster: browsers that already pinned a year-long immutable
        // copy of /sw.js (the old header bug) would never re-fetch it — the
        // buster forces this one fetch of the fixed, no-cache worker.
        const reg = await navigator.serviceWorker.register("/sw.js?swv=8");

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

    return () => {
      document.removeEventListener("visibilitychange", clearNotifications);
      window.removeEventListener("focus", clearNotifications);
    };
  }, []);

  return null;
}
