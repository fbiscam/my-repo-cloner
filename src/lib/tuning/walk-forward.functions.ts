import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_FACTOR_WEIGHTS, type FactorWeightsByAsset } from "@/lib/analysis/engine";
import { fetchBacktestSeries, simulateOnCandles } from "@/lib/backtest-historical.functions";

/**
 * Walk-forward validation.
 *
 * Splits the historical LTF window into K sequential out-of-sample folds and
 * scores both the candidate weights and the current active baseline on each
 * fold. The candidate is considered validated when it beats the baseline on
 * expectancy in ≥ MIN_WINS folds AND clears absolute minimums on aggregate
 * (win-rate + avg R). Only validated candidates can be auto-activated by
 * the scheduler; admins may still override manually.
 */

const K_FOLDS = 5;
const MIN_FOLD_WINS = 3;      // must beat baseline in this many folds
const MIN_AGG_WIN_RATE = 50;  // percent, aggregate across folds
const MIN_AGG_AVG_R = 0.15;   // R multiples

export const runWalkForwardValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { configId: string; symbol?: string; threshold?: number }) => ({
    configId: String(input.configId),
    symbol: String(input.symbol || "XAUUSD").toUpperCase(),
    threshold: typeof input.threshold === "number" ? input.threshold : 75,
  }))
  .handler(async ({ context, data }) => {
    const { data: isAdmin, error: rErr } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (rErr || !isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load candidate + baseline (active) configs
    const { data: cand, error: cErr } = await supabaseAdmin
      .from("signal_weight_configs")
      .select("id, version, status, weights")
      .eq("id", data.configId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cand) throw new Error("Candidate config not found");
    if (cand.status === "retired") throw new Error("Cannot validate a retired config");

    const { data: activeCfg } = await supabaseAdmin
      .from("signal_weight_configs")
      .select("id, version, weights")
      .eq("status", "active")
      .maybeSingle();
    const baselineWeights: FactorWeightsByAsset =
      (activeCfg?.weights as unknown as FactorWeightsByAsset) ?? DEFAULT_FACTOR_WEIGHTS;
    const candidateWeights = cand.weights as unknown as FactorWeightsByAsset;

    // Fetch candles once
    const { inst, ltf, htf } = await fetchBacktestSeries(data.symbol);
    if (ltf.length < 400) throw new Error("Not enough historical candles for K-fold validation");

    const start = ltf[0].t;
    const end = ltf[ltf.length - 1].t;
    const foldSpanMs = Math.floor((end - start) / K_FOLDS);

    // Record run row
    const { data: runRow, error: runErr } = await supabaseAdmin
      .from("signal_weight_tuning_runs")
      .insert({
        mode: "walk_forward",
        symbol: data.symbol,
        range_start: new Date(start).toISOString(),
        range_end: new Date(end).toISOString(),
        combinations_tested: K_FOLDS,
        status: "running",
        created_by: context.userId,
        best_config_id: cand.id,
      })
      .select("id")
      .single();
    if (runErr || !runRow) throw new Error(runErr?.message || "Failed to create tuning run");
    const runId = runRow.id as string;

    const foldReports: Array<{
      fold: number;
      candWinRate: number | null; candAvgR: number | null; candSample: number;
      baseWinRate: number | null; baseAvgR: number | null; baseSample: number;
      candBeatsBaseline: boolean;
      oosStart: string; oosEnd: string;
    }> = [];

    let aggCandWins = 0, aggCandLosses = 0, aggCandR = 0, aggCandTrades = 0;
    let foldWinsForCandidate = 0;

    for (let f = 0; f < K_FOLDS; f++) {
      const foldStart = start + f * foldSpanMs;
      const foldEnd = f === K_FOLDS - 1 ? end : start + (f + 1) * foldSpanMs;
      const timeFilter = (t: number) => t >= foldStart && t < foldEnd;

      const candSim = simulateOnCandles({
        ltf, htf, kind: inst.kind as any,
        threshold: data.threshold, decimals: inst.decimals,
        weightsOverride: candidateWeights, timeFilter,
      });
      const baseSim = simulateOnCandles({
        ltf, htf, kind: inst.kind as any,
        threshold: data.threshold, decimals: inst.decimals,
        weightsOverride: baselineWeights, timeFilter,
      });

      const candDecided = candSim.wins + candSim.losses;
      const baseDecided = baseSim.wins + baseSim.losses;
      const candExpectancy = candSim.avgR ?? 0;
      const baseExpectancy = baseSim.avgR ?? 0;
      // "beats baseline" requires meaningful sample size for candidate.
      const beats = candDecided >= 3 && candExpectancy > baseExpectancy;
      if (beats) foldWinsForCandidate++;

      aggCandWins += candSim.wins;
      aggCandLosses += candSim.losses;
      aggCandR += (candSim.avgR ?? 0) * candSim.trades.length;
      aggCandTrades += candSim.trades.length;

      foldReports.push({
        fold: f,
        candWinRate: candSim.winRate, candAvgR: candSim.avgR, candSample: candDecided,
        baseWinRate: baseSim.winRate, baseAvgR: baseSim.avgR, baseSample: baseDecided,
        candBeatsBaseline: beats,
        oosStart: new Date(foldStart).toISOString(),
        oosEnd: new Date(foldEnd).toISOString(),
      });

      await supabaseAdmin.from("signal_weight_window_results").insert({
        run_id: runId,
        config_id: cand.id,
        fold_index: f,
        in_sample_start: new Date(foldStart).toISOString(),
        in_sample_end: new Date(foldStart).toISOString(),
        oos_start: new Date(foldStart).toISOString(),
        oos_end: new Date(foldEnd).toISOString(),
        in_sample_win_rate: null,
        win_rate: candSim.winRate,
        expectancy_r: candSim.avgR,
        sample_size: candDecided,
        max_drawdown_r: candSim.worstR,
        passed: beats,
        metrics: {
          candidate: { winRate: candSim.winRate, avgR: candSim.avgR, sample: candDecided, worstR: candSim.worstR },
          baseline:  { winRate: baseSim.winRate, avgR: baseSim.avgR, sample: baseDecided, worstR: baseSim.worstR },
        } as any,
      });
    }

    const aggDecided = aggCandWins + aggCandLosses;
    const aggWinRate = aggDecided > 0 ? (aggCandWins / aggDecided) * 100 : null;
    const aggAvgR = aggCandTrades > 0 ? aggCandR / aggCandTrades : null;

    const passed =
      foldWinsForCandidate >= MIN_FOLD_WINS &&
      (aggWinRate ?? 0) >= MIN_AGG_WIN_RATE &&
      (aggAvgR ?? 0) >= MIN_AGG_AVG_R;

    const summary = {
      folds: K_FOLDS,
      foldWinsForCandidate,
      minFoldWins: MIN_FOLD_WINS,
      aggWinRate, aggAvgR, aggSample: aggDecided,
      thresholds: { minAggWinRate: MIN_AGG_WIN_RATE, minAggAvgR: MIN_AGG_AVG_R },
      passed,
      baselineVersion: activeCfg?.version ?? null,
      symbol: data.symbol,
      fold_reports: foldReports,
    };

    // Update candidate config validation state
    await supabaseAdmin
      .from("signal_weight_configs")
      .update({
        validated: passed,
        validated_at: passed ? new Date().toISOString() : null,
        validation_summary: summary as any,
      })
      .eq("id", cand.id);

    await supabaseAdmin
      .from("signal_weight_tuning_runs")
      .update({
        metrics: summary as any,
        status: "completed",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return { ok: true, runId, passed, summary };
  });
