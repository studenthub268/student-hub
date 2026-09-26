"use client";

import Link from "next/link";
import { Upload, Heart, Calendar, ArrowRight, FileText, Download } from "lucide-react";
import { ResourceCard } from "@/components/resources/ResourceCard";
import { Avatar } from "@/components/ui/Avatar";
import { Resource, User } from "@/lib/db/schema";

interface ProfileContentProps {
  profile: User | null;
  resources: Resource[];
  totalLikes: number;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function ProfileContent({
  profile,
  resources,
  totalLikes,
}: ProfileContentProps) {
  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  const totalDownloads = resources.reduce((sum, r) => sum + (r.downloads || 0), 0);

  const stats = [
    { icon: FileText, value: resources.length, label: "Uploads" },
    { icon: Heart, value: totalLikes, label: "Likes Received" },
    { icon: Download, value: totalDownloads, label: "Downloads" },
  ];

  return (
    <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8 max-w-[1400px]">
      {/* Identity bar — one wide card instead of the old three separate
          boxes: avatar and name on the left, stat chips inline on the
          right. Reads as a single profile strip; on phones everything
          stacks but keeps the same compact rhythm. */}
      <div className="rounded-[2rem] border-2 border-ink bg-surface shadow-hard overflow-hidden mb-12">
        <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          {/* Identity */}
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            <div className="shrink-0 rounded-full border-4 border-ink bg-accent">
              <Avatar image={profile?.image} name={profile?.name} email={profile?.email} size={64} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground truncate">
                {profile?.name || "Student"}
              </h1>
              <p className="mt-0.5 text-sm font-medium text-foreground/60 truncate">
                {profile?.email}
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wider text-foreground/60">
                <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">Joined {joinDate}</span>
              </p>
            </div>
          </div>

          {/* Stats — hairline-divided columns, big numeral first, label under.
              px scales down on phones so three columns fit a 360px card; the
              "Likes Received" label drops its icon below xs, where the icon
              + text was what forced the wrap/overflow. */}
          <div className="grid grid-cols-3 divide-x divide-line border-t-2 border-line pt-6 lg:border-t-0 lg:border-l-2 lg:border-line lg:pt-0 lg:pl-10">
            {stats.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex flex-col items-center px-1.5 sm:px-8 text-center min-w-0">
                <span className="text-3xl sm:text-4xl font-black tracking-tighter text-foreground tabular-nums">
                  {value}
                </span>
                <span className="mt-1 inline-flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold tracking-wider text-foreground/60 min-w-0">
                  <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:inline" strokeWidth={2} aria-hidden />
                  <span className="truncate">{label}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* User's Resources */}
      <div>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
              My Uploads
            </h2>
            <p className="mt-2 text-sm font-medium text-foreground/60">
              {resources.length > 0
                ? `Total size ${formatBytes(resources.reduce((s, r) => s + (r.fileSize || 0), 0))}`
                : "Nothing shared yet."}
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-ink on-ink px-5 py-2.5 text-sm font-bold tracking-wider shadow-hard-sm transition-all hover:-translate-y-0.5 hover:shadow-hard active:translate-y-0 active:shadow-none"
          >
            <Upload className="h-4 w-4" aria-hidden />
            Upload New
          </Link>
        </div>

        {resources.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {resources.map((resource) => (
              <div key={resource.id} className="h-full">
                <ResourceCard resource={resource} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-ink bg-surface-muted py-24 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink bg-surface mb-6">
              <Upload className="h-8 w-8 text-foreground" strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-medium text-foreground">No uploads yet</h3>
            <p className="mt-4 text-foreground/60 max-w-sm mx-auto font-medium">
              Share your study materials with the community and help fellow students succeed.
            </p>
            <Link
              href="/upload"
              className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-ink bg-ink on-ink px-6 py-3 text-sm font-bold tracking-wider hover:-translate-y-0.5 hover:shadow-hard transition-all"
            >
              Upload Your First Resource <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
