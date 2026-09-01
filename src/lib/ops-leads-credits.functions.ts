// Ops-console-only server functions to manage Jenvu Leads account credits.
// Gated purely on the ops-console session cookie (no Supabase auth needed).

import { createServerFn } from "@tanstack/react-start";
import { isOpsUnlockedOrToken } from "./admin-guard.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function gate(token?: string) {
  const ok = await isOpsUnlockedOrToken(token);
  if (!ok) throw new Error("Locked");
}

export const opsListLeadsAccounts = createServerFn({ method: "POST" })
  .inputValidator((i?: { token?: string }) => ({ token: i?.token ? String(i.token) : undefined }))
  .handler(async ({ data }) => {
  await gate(data.token);
  const sb = await db();
  const { data: profiles } = await sb
    .from("lg_profiles")
    .select("user_id,email,full_name,is_disabled,monthly_credit_limit,created_at")
    .order("created_at", { ascending: false });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data: usage } = await sb
    .from("lg_usage_events")
    .select("user_id,credits,created_at")
    .gte("created_at", monthStart);

  const used = new Map<string, number>();
  for (const u of usage ?? []) used.set(u.user_id, (used.get(u.user_id) ?? 0) + Number(u.credits ?? 0));

  const { data: roles } = await sb.from("lg_user_roles").select("user_id,role");
  const roleMap = new Map<string, string>();
  for (const r of roles ?? []) {
    if (r.role === "admin" || !roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
  }

  return (profiles ?? []).map((p: any) => {
    const limit = Number(p.monthly_credit_limit ?? 0);
    const spent = Number((used.get(p.user_id) ?? 0).toFixed(2));
    return {
      user_id: p.user_id as string,
      email: (p.email ?? "") as string,
      full_name: (p.full_name ?? null) as string | null,
      is_disabled: !!p.is_disabled,
      role: roleMap.get(p.user_id) ?? "member",
      created_at: p.created_at as string,
      limit,
      used: spent,
      remaining: Number((limit - spent).toFixed(2)),
    };
  });
});

export const opsAdjustLeadsCredits = createServerFn({ method: "POST" })
  .inputValidator((i: { userId: string; mode: "add" | "set"; amount: number; token?: string }) => {
    const amount = Number(i?.amount);
    if (!Number.isFinite(amount)) throw new Error("Enter a valid amount.");
    return {
      userId: String(i?.userId ?? ""),
      mode: i?.mode === "set" ? ("set" as const) : ("add" as const),
      amount: Math.max(-100000, Math.min(100000, amount)),
      token: i?.token ? String(i.token) : undefined,
    };
  })
  .handler(async ({ data }) => {
    await gate(data.token);
    const sb = await db();
    const { data: profile, error: readErr } = await sb
      .from("lg_profiles")
      .select("monthly_credit_limit")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!profile) throw new Error("Account not found.");

    const current = Number(profile.monthly_credit_limit ?? 0);
    const next = Math.max(0, Math.min(100000, data.mode === "add" ? current + data.amount : data.amount));

    const { error } = await sb
      .from("lg_profiles")
      .update({ monthly_credit_limit: next })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);

    return { ok: true as const, limit: Number(next.toFixed(2)) };
  });

export const opsSetLeadsAccountDisabled = createServerFn({ method: "POST" })
  .inputValidator((i: { userId: string; disabled: boolean; token?: string }) => ({
    userId: String(i?.userId ?? ""),
    disabled: !!i?.disabled,
    token: i?.token ? String(i.token) : undefined,
  }))
  .handler(async ({ data }) => {
    await gate(data.token);
    const sb = await db();
    const { error } = await sb
      .from("lg_profiles")
      .update({ is_disabled: data.disabled })
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
