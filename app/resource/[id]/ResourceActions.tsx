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
 * The rail's interactive card: file summary, meta, primary actions, and the
 * utilities — all in the site's bold ink-bordered language.
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

  /* Meta row label: bold small-caps style label with a leading icon. */
  const metaLabel = (icon: React.ReactNode, text: string) => (
    <span className="flex shrink-0 items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-foreground/70">
      {icon}
      {text}
    </span>
  );

  return (
    <>
      <div className="rounded-[2rem] border-2 border-ink bg-surface shadow-hard">
        {/* File summary — bold row; the glyph column matches the meta icons
            below so every left edge in the card lines up. */}
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink px-5 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileGlyph fileType={fileType} size={18} className="shrink-0 text-foreground" strokeWidth={2} />
            <p className="min-w-0 truncate text-sm font-bold uppercase tracking-wider text-foreground">
              {formatFileType(fileType)} file
            </p>
          </div>
          <span className="shrink-0 text-xs font-bold tabular-nums text-foreground/70">
            {fileSize ? formatFileSize(fileSize) : "—"}
          </span>
        </div>

        {/* Uploader & course meta — labels share one left edge (18px icon +
            gap-2.5); values right-align in bold. */}
        <div className="space-y-3 border-b-2 border-ink px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            {metaLabel(
              <User size={18} strokeWidth={2} className="shrink-0 text-foreground" aria-hidden />,
              "Uploaded by",
            )}
            <span className="min-w-0 truncate text-sm font-bold text-foreground">{uploader}</span>
          </div>
          {professor && (
            <div className="flex items-center justify-between gap-3">
              {metaLabel(
                <GraduationCap size={18} strokeWidth={2} className="shrink-0 text-foreground" aria-hidden />,
                "Professor",
              )}
              <span className="min-w-0 truncate text-sm font-bold text-foreground">{professor}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            {metaLabel(
              <Calendar size={18} strokeWidth={2} className="shrink-0 text-foreground" aria-hidden />,
              "Uploaded",
            )}
            <span className="text-sm font-bold text-foreground">{dateLabel}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 px-5 py-4">
          <button
            onClick={handleDownload}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-accent-contrast shadow-hard-sm transition-all hover:-translate-y-0.5 hover:shadow-hard active:translate-y-0 active:shadow-hard-sm"
          >
            <Download size={17} strokeWidth={2.5} aria-hidden />
            Download
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleLike}
              disabled={isLiking}
              aria-pressed={hasLiked}
              className={`flex items-center justify-center gap-1.5 rounded-full border-2 border-ink px-4 py-2.5 text-sm font-bold transition-all hover:-translate-y-0.5 hover:shadow-hard-sm disabled:opacity-50 ${
                hasLiked
                  ? "bg-danger/10 text-danger"
                  : "bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              <Heart
                size={15}
                strokeWidth={2.25}
                className={hasLiked ? "fill-danger" : ""}
                aria-hidden
              />
              {hasLiked ? "Liked" : "Like"}
              <span
                className={`min-w-4 tabular-nums ${
                  hasLiked ? "text-danger/80" : "text-foreground/60"
                }`}
              >
                {likes}
              </span>
              {/* Accessible name is content + sr-only state so the visible
                  label is always contained (WCAG 2.5.3 Label in Name). */}
              <span className="sr-only">
                {hasLiked ? " — active, select to remove your like" : " — select to like this resource"}
              </span>
            </button>
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-surface px-4 py-2.5 text-sm font-bold text-foreground transition-all hover:-translate-y-0.5 hover:bg-surface-muted hover:shadow-hard-sm"
            >
              <Share2 size={15} strokeWidth={2.25} aria-hidden />
              Share
            </button>
          </div>
        </div>

        {/* Utilities */}
        <div className="flex items-center justify-between gap-3 border-t-2 border-ink px-5 py-3.5">
          <button
            onClick={() => router.push("/report?resourceId=" + resourceId)}
            className="text-xs font-bold uppercase tracking-wider text-foreground/60 transition-colors hover:text-foreground"
          >
            Report issue
          </button>
          {isOwner && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={isDeleting}
              className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-danger transition-opacity hover:opacity-70 disabled:opacity-50"
            >
              <Trash2 size={13} strokeWidth={2.25} aria-hidden />
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
