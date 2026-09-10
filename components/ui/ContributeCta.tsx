"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useSessionUser } from "@/components/layout/NavbarAuth";

// Final home-page CTA. Server-rendered in the static HTML (guests see it with
// zero delay); hidden after hydration for signed-in users, reusing the navbar's
// shared /api/auth/session fetch — no extra request, page stays ISR-static.
export function ContributeCta() {
  const user = useSessionUser();
  if (user) return null; // signed-in: Upload already lives in the profile menu

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-12 max-w-[1400px] mx-auto w-full below-fold">
      <div className="bg-[#111] text-white rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 text-center relative overflow-hidden group">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neutral-800/20 to-transparent opacity-50"></div>
        <div className="relative z-10">
          <h2 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tighter mb-6 italic uppercase">Ready to contribute?</h2>
          <p className="text-xl text-white/60 font-medium mb-10 max-w-2xl mx-auto italic">
            Join the thousands of students already sharing their knowledge.
          </p>
          <Link href="/upload" className="inline-flex items-center gap-2 sm:gap-3 bg-[#0D9488] text-black border-2 border-black px-6 sm:px-12 py-4 sm:py-5 rounded-full font-bold text-xs sm:text-sm tracking-wider hover:-translate-y-1 transition-all whitespace-nowrap">
            Upload a Resource <ArrowUpRight />
          </Link>
        </div>
      </div>
    </section>
  );
}
