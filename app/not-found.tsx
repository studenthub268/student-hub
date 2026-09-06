import Link from "next/link";
import { MoveUpRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center">
      <div className="bg-gray-50 rounded-[2rem] border-2 border-dashed border-black/10 p-12 sm:p-16 max-w-lg w-full">
        <h1 className="text-6xl sm:text-8xl font-black tracking-tighter text-black/10 mb-4">
          404
        </h1>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
          Page not found
        </h2>
        <p className="text-black/50 font-medium mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-[#111] text-white px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:-translate-y-1 transition-all"
        >
          Go home <MoveUpRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
