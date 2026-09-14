"use client";

import { useState, useEffect } from "react";
import { Download, Heart, Share2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";
import { toggleLike } from "@/lib/actions/likes";
import { deleteResource } from "@/lib/actions/resources";
import { useRouter } from "next/navigation";
import { getErrorMessage } from "@/lib/utils";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/**
 * The download filename is the resource title, which has no extension —
 * derive one from the stored file URL so saved files open correctly.
 */
function withExtension(name: string, url: string): string {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  try {
    const ext = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1];
    if (ext) return `${name}.${ext.toLowerCase()}`;
  } catch {}
  return name;
}

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
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const handleDownload = () => {
    // Same-origin proxy route: streams the file from R2 (whose public bucket
    // sends no CORS headers, so client-side fetch() can never read it) and
    // forces a friendly filename. The browser's native download UI handles
    // progress; the route records the download server-side.
    const link = document.createElement("a");
    link.href = `/api/download/${resourceId}`;
    link.download = withExtension(fileName, fileUrl);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Download started!", { id: "download" });
  };

  const handleShare = async () => {
    const url = window.location.href;
    // Native share sheet on mobile (and Edge/Safari) — clipboard only where
    // share isn't available or the user cancels the sheet.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: fileName, url });
        return;
      } catch {
        /* user dismissed the sheet — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteResource(resourceId);
      toast.success("Resource deleted successfully");
      router.push("/browse");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete resource"));
      setIsDeleting(false);
      setConfirmDelete(false);
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
        <button onClick={() => setConfirmDelete(true)} disabled={isDeleting} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border-2 border-red-500 text-red-500 px-6 py-3 rounded-full font-bold tracking-wider text-sm hover:bg-red-50 transition-colors disabled:opacity-50">
          <Trash2 size={20} strokeWidth={2} /> {isDeleting ? "Deleting..." : "Delete"}
        </button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this resource?"
        message="This will permanently remove the resource and its file. This action cannot be undone."
        busy={isDeleting}
        busyLabel="Deleting…"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <button onClick={() => router.push("/report?resourceId=" + resourceId)} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border-2 border-red-500 text-red-500 px-6 py-3 rounded-full font-bold tracking-wider text-sm hover:bg-red-50 transition-all">
        <AlertTriangle size={20} strokeWidth={2} /> Report Issue
      </button>
    </div>
  );
}
