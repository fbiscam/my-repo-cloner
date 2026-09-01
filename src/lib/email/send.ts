import { supabase } from '@/integrations/supabase/client'

export interface SendEmailArgs {
  templateName: string
  recipientEmail: string
  idempotencyKey?: string
  templateData?: Record<string, unknown>
}

/**
 * Send a transactional email via /lovable/email/transactional/send.
 * Requires an authenticated Supabase session (attaches the user's JWT).
 */
export async function sendTransactionalEmail(args: SendEmailArgs): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return { ok: false, error: 'not_authenticated' }

    const res = await fetch('/lovable/email/transactional/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: text || `http_${res.status}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'send_failed' }
  }
}
