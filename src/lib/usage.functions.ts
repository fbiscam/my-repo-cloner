import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LedgerRow = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
  model?: string | null;
  stage?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  raw_cost_usd?: number | null;
};

export type DailyBucket = { date: string; spent: number; earned: number };
export type ReasonBucket = { reason: string; scans: number };

export type UsageStats = {
  balance: number;
  allowance: number;
  periodResetsAt: string | null;
  periodStart: string | null;
  spentThisPeriod: number;
  earnedThisPeriod: number;
  daily: DailyBucket[];
  byReason: ReasonBucket[];
  ledger: LedgerRow[];
};

export const getUsageStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageStats> => {
    const { supabase, userId } = context;

    const [{ data: bal }, { data: ledger }] = await Promise.all([
      supabase
        .from("credit_balances")
        .select("balance, monthly_allowance, period_resets_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("credit_ledger")
        .select("id, delta, reason, balance_after, created_at, model, stage, prompt_tokens, completion_tokens, raw_cost_usd")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const balance = Number(bal?.balance ?? 0);
    const allowance = Number(bal?.monthly_allowance ?? 0);
    const periodResetsAt = bal?.period_resets_at ?? null;
    const periodStart: string | null = periodResetsAt
      ? new Date(new Date(periodResetsAt).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const rows: LedgerRow[] = (ledger ?? []).map((r: any) => ({
      id: r.id,
      delta: Number(r.delta),
      reason: r.reason,
      balance_after: Number(r.balance_after),
      created_at: r.created_at,
      model: r.model ?? null,
      stage: r.stage ?? null,
      prompt_tokens: r.prompt_tokens ?? null,
      completion_tokens: r.completion_tokens ?? null,
      raw_cost_usd: r.raw_cost_usd == null ? null : Number(r.raw_cost_usd),
    }));

    // Period window
    const start = periodStart ? new Date(periodStart).getTime() : 0;
    const inPeriod = rows.filter((r) => new Date(r.created_at).getTime() >= start);

    let spentThisPeriod = 0;
    let earnedThisPeriod = 0;
    for (const r of inPeriod) {
      if (r.delta < 0) spentThisPeriod += Math.abs(r.delta);
      else earnedThisPeriod += r.delta;
    }

    // Daily buckets — last 30 days
    const dayMap = new Map<string, DailyBucket>();
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { date: key, spent: 0, earned: 0 });
    }
    for (const r of rows) {
      const key = r.created_at.slice(0, 10);
      const b = dayMap.get(key);
      if (!b) continue;
      if (r.delta < 0) b.spent += Math.abs(r.delta);
      else b.earned += r.delta;
    }

    // Breakdown by reason (spent only, this period)
    const reasonMap = new Map<string, number>();
    for (const r of inPeriod) {
      if (r.delta >= 0) continue;
      reasonMap.set(r.reason, (reasonMap.get(r.reason) ?? 0) + Math.abs(r.delta));
    }
    const byReason = Array.from(reasonMap.entries())
      .map(([reason, scans]) => ({ reason, scans }))
      .sort((a, b) => b.scans - a.scans);

    return {
      balance,
      allowance,
      periodResetsAt,
      periodStart,
      spentThisPeriod,
      earnedThisPeriod,
      daily: Array.from(dayMap.values()),
      byReason,
      ledger: rows,
    };
  });
