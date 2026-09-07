"use client";

import { useState, useEffect } from "react";
import { Download, Heart, Share2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";
import { toggleLike, recordDownload } from "@/lib/actions/likes";
import { deleteResource } from "@/lib/actions/resources";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@/lib/utils";

interface ResourceActionsProps {
  resourceId: string;
  initialLikes: number;
  fileUrl: string;
  fileName: string;
  hasLikedInitially: boolean;
  uploaderId: string | null;
}

export default function ResourceActions({
  resourceId,
  initialLikes,
  fileUrl,
  fileName,
  hasLikedInitially,
  uploaderId,
}: ResourceActionsProps) {
  const [likes, setLikes] = useState(initialLikes);
  const [hasLiked, setHasLiked] = useState(hasLikedInitially);
  const [isLiking, setIsLiking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/session");
        const session = await res.json();
        if (session?.user?.id) setCurrentUserId(session.user.id);
      } catch {}
    };
    fetchUser();
  }, []);

  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    try {
      await toggleLike(resourceId, hasLiked);
      setLikes(prev => hasLiked ? prev - 1 : prev + 1);
      setHasLiked(!hasLiked);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update like status"));
    } finally {
      setIsLiking(false);
    }
  };

  const handleDownload = async () => {
    try {
      toast.loading("Preparing download...", { id: "download" });
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      toast.success("Download started!", { id: "download" });
      await recordDownload(resourceId);
    } catch {
      toast.error("Failed to download file", { id: "download" });
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard!");
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this resource? This action cannot be undone.")) return;
    setIsDeleting(true);
    try {
      await deleteResource(resourceId);
      toast.success("Resource deleted successfully");
      router.push("/browse");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete resource"));
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 mt-8">
      <button onClick={handleDownload} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#0D9488] border-2 border-black text-black px-6 py-3 rounded-full font-bold tracking-wider text-sm hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#111] transition-all">
        <Download size={20} strokeWidth={2} /> Download
      </button>
      <button onClick={handleLike} disabled={isLiking}
        className={"flex-1 sm:flex-none flex items-center justify-center gap-2 border-2 border-black px-6 py-3 rounded-full font-bold tracking-wider text-sm transition-all hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_#111] " + (hasLiked ? "bg-red-500 text-white border-black" : "bg-white text-black") + " disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"}>
        <Heart size={20} strokeWidth={2} className={hasLiked ? "fill-white" : ""} /> {hasLiked ? "Liked" : "Like"} ({likes})
      </button>
      <button onClick={handleShare} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border-2 border-black px-6 py-3 rounded-full font-bold tracking-wider text-sm hover:bg-gray-50 transition-colors">
        <Share2 size={20} strokeWidth={2} /> Share
      </button>
      {currentUserId && currentUserId === uploaderId && (
        <button onClick={handleDelete} disabled={isDeleting} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border-2 border-red-500 text-red-500 px-6 py-3 rounded-full font-bold tracking-wider text-sm hover:bg-red-50 transition-colors disabled:opacity-50">
          <Trash2 size={20} strokeWidth={2} /> {isDeleting ? "Deleting..." : "Delete"}
        </button>
      )}
      <button onClick={() => router.push("/report?resourceId=" + resourceId)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border-2 border-red-500 text-red-500 px-6 py-3 rounded-full font-bold tracking-wider text-sm hover:bg-red-50 transition-all">
        <AlertTriangle size={20} strokeWidth={2} /> Report Issue
      </button>
    </div>
  );
}
