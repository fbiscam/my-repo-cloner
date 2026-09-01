import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'

// Economic news / event alert worker. Called every 15 min by pg_cron.
// Auth: x-cron-secret. Finds high-impact USD/XAU releases landing within the
// next ~75 minutes, then fans out an in-app notification + email once per event.

const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'
const SENDER_DOMAIN = 'notify.jenvu.com'
const FROM = 'Jenvu Market Desk <news@notify.jenvu.com>'

type FFEvent = {
  title: string
  country: string
  date: string
  impact: string
  forecast?: string
  previous?: string
}

function fmtUtc(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

export const Route = createFileRoute('/api/public/hooks/news-alerts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const cronSecret = process.env.CRON_SECRET
        if (!supabaseUrl || !serviceKey || !cronSecret) {
          return Response.json({ error: 'server_misconfigured' }, { status: 500 })
        }
        const provided = request.headers.get('x-cron-secret') || ''
        if (provided !== cronSecret) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        // 1. Pull calendar
        let raw: FFEvent[] = []
        try {
          const res = await fetch(FF_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })
          if (!res.ok) return Response.json({ ok: false, error: 'calendar_unavailable' })
          raw = (await res.json()) as FFEvent[]
        } catch {
          return Response.json({ ok: false, error: 'calendar_fetch_failed' })
        }

        const now = Date.now()
        const upcoming = (raw ?? [])
          .filter((e) => (e.country === 'USD' || e.country === 'XAU') && /high/i.test(e.impact))
          .map((e) => ({ ...e, ts: new Date(e.date).getTime() }))
          .filter((e) => Number.isFinite(e.ts) && e.ts > now && e.ts <= now + 75 * 60 * 1000)
          .sort((a, b) => a.ts - b.ts)
          .slice(0, 5)

        if (upcoming.length === 0) {
          return Response.json({ ok: true, events: 0 })
        }

        // 2. Recipients: every user with alerts enabled
        const userIds: string[] = []
        const emailById = new Map<string, string>()
        for (let page = 1; page <= 10; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
          if (error || !data?.users?.length) break
          for (const u of data.users) {
            userIds.push(u.id)
            const em = (u.email ?? '').toLowerCase().trim()
            if (em && /.+@.+\..+/.test(em)) emailById.set(u.id, em)
          }
          if (data.users.length < 1000) break
        }

        // Preferences must cover EVERY user, not just the first page —
        // otherwise opted-out accounts past index 1000 keep getting pinged.
        const prefs = new Map<
          string,
          { user_id: string; alerts_enabled: boolean; email_enabled: boolean }
        >()
        for (let i = 0; i < userIds.length; i += 500) {
          const chunk = userIds.slice(i, i + 500)
          const { data: prefRows } = await admin
            .from('alert_preferences')
            .select('user_id, alerts_enabled, email_enabled')
            .in('user_id', chunk)
          for (const r of (prefRows ?? []) as Array<{
            user_id: string
            alerts_enabled: boolean
            email_enabled: boolean
          }>) {
            prefs.set(r.user_id, r)
          }
        }
        const notifyIds = userIds.filter((id) => prefs.get(id)?.alerts_enabled !== false)
        const emailIds = notifyIds.filter((id) => prefs.get(id)?.email_enabled !== false)

        const results: Array<Record<string, unknown>> = []

        for (const ev of upcoming) {
          const eventKey = `${ev.country}|${ev.title}|${new Date(ev.ts).toISOString()}`

          // Idempotency — one alert per event
          const { error: claimErr } = await admin.from('news_event_notifications').insert({
            event_key: eventKey,
            title: ev.title,
            country: ev.country,
            impact: 'High',
            event_at: new Date(ev.ts).toISOString(),
          })
          if (claimErr) {
            results.push({ event: ev.title, skipped: 'already_sent' })
            continue
          }

          const minutesUntil = Math.max(1, Math.round((ev.ts - now) / 60000))
          const title = `News: ${ev.title} in ${minutesUntil}m`
          const body =
            `High impact ${ev.country} release at ${fmtUtc(new Date(ev.ts).toISOString())}.` +
            (ev.forecast ? ` Forecast ${ev.forecast}.` : '') +
            (ev.previous ? ` Previous ${ev.previous}.` : '') +
            ' Expect volatility on gold — manage open risk.'

          // 3. In-app notifications
          const rows = notifyIds.map((uid) => ({
            user_id: uid,
            type: 'news_event',
            title,
            body,
            data: {
              event_title: ev.title,
              country: ev.country,
              impact: 'High',
              event_at: new Date(ev.ts).toISOString(),
              minutes_until: minutesUntil,
              forecast: ev.forecast ?? null,
              previous: ev.previous ?? null,
            },
          }))
          for (let i = 0; i < rows.length; i += 500) {
            await admin.from('user_notifications').insert(rows.slice(i, i + 500))
          }

          // 4. Emails
          let enqueued = 0
          if (emailIds.length > 0) {
            const { default: React } = await import('react')
            const { render } = await import('@react-email/render')
            const { template } = await import('@/lib/email-templates/news-event')

            const templateData = {
              title: ev.title,
              country: ev.country,
              impact: 'High',
              eventTime: fmtUtc(new Date(ev.ts).toISOString()),
              minutesUntil,
              forecast: ev.forecast ?? '',
              previous: ev.previous ?? '',
              signalUrl: 'https://jenvu.com/signal',
            }
            const element = React.createElement(template.component, templateData)
            const html = await render(element)
            const text = await render(element, { plainText: true })
            const subject =
              typeof template.subject === 'function'
                ? template.subject(templateData)
                : template.subject

            for (const uid of emailIds) {
              const normalized = emailById.get(uid)
              if (!normalized) continue

              const { data: suppressed } = await admin
                .from('suppressed_emails')
                .select('id')
                .eq('email', normalized)
                .maybeSingle()
              if (suppressed) continue

              let token: string | null = null
              const { data: existing } = await admin
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
                await admin
                  .from('email_unsubscribe_tokens')
                  .upsert({ token, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
                const { data: stored } = await admin
                  .from('email_unsubscribe_tokens')
                  .select('token')
                  .eq('email', normalized)
                  .maybeSingle()
                token = stored?.token ?? token
              } else {
                continue
              }

              const messageId = crypto.randomUUID()
              await admin.from('email_send_log').insert({
                message_id: messageId,
                template_name: 'news-event',
                recipient_email: normalized,
                status: 'pending',
              })

              const { error: enqueueError } = await admin.rpc('enqueue_email', {
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
                  label: 'news-event',
                  idempotency_key: `news-${eventKey}-${normalized}`.slice(0, 200),
                  unsubscribe_token: token,
                  queued_at: new Date().toISOString(),
                },
              })
              if (enqueueError) {
                await admin.from('email_send_log').insert({
                  message_id: messageId,
                  template_name: 'news-event',
                  recipient_email: normalized,
                  status: 'failed',
                  error_message: enqueueError.message ?? 'enqueue_failed',
                })
              } else {
                enqueued++
              }
            }
          }

          await admin
            .from('news_event_notifications')
            .update({ recipients: notifyIds.length, emails_enqueued: enqueued })
            .eq('event_key', eventKey)

          results.push({ event: ev.title, notified: notifyIds.length, enqueued })
        }

        return Response.json({ ok: true, events: upcoming.length, results })
      },
    },
  },
})
