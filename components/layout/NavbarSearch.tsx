"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { SUBJECTS } from "@/lib/constants";
import { searchResourceSuggestions } from "@/lib/actions/search";

type Suggestion =
  | { type: "Subject"; text: string; id: string }
  | { type: "Resource"; text: string; id: string; subject: string };

export default function NavbarSearch() {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [resourceSuggestions, setResourceSuggestions] = useState<{id: string; title: string; subject: string}[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // On /find the dedicated full-width search page takes over.
  const isFindPage = pathname === "/find";

  // Debounced fetch from Server Action
  useEffect(() => {
    async function fetchSuggestions() {
      if (query.trim().length < 2) {
        setResourceSuggestions([]);
        return;
      }

      const data = await searchResourceSuggestions(query);

      if (data) {
        setResourceSuggestions(data);
      }
    }

    const timeoutId = setTimeout(() => {
      fetchSuggestions();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Build combined suggestions: matching subjects + matching resources
  const subjectMatches: Suggestion[] = query.trim().length >= 2
    ? SUBJECTS.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 3)
        .map((s) => ({ type: "Subject" as const, text: s, id: s }))
    : [];

  const resourceMatches: Suggestion[] = resourceSuggestions.map((r) => ({
    type: "Resource" as const,
    text: r.title,
    id: r.id,
    subject: r.subject,
  }));

  const suggestions = [...subjectMatches, ...resourceMatches].slice(0, 6);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const go = (url: string) => {
    setShowSuggestions(false);
    setQuery("");
    router.push(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      go(`/browse?q=${encodeURIComponent(query)}`);
    }
  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    if (suggestion.type === "Subject") {
      go(`/browse?subject=${encodeURIComponent(suggestion.text)}`);
    } else {
      go(`/resource/${suggestion.id}`);
    }
  };

  // Placeholder (non-functional) pill on /find — the big search box owns the page.
  if (isFindPage) {
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
    <div ref={wrapperRef} className="relative transition-all duration-500 ease-in-out opacity-100 scale-100">
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setShowSuggestions(true);
          }}
          placeholder="Search resources, subjects…"
          className="h-10 w-full md:w-56 md:focus:w-72 rounded-full border border-gray-300 pl-9 pr-8 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black transition-all"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setResourceSuggestions([]); setShowSuggestions(false); }}
            className="absolute right-3 text-gray-400 hover:text-black transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </form>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 md:left-auto md:right-0 z-50 w-full md:w-80 mt-2 rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_#111] overflow-hidden">
          {suggestions.map((item, index) => (
            <div
              key={`${item.type}-${item.id}-${index}`}
              onClick={() => handleSelectSuggestion(item)}
              className="group cursor-pointer px-4 py-3 border-b border-black/5 last:border-b-0 flex justify-between items-center gap-3 transition-colors hover:bg-[#0D9488]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Search className="h-3.5 w-3.5 text-black/30 flex-shrink-0 transition-colors group-hover:text-black/60" />
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-black">{item.text}</span>
                  {item.type === "Resource" && item.subject && (
                    <span className="block truncate text-xs font-medium text-black/40 transition-colors group-hover:text-black/60">
                      in {item.subject}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-[10px] font-bold tracking-widest px-2.5 py-0.5 rounded-full border border-black flex-shrink-0 transition-colors ${
                item.type === "Subject"
                  ? "bg-white text-black group-hover:bg-black group-hover:text-white"
                  : "bg-[#0D9488] text-black"
              }`}>
                {item.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
