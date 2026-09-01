import * as React from 'react'
import { sendLovableEmail } from '@lovable.dev/email-js'
import { render } from '@react-email/render'
import { SignupEmail } from '@/lib/email-templates/signup'
import { RecoveryEmail } from '@/lib/email-templates/recovery'

type CustomAuthEmailInput = {
  to: string
  type: 'signup' | 'recovery'
  code: string
  siteUrl?: string
  resetLink?: string
}


const SITE_NAME = 'Jenvu'
const ROOT_DOMAIN = 'jenvu.com'
const FROM_DOMAIN = 'jenvu.com'
const SENDER_DOMAIN = 'notify.jenvu.com'

function generateUnsubToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getOrCreateUnsubscribeToken(
  supabaseAdmin: any,
  email: string,
): Promise<string> {
  const normalized = email.toLowerCase()
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalized)
    .maybeSingle()
  if (existing && !existing.used_at) return existing.token
  if (existing && existing.used_at) return existing.token

  const token = generateUnsubToken()
  await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .upsert({ token, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
  const { data: stored } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalized)
    .maybeSingle()
  return stored?.token ?? token
}

export async function sendCustomAuthEmail({ to, type, code, resetLink }: CustomAuthEmailInput) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const apiKey = process.env.LOVABLE_API_KEY
  if (!apiKey) throw new Error('Server is missing email configuration.')

  const origin = `https://${ROOT_DOMAIN}`
  const messageId = crypto.randomUUID()
  const idempotencyKey = `custom-auth-${type}-${messageId}`

  const element =
    type === 'signup' ? (
      <SignupEmail
        siteName={SITE_NAME}
        siteUrl={origin}
        recipient={to}
        confirmationUrl={`${origin}/auth`}
        token={code}
        showLink={false}
      />
    ) : (
      <RecoveryEmail
        siteName={SITE_NAME}
        confirmationUrl={resetLink || `${origin}/reset-password`}
        recipient={to}
        token={code}
        showLink={Boolean(resetLink)}
      />
    )


  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject = type === 'signup' ? 'Confirm your email' : 'Reset your password'

  const unsubscribeToken = await getOrCreateUnsubscribeToken(supabaseAdmin, to)

  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: type,
    recipient_email: to,
    status: 'pending',
  })


  try {
    await sendLovableEmail(
      {
        message_id: messageId,
        to,
        from: `Jenvu <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        // NOTE: Lovable's send API requires purpose=transactional when we
        // don't have a build run_id. Auth emails from runtime code must go
        // through this path (and therefore include an unsubscribe_token).
        purpose: 'transactional',
        label: type,
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
      },


      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
    )

    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: type,
      recipient_email: to,
      status: 'sent',
    })
  } catch (error) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: type,
      recipient_email: to,
      status: 'failed',
      error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Failed to send email',
    })
    throw new Error('Could not send verification email. Please try again.')
  }
}