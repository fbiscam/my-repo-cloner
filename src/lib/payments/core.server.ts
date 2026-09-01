// Server-only core for crypto top-ups: deposit config, promo evaluation,
// on-chain verification and wallet crediting.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { NetworkId, PromoType, Quote } from "./shared";

const ADDRESS_SETTINGS_KEY = "crypto_deposit_addresses";

export type DepositAddresses = Record<NetworkId, string>;

export async function getDepositAddresses(): Promise<DepositAddresses> {
  const fallback: DepositAddresses = {
    trc20: process.env["CRYPTO_ADDR_TRC20"] ?? "",
    bep20: process.env["CRYPTO_ADDR_BEP20"] ?? "",
    erc20: process.env["CRYPTO_ADDR_ERC20"] ?? "",
  };
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", ADDRESS_SETTINGS_KEY)
    .maybeSingle();
  const v = (data?.value ?? {}) as Partial<DepositAddresses>;
  return {
    trc20: (v.trc20 || fallback.trc20 || "").trim(),
    bep20: (v.bep20 || fallback.bep20 || "").trim(),
    erc20: (v.erc20 || fallback.erc20 || "").trim(),
  };
}

export async function setDepositAddresses(next: Partial<DepositAddresses>) {
  const current = await getDepositAddresses();
  const merged = { ...current, ...next };
  await supabaseAdmin
    .from("system_settings")
    .upsert({ key: ADDRESS_SETTINGS_KEY, value: merged as never }, { onConflict: "key" });
  return merged;
}

export type PromoRow = {
  code: string;
  type: PromoType;
  value: number;
  min_topup_usd: number;
  max_bonus_usd: number | null;
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  note: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function evaluatePromo(args: {
  userId: string;
  amountUsd: number;
  code?: string | null;
}): Promise<Quote> {
  const amountUsd = round2(Math.max(0, args.amountUsd));
  const base: Quote = {
    amountUsd,
    payUsd: amountUsd,
    creditUsd: amountUsd,
    bonusUsd: 0,
    promoCode: null,
    promoType: null,
    promoNote: null,
    error: null,
  };
  const code = (args.code ?? "").trim().toUpperCase();
  if (!code) return base;

  const { data: promo } = await supabaseAdmin
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  const p = promo as PromoRow | null;
  if (!p || !p.active) return { ...base, error: "Invalid promo code." };
  if (p.expires_at && new Date(p.expires_at).getTime() < Date.now())
    return { ...base, error: "This promo code has expired." };
  if (p.usage_limit != null && p.used_count >= p.usage_limit)
    return { ...base, error: "This promo code has reached its limit." };

  const { count } = await supabaseAdmin
    .from("promo_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("code", code)
    .eq("user_id", args.userId);
  if ((count ?? 0) >= p.per_user_limit)
    return { ...base, error: "You have already used this promo code." };

  if (p.type === "free") {
    return {
      ...base,
      payUsd: 0,
      creditUsd: round2(Number(p.value)),
      bonusUsd: round2(Number(p.value)),
      promoCode: code,
      promoType: "free",
      promoNote: p.note,
    };
  }

  if (amountUsd < Number(p.min_topup_usd))
    return { ...base, error: `Minimum top-up for this code is $${Number(p.min_topup_usd).toFixed(2)}.` };

  if (p.type === "percent") {
    let bonus = round2((amountUsd * Number(p.value)) / 100);
    if (p.max_bonus_usd != null) bonus = Math.min(bonus, Number(p.max_bonus_usd));
    return {
      ...base,
      bonusUsd: bonus,
      creditUsd: round2(amountUsd + bonus),
      promoCode: code,
      promoType: "percent",
      promoNote: p.note,
    };
  }

  if (p.type === "flat") {
    let bonus = round2(Number(p.value));
    if (p.max_bonus_usd != null) bonus = Math.min(bonus, Number(p.max_bonus_usd));
    return {
      ...base,
      bonusUsd: bonus,
      creditUsd: round2(amountUsd + bonus),
      promoCode: code,
      promoType: "flat",
      promoNote: p.note,
    };
  }

  // discount: pay less, receive full value
  const discount = round2(Math.min(amountUsd, (amountUsd * Number(p.value)) / 100));
  return {
    ...base,
    payUsd: round2(Math.max(0, amountUsd - discount)),
    creditUsd: amountUsd,
    bonusUsd: discount,
    promoCode: code,
    promoType: "discount",
    promoNote: p.note,
  };
}

export async function creditWallet(args: {
  userId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<number | null> {
  const { data, error } = await supabaseAdmin.rpc("grant_credits", {
    _user_id: args.userId,
    _amount: args.amount,
    _reason: args.reason,
    _metadata: (args.metadata ?? {}) as never,
  });
  if (error) throw new Error(error.message);
  return data == null ? null : Number(data);
}

export async function bumpPromoUsage(code: string) {
  const { data } = await supabaseAdmin
    .from("promo_codes")
    .select("used_count")
    .eq("code", code)
    .maybeSingle();
  await supabaseAdmin
    .from("promo_codes")
    .update({ used_count: Number(data?.used_count ?? 0) + 1 })
    .eq("code", code);
}

/** Upgrade the user's plan to the best tier their paid amount covers, and end any trial. */
export async function applyPlanForPayment(userId: string, paidUsd: number, targetPlanId?: string | null) {
  const { data: plans } = await supabaseAdmin
    .from("plans")
    .select("id, price_usd")
    .order("price_usd", { ascending: true });
  const tiers = (plans ?? []).filter((p: any) => Number(p.price_usd) > 0);

  let earned: any = null;
  if (targetPlanId) {
    earned = tiers.find((p: any) => p.id === targetPlanId);
    // Safety check: if they paid enough for it, use it.
    // We compare against the plan's wallet_usd value which represents its cost.
    const required = Number(earned?.price_usd ?? 0);
    if (earned && paidUsd + 0.01 < required) {
      earned = null; // didn't pay enough for the target
    }
  }

  // Fallback to auto-detection if no specific target or target was underpaid
  if (!earned) {
    earned = tiers.filter((p: any) => paidUsd + 0.01 >= Number(p.price_usd)).pop() as any;
  }

  if (!earned) return null;

  const { data: sub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("plan_id, is_trial")
    .eq("user_id", userId)
    .maybeSingle();

  // Downgrades are allowed only when explicitly targeted via targetPlanId.
  // A plain wallet top-up (no target) must never demote a higher tier.
  if (sub?.plan_id === earned.id && !(sub as any).is_trial) return null;
  if (!targetPlanId) {
    const priceOf = (id?: string | null) =>
      Number((plans ?? []).find((p: any) => p.id === id)?.price_usd ?? 0);
    if (priceOf(sub?.plan_id) > Number(earned.price_usd)) return null;
  }

  const payload = {
    user_id: userId,
    plan_id: earned.id,
    status: "active",
    is_trial: false,
    trial_ends_at: null,
    updated_at: new Date().toISOString(),
  };
  if (sub) {
    await supabaseAdmin.from("user_subscriptions").update(payload).eq("user_id", userId);
  } else {
    await supabaseAdmin.from("user_subscriptions").insert(payload);
  }
  return earned.id as string;
}

/** Approve an order: credit the wallet once, log redemption, mark approved. */
export async function approveOrder(orderId: string, by: string) {
  const { data: order } = await supabaseAdmin
    .from("payment_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (order.status === "approved") return { ok: true as const, alreadyDone: true };

  const credit = Number(order.credit_usd);

  await creditWallet({
    userId: order.user_id,
    amount: credit,
    reason: "topup_crypto",
    metadata: {
      order_id: order.id,
      network: order.network,
      tx_hash: order.tx_hash,
      promo_code: order.promo_code,
      bonus_usd: Number(order.bonus_usd ?? 0),
      approved_by: by,
    },
  });

  if (order.promo_code) {
    await supabaseAdmin.from("promo_redemptions").insert({
      code: order.promo_code,
      user_id: order.user_id,
      order_id: order.id,
      pay_amount_usd: Number(order.pay_amount_usd),
      bonus_usd: Number(order.bonus_usd ?? 0),
    });
    await bumpPromoUsage(order.promo_code);
  }

  // Paid amount (excluding promo bonus) decides the plan tier.
  try {
    await applyPlanForPayment(order.user_id, Number(order.pay_amount_usd ?? credit), order.target_plan_id);
  } catch (e) {
    console.error("plan upgrade on approval failed", (e as Error)?.message);
  }



  await supabaseAdmin
    .from("payment_orders")
    .update({
      status: "approved",
      credited_usd: credit,
      decided_at: new Date().toISOString(),
      decided_by: by,
    })
    .eq("id", order.id);

  try {
    const { sendPaymentEmail } = await import("./email.server");
    await sendPaymentEmail({ kind: "approved", order: { ...order, credited_usd: credit } });
  } catch (e) {
    console.error("payment approve email failed", (e as Error)?.message);
  }

  return { ok: true as const, alreadyDone: false };
}

export async function rejectOrder(orderId: string, reason: string, by: string) {
  const { data: order } = await supabaseAdmin
    .from("payment_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");
  if (order.status === "approved") throw new Error("Order is already approved.");

  await supabaseAdmin
    .from("payment_orders")
    .update({
      status: "rejected",
      reject_reason: reason,
      decided_at: new Date().toISOString(),
      decided_by: by,
    })
    .eq("id", order.id);

  try {
    const { sendPaymentEmail } = await import("./email.server");
    await sendPaymentEmail({ kind: "rejected", order: { ...order, reject_reason: reason } });
  } catch (e) {
    console.error("payment reject email failed", (e as Error)?.message);
  }
  return { ok: true as const };
}
