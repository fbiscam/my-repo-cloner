import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, TrendingUp, RefreshCw } from "lucide-react";
import { getAccuracyReport } from "@/lib/tuning/accuracy.functions";
import { replayGateVerification, type ReplayResult } from "@/lib/tuning/replay.functions";

export const Route = createFileRoute("/_authenticated/dashboard/admin/accuracy")({
  head: () => ({
    meta: [
      { title: "Signal Accuracy — Jenvu Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccuracyPage,
});

type Report = Awaited<ReturnType<typeof getAccuracyReport>>;

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function r(n: number) {
  return n.toFixed(2);
}

function AccuracyPage() {
  const fetchReport = useServerFn(getAccuracyReport);
  const fetchReplay = useServerFn(replayGateVerification);
  const [report, setReport] = useState<Report | null>(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(false);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  const runReplay = async (d: number) => {
    setReplayLoading(true);
    try {
      setReplay(await fetchReplay({ data: { days: d } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Replay failed");
    } finally {
      setReplayLoading(false);
    }
  };

  const load = async (d: number) => {
    setLoading(true);
    try {
      const r = await fetchReport({ data: { days: d } });
      setReport(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6" style={{ fontFamily: "'Google Sans','Urbanist',sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="pl-1 text-2xl font-semibold text-black">Signal Accuracy</h1>
          <p className="text-sm text-gray-500 mt-1">
            Objective win-rate and R-expectancy from the paper-trading log (auto-resolved via 5m candles).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-md px-3 py-1.5 text-sm bg-white"
            value={days}
            onChange={(e) => {
              const d = Number(e.target.value);
              setDays(d);
              load(d);
            }}
          >
            <option value={7}>Last 7d</option>
            <option value={30}>Last 30d</option>
            <option value={90}>Last 90d</option>
            <option value={180}>Last 180d</option>
          </select>
          <button
            onClick={() => load(days)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {report?.drift_warning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <div className="font-medium">Model drift detected</div>
            <div>{report.drift_warning}</div>
          </div>
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              label="Total signals"
              value={String(report.overall.total)}
              hint={`${report.overall.resolved} resolved`}
            />
            <Kpi
              label="Win rate"
              value={pct(report.overall.win_rate)}
              hint={report.baseline_win_rate != null ? `baseline ${pct(report.baseline_win_rate)}` : undefined}
              accent={report.overall.win_rate >= 0.55 ? "good" : report.overall.win_rate >= 0.4 ? "neutral" : "bad"}
            />
            <Kpi
              label="Avg R"
              value={r(report.overall.avg_r)}
              accent={report.overall.avg_r >= 0.3 ? "good" : report.overall.avg_r >= 0 ? "neutral" : "bad"}
            />
            <Kpi
              label="30-day win rate"
              value={pct(report.recent_30d.win_rate)}
              hint={`${report.recent_30d.total} signals`}
            />
          </div>

          <Section title="Gate replay — before vs after">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runReplay(Math.min(days, 180))}
                  disabled={replayLoading}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${replayLoading ? "animate-spin" : ""}`} />
                  Replay last {Math.min(days, 180)}d through current gates
                </button>
              </div>
              {replay && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Kpi
                      label="Before — win rate"
                      value={pct(replay.before.winRate)}
                      hint={`${replay.before.taken} resolved · avg R ${r(replay.before.avgR)}`}
                    />
                    <Kpi
                      label="After — win rate"
                      value={pct(replay.after.winRate)}
                      hint={`${replay.after.taken} kept · avg R ${r(replay.after.avgR)}`}
                      accent={replay.after.winRate >= replay.before.winRate ? "good" : "bad"}
                    />
                    <Kpi
                      label="Delta"
                      value={`${((replay.after.winRate - replay.before.winRate) * 100).toFixed(1)} pts`}
                      accent={replay.after.winRate >= replay.before.winRate ? "good" : "bad"}
                    />
                    <Kpi
                      label="Filtered out"
                      value={String(replay.before.taken - replay.after.taken)}
                      hint="signals current gates would block"
                    />
                  </div>
                  {replay.filteredOut.length > 0 && (
                    <Table
                      cols={["Blocked by", "Count", "Would-be wins", "Would-be losses"]}
                      rows={replay.filteredOut.map((f) => [
                        f.reason.replace(/_/g, " "),
                        f.count,
                        f.wins,
                        f.losses,
                      ])}
                    />
                  )}
                  <p className="text-xs text-gray-500">{replay.note}</p>
                </>
              )}
            </div>
          </Section>



          <Section title="By grade">
            <Table
              cols={["Grade", "Total", "Wins", "Losses", "Timeout", "Pending", "Win rate", "Avg R"]}
              rows={report.by_grade.map((g) => [
                g.grade,
                g.total,
                g.wins,
                g.losses,
                g.timeouts,
                g.pending,
                pct(g.win_rate),
                r(g.avg_r),
              ])}
            />
          </Section>

          <Section title="By pair">
            <Table
              cols={["Pair", "Total", "Win rate", "Avg R"]}
              rows={report.by_pair.map((p) => [p.pair, p.total, pct(p.win_rate), r(p.avg_r)])}
            />
          </Section>

          <Section title="By direction">
            <Table
              cols={["Direction", "Total", "Win rate", "Avg R"]}
              rows={report.by_direction.map((d) => [d.direction, d.total, pct(d.win_rate), r(d.avg_r)])}
            />
          </Section>

          <div className="text-xs text-gray-400 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Window: {report.window_days}d · Resolver runs every 30 minutes.
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "good" | "bad" | "neutral";
}) {
  const color =
    accent === "good" ? "text-emerald-600" : accent === "bad" ? "text-red-600" : "text-black";
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b bg-gray-50 text-sm font-medium text-black">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase">
            {cols.map((c) => (
              <th key={c} className="py-2 pr-4 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="text-gray-400 py-4">
                No data yet.
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-black">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
