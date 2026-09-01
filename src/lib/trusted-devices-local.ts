import { supabase } from "@/integrations/supabase/client";
import { revokeTrustedDeviceByToken } from "@/lib/trusted-devices.functions";

export const TRUSTED_DEVICE_KEY = (uid: string) => `mfa_trusted_device:${uid}`;

/**
 * Revoke this browser's trusted-device row (if any) and clear the local token.
 * Safe to call from any signed-in client path — swallows all errors so it can
 * be awaited from sign-out flows without blocking them.
 */
export async function revokeCurrentTrustedDevice(): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    const key = TRUSTED_DEVICE_KEY(uid);
    const token = window.localStorage.getItem(key);
    if (!token) return;
    try {
      await revokeTrustedDeviceByToken({ data: { token } });
    } catch { /* still clear local token */ }
    window.localStorage.removeItem(key);
  } catch { /* noop */ }
}
