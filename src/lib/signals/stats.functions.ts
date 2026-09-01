import { createServerFn } from "@tanstack/react-start";

export type SignalPerformance = {
  windowDays: number;
  resolved: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  bySession: Array<{ key: string; resolved: number; winRate: number; avgR: number; confBump: number }>;
  byFactor: Array<{ key: string; resolved: number; winRate: number; avgR: number }>;
};

/**
 * Public, aggregate-only signal performance (rolling window). No user data,
 * no per-ticket rows — safe to show on the signal page.
 */
export const getSignalPerformance = createServerFn({ method: "GET" })
  .inputValidator((d: { days?: number } | undefined) => ({ days: Number(d?.days ?? 30) }))
  .handler(async ({ data }): Promise<SignalPerformance> => {
    const days = Math.max(7, Math.min(90, Number.isFinite(data.days) ? data.days : 30));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeCalibration } = await import("@/lib/signals/calibration.server");
    const report = await computeCalibration(supabaseAdmin as never, days);
    return {
      windowDays: report.windowDays,
      resolved: report.overall.resolved,
      wins: report.overall.wins,
      losses: report.overall.resolved - report.overall.wins,
      winRate: report.overall.winRate,
      avgR: report.overall.avgR,
      bySession: report.bySession.map((s) => ({
        key: s.key,
        resolved: s.resolved,
        winRate: s.winRate,
        avgR: s.avgR,
        confBump: s.confBump,
      })),
      byFactor: report.byFactor.map((f) => ({
        key: f.key,
        resolved: f.resolved,
        winRate: f.winRate,
        avgR: f.avgR,
      })),
    };
  });
