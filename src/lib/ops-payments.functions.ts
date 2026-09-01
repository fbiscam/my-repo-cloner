// Ops-console-only server functions for crypto payments & promo codes.
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

export const opsListPayments = createServerFn({ method: "POST" })
  .inputValidator((i?: { token?: string; status?: string }) => ({
    token: i?.token ? String(i.token) : undefined,
    status: i?.status ? String(i.status) : "all",
  }))
  .handler(async ({ data }) => {
    await gate(data.token);
    const sb = await db();
    let q = sb.from("payment_orders").select("*").order("created_at", { ascending: false }).limit(300);
    if (data.status === "review") q = q.in("status", ["needs_review", "verifying"]);
    else if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<Record<string, any>>;
  });

export const opsDecidePayment = createServerFn({ method: "POST" })
  .inputValidator((i: { orderId: string; action: "approve" | "reject"; reason?: string; token?: string }) => ({
    orderId: String(i?.orderId ?? ""),
    action: i?.action === "reject" ? ("reject" as const) : ("approve" as const),
    reason: (i?.reason ?? "").slice(0, 300),
    token: i?.token ? String(i.token) : undefined,
  }))
  .handler(async ({ data }) => {
    await gate(data.token);
    const { approveOrder, rejectOrder } = await import("@/lib/payments/core.server");
    if (data.action === "approve") {
      await approveOrder(data.orderId, "ops-console");
      return { ok: true as const };
    }
    if (!data.reason.trim()) throw new Error("A rejection reason is required.");
    await rejectOrder(data.orderId, data.reason.trim(), "ops-console");
    return { ok: true as const };
  });

export const opsAdjustWallet = createServerFn({ method: "POST" })
  .inputValidator((i: { userId: string; amount: number; note?: string; token?: string }) => {
    const amount = Number(i?.amount);
    if (!Number.isFinite(amount) || amount === 0) throw new Error("Enter a valid amount.");
    return {
      userId: String(i?.userId ?? ""),
      amount: Math.max(-10000, Math.min(10000, amount)),
      note: (i?.note ?? "").slice(0, 200),
      token: i?.token ? String(i.token) : undefined,
    };
  })
  .handler(async ({ data }) => {
    await gate(data.token);
    const { creditWallet } = await import("@/lib/payments/core.server");
    const balance = await creditWallet({
      userId: data.userId,
      amount: data.amount,
      reason: data.amount > 0 ? "manual_credit" : "manual_debit",
      metadata: { note: data.note, source: "ops-console" },
    });
    return { ok: true as const, balance };
  });

export const opsGetPaymentConfig = createServerFn({ method: "POST" })
  .inputValidator((i?: { token?: string }) => ({ token: i?.token ? String(i.token) : undefined }))
  .handler(async ({ data }) => {
    await gate(data.token);
    const { getDepositAddresses } = await import("@/lib/payments/core.server");
    return await getDepositAddresses();
  });

export const opsSetPaymentConfig = createServerFn({ method: "POST" })
  .inputValidator((i: { trc20?: string; bep20?: string; erc20?: string; token?: string }) => ({
    trc20: (i?.trc20 ?? "").trim().slice(0, 120),
    bep20: (i?.bep20 ?? "").trim().slice(0, 120),
    erc20: (i?.erc20 ?? "").trim().slice(0, 120),
    token: i?.token ? String(i.token) : undefined,
  }))
  .handler(async ({ data }) => {
    await gate(data.token);
    const { setDepositAddresses } = await import("@/lib/payments/core.server");
    return await setDepositAddresses({ trc20: data.trc20, bep20: data.bep20, erc20: data.erc20 });
  });

export const opsListPromos = createServerFn({ method: "POST" })
  .inputValidator((i?: { token?: string }) => ({ token: i?.token ? String(i.token) : undefined }))
  .handler(async ({ data }) => {
    await gate(data.token);
    const sb = await db();
    const { data: rows, error } = await sb
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<Record<string, any>>;
  });

export const opsSavePromo = createServerFn({ method: "POST" })
  .inputValidator((i: {
    code: string;
    type: "percent" | "flat" | "discount" | "free";
    value: number;
    minTopup?: number;
    maxBonus?: number | null;
    usageLimit?: number | null;
    perUserLimit?: number;
    expiresAt?: string | null;
    active?: boolean;
    note?: string;
    token?: string;
  }) => {
    const code = String(i?.code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,24}$/.test(code)) throw new Error("Code must be 2-24 letters, digits, - or _.");
    const value = Number(i?.value);
    if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid value.");
    return {
      code,
      type: i?.type ?? "flat",
      value,
      minTopup: Number(i?.minTopup ?? 0) || 0,
      maxBonus: i?.maxBonus == null || i.maxBonus === ("" as never) ? null : Number(i.maxBonus),
      usageLimit: i?.usageLimit == null || i.usageLimit === ("" as never) ? null : Number(i.usageLimit),
      perUserLimit: Number(i?.perUserLimit ?? 1) || 1,
      expiresAt: i?.expiresAt ? String(i.expiresAt) : null,
      active: i?.active !== false,
      note: (i?.note ?? "").slice(0, 200),
      token: i?.token ? String(i.token) : undefined,
    };
  })
  .handler(async ({ data }) => {
    await gate(data.token);
    const sb = await db();
    const { error } = await sb.from("promo_codes").upsert(
      {
        code: data.code,
        type: data.type,
        value: data.value,
        min_topup_usd: data.minTopup,
        max_bonus_usd: data.maxBonus,
        usage_limit: data.usageLimit,
        per_user_limit: data.perUserLimit,
        expires_at: data.expiresAt,
        active: data.active,
        note: data.note || null,
      },
      { onConflict: "code" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const opsTogglePromo = createServerFn({ method: "POST" })
  .inputValidator((i: { code: string; active: boolean; token?: string }) => ({
    code: String(i?.code ?? "").toUpperCase(),
    active: !!i?.active,
    token: i?.token ? String(i.token) : undefined,
  }))
  .handler(async ({ data }) => {
    await gate(data.token);
    const sb = await db();
    const { error } = await sb.from("promo_codes").update({ active: data.active }).eq("code", data.code);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
