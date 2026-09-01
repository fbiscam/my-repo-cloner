// Core server functions for the Jenvu Leads platform.
// Thin wrappers only: every helper lives in db.server.ts / shared.ts.

import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import {
  LEAD_CREDIT_COST,
  LEAD_STATUSES,
  dedupeKeyFor,
  type LeadInput,
  type LeadStatus,
} from './shared'
import { admin, resolveActor, creditState, charge, logActivity } from './db.server'

export const getMe = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims?.email as string | undefined) ?? ''
    const actor = await resolveActor(context.userId, email)
    const db = await admin()
    const { data: profile } = await db
      .from('lg_profiles')
      .select('full_name,is_disabled,email')
      .eq('user_id', actor.userId)
      .maybeSingle()
    return {
      user_id: actor.userId,
      email: profile?.email ?? actor.email,
      full_name: profile?.full_name ?? null,
      is_admin: actor.isAdmin,
      is_disabled: !!profile?.is_disabled,
      credits: await creditState(actor.userId),
    }
  })

export const listLists = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin()
    const { data } = await db
      .from('lg_lead_lists')
      .select('id,name,description,created_at')
      .eq('user_id', context.userId)
      .order('created_at', { ascending: false })
    const lists = data ?? []
    const { data: counts } = await db
      .from('lg_leads')
      .select('list_id')
      .eq('user_id', context.userId)
    const tally = new Map<string, number>()
    for (const row of counts ?? []) {
      if (row.list_id) tally.set(row.list_id, (tally.get(row.list_id) ?? 0) + 1)
    }
    return lists.map((l) => ({ ...l, lead_count: tally.get(l.id) ?? 0 }))
  })

export const createList = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; description?: string }) => {
    const name = String(i?.name ?? '').trim()
    if (!name) throw new Error('List name is required.')
    return { name: name.slice(0, 120), description: (i.description ?? '').slice(0, 500) || null }
  })
  .handler(async ({ data, context }) => {
    const db = await admin()
    const { data: row, error } = await db
      .from('lg_lead_lists')
      .insert({ user_id: context.userId, name: data.name, description: data.description })
      .select('id,name,description,created_at')
      .single()
    if (error) throw new Error(error.message)
    return row
  })

export const deleteList = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: String(i.id) }))
  .handler(async ({ data, context }) => {
    const db = await admin()
    await db.from('lg_lead_lists').delete().eq('id', data.id).eq('user_id', context.userId)
    return { ok: true }
  })

export const listLeads = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { listId?: string | null; limit?: number } | undefined) => ({
    listId: i?.listId ?? null,
    limit: Math.min(Math.max(Number(i?.limit) || 500, 1), 2000),
  }))
  .handler(async ({ data, context }) => {
    const db = await admin()
    let q = db
      .from('lg_leads')
      .select(
        'id,list_id,source,name,title,company,category,address,city,country,phone,email,website,socials,rating,reviews,status,notes,revealed,created_at',
      )
      .eq('user_id', context.userId)
      .order('created_at', { ascending: false })
      .limit(data.limit)
    if (data.listId) q = q.eq('list_id', data.listId)
    const { data: rows } = await q
    return rows ?? []
  })

/** Saving or revealing a lead costs LEAD_CREDIT_COST per new lead — admins included. */
export const saveLeads = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { leads: LeadInput[]; listId?: string | null }) => {
    const leads = Array.isArray(i?.leads) ? i.leads.slice(0, 200) : []
    if (leads.length === 0) throw new Error('No leads selected.')
    return { leads, listId: i.listId ?? null }
  })
  .handler(async ({ data, context }) => {
    const db = await admin()
    const keys = data.leads.map(dedupeKeyFor)
    const { data: existing } = await db
      .from('lg_leads')
      .select('dedupe_key')
      .eq('user_id', context.userId)
      .in('dedupe_key', keys)
    const seen = new Set((existing ?? []).map((r) => r.dedupe_key))

    const fresh = data.leads.filter((l) => {
      const k = dedupeKeyFor(l)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (fresh.length === 0) {
      return { saved: 0, duplicates: data.leads.length, remaining: (await creditState(context.userId)).remaining }
    }

    // Provider-sourced leads are already charged the moment they are extracted
    // (maps/people/enrich search). Only CSV imports are billed here.
    const billable = fresh.filter((l) => l.source === 'csv').length
    const cost = Number((billable * LEAD_CREDIT_COST).toFixed(2))
    const remaining =
      cost > 0
        ? await charge(context.userId, 'lead_save', cost, data.listId, { count: billable })
        : (await creditState(context.userId)).remaining

    const { error } = await db.from('lg_leads').insert(
      fresh.map((l) => ({
        user_id: context.userId,
        list_id: data.listId,
        source: l.source,
        name: l.name,
        title: l.title ?? null,
        company: l.company ?? null,
        category: l.category ?? null,
        address: l.address ?? null,
        city: l.city ?? null,
        country: l.country ?? null,
        phone: l.phone ?? null,
        email: l.email ?? null,
        website: l.website ?? null,
        socials: l.socials ?? {},
        rating: l.rating ?? null,
        reviews: l.reviews ?? null,
        external_id: l.external_id ?? null,
        revealed: l.revealed ?? true,
        dedupe_key: dedupeKeyFor(l),
      })),
    )
    if (error) throw new Error(error.message)
    return { saved: fresh.length, duplicates: data.leads.length - fresh.length, remaining }
  })

export const updateLead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; status?: LeadStatus; notes?: string; listId?: string | null }) => {
    if (i.status && !LEAD_STATUSES.includes(i.status)) throw new Error('Invalid status.')
    return i
  })
  .handler(async ({ data, context }) => {
    const db = await admin()
    const patch: Record<string, unknown> = {}
    if (data.status) patch.status = data.status
    if (data.notes !== undefined) patch.notes = data.notes.slice(0, 4000)
    if (data.listId !== undefined) patch.list_id = data.listId
    const { error } = await db
      .from('lg_leads')
      .update(patch)
      .eq('id', data.id)
      .eq('user_id', context.userId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const deleteLeads = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { ids: string[] }) => ({ ids: (i.ids ?? []).slice(0, 500).map(String) }))
  .handler(async ({ data, context }) => {
    const db = await admin()
    await db.from('lg_leads').delete().in('id', data.ids).eq('user_id', context.userId)
    return { ok: true }
  })

export const getActivity = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string; scope?: 'me' | 'all' } | undefined) => ({
    from: i?.from ?? null,
    to: i?.to ?? null,
    scope: i?.scope === 'all' ? ('all' as const) : ('me' as const),
  }))
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string | undefined) ?? ''
    const actor = await resolveActor(context.userId, email)
    const db = await admin()
    let q = db
      .from('lg_usage_events')
      .select('id,user_id,kind,credits,ref_id,meta,created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    if (data.scope === 'all' && actor.isAdmin) {
      // admin sees everything
    } else {
      q = q.eq('user_id', context.userId)
    }
    if (data.from) q = q.gte('created_at', data.from)
    if (data.to) q = q.lte('created_at', data.to)
    const { data: rows } = await q

    const ids = [...new Set((rows ?? []).map((r) => r.user_id))]
    const { data: people } = await db.from('lg_profiles').select('user_id,email').in('user_id', ids)
    const emails = new Map((people ?? []).map((p) => [p.user_id, p.email]))
    return (rows ?? []).map((r) => ({ ...r, email: emails.get(r.user_id) ?? '—' }))
  })

export const getOverview = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin()
    const [{ count: leadCount }, { count: listCount }, { data: recent }] = await Promise.all([
      db.from('lg_leads').select('id', { count: 'exact', head: true }).eq('user_id', context.userId),
      db
        .from('lg_lead_lists')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', context.userId),
      db
        .from('lg_lead_lists')
        .select('id,name,created_at')
        .eq('user_id', context.userId)
        .order('created_at', { ascending: false })
        .limit(5),
    ])
    await logActivity(context.userId, 'dashboard_view')
    return {
      leads: leadCount ?? 0,
      lists: listCount ?? 0,
      recentLists: recent ?? [],
      credits: await creditState(context.userId),
    }
  })
