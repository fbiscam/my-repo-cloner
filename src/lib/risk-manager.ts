// Risk manager: pure functions for position sizing and daily loss limits.
// Used by signal cards, WhatsApp alerts, and auto-scan kill-switch gate.
//
// XAU pairs are quoted per troy ounce. Standard contract = 100 oz / lot.
// So $ risk per lot per unit of price move = 100 * |entry - sl| (in quote currency).
// For non-USD-quoted XAU pairs (XAUEUR, XAUGBP, etc.) we approximate 1 unit of
// quote ≈ $1 for sizing purposes — good enough for a suggested lot size that
// users tune against their broker's true pip value.

export type PositionSize = {
  lots: number;         // suggested lot size (rounded to 2dp)
  units: number;        // total ounces (lots * 100)
  riskUsd: number;      // dollar risk assumed
  stopDistance: number; // absolute price distance to SL
  note: string;         // short human-readable line
};

export function computePositionSize(input: {
  balanceUsd: number;
  riskPct: number;
  entry: number;
  sl: number;
  contractSize?: number; // default 100 for XAU
}): PositionSize | null {
  const { balanceUsd, riskPct, entry, sl } = input;
  const contract = input.contractSize ?? 100;
  if (
    !isFinite(balanceUsd) || balanceUsd <= 0 ||
    !isFinite(riskPct) || riskPct <= 0 ||
    !isFinite(entry) || !isFinite(sl)
  ) return null;

  const stopDist = Math.abs(entry - sl);
  if (stopDist <= 0) return null;

  const riskUsd = (balanceUsd * riskPct) / 100;
  const dollarPerLotPerUnit = contract; // 100 oz per lot
  const rawLots = riskUsd / (stopDist * dollarPerLotPerUnit);
  // Enforce broker minimum 0.01 lot so small accounts ($10) can still trade.
  const lots = Math.max(0.01, Math.round(rawLots * 100) / 100);
  const units = Math.round(lots * contract);
  // Actual $ at risk given the (possibly clamped) lot size.
  const actualRiskUsd = Math.round(lots * contract * stopDist * 100) / 100;
  const clamped = actualRiskUsd > riskUsd + 0.01;

  return {
    lots,
    units,
    riskUsd: Math.round(riskUsd * 100) / 100,
    stopDistance: stopDist,
    note: clamped
      ? `${lots.toFixed(2)} lot · ${units} oz · min-lot risk $${actualRiskUsd.toFixed(2)} (target ${riskPct}% = $${riskUsd.toFixed(2)})`
      : `${lots.toFixed(2)} lot · ${units} oz · risking $${riskUsd.toFixed(2)} (${riskPct}%)`,
  };



}

// Sum realized losses (negative pnl) for today from trade_journal.
// Positive number = today's total loss magnitude.
export async function computeTodayRealizedLoss(
  supabase: {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => {
          gte: (c: string, v: string) => Promise<{ data: Array<{ pnl: number | null }> | null }>;
        };
      };
    };
  },
  userId: string,
): Promise<number> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("trade_journal")
    .select("pnl")
    .eq("user_id", userId)
    .gte("closed_at", dayStart.toISOString());
  if (!data) return 0;
  let loss = 0;
  for (const r of data) {
    const p = Number(r.pnl ?? 0);
    if (p < 0) loss += Math.abs(p);
  }
  return Math.round(loss * 100) / 100;
}

export type KillSwitchStatus = {
  triggered: boolean;
  todayLossUsd: number;
  limitUsd: number | null;
  reason?: string;
};

export function evaluateKillSwitch(input: {
  enabled: boolean;
  dailyLossLimitUsd: number | null;
  todayLossUsd: number;
}): KillSwitchStatus {
  const { enabled, dailyLossLimitUsd, todayLossUsd } = input;
  if (!enabled || !dailyLossLimitUsd || dailyLossLimitUsd <= 0) {
    return { triggered: false, todayLossUsd, limitUsd: dailyLossLimitUsd };
  }
  if (todayLossUsd >= dailyLossLimitUsd) {
    return {
      triggered: true,
      todayLossUsd,
      limitUsd: dailyLossLimitUsd,
      reason: `Daily loss $${todayLossUsd.toFixed(2)} ≥ limit $${dailyLossLimitUsd.toFixed(2)}`,
    };
  }
  return { triggered: false, todayLossUsd, limitUsd: dailyLossLimitUsd };
}
