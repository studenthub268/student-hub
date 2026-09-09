"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

/**
 * Navbar search pill — a pure trigger. The popup itself is owned by the
 * Navbar (outside the mobile menu subtree) so closing the menu can never
 * unmount the open popup.
 *
 * Two shapes:
 *  - default (desktop pill, ≥lg only): compact chip with a short placeholder
 *    that can never truncate,
 *  - fullWidth (inside the mobile menu): a full-width search bar.
 */
export default function NavbarSearch({
  onOpenSearch,
  fullWidth,
}: {
  onOpenSearch?: () => void;
  fullWidth?: boolean;
}) {
  const pathname = usePathname();

  // On /find the dedicated full-width search page takes over.
  if (pathname === "/find") {
    return (
      <div className="relative transition-all duration-500 ease-in-out opacity-0 scale-95 pointer-events-none w-0">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search..."
            className="h-10 w-full md:w-56 rounded-full border border-gray-300 pl-9 pr-8 text-sm outline-none cursor-pointer"
            tabIndex={-1}
            aria-hidden
          />
        </div>
      </div>
    );
  }

  return (
    <div
      role="search"
      aria-label="Search — opens the search window"
      onClick={onOpenSearch}
      className="relative flex items-center cursor-pointer group"
    >
      <Search className="absolute left-3 h-4 w-4 text-black/70 pointer-events-none transition-colors group-hover:text-black" />
      <input
        type="text"
        readOnly
        value=""
        placeholder={fullWidth ? "Search resources, subjects…" : "Search…"}
        tabIndex={-1}
        aria-hidden
        className={`h-10 ${fullWidth ? "w-full" : "w-40 md:w-56"} rounded-full border-2 border-black bg-white/70 backdrop-blur-md pl-9 pr-4 text-sm outline-none cursor-pointer placeholder:text-black/60 transition-colors group-hover:bg-white`}
      />
    </div>
  );
}
