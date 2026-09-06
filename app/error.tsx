"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="bg-gray-50 rounded-[2rem] border-2 border-dashed border-black/10 p-12 sm:p-16 max-w-lg w-full">
        <h1 className="text-6xl sm:text-8xl font-black tracking-tighter text-black/10 mb-4">
          !
        </h1>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          Something went wrong
        </h2>
        <p className="text-black/50 font-medium mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-[#111] text-white px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:-translate-y-1 transition-all"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
