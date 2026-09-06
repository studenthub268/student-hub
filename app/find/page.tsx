"use client";

import { useState, useEffect } from "react";
import { Search, ArrowLeft, ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Resource } from "@/lib/db/schema";
import { findResources } from "@/lib/actions/search-find";

export default function FindPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(Resource & { uploader?: { name: string | null } | null })[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const searchResources = async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const data = await findResources(query);
        if (data) setResults(data as Resource[]);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchResources, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-[#0D9488]">
      <div className="max-w-4xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="flex items-center gap-4 mb-12">
          <button
            onClick={() => router.back()}
            className="hidden md:flex p-3 rounded-full hover:bg-gray-100 transition-colors border-2 border-transparent hover:border-black"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-4xl font-black tracking-tighter">Find Resources</h1>
        </div>

        {/* Massive Search Bar */}
        <div className="relative mb-16">
          <div className="absolute inset-y-0 left-4 sm:left-8 flex items-center pointer-events-none">
            <Search className="h-6 w-6 sm:h-8 sm:w-8 text-black/20" strokeWidth={3} />
          </div>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type anything to find..."
            className="w-full bg-gray-50 border-4 border-black p-4 sm:p-8 pl-12 sm:pl-20 text-base sm:text-3xl font-bold tracking-tight rounded-[2.5rem] outline-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] focus:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-all placeholder:text-black/10 overflow-hidden text-ellipsis"
          />
        </div>

        {/* Results Area */}
        <div className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-[#0D9488] border-t-black rounded-full animate-spin"></div>
            </div>
          ) : query.trim().length >= 2 && results.length > 0 ? (
            <div className="grid gap-4">
              {results.map((resource) => (
                <Link
                  key={resource.id}
                  href={`/resource/${resource.id}`}
                  className="group block bg-white border-2 border-black p-6 rounded-[2rem] hover:bg-[#0D9488] transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex gap-4">
                      <div className="p-3 bg-black text-white rounded-2xl group-hover:bg-white group-hover:text-black transition-colors">
                        <FileText size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold tracking-tight line-clamp-1">{resource.title}</h3>
                        <p className="text-black/60 font-medium text-sm">{resource.subject} • {resource.uploader?.name || 'Anonymous'}</p>
                      </div>
                    </div>
                    <ArrowUpRight className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          ) : query.trim().length >= 2 ? (
            <div className="text-center py-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-black/10">
              <h3 className="text-2xl font-black tracking-tighter mb-2">No results found</h3>
              <p className="text-black/40 font-medium italic">Try a different keyword or subject.</p>
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-black/30 font-bold tracking-wider text-sm">Start typing to search the student hub</p>
            </div>
          )}
        </div>

        {/* Subject Shortcuts */}
        {!query && (
          <div className="mt-20">
            <h4 className="text-xs font-black tracking-wider text-black/40 mb-6 text-center">Popular Subjects</h4>
            <div className="flex flex-wrap justify-center gap-3">
              {["Calculus", "Applied Physics", "Islamiyat", "AI", "Software Engineering", "DSA"].map((sub) => (
                <button
                  key={sub}
                  onClick={() => setQuery(sub)}
                  className="px-6 py-3 bg-white border-2 border-black rounded-full text-sm font-bold tracking-wider hover:bg-[#0D9488] transition-all active:scale-95"
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
