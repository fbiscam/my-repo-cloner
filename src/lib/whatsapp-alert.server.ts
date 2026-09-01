import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { filterAlertsEnabledUserIds } from '@/lib/alert-pref-filter.server'

interface SignalAlertArgs {
  alertId: string
  pair: string
  grade: string
  direction: string
  entry: number
  sl: number
  tp: number
  rr: number
  confidence: number
  decimals: number
  rationale?: string | null
  session?: string | null
  killzone?: string | null
  htfBias?: string | null
}


export async function sendSignalAlertWhatsApp(a: SignalAlertArgs): Promise<{ sent: number }> {
  // 1. Get recipients who have WhatsApp enabled and verified
  const { data: paidRows } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id')
    .eq('status', 'active')
    .neq('plan_id', 'free')
  
  let paidIds = Array.from(new Set((paidRows ?? []).map((r) => r.user_id)))
  paidIds = await filterAlertsEnabledUserIds(paidIds, { 
    grade: a.grade as any, 
    pair: a.pair, 
    direction: a.direction as any 
  })
  
  if (paidIds.length === 0) {
    console.warn('[WhatsApp] no eligible paid/opted-in users for alert', a.alertId)
    return { sent: 0 }
  }

  const { data: links } = await supabaseAdmin
    .from('whatsapp_alert_links')
    .select('user_id, phone_number')
    .in('user_id', paidIds)
    .eq('whatsapp_enabled', true)
    .not('verified_at', 'is', null)

  const rows = (links ?? []) as Array<{ user_id: string; phone_number: string }>
  if (rows.length === 0) {
    console.warn(
      `[WhatsApp] alert ${a.alertId}: 0 recipients — ${paidIds.length} eligible users but none have a verified + enabled WhatsApp link.`,
    )
  }

  if (rows.length === 0) return { sent: 0 }

  // 2. Format message
  const round = (n: number) => Number(n.toFixed(a.decimals)).toFixed(a.decimals)
  const title = `*${a.direction} · ${a.pair}*`
  
  const messageBody = [
    title,
    '',
    `Grade: *${a.grade}*`,
    `Entry: *${round(a.entry)}*`,
    `SL: *${round(a.sl)}*`,
    `TP: *${round(a.tp)}*`,
    `R:R: *1:${a.rr.toFixed(2)}*`,
    `Confidence: *${Math.round(a.confidence)}%*`,
    a.session ? `Session: *${a.session}*` : '',
    a.killzone ? `Killzone: *${a.killzone}*` : '',
    '',
    a.rationale ? `_Why this ${a.direction.toLowerCase()}:_\n${a.rationale.slice(0, 500)}` : '',
    '',
    `View details: https://jenvu.com/signals-live?alertId=${a.alertId}`
  ].filter(Boolean).join('\n')

  const templateParams: [string, string] = [
    `${a.direction} ${a.pair} (Grade ${a.grade})`,
    `Entry ${round(a.entry)}, SL ${round(a.sl)}, TP ${round(a.tp)}, R:R ${a.rr.toFixed(2)}, Confidence ${Math.round(a.confidence)}%`,
  ]

  const { sendWhatsappAlertMessage } = await import('./whatsapp-api.server')

  let sent = 0
  for (const row of rows) {
    try {
      // Free-form text works inside the 24h window; otherwise the approved
      // utility template is used automatically.
      await sendWhatsappAlertMessage(row.phone_number, messageBody, templateParams)

      
      sent++
      await supabaseAdmin
        .from('whatsapp_alert_links')
        .update({ last_error: null })
        .eq('user_id', row.user_id)
    } catch (error) {
      console.error(`[WhatsApp] Failed to send to ${row.user_id}:`, error)
      await supabaseAdmin
        .from('whatsapp_alert_links')
        .update({ last_error: (error as Error).message.slice(0, 500) })
        .eq('user_id', row.user_id)
    }
  }

  return { sent }
}

interface SignalStatusArgs {
  alertId?: string | null
  pair: string
  grade?: string | null
  direction: string
  entry: number
  sl: number
  priceNow: number
  lockedR: number
  decimals: number
  reason: 'sl_hit' | 'flipped'
  flipConfidence?: number | null
  /** Restrict delivery to these user ids (already pref-filtered). */
  userIds: string[]
}

/**
 * WhatsApp fan-out when a previously broadcast signal is invalidated
 * (stop-loss reached) or reversed (fresh scan flips the bias).
 */
export async function sendSignalStatusWhatsApp(a: SignalStatusArgs): Promise<{ sent: number }> {
  if (!a.userIds || a.userIds.length === 0) return { sent: 0 }

  const { data: links } = await supabaseAdmin
    .from('whatsapp_alert_links')
    .select('user_id, phone_number')
    .in('user_id', a.userIds)
    .eq('whatsapp_enabled', true)
    .not('verified_at', 'is', null)

  const rows = (links ?? []) as Array<{ user_id: string; phone_number: string }>
  if (rows.length === 0) return { sent: 0 }

  const round = (n: number) => Number(n.toFixed(a.decimals)).toFixed(a.decimals)
  const status =
    a.lockedR >= 0.05
      ? `Profit locked *${a.lockedR.toFixed(2)}R*`
      : a.lockedR <= -0.05
        ? `Loss locked *${a.lockedR.toFixed(2)}R*`
        : '*Breakeven*'

  const headline =
    a.reason === 'sl_hit'
      ? `⚠️ *Signal invalidated*`
      : `🔄 *Signal reversed*`

  const messageBody = [
    headline,
    '',
    `*${a.direction} · ${a.pair}*`,
    `Entry: *${round(a.entry)}*`,
    `Price now: *${round(a.priceNow)}*`,
    a.reason === 'sl_hit'
      ? `SL was: *${round(a.sl)}*`
      : `New bias confidence: *${Math.round(a.flipConfidence ?? 0)}%*`,
    status,
    '',
    a.reason === 'sl_hit'
      ? 'Stop-loss level was reached — this setup is no longer valid.'
      : 'A fresh scan flipped the bias — this setup is no longer valid.',
    'Your booked trade was auto-closed to reserve current P/L.',
    '',
    `View details: https://jenvu.com/dashboard/notifications`,
  ].filter(Boolean).join('\n')

  const templateParams: [string, string] = [
    a.reason === 'sl_hit'
      ? `Signal invalidated — ${a.direction} ${a.pair}`
      : `Signal reversed — ${a.direction} ${a.pair}`,
    `Entry ${round(a.entry)}, price now ${round(a.priceNow)}, ${
      a.lockedR >= 0.05
        ? `profit locked ${a.lockedR.toFixed(2)}R`
        : a.lockedR <= -0.05
          ? `loss locked ${a.lockedR.toFixed(2)}R`
          : 'breakeven'
    }. Setup is no longer valid.`,
  ]

  const { sendWhatsappAlertMessage } = await import('./whatsapp-api.server')

  let sent = 0
  for (const row of rows) {
    try {
      await sendWhatsappAlertMessage(row.phone_number, messageBody, templateParams)
      sent++
      await supabaseAdmin
        .from('whatsapp_alert_links')
        .update({ last_error: null })
        .eq('user_id', row.user_id)
    } catch (error) {
      console.error(`[WhatsApp] invalidation send failed for ${row.user_id}:`, error)
      await supabaseAdmin
        .from('whatsapp_alert_links')
        .update({ last_error: (error as Error).message.slice(0, 500) })
        .eq('user_id', row.user_id)
    }
  }

  return { sent }
}
