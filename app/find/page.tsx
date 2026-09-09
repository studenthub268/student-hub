"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { Search, ArrowLeft, ArrowUpRight, FileText, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Resource } from "@/lib/db/schema";
import { findResources } from "@/lib/actions/search-find";
import { SUBJECTS } from "@/lib/constants";

type FindResource = Resource & { uploader?: { name: string | null } | null };

function FindContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [results, setResults] = useState<FindResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const searchResources = async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const data = await findResources(query);
        if (data) setResults(data as FindResource[]);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchResources, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  // Close the suggestions dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const trimmed = query.trim().toLowerCase();
  const subjectMatches =
    trimmed.length >= 2
      ? SUBJECTS.filter((s) => s.toLowerCase().includes(trimmed)).slice(0, 4)
      : [];
  const showSuggestionsNow =
    showSuggestions && trimmed.length >= 2 && (subjectMatches.length > 0 || results.length > 0);

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-[#0D9488]">
      <div className="max-w-4xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="flex items-center gap-4 mb-12">
          <button
            onClick={() => router.back()}
            className="hidden md:flex p-3 rounded-full hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-black"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-4xl font-black tracking-tighter">Find Resources</h1>
        </div>

        {/* Massive Search Bar with suggestions */}
        <div className="relative mb-16" ref={wrapperRef}>
          <div className="absolute inset-y-0 left-4 sm:left-8 flex items-center pointer-events-none">
            <Search className="h-6 w-6 sm:h-8 sm:w-8 text-black/20" strokeWidth={3} />
          </div>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Type anything to find..."
            className="w-full bg-gray-50 border-4 border-black p-4 sm:p-8 pl-12 sm:pl-20 pr-12 sm:pr-20 text-base sm:text-3xl font-bold tracking-tight rounded-[2.5rem] outline-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] focus:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all placeholder:text-black/10 overflow-hidden text-ellipsis"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setResults([]); setShowSuggestions(false); }}
              className="absolute inset-y-0 right-4 sm:right-8 flex items-center text-black/30 hover:text-black transition-colors"
              aria-label="Clear search"
            >
              <X className="h-6 w-6" strokeWidth={2} />
            </button>
          )}

          {/* Suggestions dropdown — matching subjects + live results */}
          {showSuggestionsNow && (
            <div className="absolute left-0 right-0 top-full mt-3 z-50 rounded-3xl border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
              {subjectMatches.map((subject) => (
                <button
                  key={`subject-${subject}`}
                  onClick={() => {
                    setShowSuggestions(false);
                    router.push(`/browse?subject=${encodeURIComponent(subject)}`);
                  }
                  }
                  className="w-full group cursor-pointer px-5 sm:px-8 py-4 border-b border-black/5 flex items-center justify-between gap-3 transition-colors hover:bg-[#0D9488] text-left"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Search className="h-4 w-4 text-black/30 group-hover:text-black/60 flex-shrink-0" />
                    <span className="truncate text-sm sm:text-base font-medium text-black">{subject}</span>
                  </span>
                  <span className="text-[10px] font-bold tracking-widest px-2.5 py-0.5 rounded-full border border-black bg-white text-black group-hover:bg-black group-hover:text-white flex-shrink-0">
                    Subject
                  </span>
                </button>
              ))}
              {results.slice(0, 4).map((resource) => (
                <Link
                  key={resource.id}
                  href={`/resource/${resource.id}`}
                  onClick={() => setShowSuggestions(false)}
                  className="group cursor-pointer px-5 sm:px-8 py-4 border-b border-black/5 last:border-b-0 flex items-center justify-between gap-3 transition-colors hover:bg-[#0D9488]"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-black/30 group-hover:text-black/60 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm sm:text-base font-medium text-black">{resource.title}</span>
                      {resource.subject && (
                        <span className="block truncate text-xs font-medium text-black/40 group-hover:text-black/60">
                          in {resource.subject}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="text-[10px] font-bold tracking-widest px-2.5 py-0.5 rounded-full border border-black bg-[#0D9488] text-black flex-shrink-0">
                    Resource
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Results Area */}
        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-[#0D9488] border-t-black rounded-full animate-spin"></div>
            </div>
          ) : query.trim().length >= 2 && results.length > 0 ? (
            <div className="grid gap-4">
              {results.map((resource) => (
                <Link
                  key={resource.id}
                  href={`/resource/${resource.id}`}
                  className="group block bg-white border-2 border-black p-6 rounded-[2rem] hover:bg-[#0D9488] transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex gap-4">
                      <div className="p-3 bg-black text-white rounded-2xl group-hover:bg-white group-hover:text-black transition-colors">
                        <FileText size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold tracking-tight line-clamp-1">{resource.title}</h3>
                        <p className="text-black/60 font-medium text-sm">{resource.subject} • {resource.uploader?.name || 'Anonymous'}</p>
                      </div>
                    </div>
                    <ArrowUpRight className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          ) : query.trim().length >= 2 ? (
            <div className="text-center py-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-black/10">
              <h3 className="text-2xl font-black tracking-tighter mb-2">No results found</h3>
              <p className="text-black/40 font-medium italic">Try a different keyword or subject.</p>
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-black/30 font-bold tracking-wider text-sm">Start typing to search the student hub</p>
            </div>
          )}
        </div>

        {/* Subject Shortcuts */}
        {!query && (
          <div className="mt-20">
            <h4 className="text-xs font-black tracking-wider text-black/40 mb-6 text-center">Popular Subjects</h4>
            <div className="flex flex-wrap justify-center gap-3">
              {["Calculus", "Applied Physics", "Islamiyat", "AI", "Software Engineering", "DSA"].map((sub) => (
                <button
                  key={sub}
                  onClick={() => setQuery(sub)}
                  className="px-6 py-3 bg-white border-2 border-black rounded-full text-sm font-bold tracking-wider hover:bg-[#0D9488] transition-all active:scale-95"
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FindPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#0D9488] border-t-black rounded-full animate-spin"></div>
      </div>
    }>
      <FindContent />
    </Suspense>
  );
}
