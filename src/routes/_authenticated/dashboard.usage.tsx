import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getUsageStats } from "@/lib/usage.functions";

export const Route = createFileRoute("/_authenticated/dashboard/usage")({
  head: () => ({
    meta: [
      { title: "Wallet Usage — Jenvu" },
      { name: "description", content: "Track your USD wallet usage, per-scan model + cost history." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UsagePage,
});

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

const REASON_LABEL: Record<string, string> = {
  ai_scan: "AI scan",
  signal: "Signal scan",
  ict_narration: "ICT narration",
  alert: "Alert broadcast",
  voice_query: "Voice query",
  monthly_reset: "Monthly reset",
  monthly_grant: "Monthly wallet",
  plan_change: "Plan change",
  topup: "Top-up",
  referral_bonus: "Referral bonus",
  signup_grant: "Signup bonus",
  usd_migration: "Wallet migration",
};

function label(reason: string) {
  return REASON_LABEL[reason] ?? reason.replace(/_/g, " ");
}

function fmtUsd(n: number, decimals = 4) {
  if (!Number.isFinite(n)) return "$0.0000";
  const abs = Math.abs(n);
  const d = abs >= 1 ? 2 : decimals;
  return `$${n.toFixed(d)}`;
}

function UsagePage() {
  const fetchStats = useServerFn(getUsageStats);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["usage-stats"],
    queryFn: () => fetchStats(),
    staleTime: 15_000,
  });
  const [showAll, setShowAll] = useState(false);

  const maxDaily = useMemo(() => {
    if (!data) return 1;
    return Math.max(0.01, ...data.daily.map((d) => d.spent + d.earned));
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <p className="text-sm text-zinc-600">Failed to load usage data.</p>
        <button onClick={() => refetch()} className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">
          Retry
        </button>
      </div>
    );
  }

  const remaining = Math.max(0, Math.min(data.balance, data.allowance));
  const pct = data.allowance > 0 ? Math.min(100, Math.round((remaining / data.allowance) * 100)) : 0;
  const usedPct = 100 - pct;
  const resetsAt = data.periodResetsAt ? new Date(data.periodResetsAt) : null;
  const ledger = showAll ? data.ledger : data.ledger.slice(0, 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="pl-1 text-2xl font-semibold text-zinc-900">Wallet usage</h1>
        <p className="mt-1 text-sm text-zinc-500">Actual $ cost per scan · model used · tokens processed.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Balance" value={fmtUsd(remaining, 2)} sub={`of ${fmtUsd(data.allowance, 2)}`} accent="emerald" />
        <StatCard label="Spent this period" value={fmtUsd(data.spentThisPeriod)} sub={`${usedPct}% of wallet`} accent="rose" />
        <StatCard label="Added" value={fmtUsd(data.earnedThisPeriod, 2)} sub="top-ups, resets, bonuses" accent="blue" />
        <StatCard
          label="Resets"
          value={resetsAt ? resetsAt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
          sub={resetsAt ? `in ${Math.max(0, Math.ceil((resetsAt.getTime() - Date.now()) / 86400000))} days` : ""}
          accent="zinc"
        />
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-baseline justify-between">
          <div className={`${MONO} text-[10px] uppercase tracking-[0.25em] text-zinc-500`}>Balance</div>
          <div className="text-sm text-zinc-600 tabular-nums">
            <span className="font-semibold text-zinc-900">{fmtUsd(remaining, 2)}</span> / {fmtUsd(data.allowance, 2)}
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full bg-zinc-900 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className={`${MONO} text-[10px] uppercase tracking-[0.25em] text-zinc-500`}>Last 30 days</div>
          <div className="flex items-center gap-3 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-rose-500" /> Spent</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Added</span>
          </div>
        </div>
        <div className="mt-5 flex h-32 items-end gap-1">
          {data.daily.map((d) => {
            const totalH = ((d.spent + d.earned) / maxDaily) * 100;
            const spentH = d.spent + d.earned > 0 ? (d.spent / (d.spent + d.earned)) * totalH : 0;
            const earnedH = totalH - spentH;
            return (
              <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end">
                <div className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-[10px] text-white group-hover:block">
                  {new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · −{fmtUsd(d.spent)} / +{fmtUsd(d.earned)}
                </div>
                <div className="flex w-full flex-col justify-end" style={{ height: "100%" }}>
                  {earnedH > 0 && <div className="w-full bg-emerald-500" style={{ height: `${earnedH}%` }} />}
                  {spentH > 0 && <div className="w-full bg-rose-500" style={{ height: `${spentH}%` }} />}
                  {totalH === 0 && <div className="w-full bg-zinc-100" style={{ height: "2px" }} />}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className={`${MONO} text-[10px] uppercase tracking-[0.25em] text-zinc-500`}>Activity log</div>
          <div className="text-[11px] text-zinc-500">{data.ledger.length} entries · model + cost per row</div>
        </div>
        {data.ledger.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-500">No activity yet.</p>
        ) : (
          <>
            <div className="mt-4 max-h-[520px] overflow-y-auto divide-y divide-zinc-100 rounded-lg border border-zinc-200 [scrollbar-width:thin]">
              {ledger.map((r) => {
                const d = new Date(r.created_at);
                const isSpend = r.delta < 0;
                const model = r.model ?? null;
                const stage = r.stage ?? null;
                const toks = (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);
                return (
                  <div key={r.id} className="flex flex-col gap-1 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`${MONO} shrink-0 text-[10px] uppercase tracking-wider text-zinc-500 tabular-nums`}>
                          {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="text-zinc-800 font-medium">{label(r.reason)}</span>
                        {stage && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-600">{stage}</span>}
                      </div>
                      {(model || toks > 0) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-zinc-500">
                          {model && <span className={`${MONO} truncate`}>{model}</span>}
                          {toks > 0 && <span className="tabular-nums">{r.prompt_tokens ?? 0} in · {r.completion_tokens ?? 0} out</span>}
                          {r.raw_cost_usd != null && <span className="tabular-nums">raw {fmtUsd(Number(r.raw_cost_usd))}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span className={`font-semibold ${isSpend ? "text-rose-600" : "text-emerald-600"}`}>
                        {isSpend ? "−" : "+"}{fmtUsd(Math.abs(r.delta))}
                      </span>
                      <span className="text-[10px] text-zinc-400">bal {fmtUsd(Number(r.balance_after), 2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {data.ledger.length > 20 && (
              <div className="mt-3 flex justify-center">
                <button type="button" onClick={() => setShowAll((v) => !v)}
                  className="text-xs font-medium text-zinc-700 hover:text-zinc-900">
                  {showAll ? "Show less" : `Show more (${data.ledger.length - 20})`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: React.ReactNode; sub?: string;
  accent: "emerald" | "rose" | "blue" | "zinc";
}) {
  const dot = { emerald: "bg-emerald-500", rose: "bg-rose-500", blue: "bg-blue-500", zinc: "bg-zinc-400" }[accent];
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className={`${MONO} text-[10px] uppercase tracking-[0.2em] text-zinc-500`}>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}
