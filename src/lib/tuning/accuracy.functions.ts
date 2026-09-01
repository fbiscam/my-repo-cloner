import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface GradeRow {
  grade: string;
  total: number;
  wins: number;
  losses: number;
  timeouts: number;
  pending: number;
  win_rate: number;
  avg_r: number;
  expectancy_r: number;
}

interface AccuracyResult {
  overall: {
    total: number;
    resolved: number;
    win_rate: number;
    avg_r: number;
    expectancy_r: number;
  };
  by_grade: GradeRow[];
  by_pair: Array<{ pair: string; total: number; win_rate: number; avg_r: number }>;
  by_direction: Array<{ direction: string; total: number; win_rate: number; avg_r: number }>;
  recent_30d: {
    win_rate: number;
    avg_r: number;
    total: number;
  };
  drift_warning: string | null;
  baseline_win_rate: number | null;
  window_days: number;
}

export const getAccuracyReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<AccuracyResult> => {
    // Admin gate (ops-console session also allowed)
    const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
    const ok = await isAdminOrOpsUnlocked(context.supabase, context.userId);
    if (!ok) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const days = Math.max(1, Math.min(180, Number(data.days ?? 90)));
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const { data: rows } = await supabaseAdmin
      .from("signal_paper_trades")
      .select("pair, direction, grade, outcome, realized_r, fired_at")
      .gte("fired_at", since)
      .limit(5000);

    type Row = {
      pair: string;
      direction: string;
      grade: string | null;
      outcome: string | null;
      realized_r: number | null;
      fired_at: string;
    };
    const all = (rows ?? []) as Row[];

    const agg = (list: Row[]) => {
      const total = list.length;
      const wins = list.filter((r) => r.outcome === "win").length;
      const losses = list.filter((r) => r.outcome === "loss").length;
      const timeouts = list.filter((r) => r.outcome === "timeout").length;
      const pending = list.filter((r) => r.outcome === "pending").length;
      const resolved = wins + losses + timeouts;
      const win_rate = resolved > 0 ? wins / resolved : 0;
      const rs = list
        .filter((r) => r.realized_r != null)
        .map((r) => Number(r.realized_r));
      const avg_r = rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
      const expectancy_r = avg_r;
      return { total, wins, losses, timeouts, pending, win_rate, avg_r, expectancy_r };
    };

    const overall = agg(all);

    const grades = ["A+", "A", "B", "C"];
    const by_grade = grades.map((g) => {
      const list = all.filter((r) => r.grade === g);
      const a = agg(list);
      return {
        grade: g,
        total: a.total,
        wins: a.wins,
        losses: a.losses,
        timeouts: a.timeouts,
        pending: a.pending,
        win_rate: a.win_rate,
        avg_r: a.avg_r,
        expectancy_r: a.expectancy_r,
      };
    });

    const pairs = Array.from(new Set(all.map((r) => r.pair)));
    const by_pair = pairs
      .map((p) => {
        const a = agg(all.filter((r) => r.pair === p));
        return {
          pair: p,
          total: a.total,
          win_rate: a.win_rate,
          avg_r: a.avg_r,
        };
      })
      .sort((a, b) => b.total - a.total);

    const by_direction = ["BUY", "SELL"].map((d) => {
      const a = agg(all.filter((r) => r.direction === d));
      return { direction: d, total: a.total, win_rate: a.win_rate, avg_r: a.avg_r };
    });

    const cutoff30 = Date.now() - 30 * 86400_000;
    const recent = all.filter((r) => new Date(r.fired_at).getTime() >= cutoff30);
    const recentAgg = agg(recent);

    // Baseline: use the active tuning config's validation summary if
    // available, otherwise fall back to the full window's average.
    let baseline_win_rate: number | null = null;
    try {
      const { data: cfg } = await supabaseAdmin
        .from("signal_weight_configs")
        .select("validation_summary")
        .eq("status", "active")
        .maybeSingle();
      const vs = (cfg?.validation_summary ?? null) as
        | { baseline_win_rate?: number; win_rate?: number }
        | null;
      const b = vs?.baseline_win_rate ?? vs?.win_rate;
      if (typeof b === "number") baseline_win_rate = b;
    } catch {
      // best-effort baseline
    }
    if (baseline_win_rate == null && overall.win_rate > 0) {
      baseline_win_rate = overall.win_rate;
    }

    let drift_warning: string | null = null;
    if (
      baseline_win_rate != null &&
      recentAgg.total >= 20 &&
      recentAgg.win_rate < baseline_win_rate - 0.15
    ) {
      drift_warning = `Recent 30-day win rate (${(recentAgg.win_rate * 100).toFixed(1)}%) is ${((baseline_win_rate - recentAgg.win_rate) * 100).toFixed(1)} points below baseline. Consider re-tuning.`;
    }

    return {
      overall: {
        total: overall.total,
        resolved: overall.wins + overall.losses + overall.timeouts,
        win_rate: overall.win_rate,
        avg_r: overall.avg_r,
        expectancy_r: overall.expectancy_r,
      },
      by_grade,
      by_pair,
      by_direction,
      recent_30d: {
        win_rate: recentAgg.win_rate,
        avg_r: recentAgg.avg_r,
        total: recentAgg.total,
      },
      drift_warning,
      baseline_win_rate,
      window_days: days,
    };
  });
