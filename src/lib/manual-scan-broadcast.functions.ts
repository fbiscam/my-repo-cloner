// Fires the shared auto-scan broadcast pipeline in "manual" mode after a
// user's on-page analyze on /signal succeeds. Bypasses cooldown / two-hit /
// daily cap so a deliberate user scan still delivers to paid subscribers,
// but keeps every safety gate (killzone, HTF align, min conf, dedup,
// freshness, re-quote). The caller is excluded from the broadcast fan-out.
import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

interface Input { pair: string }

export const runManualScanBroadcast = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => ({
    pair: String(input.pair ?? '').toUpperCase().replace(/[^A-Z]/g, ''),
  }))
  .handler(async ({ data, context }) => {
    const pair = data.pair
    if (!pair || !pair.startsWith('XAU')) {
      return { ok: false as const, error: 'unsupported_pair' }
    }
    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    if (!svc) return { ok: false as const, error: 'missing_env' }

    // Cloudflare Workers `fetch` requires an absolute URL — a bare path
    // throws and the manual broadcast silently never leaves the server.
    // Resolve against PUBLIC_APP_URL (falls back to the stable project URL).
    const base =
      process.env.PUBLIC_APP_URL ||
      'https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app'
    try {
      // Auth: service-role-signed manual body (the hook accepts it in place
      // of the x-cron-secret header when `manual: true`).
      const res = await fetch(`${base}/api/public/hooks/auto-scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          manual: true,
          pair,
          manual_token: svc,
          exclude_user_id: context.userId,
        }),
      })
      const body = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, body }
    } catch (e) {
      return { ok: false as const, error: (e as Error).message }
    }
  })
