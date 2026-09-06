"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Filter, X } from "lucide-react";
import { SUBJECTS, RESOURCE_TYPES } from "@/lib/constants";
import { ResourceCard } from "@/components/resources/ResourceCard";
import type { Resource } from "@/lib/db/schema";

interface BrowseResource extends Resource {
  uploader?: { name: string | null } | null;
}

interface BrowseContentProps {
  resources: BrowseResource[];
  typeCounts: Record<string, number>;
  subjectCounts: Record<string, number>;
  total: number;
}

interface FilterPillProps {
  label: string;
  active: boolean;
  count?: number;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}

function FilterPill({ label, active, count, disabled, pending, onClick }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border-2 border-black transition-all text-left ${
        active
          ? "bg-[#0D9488] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          : "bg-white hover:bg-gray-50"
      } ${disabled && !active ? "opacity-40 cursor-not-allowed hover:bg-white" : ""} ${
        pending && active ? "opacity-60 animate-pulse" : ""
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={`text-xs font-bold tabular-nums ${
            active ? "text-black" : "text-black/50"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

export default function BrowseContent({
  resources,
  typeCounts,
  subjectCounts,
  total,
}: BrowseContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [selectedType, setSelectedType] = useState(searchParams.get("type") || "all");
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get("subject") || "all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigate with the new params — the server (single source of truth)
  // re-queries and streams back results + fresh facet counts.
  const applyParams = (overrides: { q?: string; type?: string; subject?: string }) => {
    const next = {
      q: searchQuery,
      type: selectedType,
      subject: selectedSubject,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.type && next.type !== "all") params.set("type", next.type);
    if (next.subject && next.subject !== "all") params.set("subject", next.subject);
    const qs = params.toString();
    startTransition(() => {
      router.replace(`/browse${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyParams({ q: value }), SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const clearAll = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery("");
    setSelectedType("all");
    setSelectedSubject("all");
    startTransition(() => {
      router.replace("/browse", { scroll: false });
    });
  };

  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-[1400px]">
      <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-black">Browse Resources</h1>
          <p className="mt-4 text-lg text-black/60 font-medium">Find exactly what you need to ace your next exam.</p>
        </div>

        <div className="w-full md:w-[400px]">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Search className="h-5 w-5 text-black/50" strokeWidth={1.5} />
            </div>
            <input
              type="text"
              placeholder="Search title or description..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full h-14 pl-12 pr-12 rounded-full border-2 border-black bg-white text-base font-medium text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:outline-none focus:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all placeholder:text-black/40"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  applyParams({ q: "" });
                }}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-black/50 hover:text-black transition-colors"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters — server-computed counts; type counts ignore the subject
          facet and vice versa so pills only advertise reachable results. */}
      <div className="space-y-6 mb-10">
        {/* Type Filter */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-black tracking-wider">
            <Filter className="h-4 w-4" strokeWidth={1.5} /> Resource Type
          </h3>
          <div className="flex flex-wrap gap-2">
            <FilterPill
              label="All Types"
              active={selectedType === "all"}
              count={total}
              onClick={() => {
                setSelectedType("all");
                applyParams({ type: "all" });
              }}
            />
            {RESOURCE_TYPES.map((type) => (
              <FilterPill
                key={type.value}
                label={type.label}
                active={selectedType === type.value}
                count={typeCounts[type.value] || 0}
                disabled={!typeCounts[type.value]}
                pending={isPending}
                onClick={() => {
                  setSelectedType(type.value);
                  applyParams({ type: type.value });
                }}
              />
            ))}
          </div>
        </div>

        {/* Subject Filter */}
        <div>
          <h3 className="mb-3 text-sm font-bold text-black tracking-wider">Subject</h3>
          <div className="flex flex-wrap gap-2">
            <FilterPill
              label="All Subjects"
              active={selectedSubject === "all"}
              count={total}
              onClick={() => {
                setSelectedSubject("all");
                applyParams({ subject: "all" });
              }}
            />
            {SUBJECTS.map((subject) => (
              <FilterPill
                key={subject}
                label={subject}
                active={selectedSubject === subject}
                count={subjectCounts[subject] || 0}
                disabled={!subjectCounts[subject]}
                pending={isPending}
                onClick={() => {
                  setSelectedSubject(subject);
                  applyParams({ subject });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div>
        <div className="mb-6 text-base text-black/60 font-medium">
          Showing {resources.length} resource{resources.length !== 1 && "s"}
        </div>

        {resources.length > 0 ? (
          <div className={`grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity ${isPending ? "opacity-60" : ""}`}>
            {resources.map((resource) => (
              <div key={resource.id} className="h-full">
                <ResourceCard resource={resource} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-black bg-[#f8fafc] py-32 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-black bg-white mb-6">
              <Search className="h-8 w-8 text-black" strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-medium text-black">No resources found</h3>
            <p className="mt-4 text-black/60 max-w-sm mx-auto font-medium">
              We couldn&apos;t find anything matching your current filters.</p>
            <button onClick={clearAll}
              className="mt-8 rounded-full border-2 border-black bg-[#111] px-6 py-3 text-sm font-medium text-white transition-all hover:bg-black/80 hover:-translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]">Clear all filters</button>
          </div>
        )}
      </div>
    </div>
  );
}
