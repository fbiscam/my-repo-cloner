import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/useCredits";
import { useAuthUser } from "@/hooks/useAuthUser";
import UpgradeOverlay from "@/components/UpgradeOverlay";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Target, Activity, Award, AlertTriangle } from "lucide-react";

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

export const Route = createFileRoute("/_authenticated/dashboard/analytics")({
  component: Analytics,
});

type Trade = {
  id: string;
  pair: string;
  direction: "long" | "short";
  outcome: "pending" | "open" | "win" | "loss" | "breakeven";
  pnl: number | null;
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  opened_at: string;
  closed_at: string | null;
};

function Analytics() {
  const { features, isLoading } = useCredits();
  const locked = !isLoading && !features.journal;
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: authUser, loading: authLoading } = useAuthUser();

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) { setLoading(false); return; }
    let stopped = false;
    const fetchTrades = async () => {
      const { data } = await supabase
        .from("trade_journal")
        .select("id,pair,direction,outcome,pnl,entry,stop_loss,take_profit,opened_at,closed_at")
        .order("opened_at", { ascending: false })
        .limit(1000);
      if (stopped) return;
      setTrades((data as unknown as Trade[]) ?? []);
      setLoading(false);
    };
    fetchTrades();
    const id = setInterval(fetchTrades, 30000);
    return () => { stopped = true; clearInterval(id); };
  }, [authLoading, authUser?.id]);


  const stats = useMemo(() => computeStats(trades), [trades]);

  if (loading || isLoading) {
    return <div className="p-8 text-sm text-zinc-500">Loading analytics…</div>;
  }

  return (
    <UpgradeOverlay show={locked} title="Journal Analytics" description="Upgrade to unlock full performance analytics on your trade journal.">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
          {/* Header */}
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <h1 className={`pl-1 text-xl font-bold ${MONO} text-zinc-900 tracking-tight`}>Trade Analytics</h1>
              <p className="text-[13px] text-zinc-500 mt-1">Personalised insights from your last {trades.length} logged trades.</p>
            </div>
            <div className={`text-[10px] ${MONO} tracking-widest uppercase text-zinc-400`}>
              Data source · trade_journal
            </div>
          </div>

          {trades.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Overall stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Trades" value={stats.total.toString()} icon={Activity} tone="zinc" />
                <StatCard
                  label="Win Rate"
                  value={stats.winRate != null ? `${stats.winRate.toFixed(1)}%` : "—"}
                  icon={Target}
                  tone={stats.winRate != null && stats.winRate >= 55 ? "emerald" : stats.winRate != null && stats.winRate >= 45 ? "amber" : "rose"}
                />
                <StatCard
                  label="Net P&L"
                  value={stats.netPnl != null ? `$${stats.netPnl.toFixed(2)}` : "—"}
                  icon={stats.netPnl != null && stats.netPnl >= 0 ? TrendingUp : TrendingDown}
                  tone={stats.netPnl != null && stats.netPnl >= 0 ? "emerald" : "rose"}
                />
                <StatCard
                  label="Profit Factor"
                  value={stats.profitFactor != null ? stats.profitFactor.toFixed(2) : "—"}
                  icon={Award}
                  tone={stats.profitFactor != null && stats.profitFactor >= 1.5 ? "emerald" : stats.profitFactor != null && stats.profitFactor >= 1 ? "amber" : "rose"}
                />
              </div>

              {/* Personalised insight */}
              {stats.insight && (
                <div className={`rounded-xl border p-4 flex items-start gap-3 ${stats.insight.tone === "warn" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                  <AlertTriangle className={`h-5 w-5 shrink-0 ${stats.insight.tone === "warn" ? "text-amber-600" : "text-emerald-600"}`} />
                  <div>
                    <div className={`text-[10px] ${MONO} tracking-widest uppercase font-bold ${stats.insight.tone === "warn" ? "text-amber-700" : "text-emerald-700"}`}>
                      Coach's Note
                    </div>
                    <p className={`text-[13px] mt-1 leading-relaxed ${stats.insight.tone === "warn" ? "text-amber-900" : "text-emerald-900"}`}>
                      {stats.insight.text}
                    </p>
                  </div>
                </div>
              )}

              {/* Charts grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard title="Win Rate by Pair">
                  {stats.byPair.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-[12px] text-zinc-400">No closed trades yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.byPair} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                        <XAxis dataKey="pair" tick={{ fontSize: 10, fill: "#71717a" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#71717a" }} unit="%" />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e4e4e7" }}
                          formatter={(v: number, _n, entry) => [`${v.toFixed(1)}% (${(entry?.payload as { total: number })?.total} trades)`, "Win rate"]}
                        />
                        <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                          {stats.byPair.map((d, i) => (
                            <Cell key={i} fill={d.winRate >= 55 ? "#10b981" : d.winRate >= 45 ? "#f59e0b" : "#f43f5e"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <ChartCard title="Direction Breakdown">
                  <div className="grid grid-cols-2 gap-3 h-[220px]">
                    <DirectionTile label="Long" data={stats.byDirection.long} tone="emerald" />
                    <DirectionTile label="Short" data={stats.byDirection.short} tone="rose" />
                  </div>
                </ChartCard>

                <ChartCard title="Killzone Performance">
                  {stats.byKillzone.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-[12px] text-zinc-400">No timestamped closed trades</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.byKillzone} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                        <XAxis dataKey="zone" tick={{ fontSize: 10, fill: "#71717a" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#71717a" }} unit="%" />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e4e4e7" }}
                          formatter={(v: number, _n, entry) => [`${v.toFixed(1)}% (${(entry?.payload as { total: number })?.total} trades)`, "Win rate"]}
                        />
                        <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                          {stats.byKillzone.map((d, i) => (
                            <Cell key={i} fill={d.winRate >= 55 ? "#10b981" : d.winRate >= 45 ? "#f59e0b" : "#f43f5e"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <ChartCard title="Cumulative P&L">
                  {stats.equity.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-[12px] text-zinc-400">No P&L data yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={stats.equity} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                        <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#71717a" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#71717a" }} />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e4e4e7" }}
                          formatter={(v: number) => [`$${v.toFixed(2)}`, "Equity"]}
                        />
                        <Line type="monotone" dataKey="pnl" stroke="#18181b" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>
            </>
          )}
      </div>
    </UpgradeOverlay>
  );
}

/* ---------- helpers ---------- */

type Stats = {
  total: number;
  wins: number;
  losses: number;
  breakevens: number;
  open: number;
  winRate: number | null;
  netPnl: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  byPair: { pair: string; winRate: number; total: number }[];
  byDirection: { long: DirStat; short: DirStat };
  byKillzone: { zone: string; winRate: number; total: number }[];
  equity: { i: number; pnl: number }[];
  insight: { text: string; tone: "warn" | "good" } | null;
};

type DirStat = { total: number; wins: number; winRate: number; netPnl: number };

function killzoneOf(iso: string): string {
  const h = new Date(iso).getUTCHours();
  if (h >= 7 && h < 10) return "London";
  if (h >= 12 && h < 15) return "NY AM";
  if (h >= 17 && h < 20) return "NY PM";
  if (h >= 0 && h < 4) return "Asia";
  return "Off-hours";
}

function computeStats(trades: Trade[]): Stats {
  const closed = trades.filter((t) => t.outcome === "win" || t.outcome === "loss" || t.outcome === "breakeven");
  const wins = closed.filter((t) => t.outcome === "win");
  const losses = closed.filter((t) => t.outcome === "loss");
  const bes = closed.filter((t) => t.outcome === "breakeven");
  const open = trades.length - closed.length;

  const decided = wins.length + losses.length;
  const winRate = decided > 0 ? (wins.length / decided) * 100 : null;
  const netPnl = closed.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const grossWin = wins.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (Number(t.pnl) || 0), 0));
  const avgWin = wins.length > 0 ? grossWin / wins.length : null;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : null;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 999 : null;

  // By pair
  const pairMap = new Map<string, { wins: number; total: number }>();
  for (const t of closed) {
    if (t.outcome === "breakeven") continue;
    const p = pairMap.get(t.pair) ?? { wins: 0, total: 0 };
    p.total += 1;
    if (t.outcome === "win") p.wins += 1;
    pairMap.set(t.pair, p);
  }
  const byPair = Array.from(pairMap.entries())
    .filter(([, v]) => v.total >= 1)
    .map(([pair, v]) => ({ pair, winRate: (v.wins / v.total) * 100, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // By direction
  const dirStat = (dir: "long" | "short"): DirStat => {
    const list = closed.filter((t) => t.direction === dir);
    const w = list.filter((t) => t.outcome === "win").length;
    const l = list.filter((t) => t.outcome === "loss").length;
    const d = w + l;
    return {
      total: list.length,
      wins: w,
      winRate: d > 0 ? (w / d) * 100 : 0,
      netPnl: list.reduce((s, t) => s + (Number(t.pnl) || 0), 0),
    };
  };
  const byDirection = { long: dirStat("long"), short: dirStat("short") };

  // By killzone
  const kzMap = new Map<string, { wins: number; total: number }>();
  for (const t of closed) {
    if (t.outcome === "breakeven") continue;
    const zone = killzoneOf(t.opened_at);
    const p = kzMap.get(zone) ?? { wins: 0, total: 0 };
    p.total += 1;
    if (t.outcome === "win") p.wins += 1;
    kzMap.set(zone, p);
  }
  const byKillzone = Array.from(kzMap.entries())
    .map(([zone, v]) => ({ zone, winRate: (v.wins / v.total) * 100, total: v.total }))
    .sort((a, b) => b.total - a.total);

  // Equity curve (chronological)
  const chrono = [...closed].sort((a, b) => +new Date(a.closed_at ?? a.opened_at) - +new Date(b.closed_at ?? b.opened_at));
  let running = 0;
  const equity = chrono.map((t, i) => {
    running += Number(t.pnl) || 0;
    return { i: i + 1, pnl: running };
  });

  // Personalised insight
  let insight: Stats["insight"] = null;
  if (byPair.length > 0) {
    const worst = [...byPair].filter((p) => p.total >= 3).sort((a, b) => a.winRate - b.winRate)[0];
    const best = [...byPair].filter((p) => p.total >= 3).sort((a, b) => b.winRate - a.winRate)[0];
    if (worst && worst.winRate < 40) {
      insight = { tone: "warn", text: `You only win ${worst.winRate.toFixed(0)}% on ${worst.pair} (${worst.total} trades). Pause it or only take A+ setups.` };
    } else if (best && best.winRate >= 65) {
      insight = { tone: "good", text: `${best.pair} is your best pair — ${best.winRate.toFixed(0)}% win rate (${best.total} trades). Consider increasing size here.` };
    } else if (byDirection.long.total >= 5 && byDirection.short.total >= 5) {
      const l = byDirection.long.winRate, s = byDirection.short.winRate;
      if (Math.abs(l - s) >= 20) {
        insight = { tone: "warn", text: `${l > s ? "Long" : "Short"} bias is strong — ${l > s ? "long" : "short"} wins ${Math.max(l, s).toFixed(0)}% vs ${l > s ? "short" : "long"} at ${Math.min(l, s).toFixed(0)}%. Avoid the weak side.` };
      }
    }
  }

  return {
    total: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: bes.length,
    open,
    winRate, netPnl, avgWin, avgLoss, profitFactor,
    byPair, byDirection, byKillzone, equity, insight,
  };
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Activity; tone: "emerald" | "rose" | "amber" | "zinc" }) {
  const toneCls = {
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-200",
    rose: "text-rose-600 bg-rose-50 border-rose-200",
    amber: "text-amber-600 bg-amber-50 border-amber-200",
    zinc: "text-zinc-700 bg-zinc-50 border-zinc-200",
  }[tone];
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] ${MONO} tracking-widest uppercase text-zinc-500`}>{label}</span>
        <div className={`h-6 w-6 rounded-md border flex items-center justify-center ${toneCls}`}>
          <Icon className="h-3 w-3" />
        </div>
      </div>
      <div className={`text-lg font-bold tabular-nums ${MONO} text-zinc-900`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className={`text-[10px] ${MONO} tracking-widest uppercase text-zinc-500 mb-3`}>{title}</div>
      {children}
    </div>
  );
}

function DirectionTile({ label, data, tone }: { label: string; data: DirStat; tone: "emerald" | "rose" }) {
  const toneCls = tone === "emerald" ? "border-emerald-200 bg-emerald-50/50 text-emerald-700" : "border-rose-200 bg-rose-50/50 text-rose-700";
  return (
    <div className={`rounded-lg border ${toneCls} p-3 flex flex-col justify-between`}>
      <div className={`text-[10px] ${MONO} tracking-widest uppercase font-bold`}>{label}</div>
      <div className="space-y-1">
        <div className={`text-2xl font-bold tabular-nums ${MONO}`}>{data.total > 0 ? `${data.winRate.toFixed(0)}%` : "—"}</div>
        <div className="text-[10px] opacity-75">{data.total} trades · ${data.netPnl.toFixed(2)}</div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
      <BarChart3Icon />
      <h3 className={`text-sm font-bold ${MONO} text-zinc-900 mt-3`}>No trades logged yet</h3>
      <p className="text-[13px] text-zinc-500 mt-1 max-w-md mx-auto">
        Save trades from the Signal Desk or log them manually in the Trades tab. Analytics unlock after 3+ closed trades.
      </p>
    </div>
  );
}

function BarChart3Icon() {
  return (
    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
      <Activity className="h-6 w-6 text-zinc-400" />
    </div>
  );
}
