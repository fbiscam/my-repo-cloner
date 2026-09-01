// Server-only helper: enqueue signal-alert emails to opted-in paid subscribers.
// Used by manual admin broadcast and auto-scan cron.
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const SENDER_DOMAIN = 'notify.jenvu.com'
const FROM = 'Jenvu Signal Desk <signals@notify.jenvu.com>'

export interface EnqueueAlertEmailsArgs {
  alertId: string
  firedAt: string
  pair: string
  grade: 'A+' | 'A' | 'B' | 'C'
  direction: 'BUY' | 'SELL'
  entry: number
  sl: number
  tp: number
  rr: number
  confidence: number
  decimals: number
  session?: string | null
  killzone?: string | null
  htfBias?: string | null
  rationale?: string | null
  excludeUserId?: string | null
}

export async function enqueueSignalAlertEmails(a: EnqueueAlertEmailsArgs): Promise<{ enqueued: number }> {
  // Recipients = every active paid-plan user's email (no opt-in required).
  const { data: paidRows } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id')
    .eq('status', 'active')
    .neq('plan_id', 'free')
  let paidIds = Array.from(new Set((paidRows ?? []).map((r: { user_id: string }) => r.user_id)))
  if (a.excludeUserId) paidIds = paidIds.filter((id) => id !== a.excludeUserId)
  if (paidIds.length === 0) return { enqueued: 0 }

  // Apply per-user email filters (alerts_enabled, email_enabled, grade/pair/direction).
  const { filterEmailRecipientIds } = await import('@/lib/alert-pref-filter.server')
  paidIds = await filterEmailRecipientIds(paidIds, {
    grade: a.grade,
    pair: a.pair,
    direction: a.direction,
  })
  if (paidIds.length === 0) return { enqueued: 0 }


  // Fetch emails via Auth Admin API (PostgREST doesn't expose the auth schema).
  // Run lookups in parallel so a large paid-user list doesn't serialize into a
  // multi-second stall that starves the enqueue budget mid-broadcast.
  const emailsById: Array<{ id: string; email: string | null }> = (
    await Promise.all(
      paidIds.map(async (uid) => {
        try {
          const { data, error } = await supabaseAdmin.auth.admin.getUserById(uid)
          if (error) return null
          return { id: uid, email: data.user?.email ?? null }
        } catch {
          return null
        }
      }),
    )
  ).filter((r): r is { id: string; email: string | null } => r !== null)
  const recipients = Array.from(
    new Set(
      emailsById
        .map((u) => (u.email ?? '').toLowerCase().trim())
        .filter((e) => !!e && /.+@.+\..+/.test(e)),
    ),
  )
  if (recipients.length === 0) return { enqueued: 0 }


  // 3. Fetch per-user risk settings → personalized lot size
  const { getPersonalRiskMap } = await import('@/lib/personal-risk.server')
  const riskMap = await getPersonalRiskMap(
    emailsById.map((u) => u.id),
    { entry: a.entry, sl: a.sl },
  )
  const riskByEmail = new Map<string, ReturnType<typeof riskMap.get>>()
  for (const u of emailsById) {
    const em = (u.email ?? '').toLowerCase().trim()
    if (em) riskByEmail.set(em, riskMap.get(u.id))
  }

  // 4. Render template (per-recipient to inject personalized size)
  const { default: React } = await import('react')
  const { render } = await import('@react-email/render')
  const { template } = await import('@/lib/email-templates/signal-alert')

  const round = (n: number) => Number(n.toFixed(a.decimals))
  const baseData = {
    pair: a.pair,
    grade: a.grade,
    direction: a.direction,
    entry: round(a.entry).toFixed(a.decimals),
    sl: round(a.sl).toFixed(a.decimals),
    tp: round(a.tp).toFixed(a.decimals),
    rr: a.rr.toFixed(2),
    confidence: Math.round(a.confidence),
    session: a.session ?? '',
    killzone: a.killzone ?? '',
    htfBias: a.htfBias ?? '',
    rationale: a.rationale ?? '',
    firedAt: a.firedAt,
    signalUrl: 'https://jenvu.com/signal',
  }

  // 5. Enqueue in parallel (recipient loop was previously serial → mid-broadcast
  //    timeouts left most paid users un-emailed for a given signal). Each
  //    per-recipient step is wrapped so one failure never aborts the batch.
  const perRecipient = async (email: string): Promise<boolean> => {
    try {
      const normalized = email.toLowerCase()
      const { data: suppressed } = await supabaseAdmin
        .from('suppressed_emails')
        .select('id')
        .eq('email', normalized)
        .maybeSingle()
      if (suppressed) return false

      let token: string | null = null
      const { data: existing } = await supabaseAdmin
        .from('email_unsubscribe_tokens')
        .select('token, used_at')
        .eq('email', normalized)
        .maybeSingle()
      if (existing && !existing.used_at) {
        token = existing.token
      } else if (!existing) {
        const bytes = new Uint8Array(32)
        crypto.getRandomValues(bytes)
        token = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        await supabaseAdmin
          .from('email_unsubscribe_tokens')
          .upsert({ token, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
        const { data: stored } = await supabaseAdmin
          .from('email_unsubscribe_tokens')
          .select('token')
          .eq('email', normalized)
          .maybeSingle()
        token = stored?.token ?? token
      } else {
        // Token exists but was used (user unsubscribed) → skip.
        return false
      }

      const personal = riskByEmail.get(normalized)
      const size = personal?.size ?? null
      const templateData = {
        ...baseData,
        sizeLots: size ? size.lots.toFixed(2) : undefined,
        sizeUnits: size ? String(size.units) : undefined,
        sizeRiskUsd: size ? size.riskUsd.toFixed(2) : undefined,
        sizeBalance: personal ? personal.balance.toFixed(2) : undefined,
        sizeRiskPct: personal ? personal.riskPct.toFixed(2) : undefined,
        unsubscribe_token: token,
      }
      const element = React.createElement(template.component, templateData)
      const html = await render(element)
      const text = await render(element, { plainText: true })
      const subject =
        typeof template.subject === 'function' ? template.subject(templateData) : template.subject

      const messageId = crypto.randomUUID()
      const idempotencyKey = `alert-${a.alertId}-${normalized}`

      await supabaseAdmin.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'signal-alert',
        recipient_email: normalized,
        status: 'pending',
      })

      const { error: enqErr } = await supabaseAdmin.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to: normalized,
          from: FROM,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: 'transactional',
          label: 'signal-alert',
          idempotency_key: idempotencyKey,
          unsubscribe_token: token,
          queued_at: new Date().toISOString(),
        },
      })
      return !enqErr
    } catch (err) {
      console.error('signal-alert enqueue failed for', email, (err as Error)?.message)
      return false
    }
  }

  const settled = await Promise.all(recipients.map(perRecipient))
  const enqueued = settled.filter(Boolean).length

  return { enqueued }
}
