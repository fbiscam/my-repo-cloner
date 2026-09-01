// Server-only helpers for the Jenvu Leads platform.
// Never import this from a route or component — only from *.functions.ts handlers.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function admin() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  return supabaseAdmin as unknown as SupabaseClient
}

export type Actor = {
  userId: string
  email: string
  isAdmin: boolean
}

/** Resolve the caller's leads-platform profile, provisioning it on first sign-in. */
export async function resolveActor(userId: string, email: string): Promise<Actor> {
  const db = await admin()
  const { data: profile } = await db
    .from('lg_profiles')
    .select('user_id,is_disabled')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile) {
    // Free tier: 50 credits on first sign-in (a saved/revealed lead costs 0.5,
    // so that is 100 leads). Admins can raise the limit per user.
    await db.from('lg_profiles').upsert(
      { user_id: userId, email: email.toLowerCase(), monthly_credit_limit: 50 },
      { onConflict: 'user_id' },
    )

  } else if (profile.is_disabled) {
    throw new Error('Your account has been disabled. Contact an administrator.')
  }

  const { data: isAdmin } = await db.rpc('has_lg_role', {
    _user_id: userId,
    _role: 'admin',
  })

  // Materialise an email-based bootstrap grant into a real role row.
  if (isAdmin) {
    await db.from('lg_user_roles').upsert(
      { user_id: userId, role: 'admin' },
      { onConflict: 'user_id,role' },
    )
  } else {
    await db.from('lg_user_roles').upsert(
      { user_id: userId, role: 'member' },
      { onConflict: 'user_id,role' },
    )
  }

  return { userId, email: email.toLowerCase(), isAdmin: !!isAdmin }
}

export async function creditState(userId: string) {
  const db = await admin()
  const { data } = await db.rpc('lg_credit_state', { _user_id: userId })
  const row = Array.isArray(data) ? data[0] : data
  return {
    monthly_limit: Number(row?.monthly_limit ?? 0),
    used: Number(row?.used ?? 0),
    remaining: Number(row?.remaining ?? 0),
  }
}

export async function charge(
  userId: string,
  kind: string,
  credits: number,
  ref?: string | null,
  meta: Record<string, unknown> = {},
) {
  const db = await admin()
  const { data, error } = await db.rpc('lg_charge_credits', {
    _user_id: userId,
    _kind: kind,
    _credits: credits,
    _ref: ref ?? null,
    _meta: meta,
  })
  if (error) {
    if (error.message.includes('insufficient_credits')) {
      throw new Error('You have used all of your credits for this month.')
    }
    throw new Error(error.message)
  }
  return Number(data ?? 0)
}

/**
 * Charge once per (user, ref) inside a window. Provider results are cached, so
 * re-running the exact same search must not bill the user a second time.
 */
export async function chargeOnce(
  userId: string,
  kind: string,
  credits: number,
  ref: string,
  windowMinutes: number,
  meta: Record<string, unknown> = {},
) {
  const db = await admin()
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  const { data: prior } = await db
    .from('lg_usage_events')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('ref_id', ref)
    .gte('created_at', since)
    .limit(1)
  if (prior && prior.length > 0) {
    const { remaining } = await creditState(userId)
    return remaining
  }
  return await charge(userId, kind, credits, ref, meta)
}

/** Cached provider fetch. `ttlMinutes` controls how long results stay warm. */
export async function cached<T>(
  provider: string,
  key: string,
  ttlMinutes: number,
  loader: () => Promise<T>,
): Promise<T> {
  const db = await admin()
  const cacheKey = `${provider}:${key}`
  const { data: hit } = await db
    .from('lg_search_cache')
    .select('payload,expires_at')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (hit && new Date(hit.expires_at).getTime() > Date.now()) {
    return hit.payload as T
  }

  const payload = await loader()
  await db.from('lg_search_cache').upsert(
    {
      cache_key: cacheKey,
      provider,
      payload: payload as never,
      expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
    },
    { onConflict: 'cache_key' },
  )
  return payload
}

export async function logActivity(
  userId: string,
  kind: string,
  meta: Record<string, unknown> = {},
) {
  const db = await admin()
  await db.from('lg_usage_events').insert({ user_id: userId, kind, credits: 0, meta })
}
