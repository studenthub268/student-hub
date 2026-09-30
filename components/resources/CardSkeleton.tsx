import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Grid-slot placeholder matching ResourceCard's exact structure and spacing,
 * shown for the incoming batch while the visitor scrolls toward it. When the
 * scroll sentinel extends the render window, each slot is swapped 1:1 for a
 * real card — same footprint, so the scrollbar never jumps and the region
 * below the last card never reads as blank page background.
 *
 * aria-hidden: purely decorative; the Load-more button below the grid is the
 * accessible control for this content.
 */
export function CardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex h-full flex-col rounded-[2rem] border-2 border-ink bg-surface p-4 sm:p-6 lg:p-8 opacity-70"
    >
      {/* Top row: type chip + arrow bubble */}
      <div className="flex items-start justify-between mb-4 sm:mb-8">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-full" />
      </div>

      {/* Title */}
      <div className="space-y-2 mb-4">
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-5 w-2/3" />
      </div>

      {/* Subject + department chips */}
      <div className="flex flex-wrap gap-2 mb-4 sm:mb-8">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>

      {/* Footer: likes left, type/size pill right */}
      <div className="mt-auto flex items-center justify-between border-t-2 border-line pt-4 sm:pt-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-4 w-8" />
        </div>
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
    </div>
  );
}

/** A full incoming batch of slots — rendered inside the same grid wrapper. */
export function CardSkeletonBatch({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={`skeleton-${i}`} className="h-full">
          <CardSkeleton />
        </div>
      ))}
    </>
  );
}
