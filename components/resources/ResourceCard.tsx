"use client";

import Link from "next/link";
import { Heart, ArrowUpRight } from "lucide-react";
import { Resource } from "@/lib/db/schema";
import { formatFileSize, formatFileType } from "@/lib/utils";

interface ResourceCardProps {
  resource: Resource & { uploader?: { name: string | null } | null };
}

export function ResourceCard({ resource }: ResourceCardProps) {
  return (
    <Link href={`/resource/${resource.id}`} className="block h-full group">
      <div className="flex flex-col h-full bg-surface rounded-2xl sm:rounded-[2rem] border-2 border-ink shadow-hard transition-all duration-300 ease-out group-hover:shadow-hard-lg sm:group-hover:-translate-y-1.5 active:scale-[0.98] overflow-hidden relative">

        {/* Mobile-ultra-tight paddings; roomy from sm up. On phones the card
            reads as a compact list row: type chip and arrow merged into the
            top line, one-line title, subject inline with the meta bar. */}
        <div className="p-3 sm:p-8 flex flex-col flex-grow">
          <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-8">
            {/* flex-wrap, and no `truncate` on the label: `truncate` gives an
                element a min-content width of 0, so it always shrank away
                rather than ever wrapping — tablet 2-up and desktop 4-up both
                showed "Introduction to C…". A chip that doesn't fit now drops
                to its own line at full width instead of losing its text. */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="shrink-0 border border-ink rounded-full px-2.5 py-0.5 sm:px-4 sm:py-1.5 text-[11px] sm:text-xs font-semibold tracking-wider capitalize">
                {resource.type.replace('-', ' ')}
              </span>
              <span className="bg-surface-muted px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-sm font-medium text-foreground/70">
                {resource.subject}
              </span>
            </div>
            <div className="shrink-0 p-1 sm:p-2 rounded-full border border-ink group-hover:bg-accent group-hover:text-accent-contrast group-hover:rotate-45 transition-all duration-300">
              <ArrowUpRight className="h-3.5 w-3.5 sm:h-5 sm:w-5" strokeWidth={1.5} />
            </div>
          </div>

          <h3 className="text-sm sm:text-xl font-normal text-foreground mb-2.5 sm:mb-4 leading-snug sm:leading-tight line-clamp-2 sm:line-clamp-3 group-hover:underline decoration-2 underline-offset-4">
            {resource.title}
          </h3>

          {/* Department sits under the title at EVERY breakpoint. In the
              header row it competed with the subject for space, and because
              its min-content width is its longest word ("Engineering") it
              won that fight and crushed the subject down to "I…" in any grid
              track narrower than ~400px — tablet 2-up and desktop 4-up. */}
          {resource.department && (
            <div className="mb-2">
              <span className="bg-surface-muted px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[11px] sm:text-xs font-medium text-foreground/70">
                {resource.department}
              </span>
            </div>
          )}

          <div className="mt-auto pt-2.5 sm:pt-6 border-t-2 border-line flex flex-wrap items-center justify-between gap-2 sm:gap-4 text-xs sm:text-sm font-medium">
            <div className="flex items-center gap-1.5 sm:gap-2 group/stat hover:text-red-600 transition-colors cursor-pointer">
              <Heart className="h-3.5 w-3.5 sm:h-5 sm:w-5 group-hover/stat:fill-red-600" strokeWidth={1.5} />
              <span>{resource.likes}</span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 bg-ink on-ink px-2 py-0.5 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs tracking-wider">
              <span className="uppercase">{formatFileType(resource.fileType)}</span>
              <span className="opacity-50">•</span>
              <span>{formatFileSize(resource.fileSize ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
