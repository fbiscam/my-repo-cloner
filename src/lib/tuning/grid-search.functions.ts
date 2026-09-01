import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_FACTOR_WEIGHTS, type FactorWeightsByAsset } from "@/lib/analysis/engine";
import { fetchBacktestSeries, simulateOnCandles } from "@/lib/backtest-historical.functions";

/**
 * Coarse grid search over the 5 core confluence factors, on top of the
 * currently-active weight set. For each candidate, we scale those factors
 * up/down and score the resulting weight table on historical candles.
 * Score = expectancy_r * sqrt(sample_size) — favours real edge, penalises
 * lucky tiny samples. Killzone filter is applied at scan time for gold pairs.
 */
export const runGridSearchTuning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { symbol?: string; threshold?: number }) => ({
    symbol: String(input.symbol || "XAUUSD").toUpperCase(),
    threshold: typeof input.threshold === "number" ? input.threshold : 75,
  }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: rErr } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (rErr || !isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load active weights as the base
    const { data: activeRow } = await supabaseAdmin
      .from("signal_weight_configs")
      .select("id, version, weights")
      .eq("status", "active")
      .maybeSingle();
    const base: FactorWeightsByAsset = (activeRow?.weights as unknown as FactorWeightsByAsset) ?? DEFAULT_FACTOR_WEIGHTS;

    // Fetch candles once
    const { inst, ltf, htf } = await fetchBacktestSeries(data.symbol);
    if (ltf.length < 200 || htf.length < 60) {
      throw new Error("Not enough historical candles to tune weights");
    }

    // Insert run row (running)
    const rangeStart = new Date(ltf[0].t).toISOString();
    const rangeEnd = new Date(ltf[ltf.length - 1].t).toISOString();
    const { data: runRow, error: runErr } = await supabaseAdmin
      .from("signal_weight_tuning_runs")
      .insert({
        mode: "grid",
        symbol: data.symbol,
        range_start: rangeStart,
        range_end: rangeEnd,
        combinations_tested: 0,
        status: "running",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (runErr || !runRow) throw new Error(runErr?.message || "Failed to record tuning run");
    const runId = runRow.id as string;

    // 5 core factors × 3 multipliers = 243 combos. Cap by taking a coarser
    // grid: 3 factors at 3 levels = 27. Keep it fast (< 30s) for one call.
    const CORE = ["bias", "sweep", "zone", "structure", "pd"] as const;
    const MULTIPLIERS = [0.7, 1.0, 1.4] as const;

    type Candidate = { weights: FactorWeightsByAsset; multipliers: Record<string, number> };
    const candidates: Candidate[] = [];
    // Vary the 3 most impactful factors only (bias, sweep, zone). structure & pd stay at base.
    const V = ["bias", "sweep", "zone"];
    for (const mA of MULTIPLIERS) for (const mB of MULTIPLIERS) for (const mC of MULTIPLIERS) {
      const mult: Record<string, number> = { bias: mA, sweep: mB, zone: mC, structure: 1, pd: 1 };
      const next: FactorWeightsByAsset = JSON.parse(JSON.stringify(base));
      for (const k of Object.keys(next) as (keyof FactorWeightsByAsset)[]) {
        for (const f of V) {
          const cur = next[k][f] ?? 0;
          if (cur > 0) next[k][f] = Math.round(cur * mult[f]);
        }
      }
      candidates.push({ weights: next, multipliers: mult });
    }
    void CORE;

    type Scored = {
      idx: number;
      multipliers: Record<string, number>;
      weights: FactorWeightsByAsset;
      winRate: number | null;
      avgR: number | null;
      sample: number;
      score: number;
    };
    const results: Scored[] = [];

    for (let idx = 0; idx < candidates.length; idx++) {
      const cand = candidates[idx];
      const sim = simulateOnCandles({
        ltf, htf, kind: inst.kind as any,
        threshold: data.threshold,
        decimals: inst.decimals,
        weightsOverride: cand.weights,
      });
      const decided = sim.wins + sim.losses;
      const winRate = sim.winRate;
      const avgR = sim.avgR;
      const sample = decided;
      const score = (avgR ?? 0) * Math.sqrt(Math.max(0, sample));
      results.push({
        idx, multipliers: cand.multipliers, weights: cand.weights,
        winRate, avgR, sample, score,
      });
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.winRate ?? 0) - (a.winRate ?? 0);
    });
    const best = results[0];

    // Persist best as a candidate config (next version #)
    const { data: maxRow } = await supabaseAdmin
      .from("signal_weight_configs")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (maxRow?.version ?? 0) + 1;

    const { data: newCfg, error: cfgErr } = await supabaseAdmin
      .from("signal_weight_configs")
      .insert({
        version: nextVersion,
        weights: best.weights as any,
        status: "candidate",
        created_by: "grid_search",
        notes: `Grid ${candidates.length} combos on ${data.symbol} · winRate=${best.winRate?.toFixed(1) ?? "-"}% · avgR=${best.avgR?.toFixed(2) ?? "-"} · sample=${best.sample}`,
      })
      .select("id")
      .single();
    if (cfgErr) throw new Error(cfgErr.message);

    await supabaseAdmin
      .from("signal_weight_tuning_runs")
      .update({
        combinations_tested: candidates.length,
        best_config_id: newCfg?.id ?? null,
        metrics: {
          winRate: best.winRate,
          avgR: best.avgR,
          sample: best.sample,
          score: best.score,
          top: results.slice(0, 5).map((r) => ({
            multipliers: r.multipliers, winRate: r.winRate, avgR: r.avgR, sample: r.sample, score: r.score,
          })),
        } as any,
        status: "completed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return {
      ok: true,
      runId,
      newConfigId: newCfg?.id ?? null,
      newVersion: nextVersion,
      combinations: candidates.length,
      best: {
        winRate: best.winRate,
        avgR: best.avgR,
        sample: best.sample,
        score: best.score,
        multipliers: best.multipliers,
      },
    };
  });
