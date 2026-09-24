"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X, ArrowLeft, Search, Home, Compass, Upload, Mail } from "lucide-react";
import NavbarSearch from "./NavbarSearch";
import NavbarAuth from "./NavbarAuth";
import { AdminLink } from "./AdminLink";
import SearchPopup from "./SearchPopup";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Icons ride along so the mobile menu rows read as a nav, not a text list.
const NAV_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/browse", label: "Browse", icon: Compass },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/contact", label: "Contact", icon: Mail },
];

// Active route matching: exact for /, prefix for everything else so
// /browse?type=notes and /resource/xyz keep Browse highlighted.
function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

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
    /* z-[60]: above the cookie card's z-50 (a same-tier sibling later in the
       DOM would otherwise paint over the open menu's dimmed backdrop). */
    <nav className="sticky top-4 z-[60] w-full px-4 sm:px-6 lg:px-8 pb-4">
      {/* z-[110] keeps the bar (its X / search buttons) tappable above the
          menu overlay's click-away catcher below. */}
      <div className="relative z-[110] mx-auto max-w-7xl">
      <div className={`nav-shell flex h-14 items-center justify-between gap-3 rounded-2xl border-2 border-ink ${scrolled ? "bg-surface/95" : "bg-surface/70"} backdrop-blur-xl shadow-hard px-3 sm:px-4 lg:px-5`}>

        {/* Logo + Mobile Back Button */}
        <div className="flex items-center gap-2 min-w-0">
          {pathname !== "/" && (
            <button
              onClick={() => router.back()}
              className="md:hidden flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border-2 border-ink bg-surface text-foreground hover:bg-accent hover:text-accent-contrast transition-all press shadow-hard-sm"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <Link href="/" prefetch className="flex items-center gap-2 group shrink-0 min-w-0">
            <Image src="/logo.png" alt="Student Hub Logo" width={64} height={64} className="w-8 h-8 rounded-full object-contain shrink-0" priority />
            {/* text-base below sm: at ~320px viewports a text-xl nowrap wordmark
                overflows into the search/hamburger buttons */}
            <span className="text-base sm:text-xl font-bold tracking-tighter text-foreground group-hover:opacity-80 whitespace-nowrap">Student Hub</span>
          </Link>
        </div>

        {/* Desktop Nav Links — the current section is marked, so users always
            know where they are (the old all-equal links made Browse vs Home
            indistinguishable once you left the homepage). */}
        <nav aria-label="Primary" className="hidden md:flex items-center rounded-full border-2 border-ink/10 bg-surface-muted/60 p-1">
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={`px-3.5 py-1.5 text-sm rounded-full transition-all lg:px-4 ${
                  active
                    ? "bg-ink on-ink font-bold shadow-hard-sm"
                    : "font-medium text-foreground/70 hover:text-foreground hover:bg-surface"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <AdminLink active={isActive(pathname, "/admin")} />
        </nav>

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

      {/* Mobile Menu — same popup presentation as SearchPopup: the page dims
          and blurs behind a floating card that scales in. Fixed, so it can't
          push layout; tapping the backdrop closes it.
          z-[100] (below the bar's z-[110]) on purpose: the bar stays crisp and
          the hamburger's X stays tappable, so the menu can be closed from
          either the button or the backdrop. */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[5.5rem]">
          <div className="absolute inset-0 bg-foreground/60 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="relative w-full max-w-xl max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-[2rem] border-2 border-ink bg-surface shadow-hard-lg scale-in"
          >
            
            {/* Nav Links — icon rows with the current page highlighted.
                Mobile-first: 48px touch rows, icon anchors the eye, the
                accent row unambiguously says "you are here". */}
            {NAV_LINKS.map(({ href, label, icon: Icon }, index) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-4 px-6 py-4 text-base font-bold transition-colors ${
                    index < NAV_LINKS.length ? "border-b border-line" : ""
                  } ${
                    active
                      ? "bg-accent text-accent-contrast"
                      : "text-foreground hover:bg-accent hover:text-accent-contrast"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                  {label}
                </Link>
              );
            })}

            {/* Admin Link (mobile) — inline with nav links; closes the menu on tap,
                same as every other menu item */}
            <AdminLink dark onNavigate={() => setMobileOpen(false)} />

            {/* Auth Section */}
            <NavbarAuth mobile onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Search popup — mounted at the Navbar level, outside the menu */}
      <SearchPopup open={searchOpen} onClose={() => setSearchOpen(false)} />
    </nav>
  );
}
