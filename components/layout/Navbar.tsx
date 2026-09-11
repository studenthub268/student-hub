"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X, ArrowLeft, Search } from "lucide-react";
import NavbarSearch from "./NavbarSearch";
import NavbarAuth from "./NavbarAuth";
import { AdminLink } from "./AdminLink";
import SearchPopup from "./SearchPopup";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse" },
  { href: "/upload", label: "Upload" },
  { href: "/contact", label: "Contact" },
];

// Shared shape for the two square icon buttons (search + hamburger).
const ICON_BTN =
  "flex items-center justify-center h-10 w-10 rounded-xl border-2 border-black bg-white text-black hover:bg-[#0D9488] transition-all press shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]";

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

  return (
    <nav className="sticky top-4 z-50 w-full px-4 sm:px-6 lg:px-8 pb-4">
      {/* z-[110] keeps the bar (its X / search buttons) tappable above the
          menu overlay's click-away catcher below. */}
      <div className="relative z-[110] mx-auto max-w-7xl">
      <div className="flex h-14 items-center justify-between rounded-2xl border-2 border-black bg-white/70 backdrop-blur-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] px-4 sm:px-6">

        {/* Logo + Mobile Back Button */}
        <div className="flex items-center gap-2">
          {pathname !== "/" && (
            <button
              onClick={() => router.back()}
              className="md:hidden p-2 rounded-xl border-2 border-black bg-white text-black hover:bg-[#0D9488] transition-all press shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <Link href="/" prefetch className="flex items-center gap-2 group shrink-0">
            <Image src="/logo.png" alt="Student Hub Logo" width={64} height={64} className="w-8 h-8 rounded-full object-contain" priority />
            <span className="text-xl font-bold tracking-tighter text-black ml-1 group-hover:opacity-80 whitespace-nowrap">Student Hub</span>
          </Link>
        </div>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center md:space-x-5 lg:space-x-8">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} prefetch className="text-sm font-medium text-black hover:text-gray-500 transition-colors">
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
          <div className="absolute left-4 right-4 sm:left-6 sm:right-6 top-[4.75rem] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border-2 border-black bg-white/95 backdrop-blur-xl shadow-[8px_8px_0px_0px_#111] scale-in origin-top">
            
            {/* Nav Links */}
            {NAV_LINKS.map((link, index) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center px-6 py-4 text-base font-bold text-black hover:bg-[#0D9488] transition-colors ${
                  index < NAV_LINKS.length - 1 ? "border-b border-black/10" : ""
                }`}
              >
                {link.label}
              </Link>
            ))}

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
