"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X, ArrowLeft } from "lucide-react";
import NavbarSearch from "./NavbarSearch";
import NavbarAuth from "./NavbarAuth";
import { AdminLink } from "./AdminLink";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse" },
  { href: "/upload", label: "Upload" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

return (
    <nav className="sticky top-0 z-50 w-full bg-white px-4 sm:px-6 lg:px-8 py-4">
      <div className="mx-auto max-w-7xl flex h-14 items-center justify-between">

        {/* Logo + Mobile Back Button */}
        <div className="flex items-center gap-2">
          {pathname !== "/" && (
            <button
              onClick={() => router.back()}
              className="md:hidden p-2 rounded-xl border-2 border-black bg-white hover:bg-[#0D9488] transition-all"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <Link href="/" className="flex items-center gap-2 group">
            <Image src="/logo.png" alt="Student Hub Logo" width={64} height={64} className="w-8 h-8 rounded-full object-contain" priority />
            <span className="text-xl font-bold tracking-tighter text-black ml-1 group-hover:opacity-80">Student Hub</span>
          </Link>
        </div>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center space-x-8">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-black hover:text-gray-500 transition-colors">
              {link.label}
            </Link>
          ))}
          <AdminLink />
        </div>

        {/* Right: Search + Admin + Auth (desktop) + Hamburger (mobile) */}
        <div className="flex items-center space-x-3">
          <div className="hidden lg:block"><NavbarSearch /></div>
          <div className="hidden md:block"><NavbarAuth /></div>

          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex items-center justify-center h-10 w-10 rounded-xl border-2 border-black bg-white text-black hover:bg-[#0D9488] transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden mt-4 mx-auto max-w-7xl">
          <div className="rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_#111] overflow-hidden max-h-[calc(100vh-6rem)] overflow-y-auto">
            
            {/* Mobile Search */}
            {pathname !== "/find" && (
              <div className="p-4 border-b border-black/10">
                <NavbarSearch onSearchClick={() => setMobileOpen(false)} />
              </div>
            )}

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
    </nav>
  );
}
