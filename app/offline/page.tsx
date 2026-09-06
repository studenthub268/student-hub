import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="bg-gray-50 rounded-[2rem] border-2 border-dashed border-black/10 p-12 sm:p-16 max-w-lg w-full">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#0D9488]/10 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-[#0D9488]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          You&apos;re offline
        </h1>
        <p className="text-black/50 font-medium mb-8">
          It looks like you&apos;ve lost your internet connection. Check your network and try again.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[#111] text-white px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:-translate-y-1 transition-all"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
