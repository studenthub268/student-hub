"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { User, LogOut, Upload, BookOpen, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "./ThemeToggle";

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
let restored = false;

// Restore the last-known session synchronously at module load, so the first
// client render already shows the signed-in navbar instead of flashing the
// guest view for as long as /api/auth/session takes to answer. The network
// fetch below still runs every load and corrects this if it's stale (signed
// out elsewhere / session expired) — the flash becomes one frame, not 2-4s.
function restoreLocal() {
  if (restored) return;
  restored = true;
  try {
    const raw = localStorage.getItem("sh-session");
    if (raw) cachedUser = JSON.parse(raw);
  } catch {
    /* corrupted entry — ignore; network fetch will fix */
  }
}
restoreLocal();

function fetchSession(): Promise<SessionUser | null> {
  if (!sessionPromise) {
    sessionPromise = fetch("/api/auth/session")
      .then((res) => res.json())
      .then((session) => {
        cachedUser = session?.user ?? null;
        try {
          if (cachedUser) localStorage.setItem("sh-session", JSON.stringify(cachedUser));
          else localStorage.removeItem("sh-session");
        } catch {
          /* storage unavailable (private mode) — in-memory cache only */
        }
        return cachedUser;
      })
      .catch(() => null);
  }
  return sessionPromise;
}

// Shared hook: session state for any client component (undefined = not yet
// known, null = guest). Deduped through the module cache above.
export function useSessionUser(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(cachedUser);
  useEffect(() => {
    let mounted = true;
    fetchSession().then((u) => {
      if (mounted) setUser(u);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return user;
}

export default function NavbarAuth({ mobile, onClose }: NavbarAuthProps) {
  const [user, setUser] = useState<SessionUser | null>(cachedUser);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    try {
      localStorage.removeItem("sh-session");
    } catch {
      /* ignore */
    }
    await signOut({ redirectTo: "/" });
  };

  if (!user) {
    return (
      <Link href="/login" onClick={onClose}
        className={mobile ? "flex items-center justify-center px-6 py-4 text-base font-bold text-accent-contrast bg-accent hover:bg-accent/80 transition-colors rounded-b-2xl" : "rounded-full bg-ink on-ink px-6 py-2.5 text-sm font-medium transition-transform hover:bg-ink hover:scale-105 active:scale-95"}>
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
        <Link href="/profile" onClick={onClose} className="group flex items-center gap-3 px-6 py-4 bg-accent border-b border-line hover:bg-accent/80 transition-colors">
          <Avatar image={user.image} name={user.name} email={user.email} size={36} />
          <div className="overflow-hidden flex-1">
            <p className="text-sm font-bold text-foreground truncate">{user.name || "Student"}</p>
            <p className="text-xs text-foreground/60 truncate">{user.email}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-foreground/60 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <button onClick={handleSignOut} className="flex w-full items-center gap-3 px-6 py-4 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors rounded-b-2xl">
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button onClick={() => setShowDropdown(!showDropdown)} className="flex items-center gap-2 rounded-full border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-foreground transition-all hover:shadow-hard-sm hover:-translate-y-0.5 active:translate-y-0 active:shadow-none">
        <Avatar image={user.image} name={user.name} email={user.email} size={28} />
        {/* Name only from xl up — at lg (1024) the pill + chip + links over-fill
            the row and squeeze the wordmark onto two lines. */}
        <span className="hidden xl:inline-block max-w-[160px] truncate align-middle">{user.name || user.email}</span>
      </button>
      {showDropdown && (
        <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-ink bg-surface shadow-hard overflow-hidden z-[9999]">
          <div className="flex items-center gap-3 px-5 py-4 border-b-2 border-ink bg-surface-muted">
            <Avatar image={user.image} name={user.name} email={user.email} size={40} />
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-foreground truncate">{user.name || "Student"}</p>
              <p className="text-xs text-foreground/60 truncate mt-0.5">{user.email}</p>
            </div>
          </div>
          <div className="py-1">
            <Link href="/profile" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-contrast transition-colors">
              <User className="h-4 w-4" /> My Profile
            </Link>
            <Link href="/upload" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-contrast transition-colors">
              <Upload className="h-4 w-4" /> Upload Resource
            </Link>
            <Link href="/browse" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-contrast transition-colors">
              <BookOpen className="h-4 w-4" /> Browse Resources
            </Link>
            <ThemeToggle />
          </div>
          <div className="border-t-2 border-ink">
            <button onClick={handleSignOut} className="flex w-full items-center gap-3 px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
