"use client";

import { useState, useEffect } from "react";
import { Gauge, RefreshCw } from "lucide-react";
import { getWebVitalsData } from "@/lib/actions/admin";
import { getErrorMessage } from "@/lib/utils";

interface VitalsData {
  windowDays: number;
  metrics: {
    metric: string;
    count: number;
    avg: number;
    poor: number;
  }[];
  slowestPages: {
    path: string;
    avgLcp: number;
    samples: number;
    poorRate: number;
  }[];
}

/**
 * Per-metric display config: unit, formatting, and Google's good/poor
 * thresholds (same values the /api/vitals collector classifies with).
 * Colors: good ≤ threshold → green; poor > poorThreshold → red; between →
 * amber. INP is shown in ms, LCP/FCP/TTFB in seconds, CLS unitless.
 */
const METRIC_CONFIG: Record<
  string,
  { label: string; unit: "ms" | "s" | "score"; good: number; poor: number; hint: string }
> = {
  LCP: { label: "LCP", unit: "ms", good: 2500, poor: 4000, hint: "Largest Contentful Paint — main content visible" },
  INP: { label: "INP", unit: "ms", good: 200, poor: 500, hint: "Interaction to Next Paint — tap/click responsiveness" },
  CLS: { label: "CLS", unit: "score", good: 0.1, poor: 0.25, hint: "Cumulative Layout Shift — visual stability" },
  FCP: { label: "FCP", unit: "ms", good: 1800, poor: 3000, hint: "First Contentful Paint — first pixel of content" },
  TTFB: { label: "TTFB", unit: "ms", good: 800, poor: 1800, hint: "Time to First Byte — server responsiveness" },
};

const METRIC_ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB"];

function formatValue(value: number, unit: "ms" | "s" | "score"): string {
  if (unit === "score") return value.toFixed(3);
  if (unit === "s") return `${(value / 1000).toFixed(2)}s`;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k ms` : `${Math.round(value)} ms`;
}

function verdictClass(avg: number, good: number, poor: number): string {
  if (avg <= good) return "text-green-700";
  if (avg > poor) return "text-red-600";
  return "text-amber-600";
}

/**
 * Vitals tab — real-user Core Web Vitals from the web_vitals aggregate
 * (privacy-safe: path + day + metric only, no visitor identifiers).
 * Answers "how fast does the site FEEL to actual students on actual
 * networks" — the numbers Lighthouse in a fast office can't tell you.
 */
export default function VitalsTab() {
  const [data, setData] = useState<VitalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getWebVitalsData());
    } catch (e) {
      setError(getErrorMessage(e, "Failed to load vitals data"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-10 h-10 mx-auto border-4 border-line border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-16 bg-surface-muted rounded-2xl border-2 border-dashed border-line">
        <Gauge className="w-12 h-12 mx-auto text-foreground/40 mb-4" aria-hidden />
        <p className="text-foreground/60 font-medium mb-4">{error || "No data"}</p>
        <button
          onClick={load}
          className="px-5 py-2.5 rounded-full bg-ink on-ink text-sm font-bold tracking-wider hover:bg-ink transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const metricsBykey = new Map(data.metrics.map((m) => [m.metric, m]));
  const ordered = METRIC_ORDER.map((key) => ({ key, row: metricsBykey.get(key) }));
  const hasSamples = data.metrics.some((m) => m.count > 0);

  if (!hasSamples) {
    return (
      <div className="text-center py-16 bg-surface-muted rounded-2xl border-2 border-dashed border-line">
        <Gauge className="w-12 h-12 mx-auto text-foreground/40 mb-4" aria-hidden />
        <p className="text-foreground/60 font-medium">No vitals collected yet.</p>
        <p className="text-xs text-foreground/50 font-medium mt-1 max-w-sm mx-auto">
          Samples appear as real visitors browse the site — check back after a day of traffic.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-wider text-foreground/60 uppercase">
          Real-user measurements · trailing {data.windowDays} days
        </p>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-line px-3 py-1.5 text-xs font-bold text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors"
          aria-label="Refresh vitals"
        >
          <RefreshCw className="h-3 w-3" aria-hidden /> Refresh
        </button>
      </div>

      {/* Metric summary cards — good/poor colored by Google's thresholds */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {ordered.map(({ key, row }) => {
          const cfg = METRIC_CONFIG[key];
          if (!cfg) return null;
          return (
            <div
              key={key}
              className="rounded-2xl border-2 border-line bg-surface p-5"
              title={cfg.hint}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-wider uppercase text-foreground/60">{cfg.label}</p>
                {row && (
                  <span className="text-[11px] font-bold tabular-nums text-foreground/40">
                    {row.count} sample{row.count === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {row ? (
                <>
                  <p className={`text-2xl font-black tracking-tight mt-1 tabular-nums ${verdictClass(row.avg, cfg.good, cfg.poor)}`}>
                    {formatValue(row.avg, cfg.unit)}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-foreground/50 tabular-nums">
                    {row.count > 0 ? Math.round((1 - row.poor / row.count) * 100) : 100}% rated good
                  </p>
                </>
              ) : (
                <p className="text-2xl font-black tracking-tight mt-1 text-foreground/20">—</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Slowest pages by average LCP — where real students wait longest */}
      <div className="rounded-2xl border-2 border-line bg-surface p-6">
        <h4 className="font-bold mb-1">Slowest pages (by average LCP)</h4>
        <p className="text-xs text-foreground/50 font-medium mb-4">
          Pages with at least 5 samples in the window — one unlucky visitor can&apos;t skew these.
        </p>
        {data.slowestPages.length === 0 ? (
          <p className="text-foreground/60 font-medium text-sm">
            Not enough samples yet — pages appear here once they&apos;ve been viewed 5+ times with vitals reporting.
          </p>
        ) : (
          <div className="space-y-2">
            {data.slowestPages.map((p) => (
              <div key={p.path} className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate font-mono">{p.path}</p>
                  <p className="text-xs text-foreground/60 font-medium tabular-nums">
                    {p.samples} sample{p.samples === 1 ? "" : "s"} · {Math.round(p.poorRate * 100)}% poor experiences
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-black tabular-nums ${verdictClass(p.avgLcp, METRIC_CONFIG.LCP.good, METRIC_CONFIG.LCP.poor)}`}
                >
                  {(p.avgLcp / 1000).toFixed(2)}s
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
