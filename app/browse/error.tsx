"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MoveUpRight } from "lucide-react";

export default function BrowseError({
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
      <h2 className="text-3xl font-bold tracking-tight mb-4">
        Couldn&apos;t load resources
      </h2>
      <p className="text-black/50 font-medium mb-8 max-w-md">
        We&apos;re having trouble connecting to the database. Please try again in a moment.
      </p>
      <div className="flex gap-4">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-[#111] text-white px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:-translate-y-1 transition-all"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 border-2 border-black px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:-translate-y-1 transition-all"
        >
          Go home <MoveUpRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
