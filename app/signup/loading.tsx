import { Skeleton } from "@/components/ui/Skeleton";

export default function SignupLoading() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Skeleton className="h-8 w-40 mx-auto" />
          <Skeleton className="h-5 w-72 mx-auto" />
        </div>
        <div className="rounded-[2rem] border-2 border-black/5 p-8 space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          <Skeleton className="h-14 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
