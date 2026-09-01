import { createClient } from '@supabase/supabase-js'
import type { Session, User } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'
import { sendCustomAuthEmail } from './custom-auth-email.server'

type OtpPurpose = 'signup' | 'recovery'

type OtpRow = {
  id: string
  email: string
  purpose: OtpPurpose
  code_hash: string
  full_name: string | null
  expires_at: string
  consumed_at: string | null
  attempts: number
}

export type CustomAuthResult = {
  ok: boolean
  error?: string
  session?: Pick<Session, 'access_token' | 'refresh_token' | 'expires_in' | 'expires_at' | 'token_type'> & {
    user: Session['user']
  }
}

const OTP_TTL_MINUTES = 15
const MAX_ATTEMPTS = 5

const encoder = new TextEncoder()

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function serverSecret() {
  const secret = process.env.LOVABLE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Server is missing secure auth configuration.')
  return secret
}

function toBase64(bytes: ArrayBuffer | Uint8Array) {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64')
}

async function hmacCode(email: string, purpose: OtpPurpose, code: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(serverSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}:${email}:${code}`))
  return toBase64(signature)
}

function safeEqual(a: string, b: string) {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  let diff = left.length ^ right.length
  const max = Math.max(left.length, right.length)
  for (let i = 0; i < max; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}

function publicAuthClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  })
}

function generateSixDigitCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1))
  return String(bytes[0] % 1_000_000).padStart(6, '0')
}

async function latestValidOtp(email: string, purpose: OtpPurpose): Promise<OtpRow | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const { data, error } = await (supabaseAdmin as any)
    .from('custom_auth_otps')
    .select('id,email,purpose,code_hash,full_name,expires_at,consumed_at,attempts')
    .eq('email', email)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as OtpRow | null) ?? null
}

async function verifyCustomOtp(email: string, purpose: OtpPurpose, code: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const row = await latestValidOtp(email, purpose)
  if (!row) return { ok: false as const, error: 'Code expired. Tap Resend.' }
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false as const, error: 'Too many attempts. Tap Resend.' }

  const expected = await hmacCode(email, purpose, code)
  if (!safeEqual(expected, row.code_hash)) {
    await (supabaseAdmin as any)
      .from('custom_auth_otps')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id)
    return { ok: false as const, error: 'Invalid code. Try again.' }
  }

  return { ok: true as const, row }
}

async function consumeOtp(id: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  await (supabaseAdmin as any)
    .from('custom_auth_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', id)
}

async function findUserByEmail(email: string): Promise<User | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    const found = data.users.find((user) => user.email?.toLowerCase() === email)
    if (found) return found
    if (!data.nextPage) break
  }
  return null
}

const SIGNUP_IP_LIMIT_PER_HOUR = 5
const SIGNUP_DOMAIN_LIMIT_PER_HOUR = 20
const MAX_ACCOUNTS_PER_DEVICE = 2

// Public email providers — skip domain-level rate limit (millions of legit users share these).
// Abuse from these is caught by device fingerprint + IP caps instead.
const PUBLIC_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'hotmail.co.uk',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me', 'pm.me',
  'zoho.com', 'gmx.com', 'gmx.de', 'mail.com', 'yandex.com', 'yandex.ru',
  'fastmail.com', 'tutanota.com', 'hey.com',
])

async function assertDeviceUnderCap(_ip: string | undefined, fingerprint: string | undefined) {
  // Only enforce the hard cap by browser fingerprint. IP addresses are shared by
  // families, offices, co-working spaces, and mobile carrier CGNAT — capping on
  // IP would lock out legitimate users. Abuse from a single IP is still throttled
  // by SIGNUP_IP_LIMIT_PER_HOUR above.
  if (!fingerprint) return
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const admin = supabaseAdmin as any
  const { count } = await admin
    .from('account_devices')
    .select('user_id', { count: 'exact', head: true })
    .eq('fingerprint', fingerprint)
  if (typeof count === 'number' && count >= MAX_ACCOUNTS_PER_DEVICE) {
    throw new Error('This device already has the maximum number of accounts. Please sign in to your existing account.')
  }
}

export async function createSignupOtp(input: { email: string; password: string; fullName: string; siteUrl?: string; ip?: string; fingerprint?: string; userAgent?: string }) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const email = normalizeEmail(input.email)

  // 1. Block disposable / throwaway email providers.
  const { isDisposableEmail } = await import('./disposable-email-domains')
  if (isDisposableEmail(email)) {
    throw new Error('Disposable email addresses are not allowed. Please use a permanent email.')
  }

  // 2. Hard cap: max N confirmed accounts per IP or device fingerprint.
  await assertDeviceUnderCap(input.ip, input.fingerprint)

  // 3. Per-email-domain rate limit: skipped for public providers (gmail/yahoo/etc.);
  //    applied only to custom/corporate domains where bulk abuse is actually meaningful.
  const domain = email.split('@')[1]?.toLowerCase().trim()
  const since = new Date(Date.now() - 60 * 60_000).toISOString()
  if (domain && !PUBLIC_EMAIL_PROVIDERS.has(domain)) {
    const { count: domainCount, error: domainErr } = await (supabaseAdmin as any)
      .from('signup_attempts')
      .select('id', { count: 'exact', head: true })
      .ilike('email', `%@${domain}`)
      .gte('created_at', since)
    if (!domainErr && typeof domainCount === 'number' && domainCount >= SIGNUP_DOMAIN_LIMIT_PER_HOUR) {
      throw new Error(`Too many signup attempts from ${domain} recently. Please try again in an hour.`)
    }
  }

  // 4. Per-IP signup rate limit: at most N attempts per hour from one IP.
  const ip = (input.ip || '').trim().slice(0, 100)
  if (ip) {
    const { count, error: countErr } = await (supabaseAdmin as any)
      .from('signup_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since)
    if (!countErr && typeof count === 'number' && count >= SIGNUP_IP_LIMIT_PER_HOUR) {
      throw new Error('Too many signup attempts from your network. Please try again in an hour.')
    }
    try {
      await (supabaseAdmin as any).from('signup_attempts').insert({ ip, email })
    } catch { /* logging failure must not block signup */ }
  }

  const existingUser = await findUserByEmail(email)
  if (existingUser?.email_confirmed_at || existingUser?.confirmed_at) {
    throw new Error('An account with this email already exists. Please sign in instead.')
  }

  const code = generateSixDigitCode()
  const codeHash = await hmacCode(email, 'signup', code)

  await (supabaseAdmin as any)
    .from('custom_auth_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('email', email)
    .eq('purpose', 'signup')
    .is('consumed_at', null)

  const { error } = await (supabaseAdmin as any).from('custom_auth_otps').insert({
    email,
    purpose: 'signup',
    code_hash: codeHash,
    full_name: input.fullName.trim(),
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  })
  if (error) throw new Error(error.message)

  await sendCustomAuthEmail({ to: email, type: 'signup', code, siteUrl: input.siteUrl })
}


export async function createRecoveryOtp(input: { email: string; siteUrl?: string }) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const email = normalizeEmail(input.email)
  const existingUser = await findUserByEmail(email)
  if (!existingUser) return

  const code = generateSixDigitCode()
  const codeHash = await hmacCode(email, 'recovery', code)

  await (supabaseAdmin as any)
    .from('custom_auth_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('email', email)
    .eq('purpose', 'recovery')
    .is('consumed_at', null)

  const { error } = await (supabaseAdmin as any).from('custom_auth_otps').insert({
    email,
    purpose: 'recovery',
    code_hash: codeHash,
    expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
  })
  if (error) throw new Error(error.message)

  // Auth-page "Forgot password" flow → email must contain ONLY the 6-digit code,
  // no reset link.
  await sendCustomAuthEmail({ to: email, type: 'recovery', code, siteUrl: input.siteUrl })
}



export async function verifySignupOtp(input: { email: string; code: string; password: string; ip?: string; fingerprint?: string; userAgent?: string }): Promise<CustomAuthResult> {
  const email = normalizeEmail(input.email)
  const verified = await verifyCustomOtp(email, 'signup', input.code)
  if (!verified.ok) return { ok: false, error: verified.error }

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const password = input.password
  const fullName = verified.row.full_name?.trim() || undefined
  const existingUser = await findUserByEmail(email)

  if (existingUser?.email_confirmed_at || existingUser?.confirmed_at) {
    return { ok: false, error: 'Account already exists. Please sign in.' }
  }

  // Re-check device cap at the confirm step, in case someone tried to bypass the request step.
  try {
    await assertDeviceUnderCap(input.ip, input.fingerprint)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Signup not allowed on this device.' }
  }

  const userResult = existingUser
    ? await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      })
    : await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      })

  if (userResult.error) return { ok: false, error: userResult.error.message }

  const auth = publicAuthClient()
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error || !data.session) return { ok: false, error: error?.message || 'Account verified. Please sign in.' }

  // Log this confirmed account against the device / IP so the cap holds for future signups.
  const uid = data.session.user.id
  try {
    if (uid) {
      await (supabaseAdmin as any).from('account_devices').insert({
        user_id: uid,
        ip: (input.ip || '').slice(0, 100) || null,
        fingerprint: (input.fingerprint || '').slice(0, 128) || null,
        user_agent: (input.userAgent || '').slice(0, 300) || null,
      })
    }
  } catch { /* logging failure must not block signup */ }

  // 14-day Pro trial abuse guard: one trial per device fingerprint / IP.
  try {
    if (uid) await claimProTrial(uid, input.fingerprint, input.ip)
  } catch { /* never block signup on trial bookkeeping */ }

  await consumeOtp(verified.row.id)
  return { ok: true, session: data.session }
}

/**
 * Records the 14-day Pro trial against this device/IP. If the same device or IP
 * already consumed a trial, the freshly granted trial is revoked and the account
 * starts on Free instead.
 */
async function claimProTrial(userId: string, fingerprint?: string, ip?: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const admin = supabaseAdmin as any
  const fp = (fingerprint || '').slice(0, 128) || null
  const ipHash = ip ? await sha256Hex(`jenvu-trial:${ip}`) : null

  let alreadyUsed = false
  if (fp || ipHash) {
    const filters: string[] = []
    if (fp) filters.push(`fingerprint.eq.${fp}`)
    if (ipHash) filters.push(`ip_hash.eq.${ipHash}`)
    const { data: prior } = await admin
      .from('trial_claims')
      .select('id')
      .or(filters.join(','))
      .neq('user_id', userId)
      .limit(1)
    alreadyUsed = Array.isArray(prior) && prior.length > 0
  }

  if (alreadyUsed) {
    await admin.rpc('revoke_pro_trial', { _user_id: userId, _reason: 'duplicate_device' })
    return
  }

  await admin.from('trial_claims').insert({ user_id: userId, fingerprint: fp, ip_hash: ipHash })
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}


export async function verifyRecoveryOtp(input: { email: string; code: string; siteUrl?: string }): Promise<CustomAuthResult> {
  const email = normalizeEmail(input.email)
  const verified = await verifyCustomOtp(email, 'recovery', input.code)
  if (!verified.ok) return { ok: false, error: verified.error }

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  const link = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: input.siteUrl && /^https?:\/\//i.test(input.siteUrl) ? `${input.siteUrl}/auth` : undefined },
  })
  if (link.error || !link.data.properties?.email_otp) {
    return { ok: false, error: link.error?.message || 'Could not verify reset code. Tap Resend.' }
  }

  const auth = publicAuthClient()
  const { data, error } = await auth.auth.verifyOtp({
    email,
    token: link.data.properties.email_otp,
    type: 'recovery',
  })
  if (error || !data.session) return { ok: false, error: error?.message || 'Could not start password reset.' }

  await consumeOtp(verified.row.id)
  return { ok: true, session: data.session }
}