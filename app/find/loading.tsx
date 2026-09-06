import { Skeleton } from "@/components/ui/Skeleton";

export default function FindLoading() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-3xl text-center">
      <Skeleton className="h-10 w-64 mx-auto mb-4" />
      <Skeleton className="h-5 w-96 mx-auto mb-8" />
      <Skeleton className="h-16 w-full rounded-full mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
