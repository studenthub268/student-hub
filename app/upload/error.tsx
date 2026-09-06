"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MoveUpRight } from "lucide-react";

export default function UploadError({
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
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="bg-gray-50 rounded-[2rem] border-2 border-dashed border-black/10 p-12 max-w-lg w-full">
        <h1 className="text-6xl font-black tracking-tighter text-black/10 mb-4">!</h1>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          Upload failed
        </h2>
        <p className="text-black/50 font-medium mb-8">
          Something went wrong while loading the upload form. Please try again.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 bg-[#111] text-white px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:-translate-y-1 transition-all"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 border-2 border-black px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:-translate-y-1 transition-all"
          >
            Go home <MoveUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
