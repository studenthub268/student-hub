"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  FileText,
} from "lucide-react";

/**
 * Custom PDF viewer — renders pages onto canvas with pdf.js, themed to match
 * the site's ink aesthetic instead of the browser's native viewer.
 *
 * Two variants:
 *  - "inline": rendered inside the resource preview stage. Shows the first
 *    page immediately and scrolls through the rest — reading starts with
 *    zero clicks, like the image preview.
 *  - "fullscreen": fixed overlay with a two-row toolbar (used by the expand
 *    button). Row 1 = page indicator (editable jump) + close; Row 2 = zoom
 *    controls + page nav + fullscreen toggle.
 *
 * Toolbar redesign: the old single-row toolbar crammed page jump, zoom, nav
 * and close into one row that wrapped badly on mobile and hid the page number
 * in a tiny input. The new two-row layout makes the page number large and
 * clearly editable, gives every control a comfortable tap target, and adds a
 * dedicated fullscreen maximize/restore toggle.
 *
 * pdf.js is dynamically imported on first mount, so the ~400 KB library is
 * only downloaded by visitors who actually view a PDF. Bytes come from
 * /api/pdf/[id] (same-origin proxy; R2 sends no CORS headers). The worker
 * ships from /public so library and worker versions always match.
 */

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

interface PdfViewerProps {
  resourceId: string;
  title: string;
  /** inline = in-flow first-page reader; fullscreen = fixed overlay. */
  variant?: "inline" | "fullscreen";
  onClose?: () => void;
}

/** Thick ink ring for toolbar buttons — matches the site's border-2 ink
  aesthetic. 44px+ tap target (h-10 ≈ 40px + padding), grows to h-11 on sm+. */
const tbBtn =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-surface text-foreground transition-all hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed sm:h-11 sm:w-11";

/** Close button on the fullscreen toolbar — ink toolbar, so a filled-ink
  button with background text (the canonical light-on-ink pattern). */
const closeBtn =
  "inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-ink text-background transition-all hover:bg-ink hover:shadow-hard-sm disabled:opacity-40 sm:h-11 sm:w-11";

/** A single numeric page-jump input: type a number, Enter jumps, Escape
  cancels. Clamped to [1, numPages]. Large enough to read and tap on mobile. */
function PageJumpInput({
  page,
  numPages,
  onJump,
}: {
  page: number;
  numPages: number;
  onJump: (n: number) => void;
}) {
  const [text, setText] = useState<string>(String(page));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync the input when the page changes from outside (scroll, arrow keys).
  useEffect(() => {
    setText(String(page));
  }, [page]);

  const commit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const n = parseInt(trimmed, 10);
    if (Number.isFinite(n)) onJump(n); // jumpToPage clamps to [1, numPages]
  }, [text, onJump]);

  const clampToWidth = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 4);

  return (
    <div className="flex items-center gap-1.5">
      <FileText size={14} className="shrink-0 text-foreground/60" aria-hidden />
      <span className="shrink-0 text-xs font-bold uppercase tracking-widest text-foreground/60">
        Page
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        aria-label="Current page number — edit to jump"
        value={text}
        onChange={(e) => setText(clampToWidth(e.target.value))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setText(String(page));
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => {
          const n = parseInt(text, 10);
          if (Number.isFinite(n)) onJump(n);
          setText(String(page));
        }}
        disabled={numPages === 0}
        className="
          w-12 sm:w-14 flex-shrink-0 h-8 rounded-md border-2 border-ink
          bg-surface text-center text-sm font-bold text-foreground
          shadow-hard-sm focus:outline-none focus:border-accent focus:ring-2
          focus:ring-accent/30 transition-all disabled:opacity-50
        "
      />
      <span className="shrink-0 text-xs font-bold text-foreground/40" aria-hidden>
        of
      </span>
      <span
        className="shrink-0 min-w-[1.6rem] text-center text-sm font-bold tabular-nums text-foreground/70"
        aria-live="polite"
      >
        {numPages || "…"}
      </span>
    </div>
  );
}

export default function PdfViewer({
  resourceId,
  title,
  variant = "fullscreen",
  onClose,
}: PdfViewerProps) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1); // 1 = fit width
  const [isFullscreen, setIsFullscreen] = useState(false);

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  type LoadingTask = Awaited<ReturnType<typeof loadTask>>;
  const docRef = useRef<Awaited<LoadingTask["promise"]> | null>(null);
  const renderVersionRef = useRef(0);

  /* Dynamic import: resolves to the ESM build; worker URL points at the
     copy in /public (same version — they ship together in the repo).

     disableStream: false (the default) — lets pdf.js use its streaming
     parser with Range requests. The /api/pdf proxy forwards Range headers
     to the upstream (R2 or Drive), so pdf.js fetches only the bytes it
     needs for each page instead of the whole file. Page 1 paints from the
     first ~64 KB (document header + xref) instead of waiting for the full
     download — the single biggest perceived-speed win for big scans.

     disableAutoFetch: true — pdf.js will not pre-fetch pages beyond what
     the viewer asks for. Combined with our own renderPages() that only
     rasterizes visible pages, this keeps unnecessary range requests out of
     the network while the reader scrolls.

     rangeChunkSize 64 KB (pdf.js's floor): small chunks mean the first
     paint arrives after ~1 range round-trip instead of after the whole
     file. The extra request overhead only matters when a reader scrolls
     through EVERY page of a huge scan — where 4× faster first paint is
     worth ~4 extra range round trips per MB.

     Repeat visitors don't pay either way: Cache-Control: public,
     max-age=86400, immutable on /api/pdf means the browser serves a second
     open from disk with no network at all. */
  const loadTask = useCallback((url: string) => {
    // Synchronous import kick-off; returns the LOADING TASK (not the doc
    // promise) so the caller can hook onProgress for byte-level loading UX.
    return import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return pdfjs.getDocument({
        url,
        withCredentials: false,
        rangeChunkSize: 65536,
        disableAutoFetch: true,
      });
    });
  }, []);

  /* One transparent retry: a transient 429 from the rate limiter or a
     blip fetching from storage used to land readers directly in the error
     state ("preview blocked"), with the fix being nothing more than
     reloading. A single short-delay retry absorbs the spike without
     masking a genuinely dead file — the second failure still errors. */
  const loadTaskWithRetry = useCallback(
    async (url: string) => {
      try {
        return await loadTask(url);
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
        return loadTask(url);
      }
    },
    [loadTask]
  );

  /* Load document once. onProgress surfaces byte-level progress so the
     loading state shows real movement ("4.2 MB of 12 MB") instead of an
     indeterminate spinner for a 30 MB scan — the difference between
     "it's working" and "it's broken" on a slow connection. */
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadTaskWithRetry(`/api/pdf/${resourceId}`).then((task) => {
      if (cancelled) {
        task.destroy();
        return;
      }
      task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
        if (!total || total <= 0) return;
        setProgressLabel(
          loaded >= total
            ? null
            : `${(loaded / 1_048_576).toFixed(1)} MB of ${(total / 1_048_576).toFixed(1)} MB`
        );
      };
      task.promise
        .then((doc) => {
          if (cancelled) {
            doc.destroy();
            return;
          }
          docRef.current = doc;
          setNumPages(doc.numPages);
          setState("ready");
        })
        .catch((e) => {
          console.error("PDF load failed:", e);
          if (!cancelled) setState("error");
        });
    });
    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [resourceId, loadTaskWithRetry]);

  /* Render visible pages. Fit-width base scale; zoom multiplies it. Renders
     are versioned — a newer request invalidates older in-flight ones. */
  const renderPages = useCallback(async () => {
    const doc = docRef.current;
    const scroller = scrollRef.current;
    const wrap = canvasWrapRef.current;
    if (!doc || !scroller || !wrap || state !== "ready") return;

    const version = ++renderVersionRef.current;
    const baseWidth = scroller.clientWidth - 32;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const els = [...wrap.querySelectorAll<HTMLElement>("[data-page]")];

    /* First pass: size every placeholder to its page's aspect ratio at the
       current zoom, so the scrollbar and page positions stay stable. */
    for (const el of els) {
      if (el.dataset.aspect) {
        const [ratioW, ratioH] = el.dataset.aspect.split(":").map(Number);
        const h = ((baseWidth * zoom) * ratioH) / ratioW;
        if (Math.abs(el.offsetHeight - h) > 2) el.style.height = `${Math.floor(h)}px`;
      }
    }

    /* Second pass: rasterize the pages near the viewport. */
    const scrollTop = scroller.scrollTop;
    const viewH = scroller.clientHeight;
    const visible = els.filter((el) => {
      const top = el.offsetTop - scrollTop;
      return top < viewH + 600 && top + el.offsetHeight > -600;
    });

    for (const el of visible) {
      const n = Number(el.dataset.page);
      if (el.dataset.rendered === String(zoom)) continue;
      try {
        const pdfPage = await doc.getPage(n);
        if (renderVersionRef.current !== version) return;

        const viewport1 = pdfPage.getViewport({ scale: 1 });
        el.dataset.aspect = `${viewport1.width}:${viewport1.height}`;

        const targetW = baseWidth * zoom;
        const scale = (targetW / viewport1.width) * dpr;
        const viewport = pdfPage.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        canvas.className = "block rounded-lg bg-white shadow-md";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Page ${n} of ${title}`);

        el.replaceChildren(canvas);
        el.dataset.rendered = String(zoom);
        const h = (targetW * viewport1.height) / viewport1.width;
        el.style.height = `${Math.floor(h)}px`;
        const task = pdfPage.render({
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        task.promise.catch(() => {}); // cancelled renders reject — ignore
      } catch {
        // render race lost or doc destroyed — next pass re-renders
      }
    }
  }, [state, zoom, title]);

  /* Re-render on mount, zoom change, scroll and resize (rAF-coalesced). */
  const rafRef = useRef(0);
  const scheduleRender = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => renderPages());
  }, [renderPages]);

  useEffect(() => {
    if (state !== "ready") return;
    scheduleRender();
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onScroll = () => scheduleRender();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", scheduleRender);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", scheduleRender);
      cancelAnimationFrame(rafRef.current);
    };
  }, [state, scheduleRender]);

  /* Track the page under the viewport top for the page indicator. */
  useEffect(() => {
    if (state !== "ready" || !scrollRef.current) return;
    const scroller = scrollRef.current;
    const onScroll = () => {
      const els = [
        ...(canvasWrapRef.current?.querySelectorAll<HTMLElement>("[data-page]") ?? []),
      ];
      let current = 1;
      for (const el of els) {
        if (el.offsetTop - scroller.scrollTop <= scroller.clientHeight / 2) {
          current = Number(el.dataset.page);
        }
      }
      setPage(current);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [state]);

  const jumpToPage = useCallback(
    (n: number) => {
      const target = Math.min(numPages, Math.max(1, n));
      setPage(target);
      canvasWrapRef.current
        ?.querySelector(`[data-page="${target}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [numPages]
  );

  /* Fullscreen toggle — Enter/Exit fullscreen. The maximize/restore button
     is on the bottom toolbar row. Esc also closes (fullscreen only). */
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  /* Fullscreen only: Esc closes, page scroll locks, arrows page.
     Key events originating inside form fields are ignored so the caret
     arrows in the jump-to-page input don't turn pages. */
  useEffect(() => {
    if (variant !== "fullscreen") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowRight" || e.key === "PageDown") jumpToPage(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") jumpToPage(page - 1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [variant, page, jumpToPage, onClose]);

  const applyZoom = (next: number) =>
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));

  /* Ctrl/Cmd+wheel zoom. */
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    applyZoom(zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
  };

  /** Zoom controls: out / in / reset. */
  const zoomControls = (
    <>
      <button
        onClick={() => applyZoom(zoom / ZOOM_STEP)}
        disabled={zoom <= ZOOM_MIN || state !== "ready"}
        className={tbBtn}
        aria-label="Zoom out"
      >
        <ZoomOut size={18} strokeWidth={2.25} aria-hidden />
      </button>
      <button
        onClick={() => applyZoom(zoom * ZOOM_STEP)}
        disabled={zoom >= ZOOM_MAX || state !== "ready"}
        className={tbBtn}
        aria-label="Zoom in"
      >
        <ZoomIn size={18} strokeWidth={2.25} aria-hidden />
      </button>
      <button
        onClick={() => applyZoom(1)}
        disabled={zoom === 1 || state !== "ready"}
        className={tbBtn}
        aria-label="Reset zoom to fit width"
      >
        <RotateCcw size={16} strokeWidth={2.25} aria-hidden />
      </button>
    </>
  );

  /** Page nav: previous / next. */
  const pageNav = (
    <>
      <button
        onClick={() => jumpToPage(page - 1)}
        disabled={page <= 1}
        className={tbBtn}
        aria-label="Previous page"
      >
        <ChevronLeft size={18} strokeWidth={2.25} aria-hidden />
      </button>
      <button
        onClick={() => jumpToPage(page + 1)}
        disabled={page >= numPages}
        className={tbBtn}
        aria-label="Next page"
      >
        <ChevronRight size={18} strokeWidth={2.25} aria-hidden />
      </button>
    </>
  );

  /** Fullscreen toggle: maximize ↔ restore. */
  const fullscreenToggle = (
    <button
      onClick={toggleFullscreen}
      className={tbBtn}
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      title={isFullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"}
    >
      {isFullscreen ? (
        <Minimize2 size={18} strokeWidth={2.25} aria-hidden />
      ) : (
        <Maximize2 size={18} strokeWidth={2.25} aria-hidden />
      )}
    </button>
  );

  /* ---------- Inline variant: two-row toolbar floating above the pages. ---------- */
  if (variant === "inline") {
    return (
      <div
        className="relative flex h-full w-full flex-col"
        aria-label={`PDF reader — ${title}`}
      >
        {/* Toolbar — Row 1: page indicator; Row 2: zoom + nav. Sticky at top
            of the scroller so it floats while reading. */}
        <div className="flex shrink-0 flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-2 rounded-2xl border-2 border-ink bg-surface/95 px-3 py-2.5 shadow-hard-sm backdrop-blur sm:rounded-none sm:border-x-0 sm:border-t-0 sm:bg-transparent sm:shadow-none z-10">
          {/* Row 1: Page indicator — large, clearly editable, always visible. */}
          <div className="flex items-center justify-center sm:justify-start gap-2 py-1.5">
            <PageJumpInput page={page} numPages={numPages} onJump={jumpToPage} />
          </div>
          {/* Row 2: Zoom controls + page nav. Hidden on mobile inline (the
              stage is small and the page number is the priority); shown on
              sm+ where there's room. */}
          <div className="hidden sm:flex items-center gap-1.5">
            {zoomControls}
            <span className="mx-0.5 h-5 w-px bg-line-strong" aria-hidden />
            {pageNav}
          </div>
        </div>

        <div ref={scrollRef} onWheel={onWheel} className="min-h-0 w-full flex-1 overflow-auto rounded-xl bg-surface-muted">
          {state === "loading" && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-foreground/60" aria-hidden />
              <p className="text-sm font-bold text-foreground/60">Loading PDF…</p>
              {progressLabel && (
                <p className="text-xs font-medium tabular-nums text-foreground/40">
                  {progressLabel}
                </p>
              )}
            </div>
          )}
          {state === "error" && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-lg font-bold text-foreground">Couldn&apos;t load the PDF</p>
              <p className="text-sm font-medium text-foreground/60">
                The file may be temporarily unavailable — try again in a moment, or use
                Download below.
              </p>
            </div>
          )}
          {state === "ready" && (
            <div ref={canvasWrapRef} className="mx-auto flex w-full flex-col items-center gap-4 p-4 pt-16">
              {Array.from({ length: numPages }, (_, i) => (
                <div
                  key={i}
                  data-page={i + 1}
                  className="flex w-full items-center justify-center rounded-lg border-2 border-ink/10 bg-white/40 min-h-[200px]"
                />
              ))}
              <p className="pb-2 text-xs font-bold tracking-wider text-foreground/40">
                END OF DOCUMENT · {numPages} {numPages === 1 ? "PAGE" : "PAGES"}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------- Fullscreen variant: two-row toolbar + page area. ---------- */
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-ink/95 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`PDF viewer — ${title}`}
    >
      {/* Toolbar — two rows: Row 1 = page indicator (left) + close (right);
          Row 2 = zoom controls + page nav + fullscreen toggle (centered). */}
      <div className="flex shrink-0 flex-col gap-2 rounded-2xl border-2 border-ink bg-surface px-3 py-2.5 sm:px-4 shadow-hard-sm z-20">
        {/* Row 1: Page indicator (left) + close button (right). */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="min-w-0 truncate text-sm font-bold text-foreground">
              {title}
            </span>
            <span className="mx-0.5 h-5 w-px bg-line-strong hidden sm:inline" aria-hidden />
            <PageJumpInput page={page} numPages={numPages} onJump={jumpToPage} />
          </div>
          <button
            onClick={onClose}
            className={closeBtn}
            aria-label="Close viewer"
          >
            <X size={18} strokeWidth={2.25} aria-hidden />
          </button>
        </div>

        {/* Row 2: Zoom controls (left) + page nav (center) + fullscreen toggle (right). */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {zoomControls}
          </div>
          <div className="flex items-center gap-1.5">
            {pageNav}
          </div>
          <div className="flex items-center gap-1.5">
            {fullscreenToggle}
          </div>
        </div>
      </div>

      {/* Page area */}
      <div ref={scrollRef} onWheel={onWheel} className="mt-2 min-h-0 flex-1 overflow-auto rounded-2xl">
        {state === "loading" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-background">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            <p className="text-sm font-bold">Loading PDF…</p>
            {progressLabel && (
              <p className="text-xs font-medium tabular-nums opacity-60">
                {progressLabel}
              </p>
            )}
          </div>
        )}
        {state === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-background">
            <p className="text-lg font-bold">Couldn&apos;t load the PDF</p>
            <p className="max-w-xs text-center text-sm font-medium opacity-70">
              The file may be temporarily unavailable — try again in a moment, or use
              Download instead.
            </p>
          </div>
        )}
        {state === "ready" && (
          <div ref={canvasWrapRef} className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 p-4">
            {Array.from({ length: numPages }, (_, i) => (
              <div
                key={i}
                data-page={i + 1}
                className="flex min-h-[200px] w-full items-center justify-center rounded-lg border border-white/10 bg-white/5"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
