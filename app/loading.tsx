import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Home page skeleton — mirrors the real layout (hero bento grid +
 * Recent Uploads cards) so the page materializes in place instead of
 * showing a spinner. Shimmer comes from the Skeleton base class.
 */
export default function HomeLoading() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-[#111] font-sans">
      {/* Hero bento */}
      <section className="px-6 sm:px-6 lg:px-8 py-8 sm:py-10 max-w-[1400px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-8 flex flex-col justify-center gap-4 pb-6 lg:pb-0">
            <Skeleton className="h-14 sm:h-20 w-full max-w-xl rounded-2xl" />
            <Skeleton className="h-14 sm:h-20 w-2/3 max-w-md rounded-2xl" />
          </div>
          <div className="lg:col-span-4 min-h-[280px] rounded-[2rem] bg-[#111] p-6 sm:p-8 flex flex-col justify-between">
            <Skeleton className="h-8 w-24 rounded-full bg-white/10" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full bg-white/10" />
              <Skeleton className="h-4 w-5/6 bg-white/10" />
              <Skeleton className="h-4 w-2/3 bg-white/10" />
            </div>
          </div>
          <div className="lg:col-span-4 flex flex-col gap-6 lg:gap-8">
            <Skeleton className="h-28 lg:h-36 rounded-[2rem]" />
            <div className="flex gap-6 lg:gap-8 h-36">
              <Skeleton className="flex-1 rounded-[2rem]" />
              <Skeleton className="flex-1 rounded-[2rem] !bg-[#222]" />
            </div>
          </div>
          <div className="lg:col-span-8 min-h-[280px] rounded-[2rem] bg-[#0D9488]/90 p-8 sm:p-10 flex flex-col justify-between">
            <div className="flex gap-2">
              <Skeleton className="h-7 w-28 rounded-full bg-black/10" />
              <Skeleton className="h-7 w-24 rounded-full bg-black/10" />
            </div>
            <div>
              <Skeleton className="h-12 sm:h-20 w-1/2 rounded-2xl bg-black/10 mb-6" />
              <Skeleton className="h-4 w-full max-w-md bg-black/10" />
            </div>
          </div>
        </div>
      </section>

      {/* Recent Uploads */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-[1400px] mx-auto w-full border-t border-gray-200">
        <div className="flex justify-between items-end mb-12">
          <div className="space-y-2">
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="hidden sm:block h-5 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 rounded-[2rem] border-2 border-black/5 p-6 sm:p-8 space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-8 w-24 rounded-full" />
                <Skeleton className="h-10 w-10 rounded-full" />
              </div>
              <Skeleton className="h-7 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
