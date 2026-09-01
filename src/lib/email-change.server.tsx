import * as React from 'react'
import { render } from '@react-email/render'
import { sendLovableEmail } from '@lovable.dev/email-js'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'

const SITE_NAME = 'Jenvu'
const ROOT_DOMAIN = 'jenvu.com'
const FROM_DOMAIN = 'jenvu.com'
const SENDER_DOMAIN = 'notify.jenvu.com'
const TOKEN_TTL_MINUTES = 60

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function generateToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getOrCreateUnsubscribeToken(supabaseAdmin: any, email: string): Promise<string> {
  const normalized = email.toLowerCase()
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalized)
    .maybeSingle()
  if (existing?.token) return existing.token

  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
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

type AuditEvent = 'requested' | 'confirmed' | 'failed_request' | 'failed_confirm'

async function writeAudit(row: {
  userId: string | null
  event: AuditEvent
  oldEmail?: string | null
  newEmail?: string | null
  requestId?: string | null
  ip?: string | null
  userAgent?: string | null
  errorReason?: string | null
}) {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    await (supabaseAdmin as any).from('email_change_audit').insert({
      user_id: row.userId,
      event: row.event,
      old_email: row.oldEmail ?? null,
      new_email: row.newEmail ?? null,
      request_id: row.requestId ?? null,
      ip: row.ip ? row.ip.slice(0, 100) : null,
      user_agent: row.userAgent ? row.userAgent.slice(0, 500) : null,
      error_reason: row.errorReason ? row.errorReason.slice(0, 500) : null,
    })
  } catch {
    // audit must never break the primary flow
  }
}

export async function createEmailChangeRequest(input: {
  userId: string
  oldEmail: string
  newEmail: string
  siteUrl?: string
  ip?: string
  userAgent?: string
}) {
  const oldEmail = normalizeEmail(input.oldEmail)
  const newEmail = normalizeEmail(input.newEmail)
  const ctx = { userId: input.userId, oldEmail, newEmail, ip: input.ip, userAgent: input.userAgent }

  const fail = async (reason: string) => {
    await writeAudit({ ...ctx, event: 'failed_request', errorReason: reason })
    throw new Error(reason)
  }

  if (oldEmail === newEmail) return fail('New email must be different from your current email.')

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

  // Per-user rate limit: at most 3 email-change requests per rolling hour.
  const RATE_LIMIT = 3
  const since = new Date(Date.now() - 60 * 60_000).toISOString()
  const { count: recentCount } = await (supabaseAdmin as any)
    .from('email_change_audit')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', input.userId)
    .eq('event', 'requested')
    .gte('created_at', since)
  if (typeof recentCount === 'number' && recentCount >= RATE_LIMIT) {
    return fail('Too many email change requests. Please try again in an hour.')
  }


  // Check that new email isn't already in use
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return fail(error.message)
    if (data.users.find((u) => u.email?.toLowerCase() === newEmail)) {
      return fail('That email is already in use by another account.')
    }
    if (!data.nextPage) break
  }

  // Invalidate previous pending requests
  await (supabaseAdmin as any)
    .from('email_change_requests')
    .update({ consumed_at: new Date().toISOString() })
    .eq('user_id', input.userId)
    .is('consumed_at', null)

  const token = generateToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString()

  const { data: inserted, error } = await (supabaseAdmin as any)
    .from('email_change_requests')
    .insert({
      user_id: input.userId,
      old_email: oldEmail,
      new_email: newEmail,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select('id')
    .single()
  if (error) return fail(error.message)

  const requestId = (inserted as { id: string }).id
  const origin = input.siteUrl && /^https?:\/\//i.test(input.siteUrl) ? input.siteUrl : `https://${ROOT_DOMAIN}`
  const confirmationUrl = `${origin}/confirm-email-change?token=${token}`

  try {
    await sendEmailChangeEmail({ to: oldEmail, oldEmail, newEmail, confirmationUrl })
  } catch (err) {
    await writeAudit({ ...ctx, event: 'failed_request', requestId, errorReason: err instanceof Error ? err.message : 'send_failed' })
    throw err
  }

  await writeAudit({ ...ctx, event: 'requested', requestId })
}

async function sendEmailChangeEmail(args: {
  to: string
  oldEmail: string
  newEmail: string
  confirmationUrl: string
}) {
  const apiKey = process.env.LOVABLE_API_KEY
  if (!apiKey) throw new Error('Server is missing email configuration.')

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const messageId = crypto.randomUUID()

  const element = (
    <EmailChangeEmail
      siteName={SITE_NAME}
      oldEmail={args.oldEmail}
      email={args.oldEmail}
      newEmail={args.newEmail}
      confirmationUrl={args.confirmationUrl}
    />
  )
  const html = await render(element)
  const text = await render(element, { plainText: true })

  const unsubscribeToken = await getOrCreateUnsubscribeToken(supabaseAdmin, args.to)

  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: 'email_change',
    recipient_email: args.to,
    status: 'pending',
  })

  try {
    await sendLovableEmail(
      {
        message_id: messageId,
        to: args.to,
        from: `Jenvu <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: 'Confirm your email change',
        html,
        text,
        purpose: 'transactional',
        label: 'email_change',
        idempotency_key: `email-change-${messageId}`,
        unsubscribe_token: unsubscribeToken,
      },
      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
    )
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'email_change',
      recipient_email: args.to,
      status: 'sent',
    })
  } catch (error) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'email_change',
      recipient_email: args.to,
      status: 'failed',
      error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Failed to send email',
    })
    throw new Error('Could not send confirmation email. Please try again.')
  }
}

export async function confirmEmailChangeToken(
  token: string,
  meta?: { ip?: string; userAgent?: string },
) {
  const ip = meta?.ip
  const userAgent = meta?.userAgent

  const failNoRow = async (reason: string) => {
    await writeAudit({ userId: null, event: 'failed_confirm', ip, userAgent, errorReason: reason })
    return { ok: false as const, error: reason }
  }

  if (!token || token.length < 16) return failNoRow('Invalid confirmation link.')
  const tokenHash = await sha256Hex(token)

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { data: row, error } = await (supabaseAdmin as any)
    .from('email_change_requests')
    .select('id,user_id,old_email,new_email,expires_at,consumed_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error) return failNoRow(error.message)
  if (!row) return failNoRow('This confirmation link is invalid.')

  const ctx = {
    userId: row.user_id as string,
    oldEmail: row.old_email as string,
    newEmail: row.new_email as string,
    requestId: row.id as string,
    ip,
    userAgent,
  }

  if (row.consumed_at) {
    await writeAudit({ ...ctx, event: 'failed_confirm', errorReason: 'already_used' })
    return { ok: false as const, error: 'This confirmation link has already been used.' }
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await writeAudit({ ...ctx, event: 'failed_confirm', errorReason: 'expired' })
    return { ok: false as const, error: 'This confirmation link has expired. Please request a new one.' }
  }

  const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(row.user_id, {
    email: row.new_email,
    email_confirm: true,
  })
  if (updErr) {
    await writeAudit({ ...ctx, event: 'failed_confirm', errorReason: updErr.message })
    return { ok: false as const, error: updErr.message }
  }

  // Sign out all sessions across all devices for this user after email change
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const url = `${process.env.SUPABASE_URL}/auth/v1/admin/users/${row.user_id}/logout?scope=global`
    await fetch(url, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    })
  } catch {}




  await (supabaseAdmin as any)
    .from('email_change_requests')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)

  await writeAudit({ ...ctx, event: 'confirmed' })
  return { ok: true as const, newEmail: row.new_email as string }
}
