import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MIN_CONFIDENCE,
  COUNTER_TREND_MIN_CONFIDENCE,
  OUTSIDE_KILLZONE_MIN_CONFIDENCE,
  MIN_RR,
} from "@/lib/signals/qualification";

export type ReplayBucket = {
  label: string;
  taken: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  expectancyR: number;
};

export type ReplayResult = {
  windowDays: number;
  totalResolved: number;
  before: ReplayBucket;
  after: ReplayBucket;
  filteredOut: Array<{ reason: string; count: number; wins: number; losses: number }>;
  note: string;
};

type Row = {
  outcome: string | null;
  realized_r: number | null;
  confidence: number | null;
  rr: number | null;
  grade: string | null;
  htf_bias: string | null;
  direction: string;
  killzone: string | null;
  session: string | null;
  gates: unknown;
};

function bucket(label: string, rows: Row[]): ReplayBucket {
  const wins = rows.filter((r) => r.outcome === "win").length;
  const losses = rows.filter((r) => r.outcome === "loss" || r.outcome === "timeout").length;
  const taken = wins + losses;
  const rs = rows.map((r) => Number(r.realized_r)).filter((n) => Number.isFinite(n));
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  return {
    label,
    taken,
    wins,
    losses,
    winRate: taken ? Number((wins / taken).toFixed(4)) : 0,
    avgR: Number(avgR.toFixed(3)),
    expectancyR: Number((avgR * (taken ? 1 : 0)).toFixed(3)),
  };
}

/**
 * Replays stored, already-resolved paper trades through the CURRENT gate set
 * and reports the before/after win rate. Historic rows do not carry engine
 * setupChecks, so the confluence layer cannot be replayed — only the gates
 * whose inputs were persisted (confidence, HTF alignment, killzone, R:R).
 * That makes this a conservative lower bound of the real improvement.
 */
export const replayGateVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number } | undefined) => ({ days: Number(d?.days ?? 60) }))
  .handler(async ({ data, context }): Promise<ReplayResult> => {
    const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
    const ok = await isAdminOrOpsUnlocked(context.supabase, context.userId);
    if (!ok) throw new Error("Forbidden");

    const days = Math.max(7, Math.min(180, Number.isFinite(data.days) ? data.days : 60));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: raw } = await supabaseAdmin
      .from("signal_paper_trades")
      .select("outcome, realized_r, confidence, rr, grade, htf_bias, direction, killzone, session, gates")
      .gte("fired_at", since)
      .in("outcome", ["win", "loss", "timeout"])
      .limit(5000);

    const rows = (raw ?? []) as Row[];
    const rejects = new Map<string, Row[]>();
    const kept: Row[] = [];

    for (const r of rows) {
      const conf = Number(r.confidence ?? 0);
      const kz = String(r.killzone ?? "").toLowerCase();
      const inKz = !!kz && kz !== "none" && kz !== "off" && !kz.includes("outside");
      const bias = String(r.htf_bias ?? "neutral").toLowerCase();
      const aligned =
        (r.direction === "BUY" && bias === "bullish") || (r.direction === "SELL" && bias === "bearish");
      const rr = Number(r.rr ?? 0);

      let reason: string | null = null;
      if (conf < MIN_CONFIDENCE) reason = "below_threshold";
      else if (!aligned && conf < COUNTER_TREND_MIN_CONFIDENCE) reason = "htf_bias_conflict";
      else if (!inKz && conf < OUTSIDE_KILLZONE_MIN_CONFIDENCE) reason = "outside_killzone";
      else if (rr > 0 && rr < MIN_RR) reason = "rr_below_floor";

      if (reason) {
        if (!rejects.has(reason)) rejects.set(reason, []);
        rejects.get(reason)!.push(r);
      } else {
        kept.push(r);
      }
    }

    return {
      windowDays: days,
      totalResolved: rows.length,
      before: bucket("All broadcast signals", rows),
      after: bucket("Passing current gates", kept),
      filteredOut: Array.from(rejects.entries()).map(([reason, list]) => ({
        reason,
        count: list.length,
        wins: list.filter((r) => r.outcome === "win").length,
        losses: list.filter((r) => r.outcome !== "win").length,
      })),
      note:
        "Historic rows lack engine setup-checks, so the 4/5 confluence and regime gates are NOT replayed — real filtering is stricter than shown.",
    };
  });
