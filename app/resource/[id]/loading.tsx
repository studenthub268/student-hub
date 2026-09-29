import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Resource page loading shell — the cheap skeleton for card prefetches.
 *
 * Resource pages are server components that run a per-visitor DB query (the
 * like check). Every card in browse/home prefetches its page on viewport, so
 * with a few thousand visitors the prefetch stream IS the traffic. This
 * boundary keeps those prefetch renders on a fixed, tiny skeleton instead of
 * streaming the full page shell — the arrival still feels instant, and the
 * server work per prefetch stays bounded.
 */
export default function ResourceLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 pt-4 pb-14 sm:px-6 sm:pt-6 lg:px-8">
      {/* Chips */}
      <div className="flex gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
      </div>

      {/* Title */}
      <Skeleton className="mt-4 h-9 w-full max-w-2xl rounded-xl" />

      {/* Workspace: preview left, rail right (stacked on mobile) */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="overflow-hidden rounded-[2rem] border-2 border-ink bg-surface shadow-hard">
            <div className="border-b-2 border-ink px-3 py-3 sm:px-5">
              <Skeleton className="h-6 w-2/3 rounded-lg" />
            </div>
            <Skeleton className="h-[56vh] min-h-[340px] w-full rounded-none" />
          </div>
        </div>
        <aside className="lg:col-span-4">
          <div className="rounded-[2rem] border-2 border-ink bg-surface shadow-hard">
            <div className="border-b-2 border-ink px-5 py-4">
              <Skeleton className="h-5 w-40 rounded-lg" />
            </div>
            <div className="space-y-3 px-5 py-4">
              <Skeleton className="h-5 w-48 rounded-lg" />
              <Skeleton className="h-5 w-36 rounded-lg" />
              <Skeleton className="h-12 w-full rounded-full" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-10 rounded-full" />
                <Skeleton className="h-10 rounded-full" />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
