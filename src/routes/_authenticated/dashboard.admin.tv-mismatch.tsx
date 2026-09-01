import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { isAdmin } from "@/lib/admin-messages.functions";
import { runTvMismatchCheck, type MismatchReport } from "@/lib/tv-mismatch.functions";

export const Route = createFileRoute("/_authenticated/dashboard/admin/tv-mismatch")({
  head: () => ({
    meta: [
      { title: "TradingView Mismatch Checker — Jenvu Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TvMismatchPage,
});

function fmt(n: number | null, d = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

function StatusBadge({ status }: { status: "ok" | "warn" | "fail" | "no-data" }) {
  if (status === "ok")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> OK
      </span>
    );
  if (status === "warn")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3" /> Drift
      </span>
    );
  if (status === "fail")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
        <XCircle className="h-3 w-3" /> Mismatch
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      No data
    </span>
  );
}

function TvMismatchPage() {
  const checkAdmin = useServerFn(isAdmin);
  const runCheck = useServerFn(runTvMismatchCheck);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<MismatchReport | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await runCheck();
      setReport(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to run check");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const ok = await checkAdmin();
        setAllowed(!!ok);
        if (ok) await load();
        else setLoading(false);
      } catch {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loading && !allowed) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Forbidden.</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#FAFAFA] p-6" style={{ fontFamily: '"Google Sans", "Google Sans Text", system-ui, sans-serif' }}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="pl-1 text-2xl font-semibold text-slate-900">TradingView Mismatch Checker</h1>
            <p className="mt-1 text-sm text-slate-500">
              Compares our Yahoo-computed XAU/USD candles (used in signal chart images) against an
              independent live reference (gold-api spot × ECB FX) and reports drift.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Re-run
          </button>
        </div>

        {report && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Generated: {new Date(report.generatedAt).toLocaleString()} · Warn ≥ {report.thresholds.warnPct}% ·
            Fail ≥ {report.thresholds.failPct}%
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Pair</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Our price</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Drift %</th>
                <th className="px-4 py-3">Candle alignment</th>
                <th className="px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !report && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Running check…
                  </td>
                </tr>
              )}
              {report?.pairs.map((p) => {
                const dec = p.pair.endsWith("JPY") ? 3 : 2;
                return (
                  <tr key={p.pair} className="text-slate-800">
                    <td className="px-4 py-3 font-medium">{p.pair}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 tabular-nums">{fmt(p.yahooLast, dec)}</td>
                    <td className="px-4 py-3 tabular-nums">{fmt(p.reference, dec)}</td>
                    <td className={`px-4 py-3 tabular-nums ${
                      p.status === "fail" ? "text-rose-600 font-semibold" :
                      p.status === "warn" ? "text-amber-600" : ""
                    }`}>
                      {p.driftPct == null ? "—" : `${p.driftPct >= 0 ? "+" : ""}${p.driftPct.toFixed(3)}%`}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {p.candleAlignment
                        ? `${p.candleAlignment.aligned}/${p.candleAlignment.total} · max gap ${p.candleAlignment.maxGapMinutes}m`
                        : p.pair === "XAUUSD" ? `${p.yahooCandles} candles` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{p.note || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Reference sources: gold-api.com (XAU spot) and open.er-api.com (ECB FX rates). Small drift &lt; 0.25% is
          normal (spot vs futures basis). Drift ≥ 0.75% indicates our chart may not match TradingView.
        </p>
      </div>
    </div>
  );
}
