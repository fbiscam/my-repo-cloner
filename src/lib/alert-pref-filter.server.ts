// Server-only helper: filter user ids down to those who want an alert for a
// specific signal (alerts_enabled + quiet hours + per-user grade/pair/direction filters).
// The per-user filter columns are stored under email_grades/email_pairs/email_directions
// for historical reasons, but now apply to ALL alert channels (browser, WhatsApp, email).
import { supabaseAdmin } from '@/integrations/supabase/client.server'

export interface SignalFilter {
  grade: string
  pair: string
  direction: 'BUY' | 'SELL'
}

// Returns true if the current time (in the user's timezone) falls within
// [quiet_start, quiet_end). Handles overnight windows (e.g. 22:00 → 07:00).
function isInQuietHours(quietStart: string | null, quietEnd: string | null, tz: string | null): boolean {
  if (!quietStart || !quietEnd) return false
  try {
    const zone = tz || 'UTC'
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date())
    const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
    const nowMin = hh * 60 + mm
    const [sH, sM] = quietStart.split(':').map((v) => Number(v))
    const [eH, eM] = quietEnd.split(':').map((v) => Number(v))
    const startMin = sH * 60 + (sM || 0)
    const endMin = eH * 60 + (eM || 0)
    if (startMin === endMin) return false
    if (startMin < endMin) return nowMin >= startMin && nowMin < endMin
    return nowMin >= startMin || nowMin < endMin
  } catch {
    return false
  }
}

/**
 * Given user ids (and optionally a specific signal), return those whose alert
 * preferences allow this alert on ANY channel. Applies:
 *   - alerts_enabled master switch
 *   - quiet hours (user's local timezone)
 *   - grade/pair/direction filters (when a signal is provided)
 * Users without a preferences row are treated as opt-in.
 */
export async function filterAlertsEnabledUserIds(
  userIds: string[],
  signal?: SignalFilter,
): Promise<string[]> {
  if (!userIds || userIds.length === 0) return []
  const { data } = await supabaseAdmin
    .from('alert_preferences')
    .select('user_id, alerts_enabled, quiet_start, quiet_end, timezone, email_grades, email_pairs, email_directions')
    .in('user_id', userIds)
  type Row = {
    user_id: string
    alerts_enabled: boolean
    quiet_start: string | null
    quiet_end: string | null
    timezone: string | null
    email_grades: string[] | null
    email_pairs: string[] | null
    email_directions: string[] | null
  }
  const byId = new Map<string, Row>()
  for (const r of (data ?? []) as Row[]) byId.set(r.user_id, r)
  const pair = signal?.pair.toUpperCase()
  return userIds.filter((id) => {
    const r = byId.get(id)
    if (!r) return true
    if (r.alerts_enabled === false) return false
    if (isInQuietHours(r.quiet_start, r.quiet_end, r.timezone)) return false
    if (signal) {
      if (r.email_grades && r.email_grades.length > 0 && !r.email_grades.includes(signal.grade)) return false
      if (r.email_pairs && r.email_pairs.length > 0 && pair && !r.email_pairs.includes(pair)) return false
      if (r.email_directions && r.email_directions.length > 0 && !r.email_directions.includes(signal.direction)) return false
    }
    return true
  })
}

export type EmailAlertFilter = SignalFilter

/**
 * Given user ids and a specific signal, return the subset who want the EMAIL
 * channel — same rules as filterAlertsEnabledUserIds plus email_enabled.
 */
export async function filterEmailRecipientIds(
  userIds: string[],
  s: EmailAlertFilter,
): Promise<string[]> {
  if (!userIds || userIds.length === 0) return []
  const allowed = await filterAlertsEnabledUserIds(userIds, s)
  if (allowed.length === 0) return []
  const { data } = await supabaseAdmin
    .from('alert_preferences')
    .select('user_id, email_enabled')
    .in('user_id', allowed)
  const disabled = new Set(
    ((data ?? []) as Array<{ user_id: string; email_enabled: boolean }>)
      .filter((r) => r.email_enabled === false)
      .map((r) => r.user_id),
  )
  return allowed.filter((id) => !disabled.has(id))
}
