import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PlanCostRow = {
  plan_id: string;
  scans: number;
  total_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost_usd: number;
  avg_cost_per_scan_usd: number;
  avg_tokens_per_call: number;
};

export type StageCostRow = {
  stage: string;
  calls: number;
  total_cost_usd: number;
  avg_cost_usd: number;
};

export type ModelCostRow = {
  model: string;
  calls: number;
  total_cost_usd: number;
};

export type ScanCostReport = {
  windowDays: number;
  since: string;
  totalCalls: number;
  totalScans: number;
  totalCostUsd: number;
  byPlan: PlanCostRow[];
  byStage: StageCostRow[];
  byModel: ModelCostRow[];
};

async function assertAdmin(supabase: any, userId: string) {
  const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
  const ok = await isAdminOrOpsUnlocked(supabase, userId);
  if (!ok) throw new Error("Forbidden: admin access required");
}

// A "scan" for reporting purposes = an "analyze/narration" event.
// Voice-chat is tracked separately but included in totals.
const SCAN_STAGES = new Set(["signal-narration", "chat-signal", "senior-review"]);
// The single canonical scan pipeline stage (one per user-initiated scan).
const CANONICAL_SCAN_STAGE = "signal-narration";

export const getScanCostReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(90).default(30) }).parse(d))
  .handler(async ({ context, data }): Promise<ScanCostReport> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from("ai_cost_log")
      .select("plan_id, stage, model, prompt_tokens, completion_tokens, cost_usd")
      .gte("created_at", since)
      .limit(50000);
    if (error) throw new Error(error.message);

    type Row = {
      plan_id: string | null;
      stage: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      cost_usd: number;
    };
    const list = (rows ?? []) as Row[];

    const byPlanMap = new Map<string, PlanCostRow>();
    const byStageMap = new Map<string, StageCostRow>();
    const byModelMap = new Map<string, ModelCostRow>();
    let totalCost = 0;
    let totalScans = 0;

    for (const r of list) {
      const plan = r.plan_id ?? "unknown";
      const cost = Number(r.cost_usd) || 0;
      totalCost += cost;

      const isScanEvent = r.stage === CANONICAL_SCAN_STAGE;
      if (isScanEvent) totalScans += 1;

      let p = byPlanMap.get(plan);
      if (!p) {
        p = {
          plan_id: plan,
          scans: 0,
          total_calls: 0,
          total_prompt_tokens: 0,
          total_completion_tokens: 0,
          total_cost_usd: 0,
          avg_cost_per_scan_usd: 0,
          avg_tokens_per_call: 0,
        };
        byPlanMap.set(plan, p);
      }
      p.total_calls += 1;
      p.total_prompt_tokens += r.prompt_tokens || 0;
      p.total_completion_tokens += r.completion_tokens || 0;
      p.total_cost_usd += cost;
      if (isScanEvent) p.scans += 1;

      let s = byStageMap.get(r.stage);
      if (!s) {
        s = { stage: r.stage, calls: 0, total_cost_usd: 0, avg_cost_usd: 0 };
        byStageMap.set(r.stage, s);
      }
      s.calls += 1;
      s.total_cost_usd += cost;

      let m = byModelMap.get(r.model);
      if (!m) {
        m = { model: r.model, calls: 0, total_cost_usd: 0 };
        byModelMap.set(r.model, m);
      }
      m.calls += 1;
      m.total_cost_usd += cost;
    }

    // For a fair "$ / scan by plan" we distribute related stages (narration +
    // senior-review) which run inside one scan into the scan count of that plan.
    // Voice-chat is a separate action, counted in total_calls only.
    for (const p of byPlanMap.values()) {
      p.avg_cost_per_scan_usd = p.scans > 0 ? p.total_cost_usd / p.scans : 0;
      p.avg_tokens_per_call = p.total_calls > 0
        ? (p.total_prompt_tokens + p.total_completion_tokens) / p.total_calls
        : 0;
    }
    for (const s of byStageMap.values()) {
      s.avg_cost_usd = s.calls > 0 ? s.total_cost_usd / s.calls : 0;
    }

    const planOrder = ["free", "pro", "elite", "ultra"];
    const byPlan = [...byPlanMap.values()].sort((a, b) => {
      const ai = planOrder.indexOf(a.plan_id);
      const bi = planOrder.indexOf(b.plan_id);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.plan_id.localeCompare(b.plan_id);
    });
    const byStage = [...byStageMap.values()].sort((a, b) => b.total_cost_usd - a.total_cost_usd);
    const byModel = [...byModelMap.values()].sort((a, b) => b.total_cost_usd - a.total_cost_usd);

    return {
      windowDays: data.days,
      since,
      totalCalls: list.length,
      totalScans,
      totalCostUsd: totalCost,
      byPlan,
      byStage,
      byModel,
    };
  });
