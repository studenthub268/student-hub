"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ExternalLink, File, FileImage, FileText, Maximize2, Minimize2, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatFileType, formatFileSize } from "@/lib/utils";

/**
 * The download filename is the resource title, which has no extension —
 * derive one from the stored file URL so saved files open correctly.
 * (Shared shape with ResourceActions; kept local so the two components
 * stay independently editable.)
 */
export function withExtension(name: string, url: string): string {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  try {
    const ext = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1];
    if (ext) return `${name}.${ext.toLowerCase()}`;
  } catch {}
  return name;
}

interface ResourcePreviewProps {
  title: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
}

export default function ResourcePreview({
  title,
  fileUrl,
  fileType,
  fileSize,
}: ResourcePreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isPDF = fileType?.includes("pdf") ?? false;
  const isImage = fileType?.includes("image") ?? false;
  const previewable = isPDF || isImage;

  const formatLabel = formatFileType(fileType);
  const sizeLabel = fileSize ? formatFileSize(fileSize) : null;
  const fileName = withExtension(title, fileUrl);

  /* iPhone Safari has no Element.requestFullscreen — feature-detect after
     mount instead of guessing from a breakpoint. */
  useEffect(() => {
    setFullscreenSupported(Boolean(document.fullscreenEnabled));
  }, []);

  const handleFullscreen = () => {
    const el = document.getElementById("preview-stage");
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {
        toast.error("Fullscreen isn't available here");
      });
    }
  };

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  /* Lightbox: Esc closes, page scroll locks while open. */
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen]);

  /* Quiet ghost icon buttons for the light toolbar. */
  const ghostBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-surface-muted hover:text-foreground";

  return (
    <>
      <div
        id="preview-stage"
        className={`overflow-hidden rounded-2xl border border-line bg-surface shadow-lg ${
          isFullscreen ? "flex h-full w-full flex-col rounded-none border-0 bg-ink" : "flex flex-col"
        }`}
      >
        {/* Light toolbar: filename left, viewer controls right. */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileGlyph fileType={fileType} size={16} className="shrink-0 text-foreground/50" />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">{fileName}</span>
            <span className="hidden shrink-0 text-xs text-foreground/50 sm:inline">
              {formatLabel}
              {sizeLabel ? ` · ${sizeLabel}` : ""}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {previewable && fullscreenSupported && (
              <button
                onClick={handleFullscreen}
                className={ghostBtn}
                aria-label={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
              >
                {isFullscreen
                  ? <Minimize2 size={16} strokeWidth={2} aria-hidden />
                  : <Maximize2 size={16} strokeWidth={2} aria-hidden />}
              </button>
            )}
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={ghostBtn}
              aria-label="Open file in a new tab"
            >
              <ExternalLink size={16} strokeWidth={2} aria-hidden />
            </a>
          </div>
        </div>

        {/* Stage: a fixed-height box in normal flow; fullscreen fills the
            viewport instead. The frame fills the box rather than sizing to
            its content (a portrait photo would otherwise inflate the card). */}
        <div
          className={`bg-surface-muted ${
            isFullscreen
              ? "flex-1 p-3 sm:p-6"
              : "h-[58vh] min-h-[380px] p-3 sm:h-[64vh] sm:p-5 lg:h-[calc(100dvh-16rem)] lg:min-h-[480px]"
          }`}
        >
          <div
            className={`relative h-full w-full overflow-hidden rounded-xl border bg-surface ${
              isFullscreen ? "border-background/20" : "border-line"
            }`}
          >
            {isPDF ? (
              // No #toolbar fragment: desktop browsers keep their native page
              // navigation, which matters for multi-page past papers.
              <iframe
                src={fileUrl}
                className="h-full w-full border-0"
                title={`Preview of ${title}`}
              />
            ) : isImage ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="group flex h-full w-full cursor-zoom-in items-center justify-center p-3 sm:p-5"
                aria-label="Open image in a larger view"
              >
                {/* fill + object-contain inside the fixed-height stage: uploads
                    have unknown aspect ratios, and a hard-coded width/height
                    here re-laid-out the whole card when the real ratio arrived
                    (Lighthouse CLS 0.10). The stage owns the size; the image
                    only letterboxes inside it — zero shift for any upload. */}
                <span className="relative block h-full w-full">
                  <Image
                    src={fileUrl}
                    alt={title}
                    fill
                    priority
                    fetchPriority="high"
                    sizes="(min-width: 1024px) 66vw, 100vw"
                    className="object-contain"
                  />
                </span>
              </button>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted">
                  <FileGlyph fileType={fileType} size={28} className="text-foreground/40" />
                </div>
                <p className="mt-5 text-lg font-medium text-foreground">No inline preview</p>
                <p className="mt-1.5 max-w-xs text-sm text-foreground/60">
                  This file type can&apos;t be displayed in the browser. Use Download to open it.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox: soft blurred backdrop, rounded image, click/Esc to close. */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/70 p-4 backdrop-blur-sm sm:p-10"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Large view of ${title}`}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 z-10 rounded-full bg-foreground/50 p-2.5 text-background transition-colors hover:bg-foreground/70"
            aria-label="Close large view"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
          <Image
            src={fileUrl}
            alt={title}
            width={2400}
            height={1800}
            className="max-h-full max-w-full rounded-xl bg-surface object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

/**
 * File-type glyph, shared by the toolbar and the fallback card. Carries no
 * colour of its own — callers pass a text colour class.
 */
export function FileGlyph({
  fileType,
  size = 24,
  className = "",
}: {
  fileType: string | null;
  size?: number;
  className?: string;
}) {
  const Icon = fileType?.includes("pdf")
    ? FileText
    : fileType?.includes("image")
      ? FileImage
      : File;
  return <Icon size={size} strokeWidth={1.5} className={className} aria-hidden />;
}
