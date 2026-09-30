"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Filter, ChevronDown, ArrowDownWideNarrow } from "lucide-react";
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
  sort: string;
}

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "liked", label: "Most liked" },
  { value: "downloads", label: "Most downloaded" },
] as const;

interface FilterPillProps {
  label: string;
  active: boolean;
  count?: number;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}

function FilterPill({ label, active, count, disabled, pending, onClick }: FilterPillProps) {
  // Selected state is otherwise colour-only (bg-accent), which says nothing to
  // assistive tech; aria-pressed exposes it the way the sort pills already do.
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border-2 border-ink transition-all text-left ${
        active
          ? "bg-accent shadow-hard-sm"
          : "bg-surface hover:bg-surface-muted"
      } ${disabled && !active ? "opacity-40 cursor-not-allowed hover:bg-surface" : ""} ${
        pending && active ? "opacity-60 animate-pulse" : ""
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span
          // Active pill is accent-filled, so the badge inherits the chip's
          // on-accent colour instead of forcing the dark body colour onto it.
          className={`text-xs font-bold tabular-nums ${
            active ? "" : "text-foreground/60"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// Subject chips shown before "Show more". Applies at EVERY breakpoint: the
// collapse used to be phone-only, which left tablet and desktop to wrap all
// 24 subjects into a ~9-row grey wall (chips ran to 804px of a 1100px tablet
// viewport) and pushed the first actual result below the fold.
const SUBJECT_LIMIT = 6;

// Cards rendered initially / added per scroll batch. 24 fills ~3 rows on
// desktop and ~12 screens on a phone column — far past where the sentinel
// (600px lookahead) fires, so scrolling never shows a gap. The server
// already caps the payload at 200 rows (a small JSON fetch, now index-backed);
// what actually hurts at scale is MOUNTING 200 card components up front —
// hydration time and DOM size grow linearly with the library. Windowing the
// render keeps both constant no matter how many rows ship.
const PAGE_SIZE = 24;

export default function BrowseContent({
  resources,
  typeCounts,
  subjectCounts,
  total,
  sort,
}: BrowseContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Rendered-window state, keyed to the results array: when the server
  // delivers a new result set (filter/sort change), the count resets
  // synchronously DURING the render that sees the new array — not in an
  // effect after it — so a narrowed result never flashes all-then-fewer.
  // (React's documented derived-state-from-props pattern.)
  const [windowState, setWindowState] = useState({
    results: resources,
    count: PAGE_SIZE,
  });
  if (windowState.results !== resources) {
    setWindowState({ results: resources, count: PAGE_SIZE });
  }
  const visibleCount = Math.min(windowState.count, resources.length);
  const visibleResources = resources.slice(0, visibleCount);
  const hasMore = visibleCount < resources.length;
  const hiddenCount = resources.length - visibleCount;

  // Auto-load: a sentinel div sits below the grid; when scrolling brings it
  // within 600px of the viewport, extend the window. Re-created only when
  // more results remain; the 600px rootMargin loads the next batch BEFORE
  // the user reaches the end, so scrolling feels endless.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!hasMore || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setWindowState((s) =>
            s.results === resources
              ? { ...s, count: s.count + PAGE_SIZE }
              : s // a new result set arrived mid-scroll — the render-reset wins
          );
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, resources]);

  /* Idle prefetch of the NEXT batch's card pages. The result data is already
     in memory (windowing), but each card's /resource/[id] RSC payload is
     only fetched when the card MOUNTS — so a visitor who scrolls fast hits
     cards whose prefetch just started (blank-ish tap targets on 3G).
     While they're still reading the current window, warm the router cache
     with the next batch's hrefs, one per idle slice (requestIdleCallback,
     setTimeout fallback): the CPU/network stays free while they read, and
     when the sentinel extends the window every new card renders — and
     navigates — instantly. Mobile gets the same benefit without needing
     hover. router.prefetch dedupes, so overlap with mounted cards' own
     prefetching is free; cancelling the queue on any change keeps a filter
     switch from prefetching stale hrefs. */
  useEffect(() => {
    if (!hasMore) return;
    const nextHrefs = resources
      .slice(visibleCount, visibleCount + PAGE_SIZE)
      .map((r) => `/resource/${r.id}`);
    if (nextHrefs.length === 0) return;

    let cancelled = false;
    let handle: number;
    const schedule = (cb: () => void) => {
      if (typeof window.requestIdleCallback === "function") {
        return window.requestIdleCallback(cb, { timeout: 3000 });
      }
      return window.setTimeout(cb, 250);
    };
    const cancel = (h: number) => {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(h);
      else window.clearTimeout(h);
    };
    const drain = (i: number) => {
      if (cancelled || i >= nextHrefs.length) return;
      router.prefetch(nextHrefs[i]);
      handle = schedule(() => drain(i + 1));
    };
    handle = schedule(() => drain(0));
    return () => {
      cancelled = true;
      cancel(handle);
    };
  }, [hasMore, resources, visibleCount, router]);

  // Arrivals from a search suggestion show results only — no filter wall.
  // Opening /browse directly keeps the full filter experience.
  const fromSearch = searchParams.get("from") === "search";
  const searchContext =
    searchParams.get("q") || searchParams.get("subject") || searchParams.get("type");

  const [selectedType, setSelectedType] = useState(searchParams.get("type") || "all");
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get("subject") || "all");
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  // Show more/less for the subject list. This is a JS slice, not a measured
  // breakpoint: server and client both render the collapsed list first, so
  // there is no post-hydration collapse and no layout shift (the CLS 0.16
  // this used to fix came from measuring the viewport, which is a different
  // problem).

  // Navigate with the new params — the server (single source of truth)
  // re-queries and streams back results + fresh facet counts.
  const applyParams = (overrides: { type?: string; subject?: string; sort?: string }) => {
    const next = {
      type: selectedType,
      subject: selectedSubject,
      sort,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (next.type && next.type !== "all") params.set("type", next.type);
    if (next.subject && next.subject !== "all") params.set("subject", next.subject);
    if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
    const qs = params.toString();
    startTransition(() => {
      router.replace(`/browse${qs ? `?${qs}` : ""}`, { scroll: false });
    });
  };

  const clearAll = () => {
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
          <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-foreground">Browse Resources</h1>
          <p className="mt-4 text-lg text-foreground/60 font-medium">Find exactly what you need to ace your next exam.</p>
        </div>
      </div>

      {/* Filters — hidden for search arrivals (results only); shown when
          /browse is opened directly. Server-computed counts; type counts
          ignore the subject facet and vice versa so pills only advertise
          reachable results. */}
      {!fromSearch && (
      <div className="space-y-6 mb-10 fade-up">
        {/* Type Filter */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground tracking-wider">
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
          <h3 className="mb-3 text-sm font-bold text-foreground tracking-wider">Subject</h3>
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
            {(showAllSubjects ? SUBJECTS : SUBJECTS.slice(0, SUBJECT_LIMIT)).map((subject) => (
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
            {/* One toggle for both states — it used to be two buttons whose
                visibility was juggled by CSS display order. */}
            {SUBJECTS.length > SUBJECT_LIMIT && (
              <button
                onClick={() => setShowAllSubjects((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-line-strong px-4 py-2 text-sm font-bold text-foreground/60 transition-colors hover:border-ink hover:text-foreground"
              >
                {showAllSubjects ? "Show less" : `Show more (${SUBJECTS.length - SUBJECT_LIMIT})`}
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showAllSubjects ? "rotate-180" : ""}`}
                  strokeWidth={2}
                />
              </button>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Results */}
      <div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="text-base text-foreground/60 font-medium">
            {fromSearch ? (
              <>
                Showing {resources.length} result{resources.length !== 1 && "s"}
                {searchContext && (
                  <> for <span className="font-bold text-foreground">“{searchContext}”</span></>
                )}
                <span className="text-foreground/50"> · </span>
                <button
                  onClick={() =>
                    startTransition(() => {
                      setSelectedType("all");
                      setSelectedSubject("all");
                      router.push("/browse");
                    })
                  }
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Browse with filters
                </button>
              </>
            ) : resources.length > visibleCount ? (
              <>
                Showing {visibleCount} of {resources.length} resource{resources.length !== 1 && "s"}
              </>
            ) : (
              <>Showing {resources.length} resource{resources.length !== 1 && "s"}</>
            )}
          </div>

          {/* Sort control — a single bordered select on phones (nothing can
              overflow, one tap to change), the full segmented pill row from
              sm up. */}
          <div className="relative sm:mx-0 sm:px-0">
            {/* Phone: compact select styled as an ink pill. */}
            <div className="flex items-center gap-1.5 sm:hidden">
              <ArrowDownWideNarrow className="h-4 w-4 shrink-0 text-foreground/50" strokeWidth={1.75} aria-hidden />
              <select
                value={sort}
                onChange={(e) => applyParams({ sort: e.target.value })}
                aria-label="Sort resources"
                className="w-full max-w-[13rem] rounded-full border-2 border-ink bg-ink on-ink px-3.5 py-2 text-sm font-bold shadow-hard-sm appearance-none pr-8"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-surface text-foreground font-medium">
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none -ml-7 h-4 w-4 shrink-0 on-ink" strokeWidth={2.5} aria-hidden />
            </div>

            {/* sm+: the full segmented row (fits; no scrolling needed). */}
            <div className="hidden sm:flex items-center gap-2">
            <ArrowDownWideNarrow className="h-4 w-4 text-foreground/50" strokeWidth={1.75} aria-hidden />
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => applyParams({ sort: opt.value })}
                aria-pressed={sort === opt.value}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium border-2 border-ink transition-all ${
                  sort === opt.value
                    ? "bg-ink on-ink shadow-hard-sm"
                    : "bg-surface hover:bg-surface-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
            </div>
          </div>
        </div>

        {resources.length > 0 ? (
          <>
          <div className={`grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity ${isPending ? "opacity-60" : ""} fade-up-stagger`}>
            {visibleResources.map((resource) => (
              <div key={resource.id} className="h-full">
                <ResourceCard resource={resource} />
              </div>
            ))}
          </div>

          {/* Load-more: auto-fired by the sentinel above it while scrolling;
              the button remains for keyboard users and any environment where
              the observer hasn't run yet. Renders only when a hidden batch
              exists, and reports the remaining count. */}
          {hasMore && (
            <div ref={sentinelRef} className="mt-10 flex justify-center">
              <button
                onClick={() =>
                  setWindowState((s) =>
                    s.results === resources ? { ...s, count: s.count + PAGE_SIZE } : s
                  )
                }
                className="rounded-full border-2 border-ink bg-surface px-8 py-3 text-sm font-bold tracking-wider shadow-hard-sm transition-all hover:-translate-y-0.5 hover:shadow-hard active:translate-y-0 active:shadow-none"
              >
                Load {Math.min(PAGE_SIZE, hiddenCount)} more
                <span className="ml-2 font-medium text-foreground/50">
                  ({hiddenCount} left)
                </span>
              </button>
            </div>
          )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-ink bg-surface-muted py-32 text-center shadow-hard-faint">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink bg-surface mb-6">
              <Search className="h-8 w-8 text-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-medium text-foreground">No resources found</h3>
            <p className="mt-4 text-foreground/60 max-w-sm mx-auto font-medium">
              We couldn&apos;t find anything matching your current filters.</p>
            <button onClick={clearAll}
              className="mt-8 rounded-full border-2 border-ink bg-ink on-ink px-6 py-3 text-sm font-medium on-ink transition-all hover:bg-ink/80 hover:-translate-y-1 shadow-hard-dim">Clear all filters</button>
          </div>
        )}
      </div>
    </div>
  );
}
