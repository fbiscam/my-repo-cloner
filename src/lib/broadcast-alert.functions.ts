import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

const SENDER_DOMAIN = 'notify.jenvu.com'
const FROM = 'Jenvu Signal Desk <signals@notify.jenvu.com>'

const BroadcastSchema = z.object({
  pair: z.string().min(3).max(16),
  grade: z.enum(['A+', 'A', 'B', 'C']),
  direction: z.enum(['BUY', 'SELL']),
  entry: z.number(),
  sl: z.number(),
  tp: z.number(),
  rr: z.number(),
  confidence: z.number().min(0).max(100),
  session: z.string().max(64).nullable().optional(),
  killzone: z.string().max(64).nullable().optional(),
  htfBias: z.string().max(64).nullable().optional(),
  rationale: z.string().max(1000).optional(),
  decimals: z.number().int().min(0).max(6).default(2),
  setupScore: z.number().min(0).max(100).optional(),
})

export const broadcastCurrentSignal = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BroadcastSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Admin gate
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    })
    if (!isAdmin) throw new Error('Forbidden: admin access required')

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const round = (n: number) => Number(n.toFixed(data.decimals))
    const pair = data.pair.toUpperCase().replace(/[^A-Z]/g, '')

    const scoreForGrade = Math.round(data.setupScore ?? data.confidence)
    const grade: z.infer<typeof BroadcastSchema>['grade'] =
      scoreForGrade >= 90 ? 'A+' : scoreForGrade >= 75 ? 'A' : scoreForGrade >= 65 ? 'B' : 'C'

    // Killzone gate: even manual broadcasts must be in a killzone unless ≥75% conf.
    const kz = String(data.killzone ?? '').trim()
    const inKillzone = kz.length > 0 && !/^(none|off|outside)$/i.test(kz)
    if (!inKillzone && scoreForGrade < 85) {
      throw new Error(`Broadcast blocked: Setup is outside killzone (${kz || 'None'}) and confidence (${scoreForGrade}%) is below the 75% "A+" override floor.`)
    }

    // 1. Insert into signal_alerts
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('signal_alerts')
      .insert({
        pair,
        grade,
        direction: data.direction,
        entry: round(data.entry),
        sl: round(data.sl),
        tp: round(data.tp),
        rr: Number(data.rr.toFixed(2)),
        confidence: Math.round(data.confidence),
        setup_score: Math.round(data.setupScore ?? data.confidence),
        htf_bias: data.htfBias ?? null,
        session: data.session ?? null,
        killzone: data.killzone ?? null,
        rationale: (data.rationale ?? '').slice(0, 1000),
      })
      .select()
      .single()

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message ?? 'Failed to record alert')
    }

    // 2. Recipients = every active paid-plan user's email whose alerts_enabled is true.
    const { filterAlertsEnabledUserIds } = await import('@/lib/alert-pref-filter.server')
    let recipientEmails: string[] = []
    let notifyUserIds: string[] = []
    const emailToUserId = new Map<string, string>()
    {
      const { data: paidRows } = await supabaseAdmin
        .from('user_subscriptions')
        .select('user_id')
        .eq('status', 'active')
        .neq('plan_id', 'free')
      const paidIds = Array.from(
        new Set((paidRows ?? []).map((r: { user_id: string }) => r.user_id)),
      )
      notifyUserIds = await filterAlertsEnabledUserIds(paidIds, { grade, pair, direction: data.direction })
      if (notifyUserIds.length > 0) {
        // PostgREST does not expose the auth schema; use the Auth Admin API.
        const collected: Array<{ id: string; email: string | null }> = []
        for (const uid of notifyUserIds) {
          try {
            const { data: u, error } = await supabaseAdmin.auth.admin.getUserById(uid)
            if (error) continue
            collected.push({ id: uid, email: u.user?.email ?? null })
          } catch {
            // ignore individual failures
          }
        }
        for (const c of collected) {
          const em = (c.email ?? '').toLowerCase().trim()
          if (em && /.+@.+\..+/.test(em)) emailToUserId.set(em, c.id)
        }
        recipientEmails = Array.from(new Set(Array.from(emailToUserId.keys())))
      }
    }
    const recipients: Array<{ email: string }> = recipientEmails.map((email) => ({ email }))



    // 3. Insert in-app notifications for allow-listed users only

    if (notifyUserIds.length > 0) {
      const { getPersonalRiskMap } = await import('@/lib/personal-risk.server')
      const riskMap = await getPersonalRiskMap(notifyUserIds, {
        entry: data.entry,
        sl: data.sl,
      })
      const rationale = (data.rationale ?? '').slice(0, 500)
      const title = `${grade} ${data.direction} · ${pair}`
      const rows = notifyUserIds.map((uid) => {
        const personal = riskMap.get(uid)
        const sizeNote = personal?.size?.note ?? ''
        const body =
          `Entry ${round(data.entry)} · SL ${round(data.sl)} · TP ${round(data.tp)} · R:R ${data.rr.toFixed(2)}` +
          (sizeNote ? ` · ${sizeNote}` : '') +
          (rationale ? ` — ${rationale}` : '')
        return {
          user_id: uid,
          type: 'signal_alert',
          title,
          body,
          data: {
            alert_id: inserted.id,
            pair,
            grade,
            direction: data.direction,
            entry: round(data.entry),
            sl: round(data.sl),
            tp: round(data.tp),
            rr: Number(data.rr.toFixed(2)),
            confidence: Math.round(data.confidence),
            setup_score: scoreForGrade,
            personal_risk: personal?.size
              ? {
                  lots: personal.size.lots,
                  units: personal.size.units,
                  risk_usd: personal.size.riskUsd,
                  balance_usd: personal.balance,
                  risk_pct: personal.riskPct,
                }
              : null,
          },
        }
      })
      // Chunk to avoid oversize inserts
      for (let i = 0; i < rows.length; i += 500) {
        await supabaseAdmin.from('user_notifications').insert(rows.slice(i, i + 500))
      }


      // Also deliver an in-app @jenvu.email message from alerts@ to every paid user
      try {
        const { sendSystemMail } = await import('@/lib/system-mail.server')
        const mailBody = [
          `New ${grade} ${data.direction} setup on ${pair}`,
          ``,
          `Entry: ${round(data.entry)}`,
          `Stop Loss: ${round(data.sl)}`,
          `Take Profit: ${round(data.tp)}`,
          `R:R: ${data.rr.toFixed(2)}`,
          `Confidence: ${Math.round(data.confidence)}%`,
          rationale ? `\nContext: ${rationale}` : '',
          ``,
          `— Jenvu Alerts`,
        ].join('\n')
        // Fire in parallel batches to avoid stampeding
        const batchSize = 25
        for (let i = 0; i < notifyUserIds.length; i += batchSize) {
          const batch = notifyUserIds.slice(i, i + batchSize)
          await Promise.all(
            batch.map((uid) =>
              sendSystemMail({
                from: 'alerts@jenvu.email',
                toUserId: uid,
                subject: title,
                body: mailBody,
              }).catch(() => {}),
            ),
          )
        }
      } catch (e) {
        console.error('[broadcast] system-mail alerts failed:', (e as Error)?.message)
      }

      // Per-recipient billing: charge $0.20 to every paid user who received
      // this broadcast (mirrors auto-scan billing). Idempotent via unique
      // per-user scanId so retries never double-charge.
      try {
        const { chargeSignalScan } = await import('@/lib/ai-cost-log.server')
        await Promise.all(
          notifyUserIds.map((uid) =>
            chargeSignalScan({
              userId: uid,
              direction: data.direction,
              model: 'manual-broadcast/ict-smc',
              symbol: pair,
              scanId: `broadcast_${inserted.id}_${uid}`,
              grade,
              score: scoreForGrade,
            }).catch((err) =>
              console.warn('[broadcast] chargeSignalScan failed for', uid, (err as Error)?.message),
            ),
          ),
        )
      } catch (e) {
        console.warn('[broadcast] chargeSignalScan import failed:', (e as Error)?.message)
      }
    }

    // 4. Queue emails
    let enqueued = 0
    let whatsappSent = 0
    try {
      const { sendSignalAlertWhatsApp } = await import('@/lib/whatsapp-alert.server')
      
      const alertData = {
        alertId: inserted.id,
        firedAt: inserted.fired_at,
        pair,
        grade,
        direction: data.direction,
        entry: round(data.entry),
        sl: round(data.sl),
        tp: round(data.tp),
        rr: Number(data.rr.toFixed(2)),
        confidence: Math.round(data.confidence),
        decimals: data.decimals,
        session: data.session ?? null,
        killzone: data.killzone ?? null,
        htfBias: data.htfBias ?? null,
        rationale: data.rationale ?? null,
      }

      const waRes = await sendSignalAlertWhatsApp(alertData).catch(e => {
        console.error('[broadcast] whatsapp alerts failed:', e?.message)
        return { sent: 0 }
      })

      whatsappSent = waRes.sent
    } catch (e) {
      console.error('[broadcast] social alerts failed:', (e as Error)?.message)
    }
    if (recipients.length > 0) {
      const { default: React } = await import('react')
      const { render } = await import('@react-email/render')
      const { template } = await import('@/lib/email-templates/signal-alert')
      const { getPersonalRiskMap } = await import('@/lib/personal-risk.server')

      const riskMap = await getPersonalRiskMap(
        Array.from(new Set(emailToUserId.values())),
        { entry: data.entry, sl: data.sl },
      )

      const baseData = {
        pair,
        grade,
        direction: data.direction,
        entry: round(data.entry).toFixed(data.decimals),
        sl: round(data.sl).toFixed(data.decimals),
        tp: round(data.tp).toFixed(data.decimals),
        rr: data.rr.toFixed(2),
        confidence: Math.round(data.confidence),
        session: data.session ?? '',
        killzone: data.killzone ?? '',
        htfBias: data.htfBias ?? '',
        rationale: data.rationale ?? '',
        firedAt: inserted.fired_at,
        signalUrl: 'https://jenvu.com/signal',
      }


      for (const { email } of recipients) {
        const normalized = email.toLowerCase()
        const { data: suppressed } = await supabaseAdmin
          .from('suppressed_emails')
          .select('id')
          .eq('email', normalized)
          .maybeSingle()
        if (suppressed) continue

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
          continue
        }

        // Personalize this recipient's email with their risk-manager sizing
        const uid = emailToUserId.get(normalized)
        const personal = uid ? riskMap.get(uid) : undefined
        const size = personal?.size ?? null
        const templateData = {
          ...baseData,
          sizeLots: size ? size.lots.toFixed(2) : undefined,
          sizeUnits: size ? String(size.units) : undefined,
          sizeRiskUsd: size ? size.riskUsd.toFixed(2) : undefined,
          sizeBalance: personal ? personal.balance.toFixed(2) : undefined,
          sizeRiskPct: personal ? personal.riskPct.toFixed(2) : undefined,
        }
        const element = React.createElement(template.component, templateData)
        const html = await render(element)
        const text = await render(element, { plainText: true })
        const subject =
          typeof template.subject === 'function' ? template.subject(templateData) : template.subject

        const messageId = crypto.randomUUID()
        const idempotencyKey = `alert-${inserted.id}-${normalized}`

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
        if (!enqErr) enqueued++
      }
    }

    return {
      ok: true,
      alert_id: inserted.id,
      recipients: recipients.length,
      enqueued,
      whatsapp_sent: whatsappSent,
      notified_in_app: notifyUserIds.length,
    }
  })
