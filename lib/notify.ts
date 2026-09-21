"use client";

import { toast } from "react-hot-toast";

/**
 * Branded notifications that behave like native ones.
 *
 * The site is a PWA with an active service worker, so the Web Notifications
 * API raises real OS-level notifications (system banner, Action Center /
 * Notification Center, lock screen) carrying the Student Hub name and icon —
 * the same surface a native app uses. Where that isn't available (unsupported
 * browser, permission denied, iOS Safari outside a home-screen install), the
 * same call degrades to the site's branded in-page toast, so callers always
 * have one simple API.
 */

const ICON = "/icon-192.png?v=3";
const BADGE = "/favicon.png?v=3";

export type NotifyKind = "success" | "error";

function swRegistration(): ServiceWorker | null {
  // `serviceWorker.controller` (not just registration) means the page is
  // actually controlled — notifications will originate from a live worker.
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.controller;
}

/** "granted" | "denied" | "default" — "default" on browsers without the API. */
export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Requests notification permission. iOS Safari only allows the request
 * inside a user gesture (tap), so call this from a click handler — e.g. the
 * upload button — never from a plain effect.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * True when the OS notification path can fire right now. Used to decide
 * whether to attach the SW `getNotifications` close-on-focus behavior.
 */
export function nativeNotificationsActive(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  return Notification.permission === "granted" && swRegistration() !== null;
}

/**
 * Show a branded notification. Fires a native OS notification when possible,
 * otherwise the in-page toast. Returns "native" | "toast" | "none" (none =
 * neither channel was usable — callers may want extra UX, e.g. keep the
 * error on screen).
 */
export async function notify(
  kind: NotifyKind,
  title: string,
  body: string,
): Promise<"native" | "toast" | "none"> {
  const options: NotificationOptions & { tag?: string } = {
    body,
    icon: ICON,
    badge: BADGE,
    tag: `student-hub-${kind}`, // one notification per kind — retries replace, not stack
  };

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && swRegistration()) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      // Don't toast on top of a native notification.
      return "native";
    } catch {
      /* fall through to toast */
    }
  }

  if (kind === "success") toast.success(title, { id: `sh-${kind}` });
  else toast.error(title, { id: `sh-${kind}` });
  return "toast";
}
