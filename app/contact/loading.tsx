import { Skeleton } from "@/components/ui/Skeleton";

export default function ContactLoading() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-3xl">
      <Skeleton className="h-10 w-48 mb-4" />
      <Skeleton className="h-5 w-96 mb-12" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>

      <div className="rounded-[2rem] border-2 border-black/5 p-8 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <Skeleton className="h-14 w-full rounded-full" />
      </div>
    </div>
  );
}
