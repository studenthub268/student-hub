"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";

/**
 * Custom PDF viewer — renders pages onto canvas with pdf.js, themed to match
 * the site's ink aesthetic instead of the browser's native viewer.
 *
 * Two variants:
 *  - "inline": rendered inside the resource preview stage. Shows the first
 *    page immediately and scrolls through the rest — reading starts with
 *    zero clicks, like the image preview.
 *  - "fullscreen": fixed overlay with a toolbar (used by the expand button).
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

export default function PdfViewer({ resourceId, title, variant = "fullscreen", onClose }: PdfViewerProps) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1); // 1 = fit width

  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<Awaited<ReturnType<typeof loadDoc>> | null>(null);
  const renderVersionRef = useRef(0);

  /* Dynamic import: resolves to the ESM build; worker URL points at the
     copy in /public (same version — they ship together in the repo). */
  const loadDoc = useCallback(async (url: string) => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({ url, withCredentials: false });
    return task.promise;
  }, []);

  /* One transparent retry: a transient 429 from the rate limiter or a
     blip fetching from storage used to land readers directly in the error
     state ("preview blocked"), with the fix being nothing more than
     reloading. A single short-delay retry absorbs the spike without
     masking a genuinely dead file — the second failure still errors. */
  const loadDocWithRetry = useCallback(
    async (url: string) => {
      try {
        return await loadDoc(url);
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
        return loadDoc(url);
      }
    },
    [loadDoc]
  );

  /* Load document once. */
  useEffect(() => {
    let cancelled = false;
    loadDocWithRetry(`/api/pdf/${resourceId}`)
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
    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [resourceId, loadDocWithRetry]);

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
        const task = pdfPage.render({ canvasContext: canvas.getContext("2d")!, viewport });
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
      const els = [...(canvasWrapRef.current?.querySelectorAll<HTMLElement>("[data-page]") ?? [])];
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

  const jumpToPage = useCallback((n: number) => {
    const target = Math.min(numPages, Math.max(1, n));
    setPage(target);
    canvasWrapRef.current
      ?.querySelector(`[data-page="${target}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [numPages]);

  /* Fullscreen only: Esc closes, page scroll locks, arrows page. */
  useEffect(() => {
    if (variant !== "fullscreen") return;
    const onKey = (e: KeyboardEvent) => {
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

  const applyZoom = (next: number) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)));

  /* Ctrl/Cmd+wheel zoom. */
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    applyZoom(zoom * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
  };

  const ctrlBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-surface text-foreground transition-all hover:bg-surface-muted disabled:opacity-40 disabled:hover:bg-transparent";

  const zoomControls = (
    <>
      <button onClick={() => applyZoom(zoom / ZOOM_STEP)} disabled={zoom <= ZOOM_MIN || state !== "ready"} className={ctrlBtn} aria-label="Zoom out">
        <ZoomOut size={16} strokeWidth={2.25} aria-hidden />
      </button>
      <button onClick={() => applyZoom(zoom * ZOOM_STEP)} disabled={zoom >= ZOOM_MAX || state !== "ready"} className={ctrlBtn} aria-label="Zoom in">
        <ZoomIn size={16} strokeWidth={2.25} aria-hidden />
      </button>
      <button onClick={() => applyZoom(1)} disabled={zoom === 1 || state !== "ready"} className={ctrlBtn} aria-label="Reset zoom to fit width">
        <RotateCcw size={15} strokeWidth={2.25} aria-hidden />
      </button>
    </>
  );

  const pager = (
    <>
      <button onClick={() => jumpToPage(page - 1)} disabled={page <= 1} className={ctrlBtn} aria-label="Previous page">
        <ChevronLeft size={16} strokeWidth={2.25} aria-hidden />
      </button>
      <span className="text-xs font-bold tabular-nums text-foreground" aria-live="polite">
        {page} / {numPages || "…"}
      </span>
      <button onClick={() => jumpToPage(page + 1)} disabled={page >= numPages} className={ctrlBtn} aria-label="Next page">
        <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
      </button>
    </>
  );

  /* ---------- Inline variant: floats above the pages, sticky at the top
     of the scroller. ---------- */
  if (variant === "inline") {
    return (
      <div className="relative flex h-full w-full flex-col" aria-label={`PDF reader — ${title}`}>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
          aria-hidden
        >
          <div className="pointer-events-auto mt-3 flex items-center gap-1.5 rounded-full border-2 border-ink bg-surface/95 px-2.5 py-1.5 shadow-hard-sm backdrop-blur">
            {zoomControls}
            <span className="mx-0.5 h-5 w-px bg-line-strong" aria-hidden />
            {pager}
          </div>
        </div>

        <div ref={scrollRef} onWheel={onWheel} className="min-h-0 w-full flex-1 overflow-auto rounded-xl bg-surface-muted">
          {state === "loading" && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-foreground/60" aria-hidden />
              <p className="text-sm font-bold text-foreground/60">Loading PDF…</p>
            </div>
          )}
          {state === "error" && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-lg font-bold text-foreground">Couldn&apos;t load the PDF</p>
              <p className="text-sm font-medium text-foreground/60">
                The file may be temporarily unavailable — try again in a moment, or use Download below.
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

  /* ---------- Fullscreen variant. ---------- */
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-ink/95 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`PDF viewer — ${title}`}
    >
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-2xl border-2 border-ink bg-surface px-3 py-2 shadow-hard-sm sm:px-4">
        <span className="min-w-0 truncate text-sm font-bold text-foreground">{title}</span>

        <div className="flex shrink-0 items-center gap-1.5">
          {zoomControls}
          <span className="mx-0.5 h-5 w-px bg-line-strong" aria-hidden />
          {pager}
          <span className="mx-0.5 hidden h-5 w-px bg-line-strong sm:block" aria-hidden />
          <button onClick={onClose} className={`${ctrlBtn} border-background bg-ink on-ink hover:bg-ink`} aria-label="Close viewer">
            <X size={16} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>

      {/* Page area */}
      <div ref={scrollRef} onWheel={onWheel} className="mt-2 min-h-0 flex-1 overflow-auto rounded-2xl">
        {state === "loading" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-background">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            <p className="text-sm font-bold">Loading PDF…</p>
          </div>
        )}
        {state === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-background">
            <p className="text-lg font-bold">Couldn&apos;t load the PDF</p>
            <p className="max-w-xs text-center text-sm font-medium opacity-70">
              The file may be temporarily unavailable — try again in a moment, or use Download instead.
            </p>
          </div>
        )}
        {state === "ready" && (
          <div ref={canvasWrapRef} className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 p-4">
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
