"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";

export function AdminLink({
  dark,
  onNavigate,
  active,
}: {
  dark?: boolean;
  onNavigate?: () => void;
  active?: boolean;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  // Admin status is re-checked at most once a minute per tab: it is cached
  // in sessionStorage so navigating around the site doesn't refetch it on
  // every mount, and the two endpoints are fetched in parallel instead of
  // serially. Only POSITIVE (admin) results are cached — a guest's "no" is
  // never cached, so an admin signing in sees the link immediately.
  const ADMIN_STATUS_CACHE_KEY = "admin-status-cache-v1";
  const ADMIN_STATUS_TTL_MS = 60_000;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- cached values are already final; setting synchronously avoids a guest-view flash, which is the whole point of the cache */
    try {
      const raw = sessionStorage.getItem(ADMIN_STATUS_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { savedAt: number; count: number };
        if (Date.now() - parsed.savedAt < ADMIN_STATUS_TTL_MS) {
          setIsAdmin(true);
          setMessageCount(parsed.count || 0);
          return;
        }
      }
    } catch {
      // corrupted cache — just refetch
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    let cancelled = false;
    // check-admin FIRST; only confirmed admins pay for the message-count
    // round-trip. (It used to be fetched in parallel by every visitor — for
    // guests that endpoint 302s to /login, so each page load wasted a request
    // and downloaded the login page's HTML mid-render.)
    fetch("/api/check-admin")
      .then((res) => (res.ok ? res.json() : null))
      .then(async (adminData) => {
        if (cancelled) return;
        if (adminData?.admin !== true) return;
        let count = 0;
        try {
          const countData = await fetch("/api/admin/message-count").then((res) =>
            res.ok ? res.json() : null
          );
          count = countData?.count || 0;
        } catch {
          // badge is cosmetic — an admin without a count still gets the link
        }
        setIsAdmin(true);
        setMessageCount(count);
        try {
          sessionStorage.setItem(
            ADMIN_STATUS_CACHE_KEY,
            JSON.stringify({ savedAt: Date.now(), count })
          );
        } catch {
          // best-effort cache only
        }
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAdmin) return null;

  // Mobile menu variant (full-width icon row, matches NAV_LINKS styling)
  if (dark) {
    return (
      <Link
        href="/admin"
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-4 px-6 py-4 text-base font-bold transition-colors rounded-b-2xl ${
          active
            ? "bg-accent text-accent-contrast"
            : "text-foreground hover:bg-accent hover:text-accent-contrast"
        }`}
      >
        <Shield className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        Admin
        {messageCount > 0 && (
          <span className="ml-auto w-5 h-5 bg-red-500 text-background text-xs font-bold rounded-full flex items-center justify-center">
            {messageCount > 99 ? "99+" : messageCount}
          </span>
        )}
      </Link>
    );
  }

  // Desktop navbar variant — pill row member, same shape as
  // Home/Browse/Upload/Contact.
  return (
    <Link
      href="/admin"
      aria-current={active ? "page" : undefined}
      className={`relative px-3.5 py-1.5 text-sm rounded-full transition-all lg:px-4 ${
        active
          ? "bg-ink on-ink font-bold shadow-hard-sm"
          : "font-medium text-foreground/70 hover:text-foreground hover:bg-surface"
      }`}
    >
      Admin
      {messageCount > 0 && (
        <span className="absolute -top-2 -right-1.5 w-5 h-5 bg-red-500 text-background text-xs font-bold rounded-full flex items-center justify-center">
          {messageCount > 99 ? "99+" : messageCount}
        </span>
      )}
    </Link>
  );
}
