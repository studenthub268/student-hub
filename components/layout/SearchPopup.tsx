"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { SUBJECTS } from "@/lib/constants";
import { searchResourceSuggestions } from "@/lib/actions/search";
import { createPortal } from "react-dom";

type Suggestion =
  | { type: "Subject"; text: string; id: string }
  | { type: "Resource"; text: string; id: string; subject: string };

interface SearchPopupProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Themed popup search window — a focused little dialog with the same
 * typeahead (subjects + live resource results) that powers quick jumps.
 */
export default function SearchPopup({ open, onClose }: SearchPopupProps) {
  const [query, setQuery] = useState("");
  const [resourceSuggestions, setResourceSuggestions] = useState<{id: string; title: string; subject: string}[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // createPortal needs the DOM — flip this in a frame after mount; the
  // parent only mounts us while open, so it's true before users see us.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Autofocus the input shortly after mount (state starts empty — the
  // parent remounts us per open via `key`, so no reset effect is needed).
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Debounced live results from the server action
  useEffect(() => {
    if (!open) return;
    async function fetchSuggestions() {
      if (query.trim().length < 2) {
        setResourceSuggestions([]);
        return;
      }
      const data = await searchResourceSuggestions(query);
      if (data) setResourceSuggestions(data);
    }
    const timeoutId = setTimeout(fetchSuggestions, 250);
    return () => clearTimeout(timeoutId);
  }, [query, open]);

  // Esc closes; body scroll locked while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const trimmed = query.trim().toLowerCase();
  const subjectMatches: Suggestion[] =
    trimmed.length >= 2
      ? SUBJECTS.filter((s) => s.toLowerCase().includes(trimmed))
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

  const go = (url: string) => {
    onClose();
    router.push(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) go(`/find?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    if (suggestion.type === "Subject") {
      go(`/browse?subject=${encodeURIComponent(suggestion.text)}`);
    } else {
      go(`/resource/${suggestion.id}`);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center px-4 pt-[12vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />

      {/* Window */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Student Hub"
        className="relative w-full max-w-xl rounded-[2rem] border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden fade-up"
      >
        {/* Input row */}
        <form onSubmit={handleSubmit} className="relative flex items-center border-b-2 border-black">
          <Search className="absolute left-5 h-5 w-5 text-black/40 pointer-events-none" strokeWidth={2} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search resources, subjects…"
            className="w-full h-16 pl-14 pr-14 text-lg font-medium outline-none placeholder:text-black/30"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResourceSuggestions([]); inputRef.current?.focus(); }}
              className="absolute right-5 text-black/40 hover:text-black transition-colors"
              aria-label="Clear"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </form>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {trimmed.length >= 2 && suggestions.length === 0 && (
            <div className="px-6 py-8 text-center">
              <p className="text-sm font-bold tracking-wider text-black/40">No matches for “{query.trim()}”</p>
              <p className="text-xs font-medium text-black/30 mt-1">Press Enter to search everything</p>
            </div>
          )}

          {suggestions.map((item) => (
            <button
              key={`${item.type}-${item.id}`}
              onClick={() => handleSelectSuggestion(item)}
              className="w-full group cursor-pointer px-5 py-4 border-b border-black/5 last:border-b-0 flex items-center justify-between gap-3 transition-colors hover:bg-[#0D9488] text-left"
            >
              <span className="flex items-center gap-3 min-w-0">
                <Search className="h-4 w-4 text-black/30 group-hover:text-black/60 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-black">{item.text}</span>
                  {item.type === "Resource" && item.subject && (
                    <span className="block truncate text-xs font-medium text-black/40 group-hover:text-black/60">
                      in {item.subject}
                    </span>
                  )}
                </span>
              </span>
              <span
                className={`text-[10px] font-bold tracking-widest px-2.5 py-0.5 rounded-full border border-black flex-shrink-0 transition-colors ${
                  item.type === "Subject"
                    ? "bg-white text-black group-hover:bg-black group-hover:text-white"
                    : "bg-[#0D9488] text-black"
                }`}
              >
                {item.type}
              </span>
            </button>
          ))}

          {/* Footer hint */}
          <div className="px-6 py-3 bg-gray-50 border-t border-black/5 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-widest text-black/30 uppercase">Search</span>
            <span className="text-[10px] font-medium text-black/30">Enter for full results · Esc to close</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
