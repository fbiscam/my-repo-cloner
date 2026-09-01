import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// SHA-256 hex helper (Web Crypto — Worker-compatible).
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mint a new trusted-device row and return the raw token to store client-side.
 * Caller MUST have just completed the MFA challenge — this fn does not
 * enforce AAL2 itself; the auth flow gates the call site.
 */
export const registerTrustedDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        label: z.string().max(120).optional(),
        userAgent: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const token = newToken();
    const tokenHash = await sha256Hex(token);
    const { error } = await context.supabase.from("trusted_devices").insert({
      user_id: context.userId,
      token_hash: tokenHash,
      label: data.label ?? null,
      user_agent: data.userAgent ?? null,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

/**
 * Verify a device token belongs to the current user and hasn't expired.
 * Returns { valid: true } and refreshes last_used_at when trusted.
 */
export const verifyTrustedDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ token: z.string().min(16).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    const tokenHash = await sha256Hex(data.token);
    const { data: rows, error } = await context.supabase
      .from("trusted_devices")
      .select("id, expires_at")
      .eq("user_id", context.userId)
      .eq("token_hash", tokenHash)
      .limit(1);
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row) return { valid: false as const };
    if (new Date(row.expires_at).getTime() <= Date.now()) return { valid: false as const };
    await context.supabase
      .from("trusted_devices")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
    return { valid: true as const };
  });

export const listTrustedDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trusted_devices")
      .select("id, label, user_agent, created_at, last_used_at, expires_at")
      .eq("user_id", context.userId)
      .order("last_used_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const revokeTrustedDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("trusted_devices")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Revoke the trusted-device row that matches a raw token (i.e. "this browser").
 * Idempotent — returns { ok: true, removed } even if nothing matched.
 */
export const revokeTrustedDeviceByToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ token: z.string().min(16).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    const tokenHash = await sha256Hex(data.token);
    const { data: rows, error } = await context.supabase
      .from("trusted_devices")
      .delete()
      .eq("user_id", context.userId)
      .eq("token_hash", tokenHash)
      .select("id");
    if (error) throw new Error(error.message);
    return { ok: true as const, removed: rows?.length ?? 0 };
  });
