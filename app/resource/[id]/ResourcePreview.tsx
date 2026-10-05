"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { ExternalLink, File, FileImage, FileText, Folder, HardDrive, Maximize2, Minimize2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "react-hot-toast";
import { formatFileType, formatFileSize } from "@/lib/utils";
import { isDriveHosted, DRIVE_FILE_TYPE, DRIVE_FOLDER_TYPE, driveEmbeddedFolderUrl, parseDriveFolderLink } from "@/lib/drive";

// Custom PDF viewer, loaded only when a PDF is actually opened — image
// pages never download pdf.js (~400 KB gzipped).
const loadPdfViewer = () => import("./PdfViewer");
/* Warm the viewer chunk at module-evaluation time (i.e. as soon as the
   route's JS arrives) rather than waiting for hydration to commit and the
   inline viewer to mount. On a PDF page the chunk is needed within a
   moment either way; starting it here overlaps its download with the rest
   of the route JS instead of adding it to the serial chain afterwards.
   webpack/turbopack dedupe the import, so the dynamic() below reuses this
   promise. Non-PDF pages never call the loader, so they still download
   nothing extra. */
if (typeof window !== "undefined") loadPdfViewer();
const PdfViewer = dynamic(loadPdfViewer, { ssr: false });

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
  resourceId: string;
  title: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
}

export default function ResourcePreview({
  resourceId,
  title,
  fileUrl,
  fileType,
  fileSize,
}: ResourcePreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  const isDrive = isDriveHosted(fileType, fileUrl);
  /* Drive-hosted PDFs and images CAN render inline: PDF bytes stream
     through the same-origin /api/pdf proxy (now Drive-aware), and images
     render in a plain <img> — no CORS needed for either. Drive folders
     embed Drive's read-only listing. Other Drive types (ZIP, Office docs)
     have no inline renderer — the Drive hand-off card shows instead. */
  const isFolder = fileType === DRIVE_FOLDER_TYPE;
  const isVideo = fileType?.startsWith("video/") ?? false;
  const isPDF = fileType?.includes("pdf") ?? false;
  const isImage = fileType?.includes("image") ?? false;
  const isPreviewable = isPDF || isImage || isFolder || isVideo;
  // Folder resources store the folder id in fileKey — but this component
  // doesn't receive it, so re-parse the share URL (same shape the uploader
  // pasted; the server saved the canonical /drive/folders/<id> form).
  const folderId = isFolder ? parseDriveFolderLink(fileUrl)?.fileId ?? null : null;

  const formatLabel = formatFileType(fileType);
  const sizeLabel = fileSize ? formatFileSize(fileSize) : null;
  const fileName = withExtension(title, fileUrl);

  /* iPhone Safari has no Element.requestFullscreen — feature-detect instead
     of guessing from a breakpoint. useSyncExternalStore reads it without an
     effect (and returns false during the server render, where there is no
     `document`). */
  const fullscreenSupported = useSyncExternalStore(
    () => () => {},
    () => Boolean(document.fullscreenEnabled),
    () => false
  );

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

  /* The expand button opens the themed in-app viewer for both types —
     images get the zoomable lightbox, PDFs the custom pdf.js viewer (works
     on iPhone, where native fullscreen/PDF UIs are unreliable). */
  const handleExpand = () => {
    if (isImage) {
      setLightboxOpen(true);
      return;
    }
    if (isPDF) {
      setPdfOpen(true);
      return;
    }
    if (isFolder) {
      // The inline iframe IS the viewer; on phones the Drive listing is
      // cramped inside the stage, so expand = fullscreen iframe when the
      // platform supports it.
      const el = document.getElementById("preview-stage");
      if (el && fullscreenSupported) el.requestFullscreen().catch(() => {});
      return;
    }
    if (isVideo) {
      // iPhone Safari only allows fullscreen on the <video> element itself
      // (webkitEnterFullscreen) — the generic Fullscreen API is a no-op for
      // it. Android/desktop accept either.
      const video = document.querySelector<HTMLVideoElement>("#preview-stage video");
      if (video) {
        const webkitVideo = video as HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
        };
        if (typeof webkitVideo.webkitEnterFullscreen === "function") webkitVideo.webkitEnterFullscreen();
        else if (fullscreenSupported) video.requestFullscreen().catch(() => {});
      }
      return;
    }
    handleFullscreen();
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

  /* Bold icon buttons for the toolbar: ink-bordered circles like the
     site's pills. */
  const iconBtn =
    "inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full border-2 border-ink bg-surface text-foreground transition-all hover:bg-surface-muted hover:-translate-y-0.5";

  return (
    <>
      {/* Warm the pdf.js WORKER from the server HTML itself — React hoists
          these into <head> during SSR, so the browser starts it while it is
          still parsing the page, in parallel with the JS chunks, instead of
          serially behind hydration → pdf.js chunk → worker. The worker (1.4 MB
          raw; brotli on Vercel) is the single largest asset on the page and
          immutable-cached, so a repeat open is served from the HTTP cache.

          The PDF BYTES are deliberately NOT preloaded. Now that /api/pdf
          advertises Accept-Ranges: bytes, pdf.js never issues a full-file GET
          — it asks for a few 64KB ranges instead. A preload always fetches the
          WHOLE file (measured 2251ms of bandwidth on this route) whose 200-body
          cannot satisfy a ranged request (the response is Vary: Range), so it
          only saturated the connection the viewer's fast little ranges need. */}
      {isPDF && <link rel="preload" href="/pdfjs/pdf.worker.min.mjs" as="fetch" />}
      <div
        id="preview-stage"
        className={`overflow-hidden rounded-[2rem] border-2 border-ink bg-surface shadow-hard ${
          isFullscreen ? "flex h-full w-full flex-col rounded-none border-0 bg-ink" : "flex flex-col"
        }`}
      >
        {/* Toolbar: filename left, viewer controls right. Mobile: px-3 and
            the type/size caption hidden under sm: — a 360px screen gives the
            filename every pixel it can get, and the chip data repeats on the
            actions rail below anyway. */}
        <div className="flex shrink-0 items-center justify-between gap-2 sm:gap-3 border-b-2 border-ink bg-surface px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileGlyph fileType={fileType} size={16} className="shrink-0 text-foreground" />
            <span className="min-w-0 truncate text-sm font-bold text-foreground">{fileName}</span>
            <span className="hidden shrink-0 text-xs font-bold uppercase tracking-wider text-foreground/60 md:inline">
              {formatLabel}
              {sizeLabel ? ` · ${sizeLabel}` : ""}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Fullscreen button: images open the lightbox, PDFs the themed
                viewer — neither needs the fullscreen API, so it renders
                everywhere (iPhone included). */}
            {/* Previewable files (PDF/image, R2 or Drive) get the expand
                button; other types rely on the fullscreen API only. */}
            {(isPreviewable || fullscreenSupported) && (
              <button
                onClick={handleExpand}
                className={iconBtn}
                aria-label={
                  isImage
                    ? "Open image in a larger view"
                    : isPDF
                      ? "Open PDF in full viewer"
                      : isFolder
                        ? "Expand folder view"
                        : isVideo
                          ? "Play video fullscreen"
                          : isFullscreen
                            ? "Exit fullscreen"
                            : "View fullscreen"
                }
              >
                {!isImage && !isPDF && !isFolder && !isVideo && isFullscreen
                  ? <Minimize2 size={15} strokeWidth={2.25} aria-hidden />
                  : <Maximize2 size={15} strokeWidth={2.25} aria-hidden />}
              </button>
            )}
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={iconBtn}
              aria-label="Open file in a new tab"
            >
              <ExternalLink size={15} strokeWidth={2.25} aria-hidden />
            </a>
          </div>
        </div>

        {/* Stage: a fixed-height box in normal flow; fullscreen fills the
            viewport instead. The frame fills the box rather than sizing to
            its content (a portrait photo would otherwise inflate the card). */}
        <div
          className={`bg-surface-muted ${
            isFullscreen
              ? "flex-1 p-2 sm:p-6"
              : "h-[56vh] min-h-[340px] p-2 sm:h-[64vh] sm:p-5 lg:h-[calc(100dvh-16rem)] lg:min-h-[480px]"
          }`}
        >
          <div
            className={`relative h-full w-full overflow-hidden rounded-2xl border-2 bg-surface ${
              isFullscreen ? "border-background/20" : "border-ink"
            }`}
          >
            {isFolder && folderId ? (
              // Drive folder: Drive's embeddable read-only listing, same
              // view Drive generates for its own "Embed folder" feature —
              // no API key, works for any public folder. Scrollable inside
              // the stage; Download (in the actions rail) hands off to Drive
              // for full navigation. A malformed stored URL (folderId null)
              // falls through to the generic hand-off below rather than an
              // empty iframe.
              <iframe
                src={driveEmbeddedFolderUrl(folderId)}
                title={`Files in ${title}`}
                loading="lazy"
                className="h-full w-full border-0 bg-surface"
              />
            ) : isVideo ? (
              // Drive-hosted (or R2) video: the direct URL streams H.264/VP9
              // bytes with Range support, so the native <video> element can
              // seek without the whole file loading first. Inline playback —
              // no hand-off card — matches how PDFs and images behave now.
              <video
                src={fileUrl}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full bg-black object-contain"
              />
            ) : isPDF ? (
              // Inline themed reader: first page renders immediately and the
              // whole document scrolls right here, like the image preview.
              // pdf.js lazy-loads on first view; the expand button opens the
              // same document in a fullscreen overlay with a toolbar.
              <PdfViewer
                resourceId={resourceId}
                title={title}
                variant="inline"
              />
            ) : isDrive && !isPreviewable ? (
              // Drive-hosted, non-previewable type (ZIP, docs): the bytes
              // live on Google's origin and no inline renderer exists, so
              // the stage is a branded hand-off — one big button opens
              // Drive's viewer in a new tab.
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full w-full flex-col items-center justify-center px-6 text-center transition-colors hover:bg-surface-muted"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-accent text-accent-contrast">
                  <HardDrive size={28} strokeWidth={1.75} aria-hidden />
                </div>
                <p className="mt-5 text-lg font-bold text-foreground">Hosted on Google Drive</p>
                <p className="mt-1.5 max-w-xs text-sm font-medium text-foreground/60">
                  This file is too large for in-app storage — open it in Google Drive, or use Download.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-surface px-4 py-2 text-xs font-bold uppercase tracking-wider text-foreground">
                  Open in Drive
                  <ExternalLink size={13} strokeWidth={2.25} aria-hidden />
                </span>
              </a>
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
                    only letterboxes inside it — zero shift for any upload.
                    Drive-hosted images use a plain <img>: next/image would
                    route Drive URLs through the optimizer (unsupported host,
                    extra hop) and the raw bytes are already exactly the
                    upload. */}
                <span className="relative block h-full w-full">
                  {isDrive ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fileUrl}
                      alt={title}
                      loading="eager"
                      fetchPriority="high"
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  ) : (
                    <Image
                      src={fileUrl}
                      alt={title}
                      fill
                      priority
                      fetchPriority="high"
                      sizes="(min-width: 1024px) 66vw, 100vw"
                      className="object-contain"
                    />
                  )}
                </span>
              </button>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink bg-surface">
                  <FileGlyph fileType={fileType} size={28} className="text-foreground" />
                </div>
                <p className="mt-5 text-lg font-bold text-foreground">No inline preview</p>
                <p className="mt-1.5 max-w-xs text-sm font-medium text-foreground/60">
                  This file type can&apos;t be displayed in the browser. Use Download to open it.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox: zoomable large view — wheel/pinch/double-click to zoom,
          drag to pan, backdrop click closes (or resets zoom while zoomed). */}
      {lightboxOpen && (
        <ImageLightbox
          src={fileUrl}
          alt={title}
          title={title}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Themed PDF viewer, fullscreen overlay: same document, toolbar with
          zoom + page navigation, Esc to close. */}
      {pdfOpen && isPDF && (
        <PdfViewer
          resourceId={resourceId}
          title={fileName}
          variant="fullscreen"
          onClose={() => setPdfOpen(false)}
        />
      )}
    </>
  );
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.4;
const ZOOM_DBLCLICK = 2.5;

/**
 * Fullscreen image viewer with zoom & pan. Zoom toward the cursor on
 * wheel/double-click/pinch; drag to pan while zoomed; toolbar buttons for
 * keyboard/touch users. Rendered only while open, so state resets naturally.
 */
function ImageLightbox({
  src,
  alt,
  title,
  onClose,
}: {
  src: string;
  alt: string;
  title: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs mirror state so pointer/wheel handlers compute from fresh values
  // without re-binding listeners.
  const zoomRef = useRef(ZOOM_MIN);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; canPan: boolean } | null>(null);
  const pinchRef = useRef<{ dist: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());

  /** Set zoom to `next`, keeping the point under viewport coords (cx, cy)
      visually fixed; clamp to [MIN, MAX]; reset pan when back at fit. */
  const applyZoom = (nextRaw: number, cx?: number, cy?: number) => {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextRaw));
    const prev = zoomRef.current;
    if (next === prev) return;
    let { x, y } = offsetRef.current;
    if (cx !== undefined && cy !== undefined && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const px = cx - (rect.left + rect.width / 2);
      const py = cy - (rect.top + rect.height / 2);
      const ratio = next / prev;
      x = px - (px - x) * ratio;
      y = py - (py - y) * ratio;
    }
    if (next === ZOOM_MIN) {
      x = 0;
      y = 0;
    }
    zoomRef.current = next;
    offsetRef.current = { x, y };
    setZoom(next);
    setOffset({ x, y });
    if (next === ZOOM_MIN) setIsPanning(false);
  };

  /* Wheel zoom — non-passive so preventDefault can stop page scroll. */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyZoom(zoomRef.current * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 1) {
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: offsetRef.current.x,
        baseY: offsetRef.current.y,
        canPan: zoomRef.current > ZOOM_MIN,
      };
      if (zoomRef.current > ZOOM_MIN) setIsPanning(true);
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      dragRef.current = null;
      setIsPanning(false);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const factor = dist / (pinchRef.current.dist || dist);
      pinchRef.current = { dist };
      applyZoom(zoomRef.current * factor, midX, midY);
    } else if (dragRef.current?.canPan) {
      const d = dragRef.current;
      offsetRef.current = {
        x: d.baseX + (e.clientX - d.startX),
        y: d.baseY + (e.clientY - d.startY),
      };
      setOffset({ ...offsetRef.current });
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 1) {
      // Two-finger pinch ended — the remaining finger becomes the pan drag.
      const [p] = [...pointersRef.current.values()];
      dragRef.current = {
        startX: p.x,
        startY: p.y,
        baseX: offsetRef.current.x,
        baseY: offsetRef.current.y,
        canPan: zoomRef.current > ZOOM_MIN,
      };
    } else if (pointersRef.current.size === 0) {
      dragRef.current = null;
      setIsPanning(false);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (zoomRef.current > ZOOM_MIN + 0.01) {
      applyZoom(ZOOM_MIN);
    } else {
      applyZoom(ZOOM_DBLCLICK, e.clientX, e.clientY);
    }
  };

  /* Backdrop: closes at fit; resets zoom first while zoomed (accidental
     closes mid-inspection are infuriating). */
  const onBackdropClick = () => {
    if (zoomRef.current > ZOOM_MIN) applyZoom(ZOOM_MIN);
    else onClose();
  };

  const toolBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 p-4 sm:p-10"
      onClick={onBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Large view of ${title}`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 rounded-full border-2 border-background bg-ink p-2.5 text-background transition-transform hover:-translate-y-0.5"
        aria-label="Close large view"
      >
        <X size={20} strokeWidth={2.25} aria-hidden />
      </button>

      <div
        className={`flex max-h-full max-w-full items-center justify-center ${
          zoom > ZOOM_MIN ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={onDoubleClick}
        onClick={(e) => e.stopPropagation()}
        aria-label="Zoomable image"
      >
        {/* Original file, not a next/image variant: the optimized srcset
            caps at viewport width, and zooming stretches those pixels into
            blur. The raw upload is the scan's true resolution — zoom stays
            sharp up to native size. Plain <img> also skips the quality-75
            re-encode. No will-change: a promoted layer gets rasterized once
            at 1x and stretched by scale(); without it Chrome re-rasterizes
            crisply at each zoom level. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          decoding="async"
          className="max-h-full max-w-full select-none rounded-2xl border-2 border-ink bg-surface object-contain shadow-hard-lg"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
        />
      </div>

      {/* Zoom toolbar */}
      <div
        className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-ink bg-surface p-1.5 shadow-hard-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => applyZoom(zoomRef.current / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} className={toolBtn} aria-label="Zoom out">
          <ZoomOut size={17} strokeWidth={2.25} aria-hidden />
        </button>
        <span className="w-14 text-center text-xs font-bold tabular-nums text-foreground" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => applyZoom(zoomRef.current * ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} className={toolBtn} aria-label="Zoom in">
          <ZoomIn size={17} strokeWidth={2.25} aria-hidden />
        </button>
        <span className="mx-0.5 h-5 w-px bg-line-strong" aria-hidden />
        <button onClick={() => applyZoom(ZOOM_MIN)} disabled={zoom === ZOOM_MIN} className={toolBtn} aria-label="Reset zoom">
          <RotateCcw size={16} strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      {zoom === ZOOM_MIN && (
        <p className="absolute bottom-20 left-1/2 -translate-x-1/2 text-xs font-medium text-background/70">
          Scroll, pinch or double-click to zoom
        </p>
      )}
    </div>
  );
}

/**
 * File-type glyph, shared by the toolbar and the fallback card. Carries no
 * colour of its own — callers pass a text colour class. Drive-hosted files
 * with an unknown type show the Drive glyph; with a known type they show
 * the matching file icon (the Drive badge on cards carries the hosting
 * signal — the glyph just describes the file).
 */
export function FileGlyph({
  fileType,
  size = 24,
  strokeWidth = 1.5,
  className = "",
}: {
  fileType: string | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon =
    fileType === DRIVE_FOLDER_TYPE
      ? Folder
      : fileType === DRIVE_FILE_TYPE
        ? HardDrive
        : fileType?.includes("pdf")
          ? FileText
          : fileType?.includes("image")
            ? FileImage
            : File;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
