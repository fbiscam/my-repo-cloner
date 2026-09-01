import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

export const getAlertsEnabled = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context
    const { data } = await supabase
      .from('alert_preferences')
      .select('alerts_enabled')
      .eq('user_id', userId)
      .maybeSingle()
    return { enabled: data ? (data as { alerts_enabled: boolean }).alerts_enabled !== false : true }
  })

export const setAlertsEnabled = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => ({ enabled: !!input.enabled }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context
    const { error } = await supabase
      .from('alert_preferences')
      .upsert({ user_id: userId, alerts_enabled: data.enabled }, { onConflict: 'user_id' })
    if (error) throw new Error(error.message)
    return { enabled: data.enabled }
  })
