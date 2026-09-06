import { Skeleton } from "@/components/ui/Skeleton";

export default function UploadLoading() {
  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8 space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-80" />
      </div>

      {/* Form */}
      <div className="rounded-[2rem] border-2 border-black/5 p-8 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <Skeleton className="h-px w-full bg-black/10" />
        <Skeleton className="h-40 w-full rounded-2xl border-2 border-dashed border-black/10" />
        <Skeleton className="h-14 w-full rounded-full" />
      </div>
    </div>
  );
}
