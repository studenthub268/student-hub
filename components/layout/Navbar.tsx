"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X, ArrowLeft, Search, Home, Compass, Upload, Mail } from "lucide-react";
import NavbarSearch from "./NavbarSearch";
import NavbarAuth from "./NavbarAuth";
import { AdminLink } from "./AdminLink";
import SearchPopup from "./SearchPopup";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse" },
  { href: "/upload", label: "Upload" },
  { href: "/contact", label: "Contact" },
];

// Menu row icons — the hamburger rows carry the same icon+label shape as
// the account section (NavbarAuth mobile), so both halves of the menu read
// identically.
const NAV_ICONS: Record<string, typeof Home> = {
  "/": Home,
  "/browse": Compass,
  "/upload": Upload,
  "/contact": Mail,
};

// Shared shape for the square icon buttons (search + hamburger + theme).
const ICON_BTN =
  "flex items-center justify-center h-10 w-10 rounded-xl border-2 border-ink bg-surface text-foreground hover:bg-accent hover:text-accent-contrast transition-all press shadow-hard-sm";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Popup lives HERE (not inside the mobile menu) so closing the menu —
  // which unmounts the menu subtree — can never kill an open popup.
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // True back: history.back() so the user lands wherever they came from —
  // but ONLY within the app. Two cases must fall back to home instead:
  //   1. Full-page arrival from Google / a shared link — the previous history
  //      entry is off-site, and back() would just leave the site.
  //   2. A fresh tab — nothing to go back to at all.
  // document.referrer CANNOT make this call: it only updates on full page
  // loads, so after a client-side navigation it is stale (empty), and the
  // referrer check alone sent in-app users home instead of back (caught in
  // live testing). Instead, flag only when the path CHANGES within this
  // tab's lifetime — a full-page arrival directly on /resource/x (Google,
  // shared link) never sees a change, so its first effect run (prev ===
  // null) correctly leaves the flag false and Back falls back to home.
  const prevPathRef = useRef<string | null>(null);
  const internalNavRef = useRef(false);
  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      internalNavRef.current = true;
    }
    prevPathRef.current = pathname;
  }, [pathname]);

  const goBack = () => {
    if (internalNavRef.current && window.history.length > 1) router.back();
    else router.push("/");
  };

  const openSearch = () => {
    setMobileOpen(false);
    setSearchOpen(true);
  };

  // Lock background scroll while the menu popup is open (same contract as
  // SearchPopup). No Esc handler — touch has no Esc; tap-outside closes.
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // Opaque bar once content scrolls underneath (70% at top keeps the
  // frosted look; 95% + blur hides everything when it overlaps content).
  // .nav-shell's background transition animates the switch.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // z-[60]: above the cookie card's z-50 (a same-tier sibling later in the
    // DOM would otherwise paint over the open menu).
    <nav className="sticky top-4 z-[60] w-full px-4 sm:px-6 lg:px-8 pb-4">
      {/* z-[110] keeps the bar (its X / search buttons) tappable above the
          menu overlay's click-away catcher below. */}
      <div className="relative z-[110] mx-auto max-w-7xl">
      <div className={`nav-shell flex h-14 items-center justify-between rounded-2xl border-2 border-ink ${scrolled ? "bg-surface/95" : "bg-surface/70"} backdrop-blur-xl shadow-hard px-4 sm:px-6`}>

        {/* Logo + Mobile Back Button */}
        <div className="flex items-center gap-2">
          {pathname !== "/" && (
            <button
              onClick={goBack}
              className="md:hidden p-2 rounded-xl border-2 border-ink bg-surface text-foreground hover:bg-accent hover:text-accent-contrast transition-all press shadow-hard-sm"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <Link href="/" prefetch className="flex items-center gap-2 group shrink-0 min-w-0">
            <Image src="/logo.png" alt="Student Hub Logo" width={64} height={64} className="w-8 h-8 rounded-full object-contain shrink-0" priority />
            {/* text-base below sm: at ~320px viewports a text-xl nowrap wordmark
                overflows into the search/hamburger buttons */}
            <span className="text-base sm:text-xl font-bold tracking-tighter text-foreground ml-1 group-hover:opacity-80 whitespace-nowrap">Student Hub</span>
          </Link>
        </div>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center md:space-x-5 lg:space-x-8">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} prefetch className="text-sm font-medium text-foreground hover:text-foreground/60 transition-colors">
              {link.label}
            </Link>
          ))}
          <AdminLink />
        </div>

        {/* Right: Search + Admin + Auth (desktop) + Search + Hamburger (mobile) */}
        <div className="flex items-center space-x-3">
          <div className="hidden lg:block"><NavbarSearch onOpenSearch={openSearch} /></div>
          {/* Below lg (mobile + the md–lg dead zone): a compact icon search in
              the navbar itself instead of a bar inside the hamburger menu. */}
          <button
            onClick={openSearch}
            aria-label="Search"
            className={`${ICON_BTN} lg:hidden`}
          >
            <Search className="h-5 w-5" />
          </button>
          <div className="hidden md:block"><NavbarAuth /></div>

          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`${ICON_BTN} md:hidden`}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      </div>

      {/* Mobile Menu — fixed popup over the page (not in-flow, so it can't
          push layout); tapping anywhere outside it closes it. */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[100]">
          {/* Click-away catcher — transparent, sits behind the panel */}
          <div className="absolute inset-0" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-4 right-4 sm:left-6 sm:right-6 top-[4.75rem] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border-2 border-ink bg-surface/95 backdrop-blur-xl shadow-hard-lg scale-in origin-top">
            {/* Profile identity — the very first thing in the menu (only when
                signed in; guests get nothing here). */}
            <NavbarAuth mobile section="header" onClose={() => setMobileOpen(false)} />

            {/* Nav Links — icon rows, same row shape as the account section
                below, so the whole menu reads as one surface. */}
            {NAV_LINKS.map((link, index) => {
              const Icon = NAV_ICONS[link.href];
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-contrast transition-colors ${
                    index < NAV_LINKS.length - 1 ? "border-b border-line" : ""
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {link.label}
                </Link>
              );
            })}

            {/* Admin Link (mobile) — inline with nav links; closes the menu on tap,
                same as every other menu item */}
            <AdminLink dark onNavigate={() => setMobileOpen(false)} />

            {/* Auth footer — Sign Out only (guests: Get Started row). The
                profile identity lives at the top of the menu. */}
            <NavbarAuth mobile section="footer" onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Search popup — mounted at the Navbar level, outside the menu */}
      <SearchPopup open={searchOpen} onClose={() => setSearchOpen(false)} />
    </nav>
  );
}
