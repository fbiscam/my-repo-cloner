import * as React from 'react'
import { render } from '@react-email/render'
import { parseEmailWebhookPayload } from '@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from '@lovable.dev/webhooks-js'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Configuration
const SITE_NAME = "Jenvu"
const SENDER_DOMAIN = "notify.jenvu.com"
const ROOT_DOMAIN = "jenvu.com"
const FROM_DOMAIN = "jenvu.com"

function redactEmail(email: string | null | undefined): string {
  if (!email) return '***'
  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return '***'
  return `${localPart[0]}***@${domain}`
}

const MAX_AUTH_WEBHOOK_BODY_BYTES = 1 << 20

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  let diff = left.length ^ right.length
  const max = Math.max(left.length, right.length)

  for (let i = 0; i < max; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }

  return diff === 0
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.toLowerCase().startsWith('bearer ')) return null
  return authHeader.slice('Bearer '.length).trim()
}

async function parseBearerAuthorizedPayload(request: Request, apiKey: string) {
  const bearerToken = getBearerToken(request)
  if (!bearerToken || !constantTimeEqual(bearerToken, apiKey)) {
    return null
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).length > MAX_AUTH_WEBHOOK_BODY_BYTES) {
    throw new WebhookError('body_too_large', 'Webhook body exceeds size limit')
  }

  try {
    return parseEmailWebhookPayload(body)
  } catch {
    throw new WebhookError('invalid_payload', 'Failed to parse webhook payload')
  }
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY

        if (!apiKey) {
          console.error('LOVABLE_API_KEY not configured')
          return Response.json(
            { error: 'Server configuration error' },
            { status: 500 }
          )
        }

        // Verify signature + timestamp, then parse payload.
        let payload: any
        let run_id = ''
        try {
          const verified = await verifyWebhookRequest({
            req: request.clone(),
            secret: apiKey,
            parser: parseEmailWebhookPayload,
          })
          payload = verified.payload
          run_id = payload.run_id
        } catch (error) {
          if (error instanceof WebhookError) {
            switch (error.code) {
              case 'invalid_signature':
              case 'missing_timestamp':
              case 'invalid_timestamp':
              case 'stale_timestamp':
                try {
                  const bearerPayload = await parseBearerAuthorizedPayload(request, apiKey)
                  if (bearerPayload) {
                    payload = bearerPayload
                    run_id = payload.run_id
                    console.warn('Auth email webhook accepted with bearer fallback', {
                      reason: error.code,
                      run_id,
                    })
                    break
                  }
                } catch (fallbackError) {
                  if (fallbackError instanceof WebhookError) {
                    console.error('Invalid webhook fallback payload', { error: fallbackError.message })
                    return Response.json(
                      { error: fallbackError.code === 'body_too_large' ? 'Webhook body too large' : 'Invalid webhook payload' },
                      { status: 400 }
                    )
                  }
                }

                console.error('Invalid webhook signature', { error: error.message })
                return Response.json(
                  { error: 'Invalid signature' },
                  { status: 401 }
                )
              case 'invalid_payload':
              case 'invalid_json':
                console.error('Invalid webhook payload', { error: error.message })
                return Response.json(
                  { error: 'Invalid webhook payload' },
                  { status: 400 }
                )
            }
          }

          if (!payload) {
            console.error('Webhook verification failed', { error })
            return Response.json(
              { error: 'Invalid webhook payload' },
              { status: 400 }
            )
          }
        }

        if (!run_id) {
          console.error('Webhook payload missing run_id')
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (payload.version !== '1') {
          console.error('Unsupported payload version', { version: payload.version, run_id })
          return Response.json(
            { error: `Unsupported payload version: ${payload.version}` },
            { status: 400 }
          )
        }

        // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
        // payload.type is the hook event type ("auth")
        const emailType = payload.data.action_type
        console.log('Received auth event', {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        })

        const EmailTemplate = EMAIL_TEMPLATES[emailType]
        if (!EmailTemplate) {
          console.error('Unknown email type', { emailType, run_id })
          return Response.json(
            { error: `Unknown email type: ${emailType}` },
            { status: 400 }
          )
        }

        // Build template props from payload.data (HookData structure)
        const isRecovery = emailType === 'recovery'
        const templateProps = {
          siteName: SITE_NAME,
          siteUrl: `https://${ROOT_DOMAIN}`,
          recipient: payload.data.email,
          confirmationUrl: payload.data.url,
          // Recovery emails triggered from Profile settings should show ONLY the link.
          token: isRecovery ? undefined : payload.data.token,
          showCode: isRecovery ? false : undefined,
          showLink: isRecovery ? true : undefined,
          email: payload.data.email,
          oldEmail: payload.data.old_email,
          newEmail: payload.data.new_email,
        }


        // Render React Email to HTML and plain text
        const element = React.createElement(EmailTemplate, templateProps)
        const html = await render(element)
        const text = await render(element, { plainText: true })

        // Enqueue email for async processing by the dispatcher (process-email-queue).
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseServiceKey) {
          console.error('Missing Supabase environment variables')
          return Response.json(
            { error: 'Server configuration error' },
            { status: 500 }
          )
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const messageId = crypto.randomUUID()
        const idempotencyKey = `auth-${emailType}-${run_id}-${messageId}`

        // Ensure an unsubscribe token exists for this recipient (required by
        // Lovable's transactional send path). Auth emails still won't render
        // an unsubscribe footer because templates omit it.
        let unsubscribeToken: string | undefined
        try {
          const email = String(payload.data.email).toLowerCase()
          const { data: existing } = await supabase
            .from('email_unsubscribe_tokens')
            .select('token')
            .eq('email', email)
            .maybeSingle()
          if (existing?.token) {
            unsubscribeToken = existing.token
          } else {
            const newToken = crypto.randomUUID().replace(/-/g, '')
            await supabase
              .from('email_unsubscribe_tokens')
              .upsert({ token: newToken, email }, { onConflict: 'email', ignoreDuplicates: true })
            const { data: stored } = await supabase
              .from('email_unsubscribe_tokens')
              .select('token')
              .eq('email', email)
              .maybeSingle()
            unsubscribeToken = stored?.token ?? newToken
          }
        } catch (e) {
          console.error('Failed to prepare unsubscribe token', { error: e })
        }

        // Log pending BEFORE enqueue so we have a record even if enqueue crashes
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: payload.data.email,
          status: 'pending',
        })

        const { error: enqueueError } = await supabase.rpc('enqueue_email', {
          queue_name: 'auth_emails',
          payload: {
            run_id,
            message_id: messageId,
            to: payload.data.email,
            from: `Jenvu <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: EMAIL_SUBJECTS[emailType] || 'Notification',
            html,
            text,
            // Lovable's send API only accepts purpose="transactional".
            purpose: 'transactional',
            idempotency_key: idempotencyKey,
            unsubscribe_token: unsubscribeToken,
            label: emailType,
            queued_at: new Date().toISOString(),
          },
        })

        if (enqueueError) {
          console.error('Failed to enqueue auth email', { error: enqueueError, run_id, emailType })
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: emailType,
            recipient_email: payload.data.email,
            status: 'failed',
            error_message: 'Failed to enqueue email',
          })
          return Response.json(
            { error: 'Failed to enqueue email' },
            { status: 500 }
          )
        }

        console.log('Auth email enqueued', {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        })

        return Response.json({ success: true, queued: true })
      },
    },
  },
})
