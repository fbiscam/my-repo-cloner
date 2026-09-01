import { useSession } from "@tanstack/react-start/server";

type OpsSession = { unlocked?: boolean; who?: string };

/**
 * Returns true when the ops-console session cookie is unlocked.
 * Lets admin-only server fns be reached from inside the ops console
 * without requiring the caller to also hold the Supabase 'admin' role.
 */
export async function isOpsUnlocked(): Promise<boolean> {
  try {
    const secret = process.env.OPS_CONSOLE_SESSION_SECRET;
    if (!secret) return false;
    const session = await useSession<OpsSession>({
      password: secret,
      name: "jenvu-ops",
      maxAge: 60 * 60 * 8,
      cookie: {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        partitioned: true,
        path: "/",
      },
    });
    return !!session.data.unlocked;
  } catch {
    return false;
  }
}

/**
 * True if the user holds the admin role OR the ops-console is unlocked.
 * Use inside any admin-gated server function to allow ops-console access.
 */
export async function isAdminOrOpsUnlocked(
  supabase: any,
  userId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (data) return true;
  } catch {
    // fall through to ops check
  }
  return await isOpsUnlocked();
}

/* ---------- Signed ops token (cookie-less fallback) ---------- */

function toB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toB64Url(new Uint8Array(sig));
}

/** Verifies the HMAC ops token issued by opsUnlock (sessionStorage fallback). */
export async function verifyOpsToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.OPS_CONSOLE_SESSION_SECRET;
  if (!token || !secret || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await signPayload(payload, secret);
  if (sig !== expected) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64Url(payload))) as { exp?: number };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

/** True when the ops cookie is unlocked OR a valid ops token is presented. */
export async function isOpsUnlockedOrToken(token?: string): Promise<boolean> {
  if (await isOpsUnlocked()) return true;
  return await verifyOpsToken(token);
}
