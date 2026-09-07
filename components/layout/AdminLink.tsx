"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function AdminLink({ dark, onNavigate }: { dark?: boolean; onNavigate?: () => void }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    fetch("/api/check-admin")
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.admin === true) {
          setIsAdmin(true);
          return fetch("/api/admin/message-count");
        }
        return null;
      })
      .then((res) => res?.json())
      .then((data) => {
        if (data?.count) setMessageCount(data.count);
      })
      .catch(() => {
        setIsAdmin(false);
      });
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
