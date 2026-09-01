// Admin-only server functions for the Bug Triage page.
// - listBugGroups: paginated list of error_group rows.
// - listBugOccurrences: recent error_log rows for a single fingerprint.
// - analyzeBugGroup: sends context to the AI Gateway and stores diagnosis.
// - updateBugStatus: mark investigating / resolved / ignored + note.

import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { callChatCompletion } from '@/lib/ai-gateway'

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  })
  if (error || !data) throw new Error('forbidden')
}

export const listBugGroups = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; limit?: number } | undefined) => ({
    status: d?.status ?? 'all',
    limit: Math.min(Math.max(d?.limit ?? 50, 1), 200),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    let q = supabaseAdmin
      .from('error_group')
      .select('*')
      .order('last_seen', { ascending: false })
      .limit(data.limit)
    if (data.status !== 'all') q = q.eq('status', data.status)
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)
    return { rows: rows ?? [] }
  })

export const listBugOccurrences = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fingerprint: string }) => {
    if (!d?.fingerprint) throw new Error('fingerprint required')
    return { fingerprint: String(d.fingerprint).slice(0, 128) }
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: rows, error } = await supabaseAdmin
      .from('error_log')
      .select('id, created_at, source, mechanism, route, user_email, message, stack, user_agent, metadata')
      .eq('fingerprint', data.fingerprint)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    return { rows: rows ?? [] }
  })

export const analyzeBugGroup = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fingerprint: string }) => {
    if (!d?.fingerprint) throw new Error('fingerprint required')
    return { fingerprint: String(d.fingerprint).slice(0, 128) }
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

    const { data: group } = await supabaseAdmin
      .from('error_group')
      .select('*')
      .eq('fingerprint', data.fingerprint)
      .maybeSingle()
    if (!group) throw new Error('group not found')

    const { data: samples } = await supabaseAdmin
      .from('error_log')
      .select('created_at, source, mechanism, route, message, stack, metadata')
      .eq('fingerprint', data.fingerprint)
      .order('created_at', { ascending: false })
      .limit(5)

    const context_text = [
      `Fingerprint: ${group.fingerprint}`,
      `Occurrences: ${group.occurrences}`,
      `First seen: ${group.first_seen}`,
      `Last seen: ${group.last_seen}`,
      `Severity: ${group.severity}`,
      `Sample message: ${group.sample_message}`,
      `Sample route: ${group.sample_route ?? '(none)'}`,
      `Sample stack (truncated):\n${(group.sample_stack ?? '').slice(0, 2000)}`,
      '',
      'Recent occurrences:',
      ...(samples ?? []).map((s: any, i: number) =>
        `#${i + 1} [${s.source}/${s.mechanism ?? '—'}] ${s.route ?? '—'}\n${s.message}\n${(s.stack ?? '').slice(0, 800)}`,
      ),
    ].join('\n')

    const system = `You are a senior full-stack engineer triaging production bugs for a TanStack Start + Supabase (Lovable Cloud) trading app.
Given error telemetry, produce:
1. root_cause: one concise sentence naming the actual cause.
2. suggested_fix: 2-6 bullet steps. Reference likely file paths (e.g. src/lib/*.functions.ts, src/routes/*, migrations) when possible. Be concrete. If it's a transient / third-party issue, say so and suggest retry/fallback rather than a code change.
Respond as strict JSON: {"root_cause": string, "suggested_fix": string}.`

    const result = await callChatCompletion({
      models: ['bmind/gpt-5.6-sol', 'bmind/gpt-5.2-chat', 'bmind/gpt-5-mini'],
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context_text.slice(0, 12000) },
      ],
      jsonMode: true,
      timeoutMs: 30000,
      stage: 'bug_triage',
    })

    let root = ''
    let fix = ''
    try {
      const parsed = JSON.parse(result.content)
      root = String(parsed.root_cause ?? '').slice(0, 800)
      fix = String(parsed.suggested_fix ?? '').slice(0, 3000)
    } catch {
      root = 'AI response was not valid JSON.'
      fix = result.content.slice(0, 3000)
    }

    const { error: uerr } = await supabaseAdmin
      .from('error_group')
      .update({
        ai_root_cause: root,
        ai_suggested_fix: fix,
        ai_analyzed_at: new Date().toISOString(),
        ai_model: result.model,
        status: group.status === 'open' ? 'investigating' : group.status,
      })
      .eq('fingerprint', data.fingerprint)
    if (uerr) throw new Error(uerr.message)

    return { root_cause: root, suggested_fix: fix, model: result.model }
  })

export const updateBugStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fingerprint: string; status: 'open' | 'investigating' | 'resolved' | 'ignored'; note?: string }) => {
    if (!d?.fingerprint) throw new Error('fingerprint required')
    if (!['open', 'investigating', 'resolved', 'ignored'].includes(d.status)) throw new Error('bad status')
    return { fingerprint: String(d.fingerprint).slice(0, 128), status: d.status, note: (d.note ?? '').slice(0, 500) }
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context)
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const patch: {
      status: 'open' | 'investigating' | 'resolved' | 'ignored'
      resolution_note: string | null
      resolved_at: string | null
      resolved_by: string | null
    } = {
      status: data.status,
      resolution_note: data.note || null,
      resolved_at: data.status === 'resolved' ? new Date().toISOString() : null,
      resolved_by: data.status === 'resolved' ? context.userId : null,
    }
    const { error } = await supabaseAdmin.from('error_group').update(patch).eq('fingerprint', data.fingerprint)
    if (error) throw new Error(error.message)
    return { ok: true as const }

  })
