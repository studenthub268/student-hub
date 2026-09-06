"use client";

import Link from "next/link";
import { Upload, Download, Heart, Calendar, FileText, ArrowRight } from "lucide-react";
import { ResourceCard } from "@/components/resources/ResourceCard";
import { Avatar } from "@/components/ui/Avatar";
import { Resource, User } from "@/lib/db/schema";

interface ProfileContentProps {
  profile: User | null;
  resources: Resource[];
  totalDownloads: number;
  totalLikes: number;
}

export default function ProfileContent({
  profile,
  resources,
  totalDownloads,
  totalLikes,
}: ProfileContentProps) {
  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Unknown";

  return (
    <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 max-w-[1400px]">
      {/* Profile Header */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        {/* Avatar + Info */}
        <div className="lg:col-span-1">
          <div className="rounded-[2rem] border-2 border-black bg-[#0D9488] p-8 shadow-[4px_4px_0px_0px_#111] text-center">
            <div className="mx-auto w-fit rounded-full border-4 border-black">
              <Avatar image={profile?.image} name={profile?.name} email={profile?.email} size={88} />
            </div>
            <h1 className="mt-6 text-2xl font-black tracking-tight text-black">
              {profile?.name || "Student"}
            </h1>
            <p className="mt-1 text-sm font-medium text-black/60 break-all">
              {profile?.email}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold tracking-wider text-black/50">
              <Calendar className="h-3.5 w-3.5" />
              Joined {joinDate}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="rounded-[2rem] border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_#111] flex flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0D9488] border-2 border-black mb-4">
              <FileText className="h-6 w-6 text-black" strokeWidth={2} />
            </div>
            <span className="text-4xl font-black tracking-tighter text-black">{resources.length}</span>
            <span className="text-xs font-bold tracking-wider text-black/50 mt-1">Uploads</span>
          </div>

          <div className="rounded-[2rem] border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_#111] flex flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0D9488] border-2 border-black mb-4">
              <Download className="h-6 w-6 text-black" strokeWidth={2} />
            </div>
            <span className="text-4xl font-black tracking-tighter text-black">{totalDownloads}</span>
            <span className="text-xs font-bold tracking-wider text-black/50 mt-1">Downloads</span>
          </div>

          <div className="rounded-[2rem] border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_#111] flex flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0D9488] border-2 border-black mb-4">
              <Heart className="h-6 w-6 text-black" strokeWidth={2} />
            </div>
            <span className="text-4xl font-black tracking-tighter text-black">{totalLikes}</span>
            <span className="text-xs font-bold tracking-wider text-black/50 mt-1">Likes Received</span>
          </div>
        </div>
      </div>

      {/* User's Resources */}
      <div>
        <div className="flex justify-between items-end mb-8">
          <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-black">
            My Uploads
          </h2>
          <Link
            href="/upload"
            className="hidden sm:inline-flex items-center gap-2 rounded-full border-2 border-black bg-[#0D9488] px-5 py-2.5 text-sm font-bold tracking-wider text-black hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all"
          >
            <Upload className="h-4 w-4" />
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
          <div className="flex flex-col items-center justify-center rounded-[2rem] border-2 border-dashed border-black bg-[#f8fafc] py-24 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-black bg-white mb-6">
              <Upload className="h-8 w-8 text-black" strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-medium text-black">No uploads yet</h3>
            <p className="mt-4 text-black/60 max-w-sm mx-auto font-medium">
              Share your study materials with the community and help fellow students succeed.
            </p>
            <Link
              href="/upload"
              className="mt-8 inline-flex items-center gap-2 rounded-full border-2 border-black bg-[#111] px-6 py-3 text-sm font-bold tracking-wider text-white hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#0D9488] transition-all"
            >
              Upload Your First Resource <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
