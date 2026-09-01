// Admin-only server functions: user provisioning, roles, credit limits.

import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { admin, resolveActor } from './db.server'

async function requireAdmin(userId: string, email: string) {
  const actor = await resolveActor(userId, email)
  if (!actor.isAdmin) throw new Error('Forbidden')
  return actor
}

function randomPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export const listUsers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, (context.claims?.email as string) ?? '')
    const db = await admin()
    const { data: profiles } = await db
      .from('lg_profiles')
      .select('user_id,email,full_name,is_disabled,monthly_credit_limit,created_at')
      .order('created_at', { ascending: false })
    const { data: roles } = await db.from('lg_user_roles').select('user_id,role')
    const { data: usage } = await db
      .from('lg_usage_events')
      .select('user_id,credits,created_at')
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

    const roleMap = new Map<string, string>()
    for (const r of roles ?? []) {
      if (r.role === 'admin' || !roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role)
    }
    const usedMap = new Map<string, number>()
    for (const u of usage ?? []) {
      usedMap.set(u.user_id, (usedMap.get(u.user_id) ?? 0) + Number(u.credits))
    }
    return (profiles ?? []).map((p) => ({
      ...p,
      monthly_credit_limit: Number(p.monthly_credit_limit),
      role: roleMap.get(p.user_id) ?? 'member',
      used: Number((usedMap.get(p.user_id) ?? 0).toFixed(2)),
    }))
  })

export const createUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { email: string; password?: string; fullName?: string; role?: 'admin' | 'member'; limit?: number }) => {
      const email = String(i?.email ?? '').trim().toLowerCase()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.')
      const password = String(i.password ?? '').trim()
      if (password && password.length < 10) throw new Error('Password must be at least 10 characters.')
      return {
        email,
        password: password || null,
        fullName: (i.fullName ?? '').slice(0, 120) || null,
        role: i.role === 'admin' ? ('admin' as const) : ('member' as const),
        limit: Math.min(Math.max(Number(i.limit ?? 150), 0), 100000),
      }
    },
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, (context.claims?.email as string) ?? '')
    const db = await admin()
    const password = data.password ?? randomPassword()
    const { data: created, error } = await db.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, leadgen: true },
    })
    if (error || !created?.user) throw new Error(error?.message ?? 'Could not create the account.')

    await db.from('lg_profiles').upsert(
      {
        user_id: created.user.id,
        email: data.email,
        full_name: data.fullName,
        monthly_credit_limit: data.limit,
      },
      { onConflict: 'user_id' },
    )
    await db
      .from('lg_user_roles')
      .upsert({ user_id: created.user.id, role: data.role }, { onConflict: 'user_id,role' })

    return { ok: true as const, email: data.email, password, userId: created.user.id }
  })

export const updateUser = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { userId: string; role?: 'admin' | 'member'; limit?: number; disabled?: boolean }) => ({
      userId: String(i.userId),
      role: i.role === 'admin' ? ('admin' as const) : i.role === 'member' ? ('member' as const) : null,
      limit: i.limit === undefined ? null : Math.min(Math.max(Number(i.limit), 0), 100000),
      disabled: typeof i.disabled === 'boolean' ? i.disabled : null,
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, (context.claims?.email as string) ?? '')
    const db = await admin()

    const patch: Record<string, unknown> = {}
    if (data.limit !== null) patch.monthly_credit_limit = data.limit
    if (data.disabled !== null) patch.is_disabled = data.disabled
    if (Object.keys(patch).length > 0) {
      await db.from('lg_profiles').update(patch).eq('user_id', data.userId)
    }

    if (data.role) {
      await db.from('lg_user_roles').delete().eq('user_id', data.userId)
      await db.from('lg_user_roles').insert({ user_id: data.userId, role: data.role })
    }
    return { ok: true as const }
  })

export const resetUserPassword = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { userId: string }) => ({ userId: String(i.userId) }))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, (context.claims?.email as string) ?? '')
    const db = await admin()
    const password = randomPassword()
    const { error } = await db.auth.admin.updateUserById(data.userId, { password })
    if (error) throw new Error(error.message)
    return { ok: true as const, password }
  })

export const changeOwnPassword = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { password: string }) => {
    const password = String(i?.password ?? '')
    if (password.length < 10) throw new Error('Password must be at least 10 characters.')
    return { password }
  })
  .handler(async ({ data, context }) => {
    const db = await admin()
    const { error } = await db.auth.admin.updateUserById(context.userId, { password: data.password })
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })

/**
 * One-time bootstrap: creates the very first admin account for an email that is
 * pre-listed in lg_role_grants. Self-disables permanently once any admin role
 * row exists, so it cannot be replayed.
 */
export const bootstrapFirstAdmin = createServerFn({ method: 'POST' })
  .inputValidator((i: { email: string }) => ({
    email: String(i?.email ?? '').trim().toLowerCase(),
  }))
  .handler(async ({ data }) => {
    const db = await admin()
    const { count } = await db
      .from('lg_user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
    if ((count ?? 0) > 0) return { ok: false as const, error: 'already_bootstrapped' }

    const { data: grant } = await db
      .from('lg_role_grants')
      .select('email')
      .eq('email', data.email)
      .eq('role', 'admin')
      .maybeSingle()
    if (!grant) return { ok: false as const, error: 'not_granted' }

    const password = randomPassword()
    const { data: created, error } = await db.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { leadgen: true },
    })
    if (error || !created?.user) return { ok: false as const, error: error?.message ?? 'failed' }

    await db.from('lg_profiles').upsert(
      { user_id: created.user.id, email: data.email, monthly_credit_limit: 100000 },
      { onConflict: 'user_id' },
    )
    await db.from('lg_user_roles').insert({ user_id: created.user.id, role: 'admin' })
    return { ok: true as const, email: data.email, password }
  })
