import { supabase } from '@/integrations/supabase/client'

/**
 * New accounts should start with a clean alert feed: they must only ever see
 * signal alerts that fired after they signed up. This returns the signed-in
 * user's account creation timestamp (ISO), cached for the session.
 */
let cached: string | null | undefined

export async function getAlertCutoff(): Promise<string | null> {
  if (cached !== undefined) return cached
  try {
    const { data } = await supabase.auth.getUser()
    cached = data.user?.created_at ?? null
  } catch {
    cached = null
  }
  return cached
}

/** True when the alert fired at/after the account was created. */
export function isAfterCutoff(firedAt: string | null | undefined, cutoff: string | null) {
  if (!cutoff || !firedAt) return true
  return new Date(firedAt).getTime() >= new Date(cutoff).getTime()
}

export function resetAlertCutoff() {
  cached = undefined
}
