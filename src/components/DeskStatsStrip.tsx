import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicRecentSignals, type PublicSignalRow } from "@/lib/public-signals.functions";
import { Activity, Target, Sparkles, Layers } from "lucide-react";

/**
 * Compact live "desk stats" strip for the landing page. Reads sanitized
 * public signals (last 48h) and derives lightweight social-proof stats.
 */
export function DeskStatsStrip() {
  const load = useServerFn(getPublicRecentSignals);
  const [rows, setRows] = useState<PublicSignalRow[]>([]);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await load();
        if (!cancel) setRows(r);
      } catch {}
    })();
    return () => {
      cancel = true;
    };
  }, [load]);

  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const last24 = rows.filter((r) => new Date(r.fired_at).getTime() >= dayAgo);
  const uniquePairs = new Set(rows.map((r) => r.pair)).size;
  const avgConf =
    rows.length > 0
      ? Math.round(
          (rows.reduce((s, r) => s + (r.confidence ?? 0), 0) / rows.length) *
            (rows[0] && rows[0].confidence && rows[0].confidence > 1 ? 1 : 100),
        )
      : null;
  const topPair =
    rows.length > 0
      ? Object.entries(
          rows.reduce<Record<string, number>>((acc, r) => {
            acc[r.pair] = (acc[r.pair] ?? 0) + 1;
            return acc;
          }, {}),
        ).sort((a, b) => b[1] - a[1])[0]?.[0]
      : null;

  const items = [
    { icon: Activity, label: "Signals · 24h", value: String(last24.length) },
    { icon: Layers, label: "Pairs active", value: uniquePairs ? `${uniquePairs} / 6` : "—" },
    {
      icon: Target,
      label: "Avg confidence",
      value: avgConf ? `${avgConf}%` : "—",
    },
    { icon: Sparkles, label: "Most fired", value: topPair ?? "—" },
  ];

  return (
    <section className="border-t border-zinc-100 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((it) => (
            <div
              key={it.label}
              className="hover-lift rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                <it.icon className="h-3.5 w-3.5" />
                {it.label}
              </div>
              <div className="mt-1 font-serif-display text-2xl leading-none tracking-tight text-zinc-900">
                {it.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
