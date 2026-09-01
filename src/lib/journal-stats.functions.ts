import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangeSchema = z
  .object({
    from: z.string().datetime().optional().nullable(),
    to: z.string().datetime().optional().nullable(),
  })
  .optional()
  .default({});

export type SetupRow = {
  id: string;
  name: string;
  category: string;
  color: string;
  description: string | null;
};

export type JournalStats = {
  totals: {
    total: number;
    wins: number;
    losses: number;
    breakeven: number;
    win_rate: number;
    total_pnl: number;
    avg_win: number;
    avg_loss: number;
    best: number;
    worst: number;
    expectancy: number;
  };
  by_setup: Array<{
    id: string;
    name: string;
    color: string;
    category: string;
    trades: number;
    wins: number;
    losses: number;
    pnl: number;
    win_rate: number;
  }>;
  by_pair: Array<{
    pair: string;
    trades: number;
    wins: number;
    losses: number;
    pnl: number;
    win_rate: number;
  }>;
  sessions: Array<{ dow: number; hour: number; trades: number; pnl: number; wins: number }>;
  equity: Array<{ day: string; pnl: number; equity: number }>;
};

export const getJournalStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data, context }): Promise<JournalStats> => {
    // Ensure default setups seeded
    await context.supabase.rpc("seed_default_setups", { _user_id: context.userId });

    const args: { _from?: string; _to?: string } = {};
    if (data.from) args._from = data.from;
    if (data.to) args._to = data.to;
    const { data: stats, error } = await context.supabase.rpc("journal_stats", args);
    if (error) throw new Error(error.message);
    return stats as unknown as JournalStats;
  });

export const listSetups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SetupRow[]> => {
    await context.supabase.rpc("seed_default_setups", { _user_id: context.userId });
    const { data, error } = await context.supabase
      .from("trade_setups")
      .select("id,name,category,color,description")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as SetupRow[];
  });

export const createSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().min(1).max(60),
        category: z.string().min(1).max(30).default("custom"),
        description: z.string().max(280).optional().nullable(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#6366f1"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<SetupRow> => {
    const { data: row, error } = await context.supabase
      .from("trade_setups")
      .insert({
        user_id: context.userId,
        name: data.name.trim(),
        category: data.category.trim(),
        description: data.description ?? null,
        color: data.color,
      })
      .select("id,name,category,color,description")
      .single();
    if (error) throw new Error(error.message);
    return row as SetupRow;
  });

export const setTradeSetups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        tradeId: z.string().uuid(),
        setupIds: z.array(z.string().uuid()).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Verify caller owns the trade (RLS also enforces)
    const { data: trade, error: tErr } = await context.supabase
      .from("trade_journal")
      .select("id")
      .eq("id", data.tradeId)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!trade) throw new Error("Trade not found");

    await context.supabase.from("trade_setup_links").delete().eq("trade_id", data.tradeId);
    if (data.setupIds.length > 0) {
      const rows = data.setupIds.map((setup_id) => ({
        trade_id: data.tradeId,
        setup_id,
        user_id: context.userId,
      }));
      const { error } = await context.supabase.from("trade_setup_links").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getTradeSetupLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ tradeIds: z.array(z.string().uuid()).max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    if (data.tradeIds.length === 0) return {} as Record<string, string[]>;
    const { data: rows, error } = await context.supabase
      .from("trade_setup_links")
      .select("trade_id,setup_id")
      .in("trade_id", data.tradeIds);
    if (error) throw new Error(error.message);
    const map: Record<string, string[]> = {};
    for (const r of rows ?? []) {
      const t = (r as { trade_id: string; setup_id: string }).trade_id;
      const s = (r as { trade_id: string; setup_id: string }).setup_id;
      (map[t] ||= []).push(s);
    }
    return map;
  });
