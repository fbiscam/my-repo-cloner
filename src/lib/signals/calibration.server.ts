/**
 * Rolling outcome calibration.
 *
 * Reads resolved `signal_paper_trades` from the last N days and derives:
 *   - per-session win rate / avg R  → a confidence bump for weak sessions
 *   - per-confluence-factor win rate → which ICT factors are actually paying
 *
 * The auto-scan worker calls `getSessionConfidenceBump()` so a session that
 * is under-performing automatically demands a higher confidence before a
 * ticket may broadcast. Nothing here ever LOWERS the global floor.
 */

export const CALIBRATION_WINDOW_DAYS = 30;
/** Target win rate the calibrator pushes each session toward. */
export const TARGET_WIN_RATE = 0.85;
/** Below this many resolved trades a session is not statistically meaningful. */
export const MIN_SAMPLE = 8;
/** Never add more than this many points on top of the configured floor. */
export const MAX_CONF_BUMP = 12;

export type BucketStats = {
  key: string;
  resolved: number;
  wins: number;
  losses: number;
  winRate: number;
  avgR: number;
  /** Extra confidence points required for this bucket (0 when healthy). */
  confBump: number;
};

export type CalibrationReport = {
  windowDays: number;
  generatedAt: string;
  overall: { resolved: number; wins: number; winRate: number; avgR: number };
  bySession: BucketStats[];
  byFactor: BucketStats[];
};

type TradeRow = {
  outcome: string | null;
  realized_r: number | null;
  session: string | null;
  killzone: string | null;
  gates: unknown;
};

const RESOLVED = new Set(["win", "loss", "timeout"]);

export function normalizeSession(session: string | null | undefined, killzone?: string | null): string {
  const raw = String(session ?? killzone ?? "").toLowerCase();
  if (!raw) return "unknown";
  if (raw.includes("overlap")) return "overlap";
  if (raw.includes("ny") || raw.includes("new york")) return "new_york";
  if (raw.includes("london")) return "london";
  if (raw.includes("asia") || raw.includes("tokyo")) return "asia";
  return "off_session";
}

function bump(winRate: number, resolved: number): number {
  if (resolved < MIN_SAMPLE) return 0;
  if (winRate >= TARGET_WIN_RATE) return 0;
  // 10 points of extra confidence for every 25 points of missing win rate.
  const gap = TARGET_WIN_RATE - winRate;
  return Math.min(MAX_CONF_BUMP, Math.round(gap * 40));
}

function summarize(key: string, rows: TradeRow[]): BucketStats {
  const wins = rows.filter((r) => r.outcome === "win").length;
  const losses = rows.filter((r) => r.outcome === "loss" || r.outcome === "timeout").length;
  const resolved = wins + losses;
  const winRate = resolved > 0 ? wins / resolved : 0;
  const rs = rows.map((r) => Number(r.realized_r)).filter((n) => Number.isFinite(n));
  const avgR = rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  return {
    key,
    resolved,
    wins,
    losses,
    winRate: Number(winRate.toFixed(4)),
    avgR: Number(avgR.toFixed(3)),
    confBump: bump(winRate, resolved),
  };
}

function confluencesOf(gates: unknown): string[] {
  const g = gates as { confluences?: unknown } | null;
  const list = Array.isArray(g?.confluences) ? g?.confluences : [];
  return (list as unknown[]).map((x) => String(x)).filter(Boolean);
}

/** Supabase client shape we need — kept structural so admin/user clients both fit. */
type DbLike = {
  from: (t: string) => {
    select: (cols: string) => {
      gte: (
        c: string,
        v: string,
      ) => {
        in: (c: string, v: string[]) => { limit: (n: number) => Promise<{ data: unknown }> };
      };
    };
  };
};

export async function computeCalibration(
  db: DbLike,
  days: number = CALIBRATION_WINDOW_DAYS,
): Promise<CalibrationReport> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await db
    .from("signal_paper_trades")
    .select("outcome, realized_r, session, killzone, gates")
    .gte("fired_at", since)
    .in("outcome", Array.from(RESOLVED))
    .limit(5000);

  const rows = ((data ?? []) as TradeRow[]).filter((r) => RESOLVED.has(String(r.outcome)));

  const sessionMap = new Map<string, TradeRow[]>();
  const factorMap = new Map<string, TradeRow[]>();
  for (const r of rows) {
    const s = normalizeSession(r.session, r.killzone);
    if (!sessionMap.has(s)) sessionMap.set(s, []);
    sessionMap.get(s)!.push(r);
    for (const f of confluencesOf(r.gates)) {
      if (!factorMap.has(f)) factorMap.set(f, []);
      factorMap.get(f)!.push(r);
    }
  }

  const overallStats = summarize("overall", rows);
  return {
    windowDays: days,
    generatedAt: new Date().toISOString(),
    overall: {
      resolved: overallStats.resolved,
      wins: overallStats.wins,
      winRate: overallStats.winRate,
      avgR: overallStats.avgR,
    },
    bySession: Array.from(sessionMap.entries())
      .map(([k, v]) => summarize(k, v))
      .sort((a, b) => b.resolved - a.resolved),
    byFactor: Array.from(factorMap.entries())
      .map(([k, v]) => summarize(k, v))
      .sort((a, b) => b.resolved - a.resolved),
  };
}

/**
 * Extra confidence points required right now, based on the session the scan
 * is running in. Returns 0 when the session is healthy or has no sample.
 */
export function sessionConfidenceBump(report: CalibrationReport, session: string | null | undefined): number {
  const key = normalizeSession(session);
  const row = report.bySession.find((s) => s.key === key);
  return row?.confBump ?? 0;
}
