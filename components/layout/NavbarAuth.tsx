"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { User, LogOut, Upload, BookOpen, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";

interface NavbarAuthProps {
  mobile?: boolean;
  onClose?: () => void;
}

interface SessionUser { id: string; name?: string | null; email?: string | null; image?: string | null }

// Module-level session cache shared by every NavbarAuth instance (desktop +
// mobile menu). Without it, opening the hamburger re-fetches the session and
// briefly renders the guest "Get Started" view before the profile appears.
let cachedUser: SessionUser | null = null;
let sessionPromise: Promise<SessionUser | null> | null = null;

function fetchSession(): Promise<SessionUser | null> {
  if (!sessionPromise) {
    sessionPromise = fetch("/api/auth/session")
      .then((res) => res.json())
      .then((session) => {
        cachedUser = session?.user ?? null;
        return cachedUser;
      })
      .catch(() => null);
  }
  return sessionPromise;
}

export default function NavbarAuth({ mobile, onClose }: NavbarAuthProps) {
  const [user, setUser] = useState<SessionUser | null>(cachedUser);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cachedUser) return; // already known — render it immediately
    fetchSession().then((u) => setUser(u));
  }, []);

  useEffect(() => {
    if (mobile) return;
    function handleOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [mobile]);

  const handleSignOut = async () => {
    // Client-side signOut POSTs with CSRF and redirects home; a plain
    // navigation to /api/auth/signout would land on NextAuth's standalone
    // confirmation page instead.
    await signOut({ redirectTo: "/" });
  };

  if (!user) {
    return (
      <Link href="/login" onClick={onClose}
        className={mobile ? "flex items-center justify-center px-6 py-4 text-base font-bold text-white bg-[#0D9488] hover:bg-[#0D9488]/80 transition-colors rounded-b-2xl" : "rounded-full bg-[#111] px-6 py-2.5 text-sm font-medium text-white transition-transform hover:bg-black hover:scale-105 active:scale-95"}>
        Get Started
      </Link>
    );
  }

  if (mobile) {
    return (
      <>
        {/* Profile header — the whole card is the link to the profile page.
            Everything else (upload/browse/contact) already lives in the main
            menu list above, so no duplicate rows here — just Sign Out. */}
        <Link href="/profile" onClick={onClose} className="group flex items-center gap-3 px-6 py-4 bg-[#0D9488] border-b border-black/10 hover:bg-[#0D9488]/80 transition-colors">
          <Avatar image={user.image} name={user.name} email={user.email} size={36} />
          <div className="overflow-hidden flex-1">
            <p className="text-sm font-bold text-black truncate">{user.name || "Student"}</p>
            <p className="text-xs text-black/60 truncate">{user.email}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-black/50 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <button onClick={handleSignOut} className="flex w-full items-center gap-3 px-6 py-4 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors rounded-b-2xl">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button onClick={() => setShowDropdown(!showDropdown)} className="flex items-center gap-2 rounded-full border-2 border-black bg-[#0D9488] px-3 py-1.5 text-sm font-bold text-black transition-all hover:shadow-[2px_2px_0px_0px_#111] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none">
        <Avatar image={user.image} name={user.name} email={user.email} size={28} />
        {/* Name only from xl up — at lg (1024) the pill + chip + links over-fill
            the row and squeeze the wordmark onto two lines. */}
        <span className="hidden xl:inline-block max-w-[160px] truncate align-middle">{user.name || user.email}</span>
      </button>
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_#111] overflow-hidden z-[9999]">
          <div className="flex items-center gap-3 px-5 py-4 border-b-2 border-black bg-gray-50">
            <Avatar image={user.image} name={user.name} email={user.email} size={40} />
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-black truncate">{user.name || "Student"}</p>
              <p className="text-xs text-black/50 truncate mt-0.5">{user.email}</p>
            </div>
          </div>
          <div className="py-1">
            <Link href="/profile" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-black hover:bg-[#0D9488] transition-colors">
              <User className="h-4 w-4" /> My Profile
            </Link>
            <Link href="/upload" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-black hover:bg-[#0D9488] transition-colors">
              <Upload className="h-4 w-4" /> Upload Resource
            </Link>
            <Link href="/browse" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-black hover:bg-[#0D9488] transition-colors">
              <BookOpen className="h-4 w-4" /> Browse Resources
            </Link>
          </div>
          <div className="border-t-2 border-black">
            <button onClick={handleSignOut} className="flex w-full items-center gap-3 px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
