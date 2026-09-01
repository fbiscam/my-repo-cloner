import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

export type SignalAlertRow = {
  id: string
  pair: string
  grade: 'A+' | 'A' | 'B' | 'C'
  direction: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  rr: number | null
  confidence: number | null
  setup_score: number | null
  htf_bias: string | null
  session: string | null
  killzone: string | null
  rationale: string | null
  fired_at: string
}

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  )
}

export const listSignalAlerts = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as { limit?: number; pair?: string; since?: string }
    return {
      limit: Math.min(Math.max(Number(o.limit) || 20, 1), 50),
      pair: typeof o.pair === 'string' && o.pair ? o.pair.toUpperCase() : null,
      since: typeof o.since === 'string' && o.since ? o.since : null,
    }
  })
  .handler(async ({ data }) => {
    const sb = publicClient()
    let q = sb
      .from('signal_alerts')
      .select(
        'id,pair,grade,direction,entry,sl,tp,rr,confidence,setup_score,htf_bias,session,killzone,rationale,fired_at',
      )
      .order('fired_at', { ascending: false })
      .limit(data.limit)
    if (data.pair) q = q.eq('pair', data.pair)
    if (data.since) q = q.gte('fired_at', data.since)
    const { data: rows, error } = await q
    if (error) return { alerts: [] as SignalAlertRow[], error: error.message }
    return { alerts: (rows ?? []) as SignalAlertRow[] }
  })

export const subscribeToAlerts = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as { email?: string }
    const email = String(o.email ?? '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
      throw new Error('Please enter a valid email address.')
    }
    return { email }
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    // Upsert by email; attach user_id so this account stays remembered
    // across browsers even if a different email is entered later.
    const { error } = await supabaseAdmin
      .from('signal_alert_subscribers')
      .upsert(
        { email: data.email, user_id: context.userId, status: 'active' },
        { onConflict: 'email' },
      )
    if (error) return { ok: false, error: error.message }
    // Also stamp user_id on any pre-existing row for the account email
    const accountEmail = (context.claims?.email as string | undefined)?.toLowerCase()
    if (accountEmail && accountEmail !== data.email) {
      await supabaseAdmin
        .from('signal_alert_subscribers')
        .update({ user_id: context.userId })
        .eq('email', accountEmail)
        .is('user_id', null)
    }
    return { ok: true }
  })

export const isAlertSubscribed = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims?.email as string | undefined)?.toLowerCase()
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    // Match by user_id OR by current account email — either counts as subscribed.
    const filter = email
      ? `user_id.eq.${context.userId},email.eq.${email}`
      : `user_id.eq.${context.userId}`
    const { data } = await supabaseAdmin
      .from('signal_alert_subscribers')
      .select('email')
      .or(filter)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    return { subscribed: !!data }
  })

