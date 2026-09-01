import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeSignalPlan, resolveInstrument, type SignalPlan } from "@/lib/gold-analysis.functions";
import { callChatCompletion, AiGatewayError, MODEL_CHAIN } from "@/lib/ai-gateway";

export type AgentContext = {
  symbol?: string;
  bias?: string;
  direction?: string;
  entry?: number;
  sl?: number;
  tp?: number;
  rr?: number;
  setupGrade?: string;
  setupScore?: number;
  session?: string;
  killzone?: string;
  confluences?: string[];
  keyLevels?: { label: string; price: number; kind?: string }[];
  currentPrice?: number;
};

/* ------- symbol detection: XAU pairs only ------- */
const XAU_TOKENS: Array<{ re: RegExp; sym: string }> = [
  { re: /\b(XAUUSD|XAU|GOLD|BULLION)\b/, sym: "XAUUSD" },
];

function detectSymbol(question: string): string | null {
  const q = ` ${question.toUpperCase()} `;
  for (const t of XAU_TOKENS) if (t.re.test(q)) return t.sym;
  return null;
}


function buildContextFromPlan(plan: SignalPlan): string {
  const lvls = (plan.keyLevels || [])
    .slice(0, 8)
    .map((k) => `${k.label}=${k.price}`)
    .join(" · ");
  return `
INSTRUMENT: ${plan.instrument.display} (${plan.instrument.kind})
CURRENT PRICE: ${plan.currentPrice}
HTF BIAS: ${plan.htfBias}
SETUP: ${plan.setupGrade} (score ${plan.setupScore}/100, alignment ${plan.alignmentLabel} ${plan.alignmentScore}/100)
TRADE: ${plan.trade.direction} entry=${plan.trade.entry ?? "—"} sl=${plan.trade.sl ?? "—"} tp=${plan.trade.tp ?? "—"} rr=${plan.trade.rr?.toFixed?.(2) ?? plan.trade.rr ?? "—"} confidence=${plan.trade.confidence ?? "—"}%
SESSION: ${plan.session} · KILLZONE: ${plan.killzone}
CONFLUENCES: ${(plan.confluences ?? []).join(" · ") || "—"}
KEY LEVELS: ${lvls || "—"}
HTF NARRATIVE: ${plan.htfNarrative}
LTF NARRATIVE: ${plan.ltfNarrative}
NEWS RISK: ${plan.newsRisk?.severity ?? "low"} — ${plan.newsRisk?.warning ?? ""}
`.trim();
}

function buildContextFromCtx(ctx: AgentContext): string {
  return `
INSTRUMENT: ${ctx.symbol ?? "—"}
CURRENT PRICE: ${ctx.currentPrice ?? "—"}
HTF BIAS: ${ctx.bias ?? "—"}
SETUP: ${ctx.setupGrade ?? "—"} (score ${ctx.setupScore ?? "—"}/100)
TRADE: ${ctx.direction ?? "WAIT"} entry=${ctx.entry ?? "—"} sl=${ctx.sl ?? "—"} tp=${ctx.tp ?? "—"} rr=${ctx.rr ?? "—"}
SESSION: ${ctx.session ?? "—"} · KILLZONE: ${ctx.killzone ?? "—"}
CONFLUENCES: ${(ctx.confluences ?? []).join(" · ") || "—"}
KEY LEVELS: ${(ctx.keyLevels ?? []).map((k) => `${k.label}=${k.price}`).join(" · ") || "—"}
`.trim();
}

async function fetchAccountContext(supabase: any, userId: string): Promise<string> {
  try {
    const [balRes, subRes, statsRes, ledgerRes, refRes, profRes] = await Promise.all([
      supabase.from("credit_balances").select("balance,monthly_allowance,period_resets_at").eq("user_id", userId).maybeSingle(),
      supabase.from("user_subscriptions").select("plan_id,status,billing_interval,current_period_end").eq("user_id", userId).maybeSingle(),
      supabase.rpc("journal_stats", { _from: null, _to: null }),
      supabase.from("credit_ledger").select("delta,reason,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("referral_codes").select("code").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    ]);
    const bal = balRes?.data ?? {};
    const sub = subRes?.data ?? {};
    const stats = (statsRes?.data as any) ?? {};
    const totals = stats.totals ?? {};
    const byPair = Array.isArray(stats.by_pair) ? stats.by_pair.slice(0, 5) : [];
    const ledger = Array.isArray(ledgerRes?.data) ? ledgerRes.data : [];
    const spentThisPeriod = ledger
      .filter((r: any) => Number(r.delta) < 0 && (r.reason === "signal_scan" || r.reason === "voice-chat"))
      .reduce((s: number, r: any) => s + Math.abs(Number(r.delta)), 0);
    const scansCount = ledger.filter((r: any) => Number(r.delta) < 0 && r.reason === "signal_scan").length;
    const ref = refRes?.data?.code ?? "—";
    const name = profRes?.data?.full_name ?? "—";

    const pairsStr = byPair.map((p: any) => `${p.pair}: ${p.trades}t ${p.win_rate}% $${Number(p.pnl).toFixed(2)}`).join(" · ") || "—";

    return `
ACCOUNT (private — use only if user asks about their account/balance/trades/stats):
NAME: ${name}
PLAN: ${sub.plan_id ?? "free"} (${sub.status ?? "—"}, ${sub.billing_interval ?? "—"}, renews ${sub.current_period_end ?? "—"})
WALLET BALANCE: $${Number(bal.balance ?? 0).toFixed(4)} (monthly allowance $${Number(bal.monthly_allowance ?? 0).toFixed(2)}, resets ${bal.period_resets_at ?? "—"})
SPENT (last 50 entries): $${spentThisPeriod.toFixed(4)} · SCANS COUNT: ${scansCount}
TRADE JOURNAL: total=${totals.total ?? 0} wins=${totals.wins ?? 0} losses=${totals.losses ?? 0} BE=${totals.breakeven ?? 0} win_rate=${totals.win_rate ?? 0}% total_pnl=$${Number(totals.total_pnl ?? 0).toFixed(2)} avg_win=$${Number(totals.avg_win ?? 0).toFixed(2)} avg_loss=$${Number(totals.avg_loss ?? 0).toFixed(2)} best=$${Number(totals.best ?? 0).toFixed(2)} worst=$${Number(totals.worst ?? 0).toFixed(2)} expectancy=$${Number(totals.expectancy ?? 0).toFixed(2)}
TOP PAIRS: ${pairsStr}
REFERRAL CODE: ${ref}
`.trim();
  } catch {
    return "ACCOUNT: (unavailable)";
  }
}

export const askSignalAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { question: string; context?: AgentContext })
  .handler(async ({ data, context }) => {
    // Voice queries are free (0 scans). No ledger deduction.

    const ctx = data.context ?? {};
    const currentSym = (ctx.symbol ?? "").toUpperCase().replace(/[\s_\-/]/g, "");
    const detected = detectSymbol(data.question);

    let switchedPlan: SignalPlan | null = null;
    let switchedDisplay: string | null = null;
    let contextStr = buildContextFromCtx(ctx);
    let isAnalysisIntent = /\b(analy[sz]e|analysis|setup|signal|entry|trade|bias|prediction|forecast|target|levels?|setup|plan|view|outlook|short|long|buy|sell|breakdown)\b/i.test(data.question);


    if (detected) {
      const resolved = resolveInstrument(detected);
      const resolvedKey = resolved.key.split(":")[1] || resolved.raw;
      const isDifferent =
        !currentSym ||
        (!currentSym.includes(detected) && !detected.includes(currentSym) && !currentSym.includes(resolvedKey));

      // If user mentioned a different instrument OR explicitly asked for analysis on it, fetch its plan.
      if (isDifferent || isAnalysisIntent) {
        try {
          switchedPlan = await computeSignalPlan({ symbol: detected }, context.userId);
          switchedDisplay = switchedPlan.instrument.display;
          contextStr = buildContextFromPlan(switchedPlan);
          isAnalysisIntent = true;
        } catch (e: any) {
          // Symbol couldn't be resolved or feed failed — let LLM still answer with a friendly note.
          contextStr += `\n\nNOTE: Live feed for ${detected} unavailable right now (${e?.message?.slice(0, 100) || "no data"}). Answer conceptually using ICT/SMC playbook for this asset class.`;
        }
      }
    }

    // Fetch account context (balance, plan, trade stats). Used only if user asks account-related questions.
    const accountStr = await fetchAccountContext(context.supabase, context.userId);

    const isAccountIntent = /\b(balance|wallet|credit|scan|plan|subscription|upgrade|renew|referral|profit|loss|pnl|win\s*rate|winrate|trades?|journal|stats|history|account|spent|used)\b/i.test(data.question);
    const system = `You are Jenvu — a gold specialist with 25+ years on bullion desks (LBMA / COMEX / prop). You trade XAU/USD exclusively. You are an expert in ICT (Inner Circle Trader) and SMC (Smart Money Concepts): BOS/CHOCH/MSS, premium/discount, OB/Breaker/Mitigation, FVG/IFVG/BPR, BSL/SSL liquidity, equal highs/lows, PDH/PDL, weekly/daily open, OTE 62-79%, London fix (10:30 & 15:00 GMT), London Killzone (07-10 GMT), NY AM Killzone (12-15 GMT), Power of Three.

Deep gold context you always use: DXY inverse correlation, real yields (10Y TIPS), central-bank buying flows, ETF flows (GLD/IAU), COMEX/COT positioning, geopolitical risk premium, gold seasonality, and news risk (NFP, CPI, FOMC, ECB, BoE, BoJ, RBA, SNB depending on the quote currency).


If the user asks about anything that is NOT XAU/USD (BTC, ETH, EURUSD, NAS100, AAPL, oil, silver, etc.), politely decline in one line: "Jenvu is a gold-only desk — I trade XAU/USD only. Shall I look at XAU/USD?" — then stop.

When the user wants an analysis / setup / signal on a XAU pair, deliver a full A+ institutional breakdown in this order (concise, numbered, no fluff, in ENGLISH only — no Hindi/Urdu):
1) HTF bias & structure (trend, last BOS/CHoCH, what side liquidity sits)
2) Liquidity map (PDH/PDL, prior week H/L, Asia range, London H/L, daily/weekly open, round-number magnets)
3) Point of Interest (OB / FVG / breaker) with exact price zone
4) Entry trigger (what confirmation you need — sweep + CHoCH on LTF, etc.)
5) Stop loss placement & logic (beyond which structure)
6) Take-profit ladder with R:R (TP1 nearest liquidity, TP2 opposing range)
7) Invalidation & risk note (news, killzone, DXY / quote-currency confluence, what kills the idea)

For casual gold questions (greeting, "why this bias?", "explain FVG", "what moved gold today?"), answer naturally in 2-4 sentences using ICT/SMC vocabulary.

ACCOUNT AWARENESS: If the user asks about THEIR account, balance, wallet, credits, scans used, current plan, subscription renewal, referral code, trade journal stats, win rate, profit/loss, best/worst trade, expectancy, or performance per pair — answer accurately using ONLY the ACCOUNT section in the context. Give exact numbers with $ where relevant. Never invent figures. If a field is "—" or missing, say it's not available yet. Never volunteer account info unless the user asked; keep private data private.

Use the LIVE prices and levels from the context. Be specific, decisive, pro. No disclaimers. IMPORTANT: Reply in PLAIN TEXT only — never use markdown formatting. No asterisks (*, **, ***), no hashes (#, ##, ###), no backticks, no underscores for emphasis, no bullet dashes. Use simple numbered lines like "1) ..." and plain sentences. Keep it clean so it reads naturally when spoken aloud.`;


    let reply = "No response.";
    try {
      const { content, model: __aiModel, usage: __aiUsage } = await callChatCompletion({
        models: [...MODEL_CHAIN.chat],
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `${switchedDisplay ? `(User is asking about ${switchedDisplay} — use the live context below for that instrument.)\n\n` : ""}CONTEXT:\n${contextStr}\n\n${isAccountIntent ? `${accountStr}\n\n` : ""}QUESTION: ${data.question}`,
          },

        ],
        priority: true,
        timeoutMs: 20000,
        stage: "voice-chat",
      });
      import("@/lib/ai-cost-log.server").then((m) => m.logAiCost({ userId: context.userId, stage: "voice-chat", model: __aiModel, usage: __aiUsage })).catch(() => {});
      reply = content.trim() || "No response.";
    } catch (err) {
      if (err instanceof AiGatewayError) throw new Error(err.message);
      throw err;
    }
    return { reply, switchedSymbol: switchedDisplay };
  });
