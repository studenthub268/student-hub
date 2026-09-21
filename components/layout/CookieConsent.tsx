"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

const STORAGE_KEY = "sh-cookie-consent-v1";
const CONSENT_EVENT = "sh-cookie-consent";

// localStorage as a tiny external store: getSnapshot re-reads the stored
// decision, and the custom event notifies after a decision so the banner
// unmounts. getServerSnapshot returns a decided value so SSR/hydration
// render nothing and the banner appears post-hydration when undecided.
function subscribe(callback: () => void) {
  window.addEventListener(CONSENT_EVENT, callback);
  return () => window.removeEventListener(CONSENT_EVENT, callback);
}
function getSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "accepted"; // storage unavailable (private mode) — never nag
  }
}
function getServerSnapshot() {
  return "accepted";
}

/**
 * Cookie consent banner (GDPR/ePrivacy style).
 *
 * The site sets strictly-necessary cookies only (session + CSRF — see
 * /privacy#cookies), so no opt-in gate is legally required. This banner is
 * an honest disclosure: it tells visitors what is stored, links the
 * privacy policy, and offers an explicit decline. No third-party consent
 * plumbing is wired up — add a rejectable script gate here first if a
 * tracking/analytics provider that sets cookies is ever integrated.
 */
export function CookieConsent() {
  const consent = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const decide = (value: "accepted" | "declined") => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {}
    window.dispatchEvent(new Event(CONSENT_EVENT));
  };

  if (consent) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-0 sm:bottom-4 sm:mx-auto sm:max-w-xl"
    >
      <div className="rounded-2xl border-2 border-ink bg-surface p-4 shadow-hard sm:flex sm:items-center sm:gap-4">
        <p className="text-xs font-medium leading-relaxed text-foreground/80 sm:flex-1">
          We use essential cookies only — session sign-in and CSRF protection.
          No ads, no tracking. Details in our{" "}
          <Link
            href="/privacy#cookies"
            className="font-bold underline underline-offset-2 hover:text-accent"
          >
            privacy policy
          </Link>
          .
        </p>
        <div className="mt-3 flex gap-2 sm:mt-0 sm:shrink-0">
          <button
            type="button"
            onClick={() => decide("declined")}
            className="h-10 flex-1 rounded-full border-2 border-ink bg-surface px-4 text-xs font-bold tracking-wider text-foreground transition-colors hover:bg-surface-muted sm:flex-none"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide("accepted")}
            className="h-10 flex-1 rounded-full border-2 border-ink bg-ink on-ink px-4 text-xs font-bold tracking-wider transition-colors hover:bg-ink sm:flex-none"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
