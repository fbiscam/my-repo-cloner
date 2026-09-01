import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageShell, H2, P } from "@/components/PageShell";
import { listSignalAlerts, type SignalAlertRow } from "@/lib/signal-alerts.functions";

export const Route = createFileRoute("/broadcasts")({
  head: () => ({
    meta: [
      { title: "Signal Broadcasts — Jenvu" },
      { name: "description", content: "Recent A+ / A / B grade XAUUSD signal broadcasts sent to Jenvu subscribers." },
      { property: "og:title", content: "Signal Broadcasts — Jenvu" },
      { property: "og:description", content: "Recent A+ / A / B grade XAUUSD signal broadcasts sent to Jenvu subscribers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BroadcastsPage,
});

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function gradeStyle(g: string) {
  switch (g) {
    case "A+": return "bg-emerald-600 text-white";
    case "A": return "bg-emerald-500 text-white";
    case "B": return "bg-amber-500 text-white";
    default: return "bg-zinc-400 text-white";
  }
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function BroadcastsPage() {
  const fetchAlerts = useServerFn(listSignalAlerts);
  const [rows, setRows] = useState<SignalAlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchAlerts({ data: { limit: 30 } });
        if (!cancelled) setRows(res.alerts ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchAlerts]);

  return (
    <PageShell
      eyebrow="Broadcasts"
      title={"Recent signal\nbroadcasts"}
      intro="A public feed of the latest ICT/SMC signal alerts sent to Jenvu subscribers. Grades reflect setup confidence at the time of broadcast."
    >
      <section className="space-y-4">
        <H2>Latest alerts</H2>
        <P>
          Broadcasts are dispatched to paid subscribers by email and in-app when a
          high-confidence setup triggers. Historical entries here are informational,
          not trading advice.
        </P>

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            Loading broadcasts…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            No broadcasts yet. Check back soon.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-[0_12px_30px_-24px_rgba(0,0,0,0.08)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold ${gradeStyle(r.grade)}`}>
                    {r.grade}
                  </span>
                  <span className="text-sm font-semibold text-zinc-900">{r.pair}</span>
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                      r.direction === "BUY" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {r.direction}
                  </span>
                  {r.session && (
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">
                      {r.session}
                    </span>
                  )}
                  {r.killzone && (
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">
                      {r.killzone}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-zinc-500">{timeAgo(r.fired_at)}</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                  <div>
                    <div className="text-zinc-500">Entry</div>
                    <div className="font-medium text-zinc-900">{fmt(r.entry)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">SL</div>
                    <div className="font-medium text-rose-700">{fmt(r.sl)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">TP</div>
                    <div className="font-medium text-emerald-700">{fmt(r.tp)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">RR</div>
                    <div className="font-medium text-zinc-900">{r.rr != null ? `${fmt(r.rr, 2)}R` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500">Confidence</div>
                    <div className="font-medium text-zinc-900">{r.confidence != null ? `${Math.round(r.confidence)}%` : "—"}</div>
                  </div>
                </div>

                {r.rationale && (
                  <p className="mt-3 text-sm text-zinc-600 leading-relaxed">{r.rationale}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
