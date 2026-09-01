import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ChargeAuditRow = {
  id: string;
  user_id: string;
  scan_id: string | null;
  reason: string;
  amount: number;
  balance_after: number | null;
  source: string;
  caller: string | null;
  symbol: string | null;
  user_agent: string | null;
  request_ip: string | null;
  metadata: any;
  created_at: string;
  user_email?: string | null;
};

export type MismatchRow = {
  scan_id: string;
  user_id: string;
  charge_count: number;
  total_amount: number;
  reasons: string[];
  sources: string[];
  callers: (string | null)[];
  first_at: string;
  last_at: string;
  user_email?: string | null;
};

async function ensureAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
  const ok = await isAdminOrOpsUnlocked(supabaseAdmin as any, userId);
  if (!ok) throw new Error("Forbidden");
}

export const listChargeAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const obj = (d ?? {}) as { limit?: number; reason?: string; scanId?: string };
    return {
      limit: Math.min(Math.max(obj.limit ?? 200, 1), 1000),
      reason: obj.reason ?? null,
      scanId: obj.scanId ?? null,
    };
  })
  .handler(async ({ data, context }): Promise<ChargeAuditRow[]> => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("credit_charge_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.reason) q = q.eq("reason", data.reason);
    if (data.scanId) q = q.eq("scan_id", data.scanId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Attach user emails (best-effort)
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const emailMap = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles" as any)
        .select("id, email:id")
        .in("id", ids);
      // profiles table doesn't hold email; fall back to auth.users via admin API
      try {
        for (const id of ids) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
          if (u?.user?.email) emailMap.set(id, u.user.email);
        }
      } catch { /* noop */ }
      void profiles;
    }
    return (rows ?? []).map((r: any) => ({ ...r, user_email: emailMap.get(r.user_id) ?? null }));
  });

export const listChargeMismatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MismatchRow[]> => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("v_scan_charge_mismatches" as any)
      .select("*")
      .order("last_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.user_id)));
    const emailMap = new Map<string, string>();
    for (const id of ids) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        if (u?.user?.email) emailMap.set(id, u.user.email);
      } catch { /* noop */ }
    }
    return ((rows ?? []) as any[]).map((r) => ({ ...r, user_email: emailMap.get(r.user_id) ?? null }));
  });
