import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_FACTOR_WEIGHTS, type FactorWeightsByAsset } from "@/lib/analysis/engine";
import { fetchBacktestSeries, simulateOnCandles } from "@/lib/backtest-historical.functions";

/**
 * Monthly automated re-tuning (Phase 5).
 *
 * Flow:
 *   1. Sanity-gate on live paper-trade outcomes over the last 30 days — if
 *      the current active weights are already meeting targets and sample is
 *      thin, skip retuning to avoid churn.
 *   2. Grid search on historical candles → best candidate config saved.
 *   3. Walk-forward K-fold validation on the candidate against the active
 *      baseline. Must beat baseline in ≥3/5 folds and clear aggregate
 *      win-rate / avg-R minimums.
 *   4. If passed → retire current active, activate new config, invalidate
 *      weights cache. Otherwise → leave candidate in the review queue.
 *
 * Triggered by pg_cron on the 1st of each month at 03:00 UTC. Secured with
 * the Supabase publishable key in the `apikey` header (matches the pattern
 * used by paper-trade-resolver and auto-scan).
 */

const SYMBOL = "XAUUSD";
const THRESHOLD = 62;

const K_FOLDS = 5;
const MIN_FOLD_WINS = 3;
const MIN_AGG_WIN_RATE = 50;
const MIN_AGG_AVG_R = 0.15;

// Skip retune if live paper trades already show healthy performance with
// enough sample. Prevents unnecessary churn on already-good weights.
const SKIP_IF_LIVE_WIN_RATE_ABOVE = 60;
const SKIP_IF_LIVE_AVG_R_ABOVE = 0.35;
const SKIP_MIN_LIVE_SAMPLE = 25;

export const Route = createFileRoute("/api/public/hooks/monthly-retune")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apikey || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ---------- Step 1: Live paper-trade sanity gate ----------
        const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
        const { data: liveRows } = await supabaseAdmin
          .from("signal_paper_trades")
          .select("outcome, realized_r")
          .gte("fired_at", since30d)
          .limit(5000);

        let liveWins = 0, liveLosses = 0, liveRSum = 0, liveResolved = 0;
        for (const r of liveRows ?? []) {
          if (r.outcome === "win") { liveWins++; liveResolved++; liveRSum += Number(r.realized_r ?? 0); }
          else if (r.outcome === "loss") { liveLosses++; liveResolved++; liveRSum += Number(r.realized_r ?? 0); }
        }
        const liveWinRate = liveResolved > 0 ? (liveWins / liveResolved) * 100 : null;
        const liveAvgR = liveResolved > 0 ? liveRSum / liveResolved : null;
        const skipDueToHealth =
          liveResolved >= SKIP_MIN_LIVE_SAMPLE &&
          (liveWinRate ?? 0) >= SKIP_IF_LIVE_WIN_RATE_ABOVE &&
          (liveAvgR ?? 0) >= SKIP_IF_LIVE_AVG_R_ABOVE;

        if (skipDueToHealth) {
          return Response.json({
            ok: true,
            skipped: true,
            reason: "Live paper-trade performance already healthy",
            live: { winRate: liveWinRate, avgR: liveAvgR, sample: liveResolved },
          });
        }

        // ---------- Step 2: Grid search ----------
        const { data: activeRow } = await supabaseAdmin
          .from("signal_weight_configs")
          .select("id, version, weights")
          .eq("status", "active")
          .maybeSingle();
        const base: FactorWeightsByAsset =
          (activeRow?.weights as unknown as FactorWeightsByAsset) ?? DEFAULT_FACTOR_WEIGHTS;

        const { inst, ltf, htf } = await fetchBacktestSeries(SYMBOL);
        if (ltf.length < 400 || htf.length < 60) {
          return Response.json({ ok: false, error: "Not enough historical candles" }, { status: 400 });
        }

        const rangeStart = new Date(ltf[0].t).toISOString();
        const rangeEnd = new Date(ltf[ltf.length - 1].t).toISOString();

        const { data: gridRun } = await supabaseAdmin
          .from("signal_weight_tuning_runs")
          .insert({
            mode: "grid",
            symbol: SYMBOL,
            range_start: rangeStart,
            range_end: rangeEnd,
            combinations_tested: 0,
            status: "running",
            created_by: null,
          })
          .select("id")
          .single();
        const gridRunId = gridRun?.id as string | undefined;

        const MULTIPLIERS = [0.7, 1.0, 1.4] as const;
        const V = ["bias", "sweep", "zone"] as const;
        type Cand = { weights: FactorWeightsByAsset; multipliers: Record<string, number> };
        const candidates: Cand[] = [];
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

        type Scored = {
          multipliers: Record<string, number>;
          weights: FactorWeightsByAsset;
          winRate: number | null; avgR: number | null; sample: number; score: number;
        };
        const scored: Scored[] = [];
        for (const c of candidates) {
          const sim = simulateOnCandles({
            ltf, htf, kind: inst.kind as any,
            threshold: THRESHOLD, decimals: inst.decimals,
            weightsOverride: c.weights,
          });
          const decided = sim.wins + sim.losses;
          const score = (sim.avgR ?? 0) * Math.sqrt(Math.max(0, decided));
          scored.push({
            multipliers: c.multipliers, weights: c.weights,
            winRate: sim.winRate, avgR: sim.avgR, sample: decided, score,
          });
        }
        scored.sort((a, b) => (b.score - a.score) || ((b.winRate ?? 0) - (a.winRate ?? 0)));
        const best = scored[0];

        const { data: maxRow } = await supabaseAdmin
          .from("signal_weight_configs")
          .select("version")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextVersion = (maxRow?.version ?? 0) + 1;

        const { data: newCfg } = await supabaseAdmin
          .from("signal_weight_configs")
          .insert({
            version: nextVersion,
            weights: best.weights as any,
            status: "candidate",
            created_by: "grid_search",
            notes: `Monthly auto-retune · winRate=${best.winRate?.toFixed(1) ?? "-"}% · avgR=${best.avgR?.toFixed(2) ?? "-"} · sample=${best.sample}`,
          })
          .select("id")
          .single();
        const candidateId = newCfg?.id as string | undefined;

        if (gridRunId) {
          await supabaseAdmin
            .from("signal_weight_tuning_runs")
            .update({
              combinations_tested: candidates.length,
              best_config_id: candidateId ?? null,
              metrics: {
                winRate: best.winRate, avgR: best.avgR,
                sample: best.sample, score: best.score,
                top: scored.slice(0, 5),
              } as any,
              status: "completed",
              finished_at: new Date().toISOString(),
            })
            .eq("id", gridRunId);
        }

        if (!candidateId) {
          return Response.json({ ok: false, error: "Failed to persist candidate" }, { status: 500 });
        }

        // ---------- Step 3: Walk-forward validation ----------
        const baselineWeights: FactorWeightsByAsset =
          (activeRow?.weights as unknown as FactorWeightsByAsset) ?? DEFAULT_FACTOR_WEIGHTS;
        const candidateWeights = best.weights;
        const start = ltf[0].t;
        const end = ltf[ltf.length - 1].t;
        const foldSpanMs = Math.floor((end - start) / K_FOLDS);

        const { data: wfRun } = await supabaseAdmin
          .from("signal_weight_tuning_runs")
          .insert({
            mode: "walk_forward",
            symbol: SYMBOL,
            range_start: new Date(start).toISOString(),
            range_end: new Date(end).toISOString(),
            combinations_tested: K_FOLDS,
            status: "running",
            created_by: null,
            best_config_id: candidateId,
          })
          .select("id")
          .single();
        const wfRunId = wfRun?.id as string | undefined;

        let aggCandWins = 0, aggCandLosses = 0, aggCandR = 0, aggCandTrades = 0;
        let foldWins = 0;
        const foldReports: any[] = [];

        for (let f = 0; f < K_FOLDS; f++) {
          const foldStart = start + f * foldSpanMs;
          const foldEnd = f === K_FOLDS - 1 ? end : start + (f + 1) * foldSpanMs;
          const timeFilter = (t: number) => t >= foldStart && t < foldEnd;

          const candSim = simulateOnCandles({
            ltf, htf, kind: inst.kind as any, threshold: THRESHOLD, decimals: inst.decimals,
            weightsOverride: candidateWeights, timeFilter,
          });
          const baseSim = simulateOnCandles({
            ltf, htf, kind: inst.kind as any, threshold: THRESHOLD, decimals: inst.decimals,
            weightsOverride: baselineWeights, timeFilter,
          });
          const candDecided = candSim.wins + candSim.losses;
          const beats = candDecided >= 3 && (candSim.avgR ?? 0) > (baseSim.avgR ?? 0);
          if (beats) foldWins++;

          aggCandWins += candSim.wins;
          aggCandLosses += candSim.losses;
          aggCandR += (candSim.avgR ?? 0) * candSim.trades.length;
          aggCandTrades += candSim.trades.length;

          foldReports.push({
            fold: f,
            candWinRate: candSim.winRate, candAvgR: candSim.avgR, candSample: candDecided,
            baseWinRate: baseSim.winRate, baseAvgR: baseSim.avgR,
            candBeatsBaseline: beats,
          });

          if (wfRunId) {
            await supabaseAdmin.from("signal_weight_window_results").insert({
              run_id: wfRunId,
              config_id: candidateId,
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
                candidate: { winRate: candSim.winRate, avgR: candSim.avgR, sample: candDecided },
                baseline: { winRate: baseSim.winRate, avgR: baseSim.avgR },
              } as any,
            });
          }
        }

        const aggDecided = aggCandWins + aggCandLosses;
        const aggWinRate = aggDecided > 0 ? (aggCandWins / aggDecided) * 100 : null;
        const aggAvgR = aggCandTrades > 0 ? aggCandR / aggCandTrades : null;
        const passed =
          foldWins >= MIN_FOLD_WINS &&
          (aggWinRate ?? 0) >= MIN_AGG_WIN_RATE &&
          (aggAvgR ?? 0) >= MIN_AGG_AVG_R;

        const summary = {
          folds: K_FOLDS, foldWinsForCandidate: foldWins,
          minFoldWins: MIN_FOLD_WINS,
          aggWinRate, aggAvgR, aggSample: aggDecided,
          thresholds: { minAggWinRate: MIN_AGG_WIN_RATE, minAggAvgR: MIN_AGG_AVG_R },
          passed,
          baselineVersion: activeRow?.version ?? null,
          symbol: SYMBOL, fold_reports: foldReports,
          live_gate: { winRate: liveWinRate, avgR: liveAvgR, sample: liveResolved },
        };

        await supabaseAdmin
          .from("signal_weight_configs")
          .update({
            validated: passed,
            validated_at: passed ? new Date().toISOString() : null,
            validation_summary: summary as any,
          })
          .eq("id", candidateId);

        if (wfRunId) {
          await supabaseAdmin
            .from("signal_weight_tuning_runs")
            .update({
              metrics: summary as any,
              status: "completed",
              finished_at: new Date().toISOString(),
            })
            .eq("id", wfRunId);
        }

        // ---------- Step 4: Auto-activate if passed ----------
        let activated = false;
        if (passed) {
          await supabaseAdmin
            .from("signal_weight_configs")
            .update({ status: "retired", retired_at: new Date().toISOString() })
            .eq("status", "active");
          await supabaseAdmin
            .from("signal_weight_configs")
            .update({ status: "active", activated_at: new Date().toISOString() })
            .eq("id", candidateId);
          const { invalidateActiveWeightsCache } = await import("@/lib/tuning/weights.server");
          invalidateActiveWeightsCache();
          activated = true;
        }

        return Response.json({
          ok: true,
          skipped: false,
          candidateId,
          candidateVersion: nextVersion,
          gridBest: { winRate: best.winRate, avgR: best.avgR, sample: best.sample },
          walkForward: { passed, foldWins, aggWinRate, aggAvgR, aggSample: aggDecided },
          activated,
          live: { winRate: liveWinRate, avgR: liveAvgR, sample: liveResolved },
        });
      },
    },
  },
});
