import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'

// Fan-out route called by the insights AFTER INSERT Postgres trigger.
// Authenticated with the Supabase anon key in the `apikey` header (pg_net pattern).
// Reads the just-published article + active subscribers, then enqueues one
// transactional email per subscriber through the internal queue.

export const Route = createFileRoute('/api/public/hooks/notify-subscribers')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        const cronSecret = process.env.CRON_SECRET

        if (!supabaseUrl || !supabaseServiceKey || !cronSecret) {
          console.error('notify-subscribers: missing env')
          return Response.json({ error: 'server_misconfigured' }, { status: 500 })
        }

        // Authenticate the caller with the shared cron secret
        const provided = request.headers.get('x-cron-secret') || ''
        if (provided !== cronSecret) {
          return Response.json({ error: 'unauthorized' }, { status: 401 })
        }

        let body: { slug?: string; id?: string }
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'invalid_json' }, { status: 400 })
        }
        if (!body.slug && !body.id) {
          return Response.json({ error: 'slug_or_id_required' }, { status: 400 })
        }

        const admin = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        // 1. Load the article
        const query = admin.from('insights').select('*')
        const { data: article, error: articleErr } = body.id
          ? await query.eq('id', body.id).maybeSingle()
          : await query.eq('slug', body.slug!).maybeSingle()

        if (articleErr || !article) {
          console.error('notify-subscribers: article not found', { body, articleErr })
          return Response.json({ error: 'article_not_found' }, { status: 404 })
        }

        // Idempotency: skip if we've already notified for this article
        if (article.notified_at) {
          return Response.json({ ok: true, skipped: 'already_notified' })
        }

        // 2. Load active subscribers
        const { data: subscribers, error: subErr } = await admin
          .from('newsletter_subscribers')
          .select('email')
          .eq('status', 'active')

        if (subErr) {
          console.error('notify-subscribers: subscriber fetch failed', subErr)
          return Response.json({ error: 'subscriber_fetch_failed' }, { status: 500 })
        }

        const recipients = (subscribers ?? []).map((s) => s.email).filter(Boolean)

        if (recipients.length === 0) {
          // Mark as notified so we don't keep retrying
          await admin
            .from('insights')
            .update({ notified_at: new Date().toISOString() })
            .eq('id', article.id)
          return Response.json({ ok: true, sent: 0, reason: 'no_subscribers' })
        }

        // 3. Render the template ONCE and enqueue directly to the email queue.
        const { default: React } = await import('react')
        const { render } = await import('react-email')
        const { template } = await import('@/lib/email-templates/new-article')

        const articleUrl = `https://jenvu.com/insights/${article.slug}`
        const templateData = {
          title: article.title,
          excerpt: article.excerpt,
          category: article.category,
          imageUrl: article.image_url || undefined,
          articleUrl,
          publishedAt: article.published_at,
        }

        const element = React.createElement(template.component, templateData)
        const html = await render(element)
        const text = await render(element, { plainText: true })
        const subject =
          typeof template.subject === 'function'
            ? template.subject(templateData)
            : template.subject

        const SENDER_DOMAIN = 'notify.jenvu.com'
        const FROM = `Jenvu Briefings <noreply@notify.jenvu.com>`

        let enqueued = 0
        const failures: string[] = []

        for (const email of recipients) {
          const normalized = email.toLowerCase()
          const messageId = crypto.randomUUID()
          const idempotencyKey = `article-${article.id}-${normalized}`

          // Suppression check
          const { data: suppressed } = await admin
            .from('suppressed_emails')
            .select('id')
            .eq('email', normalized)
            .maybeSingle()
          if (suppressed) continue

          // Ensure unsubscribe token
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
            token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
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
            continue // token used but somehow not in suppression — skip
          }

          await admin.from('email_send_log').insert({
            message_id: messageId,
            template_name: 'new-article',
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
              label: 'new-article',
              idempotency_key: idempotencyKey,
              unsubscribe_token: token,
              queued_at: new Date().toISOString(),
            },
          })

          if (enqueueError) {
            failures.push(normalized)
            await admin.from('email_send_log').insert({
              message_id: messageId,
              template_name: 'new-article',
              recipient_email: normalized,
              status: 'failed',
              error_message: enqueueError.message ?? 'enqueue_failed',
            })
          } else {
            enqueued++
          }
        }

        // Mark article as notified
        await admin
          .from('insights')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', article.id)

        return Response.json({
          ok: true,
          article: article.slug,
          subscribers: recipients.length,
          enqueued,
          failed: failures.length,
        })
      },
    },
  },
})
