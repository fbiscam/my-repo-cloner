import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { matchActualAiModels, type AiCostLogRow, type MatchedAiModels } from "@/lib/credits-model-match";

// LEGACY constant kept for import compatibility. All charges are now
// USD-based and deducted per-AI-call inside logAiCost().
export const CREDIT_COSTS = {
  voice_query: 0,
  signal: 0,
  ict_narration: 0,
  alert: 0,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

export type PlanFeatures = {
  journal: boolean;
  realtime_alerts: boolean;
  full_ict: boolean;
  scanner: boolean;
};

export type LedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
  model?: string | null;
  stage?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  raw_cost_usd?: number | null;
  metadata?: Record<string, any> | null;
};

export type TrialInfo = { active: boolean; endsAt: string | null; daysLeft: number };

export type CreditState = {
  plan: { id: string; name: string; price_usd: number; wallet_usd: number };
  features: PlanFeatures;
  balance: number;      // USD wallet balance
  allowance: number;    // monthly wallet allowance (USD)
  periodResetsAt: string | null;
  trial: TrialInfo;
  recent: LedgerEntry[];
};

export const getCreditState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreditState> => {
    const { supabase, userId } = context;

    const [{ data: sub }, { data: bal }, { data: ledger }] = await Promise.all([
      supabase
        .from("user_subscriptions")
        .select("plan_id, status, is_trial, trial_ends_at")
        .eq("user_id", userId)
        .maybeSingle(),

      supabase.from("credit_balances").select("balance, monthly_allowance, period_resets_at").eq("user_id", userId).maybeSingle(),
      supabase.from("credit_ledger")
        .select("id, delta, reason, balance_after, created_at, model, stage, prompt_tokens, completion_tokens, raw_cost_usd, metadata")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(60),
    ]);

    // Fetch plan row separately to avoid PostgREST embed edge-cases
    // (array vs object, null on join). Falls back to Free defaults.
    const planId = (sub?.plan_id as string | null) ?? "free";
    const { data: planRow } = await supabase
      .from("plans")
      .select("id, name, price_usd, wallet_usd, monthly_credits, feature_journal, feature_realtime_alerts, feature_full_ict, feature_scanner")
      .eq("id", planId)
      .maybeSingle();

    const ledgerRows = ledger ?? [];
    let actualModelMatches = new Map<string, MatchedAiModels>();
    if (ledgerRows.length > 0) {
      const times = ledgerRows.map((r: any) => new Date(r.created_at).getTime()).filter(Number.isFinite);
      if (times.length > 0) {
        const from = new Date(Math.min(...times) - 10 * 60_000).toISOString();
        const to = new Date(Math.max(...times) + 60_000).toISOString();
        const { data: aiLogs } = await supabase
          .from("ai_cost_log")
          .select("id, created_at, stage, model, prompt_tokens, completion_tokens")
          .eq("user_id", userId)
          .gte("created_at", from)
          .lte("created_at", to)
          .order("created_at", { ascending: true });
        actualModelMatches = matchActualAiModels(ledgerRows, (aiLogs ?? []) as AiCostLogRow[]);
      }
    }

    const plan = (planRow as any) ?? { id: "free", name: "Free", price_usd: 0, wallet_usd: 1.00, feature_journal: false, feature_realtime_alerts: false, feature_full_ict: false, feature_scanner: false };
    const walletUsd = Number(plan.wallet_usd ?? 0);

    const trialEndsAt = (sub as any)?.trial_ends_at as string | null | undefined;
    const trialActive = !!(sub as any)?.is_trial && !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();
    const trial = {
      active: trialActive,
      endsAt: trialActive ? trialEndsAt! : null,
      daysLeft: trialActive
        ? Math.max(0, Math.ceil((new Date(trialEndsAt!).getTime() - Date.now()) / 86_400_000))
        : 0,
    };

    return {
      trial,
      plan: { id: plan.id, name: plan.name, price_usd: Number(plan.price_usd ?? 0), wallet_usd: walletUsd },

      features: {
        journal: !!plan.feature_journal,
        realtime_alerts: !!plan.feature_realtime_alerts,
        full_ict: !!plan.feature_full_ict,
        scanner: !!plan.feature_scanner,
      },
      balance: Number(bal?.balance ?? 0),
      allowance: Number(bal?.monthly_allowance ?? walletUsd),
      periodResetsAt: bal?.period_resets_at ?? null,
      recent: ledgerRows.map((r: any) => {
        const meta = (r.metadata ?? {}) as Record<string, any>;
        const actual = actualModelMatches.get(r.id);
        const actualPrimary = actual?.primary?.model ?? null;
        const seniorsArr = actual?.seniors ?? (actual?.senior ? [actual.senior] : []);
        const actualSenior = seniorsArr.length ? seniorsArr.map((s) => s.model).filter(Boolean).join(",") : null;
        const seniorPromptTokens = seniorsArr.reduce((n, s) => n + (s.prompt_tokens ?? 0), 0);
        const seniorCompletionTokens = seniorsArr.reduce((n, s) => n + (s.completion_tokens ?? 0), 0);
        const enrichedMeta = {
          ...meta,
          ...(actualPrimary ? {
            actual_model: actualPrimary,
            actual_model_stage: actual?.primary?.stage ?? null,
            actual_prompt_tokens: actual?.primary?.prompt_tokens ?? null,
            actual_completion_tokens: actual?.primary?.completion_tokens ?? null,
          } : {}),
          ...(actualSenior ? {
            actual_senior_model: actualSenior,
            actual_senior_model_stage: seniorsArr[0]?.stage ?? null,
            actual_senior_prompt_tokens: seniorPromptTokens || null,
            actual_senior_completion_tokens: seniorCompletionTokens || null,
          } : {}),
        };
        return {
          id: r.id, delta: Number(r.delta), reason: r.reason, balance_after: Number(r.balance_after),
          created_at: r.created_at,
          model: actualPrimary ?? r.model ?? meta.model ?? null,
          stage: r.stage ?? meta.stage ?? null,
          prompt_tokens: actual?.primary?.prompt_tokens ?? r.prompt_tokens ?? meta.prompt_tokens ?? null,
          completion_tokens: actual?.primary?.completion_tokens ?? r.completion_tokens ?? meta.completion_tokens ?? null,
          raw_cost_usd: r.raw_cost_usd == null ? (meta.raw_cost_usd == null ? null : Number(meta.raw_cost_usd)) : Number(r.raw_cost_usd),
          metadata: enrichedMeta,
        };
      }),
    };
  });

const spendSchema = z.object({
  action: z.enum(["voice_query", "signal", "ict_narration", "alert"]),
  metadata: z.record(z.unknown()).optional(),
});

// USD-wallet system: pre-flight balance check only. Actual $ cost is deducted
// per-AI-call inside logAiCost() based on model tokens × plan markup.
// Minimum balance = $0.20 (flat charge per BUY/SELL signal). Anything lower
// blocks the scan up-front so the user isn't left mid-analysis with a
// half-charged wallet.
const MIN_BALANCE_USD = 0.20;

export const spendCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => spendSchema.parse(data))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Document gate: after 30 days from approval, unverified users must
    // submit identity documents before running any scan.
    const { data: authData } = await supabase.auth.getUser();
    const email = authData?.user?.email ?? null;
    if (email) {
      const { data: app } = await supabase
        .from("founding_applications")
        .select("status, document_status, approved_at")
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (app?.approved_at && app.document_status !== "verified") {
        const approvedMs = new Date(app.approved_at as string).getTime();
        const daysSince = (Date.now() - approvedMs) / 86_400_000;
        if (daysSince > 30) {
          return {
            balance: 0,
            spent: 0,
            ok: false as const,
            error: "DOCUMENTS_REQUIRED" as const,
            daysSinceApproval: Math.floor(daysSince),
          };
        }
      }
    }

    const { data: bal } = await supabase
      .from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
    const balance = Number(bal?.balance ?? 0);
    if (balance < MIN_BALANCE_USD) {
      return { balance, spent: 0, ok: false as const, error: "INSUFFICIENT_CREDITS" as const, minRequired: MIN_BALANCE_USD };
    }
    return { balance, spent: 0, ok: true as const };
  });
