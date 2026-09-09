"use client";

import { Search } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

/**
 * Navbar search pill — always a jump button to the dedicated /find page,
 * on every device. The Find page owns the actual search experience
 * (big box, live suggestions). On /find itself the pill fades out.
 */
export default function NavbarSearch({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
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
      aria-label="Search — opens the search page"
      onClick={() => {
        onNavigate?.();
        router.push("/find");
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
  );
}
