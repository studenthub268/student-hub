export default function Loading() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 border-4 border-black/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-transparent border-t-[#0D9488] rounded-full animate-spin" />
        </div>
        <p className="text-sm font-medium text-black/40 tracking-wider">
          Loading...
        </p>
      </div>
    </div>
  );
}
