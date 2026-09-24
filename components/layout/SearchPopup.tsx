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
  // Keyboard selection over the suggestion list; -1 = input (no highlight).
  const [activeIndex, setActiveIndex] = useState(-1);

  // createPortal needs the DOM — flip this in a frame after mount; the
  // parent only mounts us while open, so it's true before users see us.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Fresh state + autofocus on EVERY open. The component stays mounted while
  // `open` toggles, so a mount-once effect never re-ran — the input wasn't
  // focused and users had to click it a second time before typing.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reset-on-open is the point; it runs once per open, not in a loop */
    setQuery("");
    setResourceSuggestions([]);
    setActiveIndex(-1);
    /* eslint-enable react-hooks/set-state-in-effect */
    // The portal attaches a frame after `open` flips (see `mounted`), so
    // retry briefly until the input exists.
    let tries = 0;
    const focus = () => {
      if (inputRef.current) inputRef.current.focus();
      else if (tries++ < 10) setTimeout(focus, 30);
    };
    const t = setTimeout(focus, 20);
    return () => clearTimeout(t);
  }, [open]);

  // Debounced live results from the server action. `ignore` is the
  // stale-response guard: typing "cal" then "calc" leaves the first request
  // still in flight, and without it a slow early reply lands AFTER the newer
  // one and overwrites the visible suggestions with results for a prefix the
  // user has already typed past.
  useEffect(() => {
    if (!open) return;
    let ignore = false;
    async function fetchSuggestions() {
      if (query.trim().length < 2) {
        setResourceSuggestions([]);
        return;
      }
      try {
        const data = await searchResourceSuggestions(query);
        if (ignore) return;
        if (data) setResourceSuggestions(data);
        setActiveIndex(-1);
      } catch {
        // A typeahead must never surface an error; keep the last results.
        if (!ignore) setActiveIndex(-1);
      }
    }
    const timeoutId = setTimeout(fetchSuggestions, 250);
    return () => {
      ignore = true;
      clearTimeout(timeoutId);
    };
  }, [query, open]);

  // Esc / arrow-key navigation; body scroll locked while open. Arrow keys
  // move the highlight across the visible suggestion list (Enter opens it);
  // Escape first drops the highlight, then closes the popup.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeIndex >= 0) setActiveIndex(-1);
        else onClose();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const count = document.querySelectorAll("[data-suggestion]").length;
      if (count === 0) return;
      e.preventDefault();
      setActiveIndex((i) => {
        if (e.key === "ArrowDown") return i + 1 >= count ? 0 : i + 1;
        return i <= 0 ? count - 1 : i - 1;
      });
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, activeIndex, onClose]);

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
    // Enter on a highlighted suggestion opens it; otherwise Enter falls
    // through to the full results page (from=search = no filter chips).
    if (activeIndex >= 0) {
      const selected = suggestions[activeIndex];
      if (selected) {
        handleSelectSuggestion(selected);
        return;
      }
    }
    if (query.trim()) go(`/browse?q=${encodeURIComponent(query.trim())}&from=search`);
  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    if (suggestion.type === "Subject") {
      // from=search tells /browse to show results only — no filter chips.
      go(`/browse?subject=${encodeURIComponent(suggestion.text)}&from=search`);
    } else {
      go(`/resource/${suggestion.id}`);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center px-4 pt-[12vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/60 backdrop-blur-[2px]" onClick={onClose} />

      {/* Window */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Student Hub"
        className="relative w-full max-w-xl rounded-[2rem] border-2 border-ink bg-surface shadow-hard-lg overflow-hidden scale-in"
      >
        {/* Input row */}
        <form onSubmit={handleSubmit} className="relative flex items-center border-b-2 border-ink">
          <Search className="absolute left-5 h-5 w-5 text-foreground/70 pointer-events-none" strokeWidth={2} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search resources, subjects…"
            className="w-full h-16 pl-14 pr-14 text-lg font-medium outline-none placeholder:text-foreground/60"
            autoComplete="off"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResourceSuggestions([]); inputRef.current?.focus(); }}
              className="absolute right-5 text-foreground/60 hover:text-foreground transition-colors"
              aria-label="Clear"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </form>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {/* Empty state — nothing typed: suggest a few subjects */}
          {trimmed.length === 0 && (
            <div className="px-5 py-4">
              <p className="text-xs font-bold tracking-widest text-foreground/70 uppercase mb-3">Try a subject</p>
              <div className="flex flex-wrap gap-2">
                {SUBJECTS.filter((s) =>
                  ["Programming Fundamentals", "Circuit Analysis and Design", "Electricity and Magnetism"].includes(s)
                ).map((subject) => (
                  <button
                    key={subject}
                    onClick={() => go(`/browse?subject=${encodeURIComponent(subject)}&from=search`)}
                    className="px-4 py-2 bg-surface border-2 border-ink rounded-full text-sm font-medium text-foreground transition-all hover:bg-accent hover:text-accent-contrast press"
                  >
                    {subject}
                  </button>
                ))}
              </div>
            </div>
          )}

          {trimmed.length >= 2 && suggestions.length === 0 && (
            <div className="px-6 py-8 text-center">
              <p className="text-sm font-bold tracking-wider text-foreground/60">No matches for “{query.trim()}”</p>
              <p className="text-xs font-medium text-foreground/70 mt-1">Press Enter to search everything</p>
            </div>
          )}

          {suggestions.map((item, index) => (
            <button
              key={`${item.type}-${item.id}`}
              data-suggestion
              onClick={() => handleSelectSuggestion(item)}
              className={`w-full group cursor-pointer px-5 py-4 border-b border-line last:border-b-0 flex items-center justify-between gap-3 transition-colors text-left ${
                index === activeIndex ? "bg-accent on-ink" : "hover:bg-accent hover:text-accent-contrast"
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Search className="h-4 w-4 text-foreground/50 group-hover:text-foreground/60 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{item.text}</span>
                  {item.type === "Resource" && item.subject && (
                    <span className="block truncate text-xs font-medium text-foreground/60 group-hover:text-foreground/60">
                      in {item.subject}
                    </span>
                  )}
                </span>
              </span>
              <span
                className={`text-xs font-bold tracking-widest px-2.5 py-0.5 rounded-full border border-ink flex-shrink-0 transition-colors ${
                  item.type === "Subject"
                    ? "bg-surface text-foreground group-hover:bg-ink group-hover:on-ink"
                    : "bg-accent text-accent-contrast"
                }`}
              >
                {item.type}
              </span>
            </button>
          ))}

          {/* Footer hint */}
          <div className="px-6 py-3 bg-surface-muted border-t border-line flex items-center justify-between">
            <span className="text-xs font-bold tracking-widest text-foreground/70 uppercase">Search</span>
            <span className="text-xs font-medium text-foreground/70">
              {/* Touch has no Esc — say what actually closes it there. */}
              <span className="sm:hidden">Tap outside to close</span>
              <span className="hidden sm:inline">Enter for full results · Esc to close</span>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
