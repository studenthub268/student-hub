"use client";

import { Search } from "lucide-react";

/**
 * Navbar search pill — a pure trigger. The popup itself is owned by the
 * Navbar (outside the mobile menu subtree) so closing the menu can never
 * unmount the open popup.
 *
 * One shape: the search pill (≥md). On phones the navbar shows a round
 * Search icon button instead (see Navbar.tsx).
 */
export default function NavbarSearch({
  onOpenSearch,
}: {
  onOpenSearch: () => void;
}) {
  // Pure trigger: the old /find page is gone, so this never handles input
  // itself — it only opens the popup owned by the Navbar.
  return (
    <div
      role="search"
      aria-label="Search — opens the search window"
      onClick={onOpenSearch}
      className="relative flex items-center cursor-pointer group"
    >
      <Search className="absolute left-3 h-4 w-4 text-foreground pointer-events-none" strokeWidth={2.25} />
      <input
        type="text"
        readOnly
        value=""
        placeholder="Search…"
        tabIndex={-1}
        aria-hidden
        className="h-10 w-56 rounded-full border-2 border-ink bg-surface/70 backdrop-blur-md pl-9 pr-4 text-sm outline-none cursor-pointer placeholder:text-foreground/60 transition-colors group-hover:bg-surface"
      />
    </div>
  );
}
