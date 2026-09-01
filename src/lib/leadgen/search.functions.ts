// Provider-backed search server functions. Thin wrappers only.

import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { admin, cached, creditState, logActivity, chargeOnce } from './db.server'
import { LEAD_CREDIT_COST } from './shared'
import { mapsSearch, peopleSearch, enrichDomain, providerStatus } from './providers.server'
import type { LeadInput } from './shared'

export const getProviderStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async () => providerStatus())

export const searchMaps = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { keyword: string; location: string; radius?: number; max?: number }) => {
    const keyword = String(i?.keyword ?? '').trim()
    if (!keyword) throw new Error('Enter a keyword, e.g. "dental clinic".')
    return {
      keyword: keyword.slice(0, 120),
      location: String(i?.location ?? '').trim().slice(0, 120),
      radius: Math.min(Math.max(Number(i?.radius) || 10, 1), 100),
      max: Math.min(Math.max(Number(i?.max) || 20, 1), 60),
    }
  })
  .handler(async ({ data, context }) => {
    const { remaining } = await creditState(context.userId)
    if (remaining <= 0) throw new Error('You have used all of your credits for this month.')

    const query = data.location
      ? `${data.keyword} in ${data.location} within ${data.radius} km`
      : data.keyword
    const results = await cached<LeadInput[]>(
      'google_maps',
      `${query}|${data.max}`,
      60 * 24,
      () => mapsSearch(query, data.max),
    )
    const cost = Number((results.length * LEAD_CREDIT_COST).toFixed(2))
    const left = cost > 0
      ? await chargeOnce(context.userId, 'maps_extract', cost, `maps:${query}|${data.max}`, 60 * 24, { query, count: results.length })
      : remaining
    await logActivity(context.userId, 'maps_search', { query, results: results.length })
    return { results, remaining: left }
  })

export const searchPeople = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name?: string; title?: string; company?: string; domain?: string; page?: number }) => {
    const clean = (v?: string) => String(v ?? '').trim().slice(0, 120) || undefined
    const q = {
      name: clean(i?.name),
      title: clean(i?.title),
      company: clean(i?.company),
      domain: clean(i?.domain),
      page: Math.min(Math.max(Number(i?.page) || 1, 1), 20),
    }
    if (!q.name && !q.title && !q.company && !q.domain) throw new Error('Add at least one filter.')
    return q
  })
  .handler(async ({ data, context }) => {
    const { remaining } = await creditState(context.userId)
    if (remaining <= 0) throw new Error('You have used all of your credits for this month.')

    const key = JSON.stringify(data)
    const results = await cached<LeadInput[]>('apollo', key, 60 * 12, () =>
      peopleSearch({ ...data, perPage: 25 }),
    )
    const cost = Number((results.length * LEAD_CREDIT_COST).toFixed(2))
    const left = cost > 0
      ? await chargeOnce(context.userId, 'people_extract', cost, `people:${key}`, 60 * 12, { ...data, count: results.length })
      : remaining
    await logActivity(context.userId, 'people_search', { ...data, results: results.length })
    return { results, remaining: left }
  })

export const enrichWebsite = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { domain: string }) => {
    const domain = String(i?.domain ?? '')
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
    if (!domain || !domain.includes('.')) throw new Error('Enter a valid website, e.g. acme.com')
    return { domain: domain.slice(0, 160) }
  })
  .handler(async ({ data, context }) => {
    const { remaining } = await creditState(context.userId)
    if (remaining <= 0) throw new Error('You have used all of your credits for this month.')

    const found = await cached('firecrawl', data.domain, 60 * 24 * 7, () => enrichDomain(data.domain))
    await logActivity(context.userId, 'enrich', { domain: data.domain, emails: found.emails.length })

    const results: LeadInput[] = found.emails.map((email) => ({
      source: 'firecrawl',
      name: email.split('@')[0].replace(/[._-]+/g, ' '),
      email,
      company: data.domain,
      website: `https://${data.domain}`,
      socials: found.socials,
    }))
    if (results.length === 0 && Object.keys(found.socials).length > 0) {
      results.push({
        source: 'firecrawl',
        name: data.domain,
        company: data.domain,
        website: `https://${data.domain}`,
        socials: found.socials,
      })
    }
    const cost = Number((results.length * LEAD_CREDIT_COST).toFixed(2))
    const left = cost > 0
      ? await chargeOnce(context.userId, 'enrich_extract', cost, `enrich:${data.domain}`, 60 * 24 * 7, { domain: data.domain, count: results.length })
      : remaining
    return { results, socials: found.socials, pages: found.pages, remaining: left }
  })

/** Existing dedupe keys so the import screen can preview duplicates before charging. */
export const existingKeys = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin()
    const { data } = await db.from('lg_leads').select('dedupe_key').eq('user_id', context.userId)
    return (data ?? []).map((r) => r.dedupe_key as string)
  })
