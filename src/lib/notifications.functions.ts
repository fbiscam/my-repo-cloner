import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

export type NotificationRow = {
  id: string
  type: string
  title: string
  body: string | null
  data: Record<string, any>
  read_at: string | null
  created_at: string
}

export const listNotifications = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: NotificationRow[]; unread: number }> => {
    const { data, error } = await context.supabase
      .from('user_notifications')
      .select('id,type,title,body,data,read_at,created_at')
      .eq('user_id', context.userId)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) return { items: [], unread: 0 }
    let items = (data ?? []) as NotificationRow[]

    const alertIds = Array.from(
      new Set(
        items
          .filter((n) => n.type === 'signal_alert' && n.data?.alert_id)
          .map((n) => String(n.data.alert_id)),
      ),
    )

    if (alertIds.length > 0) {
      const { data: alerts } = await context.supabase
        .from('signal_alerts')
        .select('id,pair,grade,direction,entry,sl,tp,rr,confidence,setup_score,rationale')
        .in('id', alertIds)

      const byId = new Map((alerts ?? []).map((a: any) => [String(a.id), a]))

      items = items.map((n) => {
        if (n.type !== 'signal_alert') return n
        const alert = byId.get(String(n.data?.alert_id ?? ''))
        if (!alert) return n

        // Use the grade stored on the alert — it's derived from the blended
        // confidence at broadcast time. Re-deriving from raw setup_score here
        // downgraded every notification to "C" because setup_score often
        // sits below 65 while the displayed confidence is 65–75%+.
        const derivedGrade = alert.grade ?? 'C'

        return {
          ...n,
          title: `${derivedGrade} ${alert.direction} · ${alert.pair}`,
          data: {
            ...(n.data ?? {}),
            pair: alert.pair,
            grade: derivedGrade,
            direction: alert.direction,
            entry: alert.entry,
            sl: alert.sl,
            tp: alert.tp,
            rr: alert.rr,
            confidence: alert.confidence,
            setup_score: alert.setup_score,
            rationale: alert.rationale,
          },
        }
      })
    }

    const unread = items.filter((n) => !n.read_at).length
    return { items, unread }
  })

export const markNotificationRead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('user_id', context.userId)
    return { ok: true }
  })

export const markAllNotificationsRead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', context.userId)
      .is('read_at', null)
    return { ok: true }
  })

export const createUserNotification = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        type: z.string().min(1).max(64),
        title: z.string().min(1).max(200),
        body: z.string().max(1000).optional().nullable(),
        data: z.record(z.string(), z.any()).optional(),
        dedupeKey: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.dedupeKey) {
      const { data: existing } = await context.supabase
        .from('user_notifications')
        .select('id')
        .eq('user_id', context.userId)
        .eq('type', data.type)
        .contains('data', { dedupeKey: data.dedupeKey })
        .limit(1)
      if (existing && existing.length > 0) return { ok: true, skipped: true }
    }
    // Notifications are system-generated: inserts go through the trusted
    // server-side client after the caller's identity has been verified.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    await supabaseAdmin.from('user_notifications').insert({
      user_id: context.userId,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      data: { ...(data.data ?? {}), ...(data.dedupeKey ? { dedupeKey: data.dedupeKey } : {}) },
    })
    return { ok: true }
  })

export const deleteNotification = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from('user_notifications')
      .delete()
      .eq('id', data.id)
      .eq('user_id', context.userId)
    return { ok: true }
  })

export const deleteNotifications = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from('user_notifications')
      .delete()
      .in('id', data.ids)
      .eq('user_id', context.userId)
    return { ok: true }
  })
