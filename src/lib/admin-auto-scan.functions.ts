import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AutoScanStateRow = {
  pair: string;
  direction: string;
  first_conf: number;
  first_seen_at: string;
  last_broadcast_at: string | null;
  updated_at: string;
};

export type AutoScanBroadcastRow = {
  id: string;
  pair: string;
  direction: string;
  confidence: number;
  alert_id: string | null;
  broadcast_count: number;
  cost_usd: number;
  ai_cost_usd: number | null;
  created_at: string;
};

export type AutoScanCronRow = {
  runid: number;
  jobid: number;
  job_pid: number | null;
  status: string;
  return_message: string | null;
  start_time: string;
  end_time: string | null;
};

export type AutoScanOverview = {
  enabled: boolean;
  state: AutoScanStateRow[];
  broadcasts: AutoScanBroadcastRow[];
  cron: AutoScanCronRow[];
  totals: {
    broadcasts_24h: number;
    cost_24h: number;
    broadcasts_7d: number;
    cost_7d: number;
    last_cron_run: string | null;
    next_cron_eta_seconds: number | null;
  };
};

async function ensureAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
  const ok = await isAdminOrOpsUnlocked(supabaseAdmin as any, userId);
  if (!ok) throw new Error("Forbidden");
}

export const getAutoScanOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AutoScanOverview> => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = Date.now();
    const dayAgo = new Date(now - 24 * 3600 * 1000).toISOString();
    const weekAgo = new Date(now - 7 * 24 * 3600 * 1000).toISOString();

    const [{ data: setting }, { data: state }, { data: broadcasts }, { data: broadcasts24 }, { data: broadcasts7 }] =
      await Promise.all([
        supabaseAdmin.from("system_settings").select("value").eq("key", "auto_scan_enabled").maybeSingle(),
        supabaseAdmin.from("auto_scan_state").select("*").order("updated_at", { ascending: false }),
        supabaseAdmin
          .from("auto_scan_pool_ledger")
          .select("*")
          .not("alert_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin.from("auto_scan_pool_ledger").select("cost_usd,ai_cost_usd").not("alert_id", "is", null).gte("created_at", dayAgo),
        supabaseAdmin.from("auto_scan_pool_ledger").select("cost_usd,ai_cost_usd").not("alert_id", "is", null).gte("created_at", weekAgo),
      ]);

    // cron history — the RPC checks auth.uid() so it must go through the
    // authenticated user client, not supabaseAdmin (service_role has no auth.uid()).
    let cron: AutoScanCronRow[] = [];
    let lastCronRun: string | null = null;
    try {
      const { data: cronRows, error: cronErr } = await context.supabase.rpc(
        "admin_auto_scan_cron_history" as any,
      );
      if (cronErr) throw cronErr;
      if (Array.isArray(cronRows)) cron = cronRows as AutoScanCronRow[];
    } catch (e) {
      console.warn("[auto-scan] cron history RPC failed:", (e as Error)?.message);
      cron = [];
    }
    if (cron.length > 0) lastCronRun = cron[0].start_time;

    const sum = (rows: any[] | null | undefined) =>
      (rows ?? []).reduce(
        (acc, r) => {
          acc.cost += Number(r.cost_usd ?? 0) + Number(r.ai_cost_usd ?? 0);
          acc.count += 1;
          return acc;
        },
        { cost: 0, count: 0 },
      );

    const s24 = sum(broadcasts24);
    const s7 = sum(broadcasts7);

    // Next cron ETA — cron is */5, so compute mins to next five-minute mark
    const d = new Date();
    const minutes = d.getUTCMinutes();
    const nextQuarter = Math.ceil((minutes + 0.001) / 5) * 5;
    const nextEta =
      (nextQuarter - minutes) * 60 - d.getUTCSeconds();

    return {
      enabled: (setting?.value as any)?.enabled !== false,
      state: (state ?? []) as AutoScanStateRow[],
      broadcasts: (broadcasts ?? []) as AutoScanBroadcastRow[],
      cron,
      totals: {
        broadcasts_24h: s24.count,
        cost_24h: Number(s24.cost.toFixed(4)),
        broadcasts_7d: s7.count,
        cost_7d: Number(s7.cost.toFixed(4)),
        last_cron_run: lastCronRun,
        next_cron_eta_seconds: nextEta,
      },
    };
  });

export const setAutoScanEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const obj = (d ?? {}) as { enabled?: boolean };
    return { enabled: Boolean(obj.enabled) };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("system_settings")
      .upsert({ key: "auto_scan_enabled", value: { enabled: data.enabled } as any, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });

export const triggerAutoScanNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) throw new Error("CRON_SECRET is not configured");
    const base =
      process.env.PUBLIC_APP_URL ||
      "https://project--06cd4260-299b-4286-8096-c43f2f596dee.lovable.app";
    const res = await fetch(`${base}/api/public/hooks/auto-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
      body: "{}",
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* keep text */ }
    if (!res.ok) throw new Error(`Hook returned ${res.status}: ${text.slice(0, 200)}`);
    return { ok: true, response: json ?? text };
  });
