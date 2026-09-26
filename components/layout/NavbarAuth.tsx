"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { User, LogOut, LogIn, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";

interface NavbarAuthProps {
  mobile?: boolean;
  onClose?: () => void;
  /** Mobile only: which slice of the account UI to render in the menu. */
  section?: "header" | "footer";
}

interface SessionUser { id: string; name?: string | null; email?: string | null; image?: string | null }

// Module-level session cache shared by every NavbarAuth instance (desktop +
// mobile menu). Without it, opening the hamburger re-fetches the session and
// briefly renders the guest "Get Started" view before the profile appears.
// user: known session user; null: confirmed guest; undefined: not yet known.
let cachedUser: SessionUser | null | undefined = undefined;
let sessionPromise: Promise<SessionUser | null | undefined> | null = null;
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

// How many consecutive transient failures to ride out before concluding the
// user is signed out. A single offline blip, rate-limit 429 or serverless
// hiccup used to flip the navbar (and the home CTA) to the guest view while
// the session cookie stayed perfectly valid — every privileged action still
// worked, only the UI claimed otherwise. Retrying keeps the last-known state
// (or the unknown state) until the network gives a REAL answer.
const MAX_TRANSIENT_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

// Fetch the session, resolving to the user, null (confirmed guest) — or
// undefined when the network could not be trusted either way (kept distinct
// from null so callers never render a false "signed out").
function fetchSession(): Promise<SessionUser | null | undefined> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
        try {
          const res = await fetch("/api/auth/session");
          // 429 = our own rate limit answered instead of the session.
          // Retry like any other transient failure — treating it as a
          // sign-out would log the UI out for every user behind a
          // shared IP once 30 requests/min are exhausted.
          if (res.status === 429 || res.status >= 500) {
            throw new Error(`transient: ${res.status}`);
          }
          const session = await res.json();
          cachedUser = session?.user ?? null;
          try {
            if (cachedUser) localStorage.setItem("sh-session", JSON.stringify(cachedUser));
            else localStorage.removeItem("sh-session");
          } catch {
            /* storage unavailable (private mode) — in-memory cache only */
          }
          return cachedUser as SessionUser | null;
        } catch {
          // Network/JSON/5xx/429 failure: retry, then report "unknown".
          // Deliberately do NOT clear localStorage here — the cookie is
          // likely still valid; the endpoint just failed to answer.
          if (attempt < MAX_TRANSIENT_RETRIES) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          }
        }
      }
      return undefined;
    })().finally(() => {
      // Allow a later fetch to re-run (e.g. after sign-in elsewhere in the
      // app). The resolved value stays cached in cachedUser above.
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

// Shared hook: session state for any client component (undefined = not yet
// known or temporarily unverifiable, null = confirmed guest, user = signed
// in). Deduped through the module cache above.
export function useSessionUser(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(cachedUser);
  useEffect(() => {
    let mounted = true;
    fetchSession().then((u) => {
      // undefined (transient failure): keep whatever we already show —
      // the localStorage restore or a previous successful fetch. Never
      // overwrite a known state with "unknown".
      if (mounted && u !== undefined) setUser(u);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return user;
}

export default function NavbarAuth({ mobile, onClose, section = "footer" }: NavbarAuthProps) {
  const [user, setUser] = useState<SessionUser | null | undefined>(cachedUser);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSession().then((u) => {
      if (u !== undefined) setUser(u);
    });
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
    // Guests have no identity to show at the top — only the footer row.
    if (mobile) {
      if (section === "header") return null;
      return (
        <div className="border-t-2 border-ink">
          <Link
            href="/login"
            onClick={onClose}
            className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-contrast transition-colors"
          >
            <LogIn className="h-4 w-4" strokeWidth={2} aria-hidden />
            Get Started
          </Link>
        </div>
      );
    }
    return (
      <Link
        href="/login"
        className="rounded-full bg-ink on-ink px-6 py-2.5 text-sm font-medium transition-transform hover:bg-ink hover:scale-105 active:scale-95"
      >
        Get Started
      </Link>
    );
  }

  if (mobile) {
    // The menu renders this component twice: `header` (profile identity) sits
    // at the TOP of the menu panel, `footer` (Sign Out) at the bottom. The
    // old inline "My Profile / Upload Resource / Browse Resources" rows were
    // removed — each duplicated something the menu already shows (the header
    // links to /profile; Upload and Browse are nav links above).
    if (section === "header") {
      return (
        <Link href="/profile" onClick={onClose} className="group flex items-center gap-3 px-5 py-4 bg-surface-muted border-b-2 border-ink">
          <Avatar image={user.image} name={user.name} email={user.email} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground truncate">{user.name || "Student"}</p>
            <p className="text-xs text-foreground/60 truncate mt-0.5">{user.email}</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      );
    }
    return (
      <div className="border-t-2 border-ink">
        <button onClick={handleSignOut} className="flex w-full items-center gap-3 px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">
          <LogOut className="h-4 w-4" aria-hidden /> Sign Out
        </button>
      </div>
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
          {/* The whole header links to the profile (it IS the profile entry —
              no separate "My Profile" row duplicating it). Upload/Browse live
              in the navbar directly above, so they're not repeated here. */}
          <Link
            href="/profile"
            onClick={() => setShowDropdown(false)}
            className="group flex items-center gap-3 px-5 py-4 border-b-2 border-ink bg-surface-muted transition-colors hover:bg-line/40"
          >
            <Avatar image={user.image} name={user.name} email={user.email} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">{user.name || "Student"}</p>
              <p className="text-xs text-foreground/60 truncate mt-0.5">{user.email}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <div className="py-1">
            <Link href="/profile" onClick={() => setShowDropdown(false)} className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-contrast transition-colors">
              <User className="h-4 w-4" aria-hidden /> My Profile
            </Link>
          </div>
          <div className="border-t-2 border-ink">
            <button onClick={handleSignOut} className="flex w-full items-center gap-3 px-5 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="h-4 w-4" aria-hidden /> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
