"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";

export function AdminLink({ dark }: { dark?: boolean }) {
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

  // Dark mode for mobile menu (black text on white bg)
  if (dark) {
    return (
      <Link
        href="/admin"
        className="flex items-center gap-2 px-6 py-4 text-base font-bold text-black hover:bg-[#0D9488] transition-colors"
      >
        <Shield className="w-4 h-4" />
        Admin Panel
        {messageCount > 0 && (
          <span className="ml-auto w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {messageCount > 99 ? "99+" : messageCount}
          </span>
        )}
      </Link>
    );
  }

  // Default: navbar mode (white text on dark nav)
  return (
    <Link
      href="/admin"
      className="flex items-center gap-1.5 text-sm font-bold tracking-wider text-black hover:text-[#0D9488] transition-colors relative"
    >
      <Shield className="w-4 h-4" />
      Admin
      {messageCount > 0 && (
        <span className="absolute -top-2 -right-3 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {messageCount > 99 ? "99+" : messageCount}
        </span>
      )}
    </Link>
  );
}
