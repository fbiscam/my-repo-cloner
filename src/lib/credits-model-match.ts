export type AiCostLogRow = {
  id: string;
  created_at: string;
  stage: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
};

export type MatchedAiModels = {
  primary?: AiCostLogRow;
  senior?: AiCostLogRow;
  seniors?: AiCostLogRow[];
};

const PRIMARY_AI_STAGES = new Set(["signal-narration", "chat-signal"]);
const SENIOR_AI_STAGES = new Set(["senior-review"]);

function getMetaScanId(row: any): string | null {
  const scanId = row?.metadata?.scanId ?? row?.metadata?.scan_id;
  return typeof scanId === "string" && scanId.trim() ? scanId.trim() : null;
}

function getLogScanId(log: AiCostLogRow): string | null {
  const anyLog = log as AiCostLogRow & { metadata?: Record<string, unknown> | null; scan_id?: string | null };
  const scanId = anyLog.metadata?.scanId ?? anyLog.metadata?.scan_id ?? anyLog.scan_id;
  return typeof scanId === "string" && scanId.trim() ? scanId.trim() : null;
}

export function matchActualAiModels(ledgerRows: any[], aiLogs: AiCostLogRow[]): Map<string, MatchedAiModels> {
  const matches = new Map<string, MatchedAiModels>();
  const usedPrimary = new Set<string>();
  const usedSenior = new Set<string>();
  const scanRows = ledgerRows
    .filter((r) => Number(r.delta) < 0 && r.reason === "ai_scan")
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const pickNearestPrior = (row: any, stages: Set<string>, used: Set<string>) => {
    const rowTime = new Date(row.created_at).getTime();
    const rowScanId = getMetaScanId(row);
    const exactWindowMs = rowScanId ? 6 * 60_000 : 2 * 60_000;
    let best: AiCostLogRow | undefined;
    for (const log of aiLogs) {
      if (!log.id || used.has(log.id) || !log.model || !stages.has(String(log.stage ?? ""))) continue;
      const logScanId = getLogScanId(log);
      if (rowScanId && logScanId && rowScanId !== logScanId) continue;
      const logTime = new Date(log.created_at).getTime();
      const delta = rowTime - logTime;
      if (delta < -30_000 || delta > exactWindowMs) continue;
      if (!best || logTime > new Date(best.created_at).getTime()) best = log;
    }
    if (best?.id) used.add(best.id);
    return best;
  };

  const pickAllForScan = (row: any, stages: Set<string>, used: Set<string>) => {
    const rowScanId = getMetaScanId(row);
    if (!rowScanId) return [] as AiCostLogRow[];
    const matched: AiCostLogRow[] = [];
    for (const log of aiLogs) {
      if (!log.id || used.has(log.id) || !log.model || !stages.has(String(log.stage ?? ""))) continue;
      if (getLogScanId(log) !== rowScanId) continue;
      matched.push(log);
      used.add(log.id);
    }
    return matched;
  };

  for (const row of scanRows) {
    const seniors = pickAllForScan(row, SENIOR_AI_STAGES, usedSenior);
    const seniorFallback = seniors.length ? undefined : pickNearestPrior(row, SENIOR_AI_STAGES, usedSenior);
    matches.set(row.id, {
      primary: pickNearestPrior(row, PRIMARY_AI_STAGES, usedPrimary),
      senior: seniors[0] ?? seniorFallback,
      seniors: seniors.length ? seniors : (seniorFallback ? [seniorFallback] : []),
    });
  }
  return matches;
}