// Server-only helper: compute approx $ cost from AI Gateway usage, log to
// public.ai_cost_log, AND deduct (cost × plan markup) from the user's USD
// wallet balance via spend_credits RPC. Fire-and-forget from the caller.

type Price = { in: number; out: number };

const MODEL_PRICING: Record<string, Price> = {
  "rules-engine/ict-smc": { in: 0, out: 0 },
  // OpenAI direct
  "openai/gpt-5.5": { in: 1.25, out: 10.0 },
  "openai/gpt-5.5-pro": { in: 3.0, out: 15.0 },
  "openai/gpt-5.4": { in: 1.1, out: 8.8 },
  "openai/gpt-5.4-pro": { in: 3.0, out: 15.0 },
  "openai/gpt-5.4-mini": { in: 0.25, out: 2.0 },
  "openai/gpt-5.4-nano": { in: 0.05, out: 0.4 },
  "openai/gpt-5.2": { in: 1.1, out: 8.8 },
  "openai/gpt-5": { in: 1.25, out: 10.0 },
  "openai/gpt-5-mini": { in: 0.25, out: 2.0 },
  "openai/gpt-5-nano": { in: 0.05, out: 0.4 },
  // Bluesminds mirrors OpenAI list prices
  "bmind/gpt-5.6-sol": { in: 1.25, out: 10.0 },
  "bmind/gpt-5.6-terra": { in: 0.6, out: 4.0 },
  "bmind/gpt-5.6-luna": { in: 0.2, out: 1.6 },
  "bmind/gpt-5.5": { in: 1.25, out: 10.0 },
  "bmind/gpt-5.5-pro": { in: 3.0, out: 15.0 },
  "bmind/gpt-5.4": { in: 1.1, out: 8.8 },
  "bmind/gpt-5.4-pro": { in: 3.0, out: 15.0 },
  "bmind/gpt-5.4-mini": { in: 0.25, out: 2.0 },
  "bmind/gpt-5-mini": { in: 0.25, out: 2.0 },
  "bmind/gpt-5.2-chat": { in: 1.1, out: 8.8 },
  "bmind/gpt-4o-mini": { in: 0.15, out: 0.6 },
  "bmind/gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "bmind/claude-3.7-sonnet": { in: 3.0, out: 15.0 },
  "bmind/claude-sonnet-4.5": { in: 3.0, out: 15.0 },
  "bmind/gemini-2.5-pro": { in: 1.25, out: 10.0 },
  "bmind/deepseek-ai/deepseek-v4-pro": { in: 0.55, out: 2.19 },
  "bmind/orion/deepseek-ai/deepseek-v4-pro": { in: 0.55, out: 2.19 },
  "bmind/deepseek-v4-pro": { in: 0.55, out: 2.19 },
  "bmind/deepseek-v4-flash": { in: 0.27, out: 1.10 },
  "bmind/grok-4.5": { in: 3.0, out: 15.0 },
  // DeepSeek official API
  "dsofficial/deepseek-reasoner": { in: 0.55, out: 2.19 },
  "dsofficial/deepseek-chat": { in: 0.27, out: 1.10 },
  // NVIDIA integrate (free tier)
  "nvapi/deepseek-ai/deepseek-v4-pro": { in: 0, out: 0 },
  "nvapi/deepseek-ai/deepseek-v4-flash-0731": { in: 0, out: 0 },
  "nvapi/openai/gpt-oss-120b": { in: 0, out: 0 },

  // Google
  "google/gemini-2.5-pro": { in: 1.25, out: 10.0 },
  "google/gemini-2.5-flash": { in: 0.075, out: 0.3 },
  "google/gemini-2.5-flash-lite": { in: 0.04, out: 0.15 },
  "google/gemini-3-flash-preview": { in: 0.1, out: 0.4 },
  "google/gemini-3.1-pro-preview": { in: 1.5, out: 12.0 },
  "google/gemini-3.1-flash-lite": { in: 0.05, out: 0.2 },
  "google/gemini-3.5-flash": { in: 0.15, out: 0.6 },
};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  return (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out;
}

// Flat charge per real signal (BUY/SELL only). WAIT/no-trade scans are free.
export const SIGNAL_SCAN_CHARGE_USD = 0.20;
// Flat $0.20 per BUY/SELL scan — senior review included at no extra cost.
export const SIGNAL_SCAN_CHARGE_WITH_SENIOR_USD = 0.20;

// Pretty label for the AI model used, shown in billing history.
export function formatModelLabel(rawModel: string | null | undefined): string {
  if (!rawModel) return "—";
  const raw = String(rawModel);
  // Support comma-joined multi-model strings (parallel senior review).
  if (raw.includes(",")) {
    return raw.split(",").map((s) => formatModelLabel(s.trim())).filter(Boolean).join(" + ");
  }
  const m = raw.toLowerCase();
  if (m.startsWith("rules-engine/ict-smc")) return "ICT/SMC Rules Engine";
  // Strip provider prefix (bmind/, openai/, nvapi/, google/, etc.)
  const bare = m.replace(/^(dsofficial|bmind|openai|nvapi|google|anthropic)\//g, "").replace(/^orion\//, "").replace(/^deepseek-ai\//, "");
  if (bare.startsWith("claude-sonnet-4.5") || bare.startsWith("claude-4.5-sonnet")) return "Claude Sonnet 4.5";
  if (bare.startsWith("claude-3.7-sonnet") || bare.startsWith("claude-3-7-sonnet")) return "Claude 3.7 Sonnet";
  if (bare.startsWith("claude-opus")) return "Claude Opus";
  if (bare.startsWith("claude")) return "Claude";
  if (bare.startsWith("gpt-5.6-luna")) return "ChatGPT 5.6 Luna";
  if (bare.startsWith("gpt-5.6")) return "ChatGPT 5.6";
  if (bare.startsWith("gpt-5.5-pro")) return "ChatGPT 5.5 Pro";
  if (bare.startsWith("gpt-5.5")) return "ChatGPT 5.5";
  if (bare.startsWith("gpt-5.4-pro")) return "ChatGPT 5.4 Pro";
  if (bare.startsWith("gpt-5.4-mini")) return "ChatGPT 5.4 Mini";
  if (bare.startsWith("gpt-5.4-nano")) return "ChatGPT 5.4 Nano";
  if (bare.startsWith("gpt-5.4")) return "ChatGPT 5.4";
  if (bare.startsWith("gpt-5.2-chat")) return "ChatGPT 5.2 Chat";
  if (bare.startsWith("gpt-5.2")) return "ChatGPT 5.2";
  if (bare.startsWith("gpt-5-mini")) return "ChatGPT 5 Mini";
  if (bare.startsWith("gpt-5-nano")) return "ChatGPT 5 Nano";
  if (bare.startsWith("gpt-5")) return "ChatGPT 5";
  if (bare.startsWith("gpt-4.1-mini")) return "ChatGPT 4.1 Mini";
  if (bare.startsWith("gpt-4.1")) return "ChatGPT 4.1";
  if (bare.startsWith("gpt-4o-mini")) return "ChatGPT 4o Mini";
  if (bare.startsWith("gpt-4o")) return "ChatGPT 4o";
  if (bare.startsWith("gpt-oss-120b")) return "GPT-OSS 120B";
  if (bare.startsWith("deepseek-v4-flash")) return "DeepSeek V4 Flash";
  if (bare.startsWith("deepseek-v4-pro") || bare.startsWith("deepseek-reasoner")) return "DeepSeek V4 Pro";
  if (bare.startsWith("deepseek-chat")) return "DeepSeek V3";
  if (bare.startsWith("grok")) return "Grok 4.5";

  if (bare.startsWith("gemini-3.1-pro")) return "Gemini 3.1 Pro";
  if (bare.startsWith("gemini-3.5-flash")) return "Gemini 3.5 Flash";
  if (bare.startsWith("gemini-3-flash")) return "Gemini 3 Flash";
  if (bare.startsWith("gemini-2.5-pro")) return "Gemini 2.5 Pro";
  if (bare.startsWith("gemini-2.5-flash-lite")) return "Gemini 2.5 Flash Lite";
  if (bare.startsWith("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  return bare.replace(/^gpt-/, "GPT ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Pure logging — writes tokens & raw cost to ai_cost_log. Does NOT deduct
// from the user's wallet. Actual billing is a single flat charge per real
// signal, applied via chargeSignalScan() below.
export async function logAiCost(params: {
  userId: string | null;
  stage: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens?: number };
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let plan_id: string | null = null;
    if (params.userId) {
      const { data } = await supabaseAdmin
        .from("user_subscriptions")
        .select("plan_id")
        .eq("user_id", params.userId)
        .maybeSingle();
      plan_id = (data?.plan_id as string | undefined) ?? null;
    }

    const promptTokens = Math.max(0, params.usage.promptTokens | 0);
    const completionTokens = Math.max(0, params.usage.completionTokens | 0);
    const totalTokens = params.usage.totalTokens ?? promptTokens + completionTokens;
    const rawCost = estimateCostUsd(params.model, promptTokens, completionTokens);

    await supabaseAdmin.from("ai_cost_log").insert({
      user_id: params.userId, plan_id, stage: params.stage, model: params.model,
      prompt_tokens: promptTokens, completion_tokens: completionTokens,
      total_tokens: totalTokens, cost_usd: rawCost,
    });
  } catch (e) {
    console.warn("logAiCost failed:", (e as Error)?.message ?? e);
  }
}

// Flat per-signal billing. Charges SIGNAL_SCAN_CHARGE_USD only if the
// analysis produced a real BUY or SELL. WAIT / no-trade returns are free.
export async function chargeSignalScan(params: {
  userId: string | null;
  direction: "BUY" | "SELL" | "WAIT" | string;
  model: string | null;
  seniorModel?: string | null;
  seniorReviewRequired?: boolean;
  seniorReviewStatus?: string | null;
  seniorReviewError?: string | null;
  symbol?: string | null;
  scanId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  grade?: string | null;
  score?: number | null;
}): Promise<void> {
  if (!params.userId) return;
  const dir = String(params.direction || "").toUpperCase();
  if (dir !== "BUY" && dir !== "SELL") return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Idempotency guard — never double-charge for the same scanId. If a caller
    // (voice path, retry, race) invokes chargeSignalScan twice for one scan,
    // the second write is a no-op.
    if (params.scanId) {
      const { data: dupe } = await supabaseAdmin
        .from("credit_ledger")
        .select("id")
        .eq("user_id", params.userId)
        .eq("reason", "ai_scan")
        .contains("metadata", { scanId: params.scanId })
        .limit(1)
        .maybeSingle();
      if (dupe?.id) return;
    }
    const pTok = Math.max(0, params.promptTokens ?? 0);
    const cTok = Math.max(0, params.completionTokens ?? 0);
    const seniorRequired = params.seniorReviewRequired === true;
    // Only label + charge senior review when a real senior model actually
    // ran (i.e. the caller passed the model id it used). Don't fabricate a
    // model name when senior review was required but failed / skipped.
    const seniorModel = params.seniorModel ?? null;
    const seniorRan = Boolean(seniorModel);
    const amount = seniorRan ? SIGNAL_SCAN_CHARGE_WITH_SENIOR_USD : SIGNAL_SCAN_CHARGE_USD;
    // Guarantee history always shows the model that ran — if the caller
    // didn't pass one (deterministic engine fallback path), default to the
    // current primary so no user's billing row is ever blank.
    const primaryModel = params.model ?? "bmind/gpt-5-mini";
    const meta: Record<string, unknown> = {
      model: primaryModel,
      model_label: formatModelLabel(primaryModel),
      senior_model: seniorModel,
      senior_model_label: seniorModel ? formatModelLabel(seniorModel) : null,
      stage: "signal",
      direction: dir,
      prompt_tokens: pTok,
      completion_tokens: cTok,
      grade: params.grade ?? null,
      score: params.score ?? null,
      senior_review: seniorRan,
      senior_review_required: seniorRequired,
      senior_review_status: params.seniorReviewStatus ?? (seniorRan ? "completed" : "not_required"),
      // Only surface an error when the review actually failed — otherwise
      // stale "Timeout"/"empty response" strings pollute completed rows.
      senior_review_error: params.seniorReviewStatus === "failed" ? (params.seniorReviewError ?? null) : null,
      charge_usd: amount,
    };
    if (params.symbol) meta.symbol = params.symbol;
    if (params.scanId) meta.scanId = params.scanId;
    const { error } = await supabaseAdmin.rpc("spend_credits", {
      _user_id: params.userId,
      _amount: amount as any,
      _reason: "ai_scan",
      _metadata: meta as any,
    });
    if (error && !error.message?.includes("INSUFFICIENT_CREDITS")) {
      console.warn("chargeSignalScan spend_credits failed:", error.message);
    }
  } catch (e) {
    console.warn("chargeSignalScan failed:", (e as Error)?.message ?? e);
  }
}
