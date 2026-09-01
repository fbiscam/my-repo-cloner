// Server-only helper: batch fetch per-user risk settings and compute
// suggested position size for a given signal (entry/SL). Used to
// personalize signal alerts (email, WhatsApp, in-app) with each user's
// own lot size based on their account balance and risk% from
// /dashboard/risk.
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { computePositionSize, type PositionSize } from '@/lib/risk-manager'

export type PersonalRisk = {
  balance: number
  riskPct: number
  size: PositionSize | null
}

export async function getPersonalRiskMap(
  userIds: string[],
  signal: { entry: number; sl: number },
): Promise<Map<string, PersonalRisk>> {
  const map = new Map<string, PersonalRisk>()
  if (userIds.length === 0) return map

  const { data } = await supabaseAdmin
    .from('user_risk_settings')
    .select('user_id, account_balance_usd, risk_pct')
    .in('user_id', userIds)

  const byUser = new Map<string, { balance: number; riskPct: number }>()
  for (const r of data ?? []) {
    byUser.set(r.user_id, {
      balance: Number(r.account_balance_usd ?? 10),
      riskPct: Number(r.risk_pct ?? 1),
    })
  }

  for (const uid of userIds) {
    const s = byUser.get(uid) ?? { balance: 10, riskPct: 1 }
    const size = computePositionSize({
      balanceUsd: s.balance,
      riskPct: s.riskPct,
      entry: signal.entry,
      sl: signal.sl,
    })
    map.set(uid, { balance: s.balance, riskPct: s.riskPct, size })
  }
  return map
}
