"use client";

import { Search } from "lucide-react";

/**
 * Navbar search pill — a pure trigger. The popup itself is owned by the
 * Navbar (outside the mobile menu subtree) so closing the menu can never
 * unmount the open popup.
 *
 * One shape: the compact desktop pill (≥lg). On smaller screens the navbar
 * shows a round Search icon button instead (see Navbar.tsx).
 */
export default function NavbarSearch({
  onOpenSearch,
}: {
  onOpenSearch?: () => void;
}) {

  // The old /find page is gone — this component only renders as a trigger
  // (desktop pill / mobile full-width bar) that opens the popup.
  return (
    <div
      role="search"
      aria-label="Search — opens the search window"
      onClick={onOpenSearch}
      className="relative flex items-center cursor-pointer group"
    >
      <Search className="absolute left-3 h-4 w-4 text-black pointer-events-none" strokeWidth={2.25} />
      <input
        type="text"
        readOnly
        value=""
        placeholder="Search…"
        tabIndex={-1}
        aria-hidden
        className="h-10 w-40 md:w-56 rounded-full border-2 border-black bg-white/70 backdrop-blur-md pl-9 pr-4 text-sm outline-none cursor-pointer placeholder:text-black/60 transition-colors group-hover:bg-white"
      />
    </div>
  );
}
