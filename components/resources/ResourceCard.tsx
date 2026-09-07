"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, ArrowUpRight } from "lucide-react";
import { Resource } from "@/lib/db/schema";
import { formatFileSize } from "@/lib/utils";

interface ResourceCardProps {
  resource: Resource & { uploader?: { name: string | null } | null };
}

export function ResourceCard({ resource }: ResourceCardProps) {
  const router = useRouter();

  return (
    <Link href={`/resource/${resource.id}`} className="block h-full group">
      <div className="flex flex-col h-full bg-white rounded-[2rem] border-2 border-[#111] shadow-[4px_4px_0px_0px_rgba(17,17,17,1)] transition-all duration-300 group-hover:shadow-[8px_8px_0px_0px_rgba(17,17,17,1)] group-hover:-translate-y-1 overflow-hidden relative">

        <div className="p-6 sm:p-8 flex flex-col flex-grow">
          <div className="flex items-start justify-between mb-8">
            <div className="border border-black rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider">
              {resource.type.replace('-', ' ')}
            </div>
            <div className="p-2 rounded-full border border-black group-hover:bg-[#0D9488] transition-colors">
              <ArrowUpRight className="h-5 w-5" strokeWidth={1.5} />
            </div>
          </div>

          <h3 className="text-xl sm:text-2xl font-normal text-black mb-4 leading-tight line-clamp-3 group-hover:underline decoration-2 underline-offset-4">
            {resource.title}
          </h3>

          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-black/70 mb-8">
            <span className="bg-gray-100 px-3 py-1 rounded-full">{resource.subject}</span>
            {resource.department && (
              <span className="bg-gray-100 px-3 py-1 rounded-full">{resource.department}</span>
            )}
          </div>

          <div className="mt-auto pt-6 border-t-2 border-black/10 flex flex-wrap items-center justify-between gap-4 text-sm font-medium">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2 group/stat hover:text-red-600 transition-colors cursor-pointer">
                <Heart className="h-5 w-5 group-hover/stat:fill-red-600" strokeWidth={1.5} />
                <span>{resource.likes}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/report?resourceId=${resource.id}`);
                }}
                className="flex items-center gap-1.5 text-black/40 hover:text-red-600 transition-colors ml-2"
              >
                <span className="text-[10px] font-bold tracking-widest">Report</span>
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[#111] text-white px-3 py-1.5 rounded-full text-xs tracking-wider">
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
