"use client";

import { useState, useEffect } from "react";
import { Eye, Globe, RefreshCw } from "lucide-react";
import { getTrafficData } from "@/lib/actions/admin";
import { getErrorMessage } from "@/lib/utils";

interface TrafficData {
  totals: { today: number; last7: number; last30: number; allTime: number };
  daily: { day: string; views: number }[];
  topPaths: { path: string; views: number }[];
  topReferrers: { referrer: string | null; views: number }[];
}

/**
 * Traffic tab — visualizes the aggregated page_views data collected by
 * /api/analytics (privacy-safe: path + day + referrer-host only, no cookies,
 * no IPs). Pure CSS bars — no chart library needed.
 */
export default function TrafficTab() {
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getTrafficData());
    } catch (e) {
      setError(getErrorMessage(e, "Failed to load traffic data"));
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
        <Eye className="w-12 h-12 mx-auto text-foreground/40 mb-4" />
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

  const maxDay = Math.max(1, ...data.daily.map((d) => d.views));
  const maxPath = Math.max(1, ...data.topPaths.map((p) => p.views));
  const totalRef = Math.max(1, data.topReferrers.reduce((s, r) => s + r.views, 0));

  // Fill gaps so the trend line has one bar per day even with zero views.
  const dailyMap = new Map(data.daily.map((d) => [d.day, d.views]));
  const dailySeries: { day: string; views: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() - i);
    const day = t.toISOString().slice(0, 10);
    dailySeries.push({ day, views: dailyMap.get(day) ?? 0 });
  }

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Today", value: data.totals.today },
          { label: "Last 7 days", value: data.totals.last7 },
          { label: "Last 30 days", value: data.totals.last30 },
          { label: "All time", value: data.totals.allTime },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border-2 border-line bg-surface p-5">
            <p className="text-xs font-bold text-foreground/60 tracking-wider uppercase">{m.label}</p>
            <p className="text-3xl font-black tracking-tight mt-1">
              {m.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Daily trend — CSS bar chart, 30 days */}
      <div className="rounded-2xl border-2 border-line bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Daily views (30 days)</h3>
          <button
            onClick={load}
            aria-label="Refresh traffic data"
            className="p-2 rounded-full hover:bg-surface-muted transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex items-end gap-[3px] h-40" role="img" aria-label="Bar chart of page views over the last 30 days">
          {dailySeries.map(({ day, views }) => (
            <div
              key={day}
              title={`${day}: ${views.toLocaleString()} view${views === 1 ? "" : "s"}`}
              className="flex-1 rounded-t bg-accent hover:bg-ink transition-colors min-h-[2px]"
              style={{ height: `${Math.max(2, (views / maxDay) * 100)}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] font-bold text-foreground/60 tracking-wider">
          <span>{dailySeries[0]?.day}</span>
          <span>Today</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top paths */}
        <div className="rounded-2xl border-2 border-line bg-surface p-6">
          <h3 className="font-bold text-lg mb-4">Top pages</h3>
          {data.topPaths.length === 0 ? (
            <p className="text-foreground/60 font-medium text-sm">No page views recorded yet</p>
          ) : (
            <div className="space-y-3">
              {data.topPaths.map((p) => (
                <div key={p.path}>
                  <div className="flex justify-between items-baseline gap-3 mb-1">
                    <span className="font-mono text-sm font-bold truncate">{p.path}</span>
                    <span className="text-sm font-black shrink-0">{p.views.toLocaleString()}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(p.views / maxPath) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top referrers */}
        <div className="rounded-2xl border-2 border-line bg-surface p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4" /> Top referrers
          </h3>
          {data.topReferrers.length === 0 ? (
            <p className="text-foreground/60 font-medium text-sm">No referrer data yet</p>
          ) : (
            <div className="space-y-3">
              {data.topReferrers.map((r) => (
                <div key={r.referrer ?? "direct"}>
                  <div className="flex justify-between items-baseline gap-3 mb-1">
                    <span className="text-sm font-bold truncate">
                      {r.referrer ?? "Direct / none"}
                    </span>
                    <span className="text-sm font-black shrink-0">
                      {r.views.toLocaleString()}
                      <span className="text-foreground/60 font-medium ml-1.5">
                        {Math.round((r.views / totalRef) * 100)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-ink"
                      style={{ width: `${(r.views / totalRef) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-foreground/60 font-medium">
        Privacy note: this data is aggregate-only (path + day + referrer host).
        No cookies, IPs, or visitor identifiers are collected — see the privacy policy.
      </p>
    </div>
  );
}
