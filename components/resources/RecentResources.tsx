"use client";

import { useEffect, useState } from "react";
import { ResourceCard } from "@/components/resources/ResourceCard";
import { Resource } from "@/lib/db/schema";
import { getRecentResources } from "@/lib/actions/resources";

export function RecentResources() {
  const [resources, setResources] = useState<(Resource & { uploader?: { name: string | null } | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRecentResources().then((data) => {
      if (!cancelled) {
        setResources(data as (Resource & { uploader?: { name: string | null } | null })[]);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-64 rounded-[2rem] border-2 border-black/5 bg-gray-50 animate-pulse"></div>
        ))}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-black/10">
        <p className="text-black/40 font-medium text-sm">No resources found yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
      {resources.slice(0, 3).map((resource) => (
        <div key={resource.id} className="h-full">
          <ResourceCard resource={resource} />
        </div>
      ))}
    </div>
  );
}
