"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import SearchPopup from "./SearchPopup";

/**
 * Navbar search pill — opens the themed popup search window.
 * Hidden on /find, which owns the full-page search experience.
 */
export default function NavbarSearch({ onNavigate }: { onNavigate?: () => void }) {
  const [popupOpen, setPopupOpen] = useState(false);
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
    <>
      <div
        role="search"
        aria-label="Search — opens the search window"
        onClick={() => {
          onNavigate?.();
          setPopupOpen(true);
        }}
        className="relative flex items-center cursor-pointer group"
      >
        <Search className="absolute left-3 h-4 w-4 text-gray-400 pointer-events-none transition-colors group-hover:text-black" />
        <input
          type="text"
          readOnly
          value=""
          placeholder="Search resources, subjects…"
          className="h-10 w-full md:w-56 md:focus:w-72 rounded-full border border-gray-300 pl-9 pr-4 text-sm outline-none cursor-pointer bg-white placeholder:text-gray-400 transition-all group-hover:border-black"
          tabIndex={-1}
          aria-hidden
        />
      </div>

      {/* key remounts the popup fresh (empty state) on every open */}
      <SearchPopup
        key={popupOpen ? "open" : "closed"}
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
      />
    </>
  );
}
