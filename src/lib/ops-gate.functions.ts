import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";

type OpsSession = { unlocked?: boolean; who?: string };

const OPS_UNLOCK_PATH = "/ops-x9k2-7m4n";

function sessionConfig() {
  return {
    password: process.env.OPS_CONSOLE_SESSION_SECRET!,
    name: "jenvu-ops",
    maxAge: 60 * 60 * 8, // 8 hours
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      partitioned: true,
      path: "/",
    },
  };
}

// Constant-time-ish equality using Web Crypto (works in Cloudflare Workers).
// node:crypto's timingSafeEqual/createHash can throw non-serializable errors
// in the Worker runtime — avoid it here.
async function sha256Bytes(s: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return new Uint8Array(buf);
}

async function equalsCT(input: string, expected: string): Promise<boolean> {
  const a = await sha256Bytes(input);
  const b = await sha256Bytes(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signOpsPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

async function issueOpsToken(who: string, secret: string): Promise<string> {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ who, exp: Date.now() + 1000 * 60 * 60 * 8 })));
  return `${payload}.${await signOpsPayload(payload, secret)}`;
}

async function verifyOpsToken(token: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!token || !secret || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  const expectedSig = await signOpsPayload(payload, secret);
  const sigOk = await equalsCT(sig, expectedSig);
  if (!sigOk) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { exp?: number };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

export const opsUnlock = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; password: string }) => data)
  .handler(async ({ data }) => {
    try {
      const expectedId = process.env.OPS_CONSOLE_ID;
      const expectedPass = process.env.OPS_CONSOLE_PASS;
      const secret = process.env.OPS_CONSOLE_SESSION_SECRET;
      if (!expectedId || !expectedPass || !secret) {
        return { ok: false as const, error: "not_configured" };
      }
      const okId = await equalsCT(String(data.id ?? "").trim(), expectedId);
      const okPw = await equalsCT(String(data.password ?? ""), expectedPass);
      if (!(okId && okPw)) {
        return { ok: false as const, error: "invalid" };
      }
      const session = await useSession<OpsSession>(sessionConfig());
      await session.update({ unlocked: true, who: expectedId });
      return { ok: true as const, token: await issueOpsToken(expectedId, secret) };
    } catch (e) {
      return {
        ok: false as const,
        error: "internal",
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

export const opsLock = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<OpsSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const opsStatus = createServerFn({ method: "POST" })
  .inputValidator((data?: { token?: string }) => data ?? {})
  .handler(async ({ data }) => {
  const session = await useSession<OpsSession>(sessionConfig());
  const tokenUnlocked = await verifyOpsToken(data.token, process.env.OPS_CONSOLE_SESSION_SECRET);
  return { unlocked: !!session.data.unlocked || tokenUnlocked };
});

// Loader-side gate. Throws a redirect to the unlock page if not unlocked.
export const requireOpsUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<OpsSession>(sessionConfig());
  if (!session.data.unlocked) {
    throw redirect({ to: OPS_UNLOCK_PATH });
  }
  return { ok: true as const };
});
