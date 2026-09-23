"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Download, GraduationCap, Heart, Share2, Trash2, User } from "lucide-react";
import { toast } from "react-hot-toast";
import { toggleLike } from "@/lib/actions/likes";
import { deleteResource } from "@/lib/actions/resources";
import { getErrorMessage, formatFileType, formatFileSize } from "@/lib/utils";
import { FileGlyph, withExtension } from "./ResourcePreview";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface ResourceActionsProps {
  resourceId: string;
  title: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  initialLikes: number;
  hasLikedInitially: boolean;
  uploadedAt: string; // ISO string
  uploader: string;
  professor: string | null;
  isOwner: boolean;
}

/**
 * The rail's interactive card: file summary, stats, primary actions, and the
 * quiet utilities — plus the pinned mobile action bar and delete confirm.
 */
export default function ResourceActions({
  resourceId,
  title,
  fileUrl,
  fileType,
  fileSize,
  initialLikes,
  hasLikedInitially,
  uploadedAt,
  uploader,
  professor,
  isOwner,
}: ResourceActionsProps) {
  const router = useRouter();
  const [likes, setLikes] = useState(initialLikes);
  const [hasLiked, setHasLiked] = useState(hasLikedInitially);
  const [isLiking, setIsLiking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  /* ---------------- Like (optimistic toggle + server action) ---------------- */

  const handleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    try {
      await toggleLike(resourceId, hasLiked);
      setLikes((prev) => (hasLiked ? prev - 1 : prev + 1));
      setHasLiked(!hasLiked);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update like status"));
    } finally {
      setIsLiking(false);
    }
  };

  /* ------------- Download (same-origin proxy, friendly filename) ------------- */

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = `/api/download/${resourceId}`;
    link.download = withExtension(title, fileUrl);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Download started!", { id: "download" });
  };

  /* ---------------- Share (native sheet, clipboard fallback) ---------------- */

  const handleShare = async () => {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
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

  const dateLabel = new Date(uploadedAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <>
      <div className="rounded-2xl border border-line bg-surface shadow-sm">
        {/* File summary — one quiet row; the glyph column matches the meta
            icons below (16px + same gap) so every left edge in the card
            lines up. */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <FileGlyph fileType={fileType} size={16} className="shrink-0 text-accent" />
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">
              {formatFileType(fileType)} file
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-foreground/60">
            {fileSize ? formatFileSize(fileSize) : "—"}
          </span>
        </div>

        {/* Uploader & course meta — moved here from the page header so the
            workspace card is the single place that describes the file.
            Labels share one left edge (16px icon + gap-3); values right-align. */}
        <div className="space-y-2.5 border-b border-line px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex shrink-0 items-center gap-3 text-sm text-foreground/60">
              <User size={16} strokeWidth={1.75} className="shrink-0 text-foreground/45" aria-hidden />
              Uploaded by
            </span>
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{uploader}</span>
          </div>
          {professor && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex shrink-0 items-center gap-3 text-sm text-foreground/60">
                <GraduationCap size={16} strokeWidth={1.75} className="shrink-0 text-foreground/45" aria-hidden />
                Professor
              </span>
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{professor}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="flex shrink-0 items-center gap-3 text-sm text-foreground/60">
              <Calendar size={16} strokeWidth={1.75} className="shrink-0 text-foreground/45" aria-hidden />
              Uploaded
            </span>
            <span className="text-sm font-medium text-foreground">{dateLabel}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2.5 px-5 py-4">
          <button
            onClick={handleDownload}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent/90 active:bg-accent"
          >
            <Download size={17} strokeWidth={2} aria-hidden />
            Download
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleLike}
              disabled={isLiking}
              aria-pressed={hasLiked}
              aria-label={`${hasLiked ? "Remove your like from" : "Like"} this resource (${likes} likes)`}
              className={`flex items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                hasLiked
                  ? "border-danger/30 bg-danger/10 text-danger"
                  : "border-line bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              <Heart
                size={15}
                strokeWidth={2}
                className={hasLiked ? "fill-danger" : ""}
                aria-hidden
              />
              {hasLiked ? "Liked" : "Like"}
              <span
                className={`min-w-4 tabular-nums ${
                  hasLiked ? "text-danger/70" : "text-foreground/50"
                }`}
              >
                {likes}
              </span>
            </button>
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
            >
              <Share2 size={15} strokeWidth={2} aria-hidden />
              Share
            </button>
          </div>
        </div>

        {/* Utilities */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <button
            onClick={() => router.push("/report?resourceId=" + resourceId)}
            className="text-xs font-medium text-foreground/60 transition-colors hover:text-foreground"
          >
            Report issue
          </button>
          {isOwner && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={isDeleting}
              className="inline-flex items-center gap-1 text-xs font-medium text-danger transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              <Trash2 size={13} strokeWidth={2} aria-hidden />
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this resource?"
        message="This will permanently remove the resource and its file. This action cannot be undone."
        busy={isDeleting}
        busyLabel="Deleting…"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
