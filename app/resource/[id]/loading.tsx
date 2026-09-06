import { Skeleton } from "@/components/ui/Skeleton";

export default function ResourceLoading() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-[1400px]">
      {/* Back link */}
      <Skeleton className="h-5 w-32 mb-8" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column */}
        <div className="lg:col-span-1 space-y-8">
          <div className="rounded-[2rem] border-2 border-black/5 p-8 space-y-6">
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-32 rounded-full" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            <Skeleton className="h-px w-full bg-black/10" />
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-5 w-40" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-5 w-32" />
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border-2 border-black/5 p-8 space-y-4">
            <Skeleton className="h-6 w-36" />
            <div className="flex items-center gap-6">
              <Skeleton className="h-20 w-20 rounded-2xl" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        </div>

        {/* Right column - preview */}
        <div className="lg:col-span-2">
          <div className="rounded-[2rem] border-2 border-black/5 overflow-hidden h-[800px]">
            <Skeleton className="h-14 w-full rounded-none" />
            <Skeleton className="h-full rounded-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
