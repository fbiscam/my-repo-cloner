import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

export const deleteMyAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const ctx = context as { userId?: string; claims?: { email?: string } }
    const userId = ctx.userId
    if (!userId) throw new Error('Unauthorized')

    // Fetch email so we can also purge email-keyed rows (auth OTPs, alert subs).
    let email: string | undefined = ctx.claims?.email
    if (!email) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId)
      email = data?.user?.email ?? undefined
    }

    // Delete the auth user first — FKs cascade and wipe:
    //   profiles, saved_signals, alert_preferences, trade_journal,
    //   user_subscriptions, credit_balances, credit_ledger, credit_lots, voice_history.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) {
      console.error('deleteMyAccount failed', error)
      throw new Error(error.message || 'Failed to delete account')
    }

    // Purge email-keyed leftovers so re-signup with the same email starts fresh.
    if (email) {
      const normalized = email.toLowerCase()
      await Promise.all([
        supabaseAdmin.from('custom_auth_otps').delete().eq('email', normalized),
        supabaseAdmin.from('signal_alert_subscribers').delete().eq('email', normalized),
      ])
    }

    return { success: true }
  })
