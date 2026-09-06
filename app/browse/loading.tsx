import { Skeleton } from "@/components/ui/Skeleton";

export default function BrowseLoading() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-8 space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-8">
        <Skeleton className="h-10 w-48 rounded-full" />
        <Skeleton className="h-10 w-36 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-[2rem] border-2 border-black/5 p-6 space-y-4">
            <div className="flex justify-between">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
            </div>
            <Skeleton className="h-7 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-px w-full bg-black/10" />
            <div className="flex justify-between">
              <div className="flex gap-4">
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-5 w-12" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
