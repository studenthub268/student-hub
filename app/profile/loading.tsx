import { Skeleton } from "@/components/ui/Skeleton";

export default function ProfileLoading() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-[1400px]">
      {/* Profile header */}
      <div className="flex items-center gap-6 mb-12">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>

      {/* Resources */}
      <Skeleton className="h-8 w-48 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-[2rem] border-2 border-black/5 p-6 space-y-4">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
