"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function AdminLink({ dark, onNavigate }: { dark?: boolean; onNavigate?: () => void }) {
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
    Promise.all([
      fetch("/api/check-admin").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/admin/message-count")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([adminData, countData]) => {
        if (cancelled) return;
        if (adminData?.admin === true) {
          const count = countData?.count || 0;
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

  // Mobile menu variant (full-width row, matches NAV_LINKS styling)
  if (dark) {
    return (
      <Link
        href="/admin"
        onClick={onNavigate}
        className="flex items-center px-6 py-4 text-base font-bold text-black hover:bg-[#0D9488] transition-colors"
      >
        Admin
        {messageCount > 0 && (
          <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {messageCount > 99 ? "99+" : messageCount}
          </span>
        )}
      </Link>
    );
  }

  // Desktop navbar variant — plain text, same styling as Home/Browse/Upload/Contact
  return (
    <Link
      href="/admin"
      className="text-sm font-medium text-black hover:text-gray-500 transition-colors relative"
    >
      Admin
      {messageCount > 0 && (
        <span className="absolute -top-2 -right-3 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {messageCount > 99 ? "99+" : messageCount}
        </span>
      )}
    </Link>
  );
}
