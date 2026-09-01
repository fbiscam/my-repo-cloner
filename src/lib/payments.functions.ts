import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NetworkId, PaymentOrder, Quote } from "@/lib/payments/shared";

const quoteSchema = z.object({
  amountUsd: z.number().min(0).max(100000),
  code: z.string().max(40).optional().nullable(),
});

export const quoteTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => quoteSchema.parse(d))
  .handler(async ({ data, context }): Promise<Quote> => {
    const { evaluatePromo } = await import("@/lib/payments/core.server");
    return evaluatePromo({ userId: context.userId, amountUsd: data.amountUsd, code: data.code ?? null });
  });

const createSchema = z.object({
  amountUsd: z.number().min(5).max(10000),
  network: z.enum(["trc20", "bep20", "erc20"]),
  code: z.string().max(40).optional().nullable(),
  planId: z.string().max(40).optional().nullable(),
});

export const createTopupOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { evaluatePromo, getDepositAddresses } = await import("@/lib/payments/core.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const quote = await evaluatePromo({ userId, amountUsd: data.amountUsd, code: data.code ?? null });
    if (quote.error) return { ok: false as const, error: quote.error };
    if (quote.promoType === "free") return { ok: false as const, error: "Redeem this code from the promo box instead." };

    const addresses = await getDepositAddresses();
    const address = addresses[data.network as NetworkId];
    if (!address)
      return { ok: false as const, error: "This network is temporarily unavailable. Please pick another." };

    // Unique cents suffix so two payments of the same size stay distinguishable.
    const suffix = Math.floor(Math.random() * 89 + 10) / 100;
    const payAmount = Math.round((quote.payUsd + suffix) * 100) / 100;

    const { data: authData } = await supabase.auth.getUser();
    const { data: row, error } = await supabaseAdmin
      .from("payment_orders")
      .insert({
        user_id: userId,
        email: authData?.user?.email ?? null,
        network: data.network,
        deposit_address: address,
        pay_amount_usd: payAmount,
        credit_usd: quote.creditUsd,
        bonus_usd: quote.bonusUsd,
        promo_code: quote.promoCode,
        target_plan_id: data.planId || null,
        is_upgrade: !!data.planId,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .select("*")
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, order: row as unknown as PaymentOrder };
  });

const submitSchema = z.object({
  orderId: z.string().uuid(),
  txHash: z.string().trim().min(10).max(120),
});

export const submitTxHash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyPayment } = await import("@/lib/payments/verify.server");
    const { approveOrder } = await import("@/lib/payments/core.server");

    const { data: order } = await supabaseAdmin
      .from("payment_orders")
      .select("*")
      .eq("id", data.orderId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "Order not found." };
    if (order.status === "approved") return { ok: true as const, status: "approved" as const };

    const hash = data.txHash.trim();
    const { data: dupe } = await supabaseAdmin
      .from("payment_orders")
      .select("id")
      .ilike("tx_hash", hash)
      .neq("id", order.id)
      .maybeSingle();
    if (dupe) return { ok: false as const, error: "This transaction ID has already been used." };

    await supabaseAdmin
      .from("payment_orders")
      .update({ tx_hash: hash, status: "verifying", submitted_at: new Date().toISOString() })
      .eq("id", order.id);

    try {
      const { sendPaymentEmail } = await import("@/lib/payments/email.server");
      await sendPaymentEmail({ kind: "submitted", order: { ...order, tx_hash: hash } });
    } catch { /* non-fatal */ }

    const result = await verifyPayment({
      network: order.network as NetworkId,
      txHash: hash,
      address: order.deposit_address,
      expectedUsd: Number(order.pay_amount_usd),
    });

    if (result.ok) {
      await supabaseAdmin.from("payment_orders").update({ auto_result: result as never }).eq("id", order.id);
      await approveOrder(order.id, "auto-verify");
      return { ok: true as const, status: "approved" as const, detail: result.reason };
    }

    await supabaseAdmin
      .from("payment_orders")
      .update({ status: "needs_review", auto_result: result as never })
      .eq("id", order.id);
    return { ok: true as const, status: "needs_review" as const, detail: result.reason };
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PaymentOrder[]> => {
    const { data } = await context.supabase
      .from("payment_orders")
      .select("id, network, deposit_address, pay_amount_usd, credit_usd, bonus_usd, promo_code, tx_hash, status, reject_reason, created_at, expires_at, decided_at, target_plan_id, is_upgrade")
      .order("created_at", { ascending: false })
      .limit(30);
    return (data ?? []) as unknown as PaymentOrder[];
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("payment_orders")
      .update({ status: "expired" })
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .eq("status", "pending");
    return { ok: true as const };
  });

export const redeemFreeCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().trim().min(2).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { evaluatePromo, creditWallet, bumpPromoUsage } = await import("@/lib/payments/core.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const quote = await evaluatePromo({ userId, amountUsd: 0, code: data.code });
    if (quote.error) return { ok: false as const, error: quote.error };
    if (quote.promoType !== "free")
      return { ok: false as const, error: "This code applies to a top-up — enter it on the payment form." };

    const balance = await creditWallet({
      userId,
      amount: quote.creditUsd,
      reason: "promo_bonus",
      metadata: { promo_code: quote.promoCode },
    });
    await supabaseAdmin.from("promo_redemptions").insert({
      code: quote.promoCode!,
      user_id: userId,
      bonus_usd: quote.creditUsd,
    });
    await bumpPromoUsage(quote.promoCode!);
    return { ok: true as const, credited: quote.creditUsd, balance };
  });
