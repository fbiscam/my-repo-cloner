// Public server function: log an error into public.error_log.
// Callable without auth so guest sessions can also report errors.
// Writes are gated by the SECURITY DEFINER `log_error` DB function.

import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'

type LogErrorInput = {
  message: string
  stack?: string | null
  route?: string | null
  mechanism?: string | null
  severity?: 'error' | 'warning' | 'info'
  source?: 'client' | 'server' | 'cron'
  metadata?: Record<string, unknown>
}

export const logError = createServerFn({ method: 'POST' })
  .inputValidator((data: LogErrorInput) => {
    if (!data || typeof data.message !== 'string' || data.message.length === 0) {
      throw new Error('message required')
    }
    return {
      message: data.message.slice(0, 4000),
      stack: data.stack ? String(data.stack).slice(0, 10000) : null,
      route: data.route ? String(data.route).slice(0, 300) : null,
      mechanism: data.mechanism ? String(data.mechanism).slice(0, 60) : null,
      severity: (data.severity ?? 'error') as 'error' | 'warning' | 'info',
      source: (data.source ?? 'client') as 'client' | 'server' | 'cron',
      metadata: (data.metadata ?? {}) as Record<string, unknown>,
    }
  })
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
      const ua = getRequestHeader('user-agent') ?? null
      const { error } = await supabaseAdmin.rpc('log_error', {
        _message: data.message,
        _stack: data.stack ?? undefined,
        _route: data.route ?? undefined,
        _source: data.source,
        _mechanism: data.mechanism ?? undefined,
        _severity: data.severity,
        _user_agent: ua ?? undefined,
        _metadata: (data.metadata ?? {}) as never,
      })
      if (error) return { ok: false as const, error: error.message }
      return { ok: true as const }

    } catch (e) {
      // Never let error logging cause its own error loop.
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  })
