// Server-only provider adapters for the Jenvu Leads platform.
// Every call goes through the Lovable connector gateway — no key ever reaches the browser.

import type { LeadInput } from './shared'

const GATEWAY = 'https://connector-gateway.lovable.dev'

function gatewayHeaders(connectionKey: string) {
  const lovableKey = process.env['LOVABLE_API_KEY']
  if (!lovableKey) throw new Error('Gateway is not configured yet.')
  return {
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': connectionKey,
    'Content-Type': 'application/json',
  }
}

function requireKey(name: string, label: string) {
  const key = process.env[name]
  if (!key) {
    throw new Error(
      `${label} is not connected yet. Ask an administrator to connect it from the Lovable connectors panel.`,
    )
  }
  return key
}

export function providerStatus() {
  return {
    google_maps: !!process.env['GOOGLE_MAPS_API_KEY'],
    apollo: !!process.env['APOLLO_API_KEY'],
    firecrawl: !!process.env['FIRECRAWL_API_KEY'],
  }
}

/* ---------------------------------- Maps --------------------------------- */

type PlaceResult = {
  displayName?: { text?: string }
  formattedAddress?: string
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  primaryTypeDisplayName?: { text?: string }
  types?: string[]
  id?: string
}

export async function mapsSearch(query: string, max: number): Promise<LeadInput[]> {
  const key = requireKey('GOOGLE_MAPS_API_KEY', 'Google Maps Platform')
  const out: LeadInput[] = []
  let pageToken: string | undefined

  while (out.length < max) {
    const res = await fetch(`${GATEWAY}/google_maps/places/v1/places:searchText`, {
      method: 'POST',
      headers: {
        ...gatewayHeaders(key),
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryTypeDisplayName,places.types,nextPageToken',
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: Math.min(20, max - out.length),
        ...(pageToken ? { pageToken } : {}),
      }),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`Google Maps request failed [${res.status}]: ${text}`)
    const json = JSON.parse(text) as { places?: PlaceResult[]; nextPageToken?: string }

    for (const p of json.places ?? []) {
      out.push({
        source: 'google_maps',
        name: p.displayName?.text ?? 'Unknown',
        company: p.displayName?.text ?? null,
        category: p.primaryTypeDisplayName?.text ?? p.types?.[0]?.replace(/_/g, ' ') ?? null,
        address: p.formattedAddress ?? null,
        phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
        website: p.websiteUri ?? null,
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
        external_id: p.id ?? null,
      })
      if (out.length >= max) break
    }

    pageToken = json.nextPageToken
    if (!pageToken) break
  }

  return out
}

/* --------------------------------- Apollo -------------------------------- */

type ApolloPerson = {
  id?: string
  name?: string
  first_name?: string
  last_name?: string
  title?: string
  email?: string
  linkedin_url?: string
  twitter_url?: string
  city?: string
  country?: string
  organization?: { name?: string; website_url?: string; primary_domain?: string }
}

export async function peopleSearch(params: {
  name?: string
  title?: string
  company?: string
  domain?: string
  page: number
  perPage: number
}): Promise<LeadInput[]> {
  const key = requireKey('APOLLO_API_KEY', 'Apollo.io')
  const url = new URL(`${GATEWAY}/apollo/api/v1/mixed_people/search`)
  const qs = new URLSearchParams({
    page: String(params.page),
    per_page: String(params.perPage),
  })
  if (params.name) qs.append('q_keywords', params.name)
  if (params.title) qs.append('person_titles[]', params.title)
  if (params.company) qs.append('q_organization_name', params.company)
  if (params.domain) qs.append('q_organization_domains[]', params.domain)
  url.search = qs.toString()

  const res = await fetch(url, { method: 'POST', headers: gatewayHeaders(key) })
  const text = await res.text()
  if (res.status === 403) {
    throw new Error(
      'Apollo rejected this endpoint (403). People search needs a paid Apollo plan with a master API key — enable it in Apollo under Integrations → API.',
    )
  }
  if (!res.ok) throw new Error(`Apollo request failed [${res.status}]: ${text}`)

  const json = JSON.parse(text) as { people?: ApolloPerson[]; contacts?: ApolloPerson[] }
  const people = [...(json.people ?? []), ...(json.contacts ?? [])]

  return people.map((p) => ({
    source: 'apollo',
    name: p.name ?? [p.first_name, p.last_name].filter(Boolean).join(' ') ?? 'Unknown',
    title: p.title ?? null,
    company: p.organization?.name ?? null,
    city: p.city ?? null,
    country: p.country ?? null,
    email: p.email && !/email_not_unlocked/i.test(p.email) ? p.email : null,
    website: p.organization?.website_url ?? p.organization?.primary_domain ?? null,
    socials: {
      ...(p.linkedin_url ? { linkedin: p.linkedin_url } : {}),
      ...(p.twitter_url ? { twitter: p.twitter_url } : {}),
    },
    external_id: p.id ?? null,
  }))
}

/* -------------------------------- Firecrawl ------------------------------- */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const SOCIAL_RE =
  /https?:\/\/(?:www\.)?(linkedin\.com\/(?:company|in)\/[^\s")']+|twitter\.com\/[^\s")']+|x\.com\/[^\s")']+|facebook\.com\/[^\s")']+|instagram\.com\/[^\s")']+)/g

export async function enrichDomain(domain: string): Promise<{
  emails: string[]
  socials: Record<string, string>
  pages: number
}> {
  const key = requireKey('FIRECRAWL_API_KEY', 'Firecrawl')
  const target = domain.startsWith('http') ? domain : `https://${domain}`

  const start = await fetch(`${GATEWAY}/firecrawl/v2/crawl`, {
    method: 'POST',
    headers: gatewayHeaders(key),
    body: JSON.stringify({
      url: target,
      limit: 8,
      includePaths: ['.*contact.*', '.*about.*', '.*team.*', '.*impressum.*', '^/$'],
      scrapeOptions: { formats: ['markdown'], onlyMainContent: false },
    }),
  })
  const startText = await start.text()
  if (!start.ok) throw new Error(`Firecrawl request failed [${start.status}]: ${startText}`)
  const startJson = JSON.parse(startText) as { id?: string; url?: string }
  const jobId = startJson.id
  if (!jobId) throw new Error('Firecrawl did not return a crawl job id.')

  let docs: { markdown?: string; metadata?: { sourceURL?: string } }[] = []
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2500))
    const poll = await fetch(`${GATEWAY}/firecrawl/v2/crawl/${jobId}`, {
      headers: gatewayHeaders(key),
    })
    const pollText = await poll.text()
    if (!poll.ok) throw new Error(`Firecrawl poll failed [${poll.status}]: ${pollText}`)
    const pollJson = JSON.parse(pollText) as {
      status?: string
      data?: typeof docs
    }
    if (pollJson.status === 'completed') {
      docs = pollJson.data ?? []
      break
    }
    if (pollJson.status === 'failed') throw new Error('Firecrawl crawl failed.')
  }

  const blob = docs.map((d) => d.markdown ?? '').join('\n')
  const emails = [...new Set((blob.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))]
    .filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e))
    .slice(0, 25)

  const socials: Record<string, string> = {}
  for (const url of blob.match(SOCIAL_RE) ?? []) {
    const host = url.replace(/^https?:\/\/(www\.)?/, '').split('.')[0]
    if (!socials[host]) socials[host] = url
  }

  return { emails, socials, pages: docs.length }
}
