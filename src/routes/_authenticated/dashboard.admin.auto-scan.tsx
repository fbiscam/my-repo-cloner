import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  RefreshCw,
  Zap,
  Power,
  ShieldCheck,
  Activity,
  Clock,
  DollarSign,
  TrendingUp,
  Target,
  CheckCircle2,
  XCircle,
  CircleDashed,
  BarChart3,
} from "lucide-react";
import { isAdmin } from "@/lib/admin-messages.functions";
import {
  getAutoScanOverview,
  setAutoScanEnabled,
  triggerAutoScanNow,
  type AutoScanOverview,
} from "@/lib/admin-auto-scan.functions";
import {
  getSignalPerformance,
  type SignalPerformanceReport,
} from "@/lib/admin-signal-performance.functions";

export const Route = createFileRoute("/_authenticated/dashboard/admin/auto-scan")({
  head: () => ({
    meta: [
      { title: "Auto-Scan Monitor — Jenvu Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AutoScanAdminPage,
});

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function AutoScanAdminPage() {
  const checkAdmin = useServerFn(isAdmin);
  const fetchOverview = useServerFn(getAutoScanOverview);
  const setEnabled = useServerFn(setAutoScanEnabled);
  const runNow = useServerFn(triggerAutoScanNow);
  const fetchPerf = useServerFn(getSignalPerformance);

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [data, setData] = useState<AutoScanOverview | null>(null);
  const [perf, setPerf] = useState<SignalPerformanceReport | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfDays, setPerfDays] = useState(30);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const d = await fetchOverview();
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  };

  const loadPerf = async (days = perfDays) => {
    setPerfLoading(true);
    try {
      const p = await fetchPerf({ data: { days } });
      setPerf(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Performance load failed");
    } finally {
      setPerfLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { admin } = await checkAdmin();
        setAllowed(admin);
        if (admin) {
          await load();
          void loadPerf(30);
        }
      } finally {
        setLoading(false);
      }
    })();
    const t = setInterval(() => {
      if (allowed) load();
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-sm text-zinc-500">Loading…</div>;
  if (!allowed)
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-red-600 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" /> Admins only
      </div>
    );

  const toggle = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const res = await setEnabled({ data: { enabled: !data.enabled } });
      toast.success(`Auto-scan ${res.enabled ? "enabled" : "disabled"}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const trigger = async () => {
    setBusy(true);
    try {
      const res = await runNow();
      toast.success("Auto-scan hook triggered");
      console.log("auto-scan response", res);
      setTimeout(load, 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" style={{ fontFamily: '"Google Sans", "Google Sans Text", "Urbanist", ui-sans-serif, system-ui, sans-serif' }}>
      {/* Themed hero */}
      <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-6 sm:p-8 text-white shadow-lg">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-white/70">
              <Activity className="h-3 w-3" /> Auto-Scan Ops
            </div>
            <h1 className="pl-1 mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">Auto-Scan Monitor</h1>
            <p className="mt-1 text-sm text-white/60">
              15-min cron · 2-hit confirmation · paid-tier broadcast · signal performance analytics
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              onClick={trigger}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" /> Run Now
            </button>
            <button
              onClick={toggle}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 ${
                data?.enabled ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              <Power className="h-3.5 w-3.5" /> {data?.enabled ? "Disable" : "Enable"}
            </button>
          </div>
        </div>

        {/* Inline status pills */}
        <div className="relative mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <HeroStat
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Status"
            value={data?.enabled ? "ENABLED" : "DISABLED"}
            accent={data?.enabled ? "emerald" : "red"}
          />
          <HeroStat
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Last cron"
            value={fmtTime(data?.totals.last_cron_run)}
            sub={
              data?.totals.next_cron_eta_seconds != null
                ? `next in ~${Math.max(0, data.totals.next_cron_eta_seconds)}s`
                : undefined
            }
          />
          <HeroStat
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Alerts 24h / 7d"
            value={`${data?.totals.broadcasts_24h ?? 0} / ${data?.totals.broadcasts_7d ?? 0}`}
          />
          <HeroStat
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="Cost 24h / 7d"
            value={`$${(data?.totals.cost_24h ?? 0).toFixed(2)} / $${(data?.totals.cost_7d ?? 0).toFixed(2)}`}
          />
        </div>
      </div>

      {/* Performance dashboard */}
      <PerformanceDashboard
        perf={perf}
        loading={perfLoading}
        days={perfDays}
        onDaysChange={(d) => {
          setPerfDays(d);
          void loadPerf(d);
        }}
        onRefresh={() => loadPerf(perfDays)}
      />

      {/* Pending 2-hit confirmations */}
      <Section title="Pending confirmations" hint="1st hit registered, waiting for 2nd">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <Th>Pair</Th>
              <Th>Direction</Th>
              <Th>1st Conf</Th>
              <Th>First seen</Th>
              <Th>Last broadcast</Th>
            </tr>
          </thead>
          <tbody>
            {(data?.state ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                  No pending state
                </td>
              </tr>
            ) : (
              data!.state.map((s) => (
                <tr key={s.pair} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-medium text-zinc-900">{s.pair}</td>
                  <td className="px-3 py-2 text-zinc-700">{s.direction}</td>
                  <td className="px-3 py-2 text-zinc-700">{Number(s.first_conf).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-zinc-600">{fmtTime(s.first_seen_at)}</td>
                  <td className="px-3 py-2 text-zinc-600">{fmtTime(s.last_broadcast_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Section>

      {/* Cron history */}
      <Section title="Cron run history" hint="Last 30 runs">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <Th>Started</Th>
              <Th>Status</Th>
              <Th>Duration</Th>
              <Th>Message</Th>
            </tr>
          </thead>
          <tbody>
            {(data?.cron ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-400">
                  No runs yet — first scan runs on next 15-min slot
                </td>
              </tr>
            ) : (
              data!.cron.map((r) => {
                const dur = r.end_time
                  ? Math.round((new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 1000)
                  : null;
                return (
                  <tr key={r.runid} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-700">{fmtTime(r.start_time)}</td>
                    <td
                      className={`px-3 py-2 font-medium ${
                        r.status === "succeeded"
                          ? "text-emerald-600"
                          : r.status === "failed"
                            ? "text-red-600"
                            : "text-zinc-600"
                      }`}
                    >
                      {r.status}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">{dur != null ? `${dur}s` : "…"}</td>
                    <td className="px-3 py-2 text-zinc-600 truncate max-w-[400px]" title={r.return_message ?? ""}>
                      {r.return_message ?? "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Section>

      {/* Broadcasts */}
      <Section title="Confirmed broadcasts" hint="Last 50">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <Th>Time</Th>
              <Th>Pair</Th>
              <Th>Dir</Th>
              <Th>Conf</Th>
              <Th>Recipients</Th>
              <Th>Cost</Th>
            </tr>
          </thead>
          <tbody>
            {(data?.broadcasts ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
                  No broadcasts yet
                </td>
              </tr>
            ) : (
              data!.broadcasts.map((b) => (
                <tr key={b.id} className="border-t border-zinc-100">
                  <td className="px-3 py-2 text-zinc-700">{fmtTime(b.created_at)}</td>
                  <td className="px-3 py-2 font-medium text-zinc-900">{b.pair}</td>
                  <td
                    className={`px-3 py-2 font-medium ${b.direction === "BUY" ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {b.direction}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">{Number(b.confidence).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-zinc-700">{b.broadcast_count}</td>
                  <td className="px-3 py-2 text-zinc-700">
                    ${(Number(b.cost_usd) + Number(b.ai_cost_usd ?? 0)).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function PerformanceDashboard({
  perf,
  loading,
  days,
  onDaysChange,
  onRefresh,
}: {
  perf: SignalPerformanceReport | null;
  loading: boolean;
  days: number;
  onDaysChange: (d: number) => void;
  onRefresh: () => void;
}) {
  const t = perf?.totals;
  const bestPair = useMemo(() => {
    if (!perf) return null;
    const decided = perf.byPair.filter((b) => b.wins + b.losses >= 3);
    if (!decided.length) return null;
    return [...decided].sort((a, b) => b.winRate - a.winRate)[0];
  }, [perf]);

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-gradient-to-r from-amber-50 via-white to-emerald-50 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-zinc-900 text-amber-300">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="pl-1 text-sm font-semibold tracking-tight text-zinc-900">Signal Performance</h2>
            <p className="text-[11px] text-zinc-500">
              Win rate, R:R, correct vs wrong — evaluated against 15m market candles
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-0.5">
            {[7, 30, 60].map((d) => (
              <button
                key={d}
                onClick={() => onDaysChange(d)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition ${
                  days === d ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Reload
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-5 border-b border-zinc-100">
        <KPI
          icon={<Target className="h-3.5 w-3.5" />}
          label="Win rate"
          value={t ? pct(t.winRate) : "—"}
          accent="emerald"
          sub={t ? `${t.wins}W · ${t.losses}L` : undefined}
        />
        <KPI
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Correct"
          value={t ? String(t.wins) : "—"}
          accent="emerald"
        />
        <KPI
          icon={<XCircle className="h-3.5 w-3.5" />}
          label="Wrong"
          value={t ? String(t.losses) : "—"}
          accent="red"
        />
        <KPI
          icon={<CircleDashed className="h-3.5 w-3.5" />}
          label="Open"
          value={t ? String(t.open) : "—"}
          accent="zinc"
        />
        <KPI
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Avg R:R · Expectancy"
          value={t ? `${t.avgRR.toFixed(2)} · ${t.expectancyR >= 0 ? "+" : ""}${t.expectancyR.toFixed(2)}R` : "—"}
          accent="amber"
        />
      </div>

      {/* Best pair banner */}
      {bestPair && (
        <div className="mx-5 mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>
            <span className="font-semibold">Best pair:</span> {bestPair.pair} · {pct(bestPair.winRate)} on{" "}
            {bestPair.wins + bestPair.losses} decided signals (avg RR {bestPair.avgRR.toFixed(2)})
          </span>
        </div>
      )}

      {/* By pair */}
      <div className="p-5 pt-4">
        <h3 className="pl-1 mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Per pair</h3>
        <PerfTable buckets={perf?.byPair ?? []} loading={loading} />
      </div>

      {/* By pair + direction */}
      <div className="p-5 pt-1">
        <h3 className="pl-1 mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Per pair · direction</h3>
        <PerfTable buckets={perf?.byPairDirection ?? []} loading={loading} showDirection />
      </div>

      {/* Recent signals */}
      <div className="p-5 pt-1 pb-6">
        <h3 className="pl-1 mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent signals</h3>
        <div className="overflow-x-auto rounded-xl border border-zinc-100">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <Th>Fired</Th>
                <Th>Pair</Th>
                <Th>Dir</Th>
                <Th>Conf</Th>
                <Th>Grade</Th>
                <Th>Entry / SL / TP</Th>
                <Th>R:R</Th>
                <Th>Outcome</Th>
              </tr>
            </thead>
            <tbody>
              {(perf?.recent ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-zinc-400">
                    {loading ? "Evaluating…" : "No signals in window"}
                  </td>
                </tr>
              ) : (
                perf!.recent.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 text-zinc-700">{fmtTime(r.fired_at)}</td>
                    <td className="px-3 py-2 font-medium text-zinc-900">{r.pair}</td>
                    <td className={`px-3 py-2 font-medium ${r.direction === "BUY" ? "text-emerald-600" : "text-red-600"}`}>
                      {r.direction}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">{r.confidence ?? "—"}%</td>
                    <td className="px-3 py-2 text-zinc-700">{r.grade}</td>
                    <td className="px-3 py-2 text-zinc-600 font-mono text-[11px]">
                      {r.entry} / {r.sl} / {r.tp}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">{r.rr ? r.rr.toFixed(2) : "—"}</td>
                    <td className="px-3 py-2">
                      <OutcomePill outcome={r.outcome} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {perf?.warnings && perf.warnings.length > 0 && (
          <p className="mt-2 text-[11px] text-amber-600">Warnings: {perf.warnings.join(" · ")}</p>
        )}
        <p className="mt-2 text-[11px] text-zinc-400">
          Data source: {perf?.dataSource ?? "—"}. Outcome computed by walking 15m candles from fired_at until TP or SL is hit; ambiguous same-bar hits count as loss (conservative).
        </p>
      </div>
    </section>
  );
}

function PerfTable({
  buckets,
  loading,
  showDirection,
}: {
  buckets: Array<{
    pair: string;
    direction: string;
    total: number;
    wins: number;
    losses: number;
    open: number;
    winRate: number;
    avgRR: number;
    expectancyR: number;
  }>;
  loading?: boolean;
  showDirection?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-100">
      <table className="w-full text-xs">
        <thead className="bg-zinc-50 text-zinc-500">
          <tr>
            <Th>Pair</Th>
            {showDirection && <Th>Dir</Th>}
            <Th>Total</Th>
            <Th>Correct</Th>
            <Th>Wrong</Th>
            <Th>Open</Th>
            <Th>Win rate</Th>
            <Th>Avg R:R</Th>
            <Th>Expectancy</Th>
          </tr>
        </thead>
        <tbody>
          {buckets.length === 0 ? (
            <tr>
              <td colSpan={showDirection ? 9 : 8} className="px-3 py-6 text-center text-zinc-400">
                {loading ? "Evaluating…" : "No data"}
              </td>
            </tr>
          ) : (
            buckets.map((b) => {
              const decided = b.wins + b.losses;
              const wr = b.winRate;
              const wrColor = decided === 0 ? "text-zinc-400" : wr >= 0.6 ? "text-emerald-600" : wr >= 0.45 ? "text-amber-600" : "text-red-600";
              return (
                <tr key={`${b.pair}-${b.direction}`} className="border-t border-zinc-100">
                  <td className="px-3 py-2 font-medium text-zinc-900">{b.pair}</td>
                  {showDirection && (
                    <td className={`px-3 py-2 font-medium ${b.direction === "BUY" ? "text-emerald-600" : b.direction === "SELL" ? "text-red-600" : "text-zinc-700"}`}>
                      {b.direction}
                    </td>
                  )}
                  <td className="px-3 py-2 text-zinc-700">{b.total}</td>
                  <td className="px-3 py-2 text-emerald-600 font-medium">{b.wins}</td>
                  <td className="px-3 py-2 text-red-600 font-medium">{b.losses}</td>
                  <td className="px-3 py-2 text-zinc-500">{b.open}</td>
                  <td className={`px-3 py-2 font-semibold ${wrColor}`}>
                    {decided === 0 ? "—" : pct(wr)}
                    <div className="mt-1 h-1 w-16 rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className={`h-full ${wr >= 0.6 ? "bg-emerald-500" : wr >= 0.45 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${Math.round(wr * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-zinc-700">{b.avgRR.toFixed(2)}</td>
                  <td className={`px-3 py-2 font-medium ${b.expectancyR >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {b.expectancyR >= 0 ? "+" : ""}
                    {b.expectancyR.toFixed(2)}R
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function OutcomePill({ outcome }: { outcome: "WIN" | "LOSS" | "OPEN" }) {
  if (outcome === "WIN")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> WIN
      </span>
    );
  if (outcome === "LOSS")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200">
        <XCircle className="h-3 w-3" /> LOSS
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 border border-zinc-200">
      <CircleDashed className="h-3 w-3" /> OPEN
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-4 sm:px-5 py-3 border-b border-zinc-100">
        <h2 className="pl-1 text-sm font-semibold text-zinc-900">{title}</h2>
        {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}

function HeroStat({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald" | "red";
}) {
  const dot =
    accent === "emerald" ? "bg-emerald-400" : accent === "red" ? "bg-red-400" : "bg-white/40";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-white/60">
        {icon}
        <span>{label}</span>
        {accent && <span className={`ml-auto h-1.5 w-1.5 rounded-full ${dot}`} />}
      </div>
      <div className="mt-1.5 text-lg font-semibold tracking-tight text-white">{value}</div>
      {sub && <div className="text-[11px] text-white/50 mt-0.5">{sub}</div>}
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: "emerald" | "red" | "amber" | "zinc";
}) {
  const styles = {
    emerald: "from-emerald-50 to-white border-emerald-100 text-emerald-700",
    red: "from-red-50 to-white border-red-100 text-red-700",
    amber: "from-amber-50 to-white border-amber-100 text-amber-700",
    zinc: "from-zinc-50 to-white border-zinc-200 text-zinc-700",
  }[accent];
  return (
    <div className={`rounded-2xl border bg-gradient-to-b ${styles} p-3.5`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-zinc-900">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}
