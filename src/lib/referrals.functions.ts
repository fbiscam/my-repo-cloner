import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReferralInfo = {
  code: string;
  shareUrl: string;
  totals: { pending: number; converted: number; credits_earned: number };
  referrals: Array<{
    id: string;
    status: "pending" | "converted" | "void";
    credits_awarded: number;
    created_at: string;
    converted_at: string | null;
  }>;
  incoming: {
    status: "pending" | "converted" | "void";
    credits_awarded: number;
    created_at: string;
  } | null;
};

export const getReferralInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReferralInfo> => {
    const { data: codeData, error: codeErr } = await context.supabase.rpc(
      "get_or_create_referral_code",
      { _user_id: context.userId },
    );
    if (codeErr) throw new Error(codeErr.message);
    const code = String(codeData);

    const { data: outgoing, error } = await context.supabase
      .from("referrals")
      .select("id,status,credits_awarded,created_at,converted_at,referrer_id,referred_user_id")
      .eq("referrer_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: incomingRows } = await context.supabase
      .from("referrals")
      .select("status,credits_awarded,created_at,referred_user_id")
      .eq("referred_user_id", context.userId)
      .maybeSingle();

    const rows = (outgoing ?? []) as Array<{
      id: string;
      status: "pending" | "converted" | "void";
      credits_awarded: number;
      created_at: string;
      converted_at: string | null;
    }>;

    const totals = rows.reduce(
      (acc, r) => {
        if (r.status === "pending") acc.pending += 1;
        if (r.status === "converted") {
          acc.converted += 1;
          acc.credits_earned += r.credits_awarded ?? 0;
        }
        return acc;
      },
      { pending: 0, converted: 0, credits_earned: 0 },
    );

    return {
      code,
      shareUrl: `https://jenvu.com/auth?ref=${code}`,
      totals,
      referrals: rows,
      incoming: incomingRows
        ? {
            status: (incomingRows as { status: "pending" | "converted" | "void" }).status,
            credits_awarded: (incomingRows as { credits_awarded: number }).credits_awarded ?? 0,
            created_at: (incomingRows as { created_at: string }).created_at,
          }
        : null,
    };
  });

export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ code: z.string().min(4).max(16) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("apply_referral_code", {
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; error?: string };
  });
