"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Filter, ChevronDown } from "lucide-react";
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
  className?: string;
  onClick: () => void;
}

function FilterPill({ label, active, count, disabled, pending, className, onClick }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border-2 border-ink transition-all text-left ${className || ""} ${
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
          className={`text-xs font-bold tabular-nums ${
            active ? "text-foreground" : "text-foreground/60"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// On phones, only the first few subject chips show until "Show more" is tapped.
const MOBILE_SUBJECT_LIMIT = 6;

export default function BrowseContent({
  resources,
  typeCounts,
  subjectCounts,
  total,
}: BrowseContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Arrivals from a search suggestion show results only — no filter wall.
  // Opening /browse directly keeps the full filter experience.
  const fromSearch = searchParams.get("from") === "search";
  const searchContext =
    searchParams.get("q") || searchParams.get("subject") || searchParams.get("type");

  const [selectedType, setSelectedType] = useState(searchParams.get("type") || "all");
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get("subject") || "all");
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  // Show more/less toggle for the subject list. Visible only on phones via
  // CSS (md:flex) so there is NO isMobile state: a JS-measured breakpoint
  // starts false, flips after hydration, and collapses 30 chips into 6 —
  // shifting the whole results grid (Lighthouse CLS 0.16 on /browse).

  // Navigate with the new params — the server (single source of truth)
  // re-queries and streams back results + fresh facet counts.
  const applyParams = (overrides: { type?: string; subject?: string }) => {
    const next = {
      type: selectedType,
      subject: selectedSubject,
      ...overrides,
    };
    const params = new URLSearchParams();
    if (next.type && next.type !== "all") params.set("type", next.type);
    if (next.subject && next.subject !== "all") params.set("subject", next.subject);
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
            {SUBJECTS.map((subject, i) => (
              <FilterPill
                key={subject}
                label={subject}
                active={selectedSubject === subject}
                count={subjectCounts[subject] || 0}
                disabled={!subjectCounts[subject]}
                pending={isPending}
                // ponytail: CSS-driven mobile collapse instead of measured
                // JS state — zero layout shift, 20 lines smaller. If chips
                // must differ per breakpoint beyond hiding, revisit.
                className={i >= MOBILE_SUBJECT_LIMIT && !showAllSubjects ? "max-md:hidden" : ""}
                onClick={() => {
                  setSelectedSubject(subject);
                  applyParams({ subject });
                }}
              />
            ))}
            {/* Show more/less — phone-only (CSS), flips the chip hiding above. */}
            <button
              onClick={() => setShowAllSubjects((v) => !v)}
              className={`items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold border-2 border-dashed border-line-strong text-foreground/60 transition-colors hover:border-ink hover:text-foreground md:hidden ${
                showAllSubjects ? "hidden" : "inline-flex"
              }`}
            >
              Show more ({SUBJECTS.length - MOBILE_SUBJECT_LIMIT})
              <ChevronDown className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              onClick={() => setShowAllSubjects(false)}
              className={`items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold border-2 border-dashed border-ink text-foreground transition-colors hover:bg-surface-muted md:hidden ${
                showAllSubjects ? "inline-flex" : "hidden"
              }`}
            >
              Show less
              <ChevronDown className="h-4 w-4 rotate-180" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Results */}
      <div>
        <div className="mb-6 text-base text-foreground/60 font-medium">
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
          ) : (
            <>Showing {resources.length} resource{resources.length !== 1 && "s"}</>
          )}
        </div>

        {resources.length > 0 ? (
          <div className={`grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 transition-opacity ${isPending ? "opacity-60" : ""} fade-up-stagger`}>
            {resources.map((resource) => (
              <div key={resource.id} className="h-full">
                <ResourceCard resource={resource} />
              </div>
            ))}
          </div>
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
