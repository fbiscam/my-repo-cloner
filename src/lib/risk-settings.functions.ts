import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  computePositionSize,
  computeTodayRealizedLoss,
  evaluateKillSwitch,
} from "@/lib/risk-manager";

const settingsSchema = z.object({
  account_balance_usd: z.number().min(0).max(10_000_000).optional(),
  risk_pct: z.number().min(0.1).max(10).optional(),
  daily_loss_limit_usd: z.number().min(0).max(10_000_000).nullable().optional(),
  kill_switch_enabled: z.boolean().optional(),
});

export type RiskSettings = {
  account_balance_usd: number;
  risk_pct: number;
  daily_loss_limit_usd: number | null;
  kill_switch_enabled: boolean;
};

const DEFAULTS: RiskSettings = {
  account_balance_usd: 10,
  risk_pct: 1,
  daily_loss_limit_usd: null,
  kill_switch_enabled: false,
};

export const getRiskSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RiskSettings> => {
    const { data } = await context.supabase
      .from("user_risk_settings")
      .select("account_balance_usd, risk_pct, daily_loss_limit_usd, kill_switch_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return DEFAULTS;
    return {
      account_balance_usd: Number(data.account_balance_usd ?? DEFAULTS.account_balance_usd),
      risk_pct: Number(data.risk_pct ?? DEFAULTS.risk_pct),
      daily_loss_limit_usd:
        data.daily_loss_limit_usd == null ? null : Number(data.daily_loss_limit_usd),
      kill_switch_enabled: Boolean(data.kill_switch_enabled),
    };
  });

export const saveRiskSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      user_id: context.userId,
      account_balance_usd: data.account_balance_usd ?? DEFAULTS.account_balance_usd,
      risk_pct: data.risk_pct ?? DEFAULTS.risk_pct,
      daily_loss_limit_usd: data.daily_loss_limit_usd ?? null,
      kill_switch_enabled: data.kill_switch_enabled ?? false,
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.supabase
      .from("user_risk_settings")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Compute suggested position size + kill switch status for the current user.
// Used on the signal page card.
export const getRiskContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      entry: z.number(),
      sl: z.number(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: s } = await context.supabase
      .from("user_risk_settings")
      .select("account_balance_usd, risk_pct, daily_loss_limit_usd, kill_switch_enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    const settings: RiskSettings = s
      ? {
          account_balance_usd: Number(s.account_balance_usd ?? DEFAULTS.account_balance_usd),
          risk_pct: Number(s.risk_pct ?? DEFAULTS.risk_pct),
          daily_loss_limit_usd:
            s.daily_loss_limit_usd == null ? null : Number(s.daily_loss_limit_usd),
          kill_switch_enabled: Boolean(s.kill_switch_enabled),
        }
      : DEFAULTS;

    const size = computePositionSize({
      balanceUsd: settings.account_balance_usd,
      riskPct: settings.risk_pct,
      entry: data.entry,
      sl: data.sl,
    });

    const todayLoss = await computeTodayRealizedLoss(
      context.supabase as unknown as Parameters<typeof computeTodayRealizedLoss>[0],
      context.userId,
    );
    const killSwitch = evaluateKillSwitch({
      enabled: settings.kill_switch_enabled,
      dailyLossLimitUsd: settings.daily_loss_limit_usd,
      todayLossUsd: todayLoss,
    });

    return { settings, size, killSwitch };
  });
