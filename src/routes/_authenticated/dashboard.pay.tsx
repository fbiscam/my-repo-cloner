import { createFileRoute, Link } from "@tanstack/react-router";
import { useCredits } from "@/hooks/useCredits";
import { useTrial } from "@/hooks/useTrial";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  quoteTopup,
  createTopupOrder,
  submitTxHash,
  listMyOrders,
  cancelOrder,
  redeemFreeCode,
} from "@/lib/payments.functions";
import {
  NETWORKS,
  PRESET_AMOUNTS,
  networkMeta,
  statusLabel,
  type NetworkId,
  type PaymentOrder,
  type Quote,
} from "@/lib/payments/shared";
import { UsdtIcon, TronIcon, BnbIcon, EthIcon, NetworkIcon } from "@/components/pay/CoinIcons";

export const Route = createFileRoute("/_authenticated/dashboard/pay")({
  head: () => ({
    meta: [
      { title: "Add Funds · Crypto Top-Up · Jenvu" },
      { name: "description", content: "Top up your Jenvu scan wallet with USDT on Tron, BNB Smart Chain or Ethereum. Instant on-chain verification." },
      { property: "og:title", content: "Add Funds · Crypto Top-Up · Jenvu" },
      { property: "og:description", content: "Top up your Jenvu scan wallet with USDT. Instant on-chain verification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { amount?: number } => {
    const raw = Number(search['amount']);
    if (!Number.isFinite(raw) || raw <= 0) return {};
    return { amount: Math.min(1000, Math.round(raw * 100) / 100) };
  },
  component: PayPage,
});

const SANS = { fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 } as const;

function useCountdown(iso: string | null | undefined) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!iso) return;
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [iso]);
  return left;
}

function PayPage() {
  const quoteFn = useServerFn(quoteTopup);
  const createFn = useServerFn(createTopupOrder);
  const submitFn = useServerFn(submitTxHash);
  const listFn = useServerFn(listMyOrders);
  const cancelFn = useServerFn(cancelOrder);
  const redeemFn = useServerFn(redeemFreeCode);

  const { amount: presetFromUrl } = Route.useSearch();
  const credits = useCredits();
  const currentPlan = credits.plan && typeof credits.plan === 'object' ? (credits.plan as any).id : credits.plan;
  const trial = useTrial();
  const [mode, setMode] = useState<"topup" | "upgrade">("upgrade");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);


  const [amount, setAmount] = useState<number>(
    presetFromUrl && PRESET_AMOUNTS.includes(presetFromUrl) ? presetFromUrl : 25,
  );
  const [custom, setCustom] = useState(
    presetFromUrl && !PRESET_AMOUNTS.includes(presetFromUrl) ? String(presetFromUrl) : "",
  );
  const [network, setNetwork] = useState<NetworkId>("trc20");
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const qSeq = useRef(0);

  const PLANS = [
    { id: "pro", name: "Pro", price: 15, features: ["Realtime Alerts", "Journal Access", "Multi-Timeframe Bias"] },
    { id: "elite", name: "Elite", price: 50, features: ["Multi-pair Scanner", "Custom Alert Rules", "AI Model Analysis"] },
    { id: "ultra", name: "Ultra", price: 100, features: ["Priority Support", "Advanced Signals", "Full ICT Narration"] },
  ];

  const currentPrice = useMemo(() => {
    const p = PLANS.find(x => x.id === currentPlan);
    if (trial.active) return 0;
    return p ? p.price : 0;
  }, [currentPlan, trial.active]);

  useEffect(() => {
    if (mode === "upgrade" && !selectedPlanId) {
      const next = PLANS.find(p => p.price > currentPrice);
      if (next) {
        setSelectedPlanId(next.id);
      } else {
        // If they are already on the highest plan (Ultra), default to Ultra or their current plan
        // This ensures the button isn't disabled by default if no "next" plan exists.
        setSelectedPlanId(currentPlan || "pro");
      }
    }
  }, [mode, currentPlan, currentPrice, selectedPlanId]);

  const effAmount = useMemo(() => {
    if (mode === "upgrade" && selectedPlanId) {
      return PLANS.find(p => p.id === selectedPlanId)?.price ?? amount;
    }
    const c = Number(custom);
    return custom.trim() && Number.isFinite(c) ? Math.round(c * 100) / 100 : amount;
  }, [amount, custom, mode, selectedPlanId]);



  const loadOrders = useCallback(async () => {
    try {
      setOrders(await listFn());
    } catch { /* ignore */ }
  }, [listFn]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  useEffect(() => {
    const seq = ++qSeq.current;
    const t = setTimeout(async () => {
      try {
        const q = await quoteFn({ data: { amountUsd: effAmount, code: code.trim() || null } });
        if (seq === qSeq.current) setQuote(q);
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [effAmount, code, quoteFn]);

  const secondsLeft = useCountdown(order?.status === "pending" ? order.expires_at : null);
  useEffect(() => {
    if (order?.status === "pending" && secondsLeft === 0 && order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
      setOrder((o) => (o ? { ...o, status: "expired" } : o));
    }
  }, [secondsLeft, order?.status, order?.expires_at]);

  async function onCreate() {
    if (effAmount < 5) return toast.error("Minimum top-up is $5.");
    setBusy(true);
    try {
      const res: any = await createFn({ 
        data: { 
          amountUsd: effAmount, 
          network, 
          code: code.trim() || null,
          planId: mode === "upgrade" ? selectedPlanId : null
        } 
      });
      if (!res.ok) return toast.error(res.error);
      setOrder(res.order);
      setHash("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  }


  async function onSubmitHash() {
    if (!order) return;
    if (hash.trim().length < 10) return toast.error("Enter the full transaction ID.");
    setBusy(true);
    try {
      const res: any = await submitFn({ data: { orderId: order.id, txHash: hash.trim() } });
      if (!res.ok) return toast.error(res.error);
      if (res.status === "approved") {
        toast.success("Payment verified — credits added to your wallet.");
        setOrder({ ...order, status: "approved", tx_hash: hash.trim() });
      } else {
        toast.message("Sent for review", { description: res.detail ?? "Our team will confirm shortly." });
        setOrder({ ...order, status: "needs_review", tx_hash: hash.trim() });
      }
      void loadOrders();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not submit the transaction.");
    } finally {
      setBusy(false);
    }
  }

  async function onRedeem() {
    if (!code.trim()) return toast.error("Enter a promo code.");
    setBusy(true);
    try {
      const res: any = await redeemFn({ data: { code: code.trim() } });
      if (!res.ok) return toast.error(res.error);
      toast.success(`$${Number(res.credited).toFixed(2)} added to your wallet.`);
      setCode("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not redeem this code.");
    } finally {
      setBusy(false);
    }
  }

  const net = networkMeta(order?.network ?? network);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-1 pb-16" style={SANS}>
      <div className="relative overflow-hidden rounded-3xl border border-border bg-white p-6 sm:p-8">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-black">&nbsp;{mode === "upgrade" ? "Upgrade plan" : "Add funds"}</h1>
            <p className="mt-2 max-w-md text-sm text-black/60">
              {mode === "upgrade" 
                ? "Select a plan to unlock advanced features. Pay via USDT on Tron, BNB Smart Chain or Ethereum."
                : "Send USDT on Tron, BNB Smart Chain or Ethereum — credits land in your scan wallet right after on-chain verification."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <TronIcon className="h-8 w-8 rounded-full ring-2 ring-white" />
              <BnbIcon className="h-8 w-8 rounded-full ring-2 ring-white" />
              <EthIcon className="h-8 w-8 rounded-full ring-2 ring-white" />
            </div>
            <Link
              to="/dashboard/billing"
              className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-black shadow-sm transition hover:bg-zinc-50"
            >
              Billing
            </Link>
          </div>
        </div>
      </div>

      {!order || order.status === "expired" ? (
        <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-24px_rgba(0,0,0,0.25)] sm:p-7">
          <div className="mb-8 flex justify-center">
            <div className="inline-flex rounded-2xl bg-zinc-100 p-1">
              <button
                onClick={() => setMode("upgrade")}
                className={`rounded-xl px-6 py-2 text-sm font-medium transition ${
                  mode === "upgrade" ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Upgrade Plan
              </button>
              <button
                onClick={() => setMode("topup")}
                className={`rounded-xl px-6 py-2 text-sm font-medium transition ${
                  mode === "topup" ? "bg-white text-black shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Top-up Credits
              </button>
            </div>
          </div>

          {mode === "upgrade" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {PLANS.map((p) => {
                const isCurrent = !trial.active && currentPlan === p.id;
                const isCurrentInActiveOrder = order?.status === "approved" && order.target_plan_id === p.id;
                const isLower = false;

                const selected = selectedPlanId === p.id;
                
                return (
                  <button
                    key={p.id}
                    disabled={isCurrent || isCurrentInActiveOrder || isLower}
                    onClick={() => setSelectedPlanId(p.id)}
                    className={`relative flex flex-col rounded-2xl border p-5 text-left transition ${
                      selected
                        ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                    } ${(isCurrent || isCurrentInActiveOrder || isLower) ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
                  >
                    {isCurrent && (
                      <span className="absolute -top-2.5 right-4 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Current
                      </span>
                    )}
                    {isCurrentInActiveOrder && (
                      <span className="absolute -top-2.5 right-4 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                        Active
                      </span>
                    )}
                    <div className="text-sm font-semibold text-zinc-900">{p.name}</div>
                    <div className="mt-1 text-2xl font-bold text-black">${p.price}</div>
                    <div className="mt-4 flex-1 space-y-2">
                      {p.features.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-500">
                          <div className="h-1 w-1 rounded-full bg-zinc-400" />
                          {f}
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {PRESET_AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => { setAmount(a); setCustom(""); }}
                  className={`min-w-[86px] rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    !custom.trim() && amount === a
                      ? "border-black/15 bg-[#FAFAFA] text-black"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-900/30 hover:bg-zinc-50"
                  }`}
                >
                  ${a}
                </button>
              ))}
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="Custom $"
                inputMode="decimal"
                className="w-32 rounded-2xl border border-zinc-200 px-3 py-3 text-sm outline-none transition focus:border-zinc-900/40 focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
          )}


          <div className="mt-7 grid gap-2.5 sm:grid-cols-3">
            {NETWORKS.map((n) => {
              const active = network === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setNetwork(n.id)}
                  className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-zinc-900 bg-zinc-50/80 ring-1 ring-zinc-900"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/60"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="relative inline-flex">
                      <NetworkIcon id={n.id} className="h-8 w-8" />
                      <UsdtIcon className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white" />
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-medium text-zinc-900">{n.label}</div>
                  <div className="mt-0.5 text-[12px] text-zinc-500">{n.note}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-2.5">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. EXTRA5"
              className="w-48 rounded-2xl border border-zinc-200 px-3 py-3 text-sm uppercase outline-none transition focus:border-zinc-900/40 focus:ring-2 focus:ring-zinc-900/10"
            />
            <button
              onClick={onRedeem}
              disabled={busy}
              className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Redeem free credit
            </button>
            {quote?.error && <span className="text-[13px] text-red-600">{quote.error}</span>}
            {!quote?.error && quote?.promoCode && (
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[13px] text-emerald-700">
                {quote.promoType === "discount"
                  ? `You pay $${quote.payUsd.toFixed(2)} and receive $${quote.creditUsd.toFixed(2)}`
                  : quote.promoType === "free"
                    ? `Free credit code — hit "Redeem free credit"`
                    : `+$${quote.bonusUsd.toFixed(2)} bonus applied`}
              </span>
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-white p-5">
            <div>
              <div className="flex items-center gap-2">
                <UsdtIcon className="h-7 w-7" />
                <span className="text-3xl font-semibold text-zinc-900">${(quote?.payUsd ?? effAmount).toFixed(2)}</span>
              </div>
              <div className="mt-1.5 text-[13px] text-zinc-500">
                {mode === "upgrade" ? (
                  <>Upgrade to <span className="font-medium text-zinc-900">{PLANS.find(p => p.id === selectedPlanId)?.name}</span> plan</>
                ) : (
                  <>You receive <span className="font-medium text-zinc-900">${(quote?.creditUsd ?? effAmount).toFixed(2)}</span> in scan credits</>
                )}
              </div>
              {trial.active && mode === "upgrade" && (
                <div className="mt-2 text-[11px] text-indigo-600 font-medium bg-indigo-50 px-2 py-1 rounded-lg inline-block">
                  Note: This will end your free trial and activate your paid plan.
                </div>

              )}
            </div>

            <button
              onClick={onCreate}
              disabled={busy || !!quote?.error || (mode === "upgrade" && !selectedPlanId)}
              className="rounded-2xl border border-black/10 bg-white px-6 py-3.5 text-sm font-medium text-black transition hover:bg-black/5 disabled:opacity-50"
            >
              {mode === "upgrade" ? "Upgrade now" : "Continue to payment"}
            </button>
          </div>
        </section>
      ) : (

        <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-24px_rgba(0,0,0,0.25)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex">
                <NetworkIcon id={order.network} className="h-11 w-11" />
                <UsdtIcon className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full ring-2 ring-white" />
              </span>
              <div>
                
                <div className="mt-0.5 text-2xl font-semibold text-zinc-900">
                  {Number(order.pay_amount_usd).toFixed(2)} USDT
                </div>
                <div className="mt-1 text-[13px] text-zinc-500">
                  Send this exact amount — the cents identify your payment.
                </div>
              </div>
            </div>
            {order.status === "pending" && (
              <div className="rounded-2xl border border-black/10 bg-white px-5 py-3 text-center text-black">
                <div className="text-[10px] uppercase tracking-[0.2em] text-black/60">Time left</div>
                <div className="font-mono text-2xl tabular-nums text-red-600">{mm}:{ss}</div>
              </div>
            )}
          </div>


          <div className="mt-5 space-y-5">
            <div>
              <div className="text-[13px] text-zinc-500">Deposit address ({net.label})</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-900">
                  {order.deposit_address}
                </code>
                <button
                  onClick={() => { void navigator.clipboard.writeText(order.deposit_address); toast.success("Address copied"); }}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
                >
                  Copy
                </button>
              </div>
              <div className="mt-1.5 text-[13px] text-zinc-500">
                {order.is_upgrade ? (
                  <>Upgrade to <span className="font-medium text-zinc-900 uppercase">{order.target_plan_id}</span> plan</>
                ) : (
                  <>Credits on approval: <span className="font-medium text-zinc-900">${Number(order.credit_usd).toFixed(2)}</span>
                  {Number(order.bonus_usd) > 0 && <> · bonus ${Number(order.bonus_usd).toFixed(2)}</>}</>
                )}
              </div>

              <div className="mt-1 text-[12px] text-amber-700">
                Only send {net.asset} on {net.chain}. Other assets or networks cannot be recovered.
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-100 pt-5">
            <div className="text-[13px] font-medium text-zinc-900">
              Status: <span className="text-zinc-600">{statusLabel(order.status)}</span>
            </div>
            {order.status === "approved" ? (
              <p className="mt-2 text-[13px] text-emerald-700">
                Payment confirmed — ${Number(order.credit_usd).toFixed(2)} added to your wallet.
              </p>
            ) : order.status === "needs_review" ? (
              <p className="mt-2 text-[13px] text-zinc-600">
                We couldn't auto-confirm it yet. Our team reviews it manually and you'll get an email either way.
              </p>
            ) : (
              <>
                <p className="mt-2 text-[13px] text-zinc-600">After sending, paste the transaction ID (hash) below.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={hash}
                    onChange={(e) => setHash(e.target.value.trim())}
                    placeholder="Transaction ID / hash"
                    className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
                  />
                  <button
                    onClick={onSubmitHash}
                    disabled={busy}
                    className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Verify payment
                  </button>
                </div>
              </>
            )}
            <div className="mt-4 flex gap-3">
              <button
                onClick={async () => {
                  if (order.status === "pending") await cancelFn({ data: { orderId: order.id } });
                  setOrder(null);
                  void loadOrders();
                }}
                className="text-[13px] text-zinc-500 underline underline-offset-4 hover:text-zinc-900"
              >
                {order.status === "pending" ? "Cancel and start over" : "Make another payment"}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-24px_rgba(0,0,0,0.25)]">
        <h2 className="text-[15px] font-semibold text-zinc-900">&nbsp; Payment history</h2>
        {orders.length === 0 ? (
          <p className="mt-2 text-[13px] text-zinc-500">No payments yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-zinc-400">
                <tr>
                  <th className="py-2 pr-3 font-normal">Date</th>
                  <th className="py-2 pr-3 font-normal">Paid</th>
                  <th className="py-2 pr-3 font-normal">Credit</th>
                  <th className="py-2 pr-3 font-normal">Network</th>
                  <th className="py-2 pr-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="text-zinc-700">
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-zinc-100">
                    <td className="py-2 pr-3">{new Date(o.created_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-3">${Number(o.pay_amount_usd).toFixed(2)}</td>
                    <td className="py-2 pr-3">${Number(o.credit_usd).toFixed(2)}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <NetworkIcon id={o.network} className="h-4 w-4" />
                        {networkMeta(o.network).label}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          o.status === "approved"
                            ? "text-emerald-700"
                            : o.status === "rejected"
                              ? "text-red-600"
                              : "text-zinc-500"
                        }
                      >
                        {statusLabel(o.status)}
                      </span>
                      {o.reject_reason && <div className="text-[12px] text-red-500">{o.reject_reason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
