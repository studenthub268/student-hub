"use client";

import Link from "next/link";
import { Heart, ArrowUpRight } from "lucide-react";
import { Resource } from "@/lib/db/schema";
import { formatFileSize } from "@/lib/utils";

interface ResourceCardProps {
  resource: Resource & { uploader?: { name: string | null } | null };
}

export function ResourceCard({ resource }: ResourceCardProps) {
  return (
    <Link href={`/resource/${resource.id}`} className="block h-full group">
      <div className="flex flex-col h-full bg-surface rounded-[2rem] border-2 border-ink shadow-hard transition-all duration-300 ease-out group-hover:shadow-hard-lg group-hover:-translate-y-1.5 active:scale-[0.98] overflow-hidden relative">

        <div className="p-6 sm:p-8 flex flex-col flex-grow">
          <div className="flex items-start justify-between mb-8">
            <div className="border border-ink rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider">
              {resource.type.replace('-', ' ')}
            </div>
            <div className="p-2 rounded-full border border-ink group-hover:bg-accent group-hover:rotate-45 transition-all duration-300">
              <ArrowUpRight className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>

          <h3 className="text-xl sm:text-2xl font-normal text-foreground mb-4 leading-tight line-clamp-3 group-hover:underline decoration-2 underline-offset-4">
            {resource.title}
          </h3>

          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground/70 mb-8">
            <span className="bg-surface-muted px-3 py-1 rounded-full">{resource.subject}</span>
            {resource.department && (
              <span className="bg-surface-muted px-3 py-1 rounded-full">{resource.department}</span>
            )}
          </div>

          <div className="mt-auto pt-6 border-t-2 border-line flex flex-wrap items-center justify-between gap-4 text-sm font-medium">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2 group/stat hover:text-red-600 transition-colors cursor-pointer">
                <Heart className="h-5 w-5 group-hover/stat:fill-red-600" strokeWidth={1.5} />
                <span>{resource.likes}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-ink on-ink px-3 py-1.5 rounded-full text-xs tracking-wider">
              <span className="uppercase">{resource.fileType?.split('/')[1] || 'FILE'}</span>
              <span className="opacity-50">•</span>
              <span>{formatFileSize(resource.fileSize ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
