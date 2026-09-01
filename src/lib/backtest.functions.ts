import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BacktestStats = {
  total: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgPnl: number | null;
  sample: "sufficient" | "sparse" | "none";
};

/**
 * Returns historical performance from the user's own trade_journal
 * for the same pair + direction. Used to warn / reinforce the trader
 * on signal cards ("Similar setups: 24 taken · 68% win").
 */
export const getBacktestStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { pair: string; direction: "BUY" | "SELL" | "long" | "short" }) => input)
  .handler(async ({ data, context }): Promise<BacktestStats> => {
    const dir = data.direction === "BUY" ? "long" : data.direction === "SELL" ? "short" : data.direction;
    const pair = data.pair.toUpperCase().replace(/\//g, "");
    const { data: rows } = await context.supabase
      .from("trade_journal")
      .select("outcome,pnl")
      .eq("pair", pair)
      .eq("direction", dir)
      .in("outcome", ["win", "loss", "breakeven"])
      .order("opened_at", { ascending: false })
      .limit(200);

    const trades = rows ?? [];
    const total = trades.length;
    const wins = trades.filter((t) => t.outcome === "win").length;
    const losses = trades.filter((t) => t.outcome === "loss").length;
    const decided = wins + losses;
    const winRate = decided > 0 ? (wins / decided) * 100 : null;
    const netPnl = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const avgPnl = total > 0 ? netPnl / total : null;

    return {
      total,
      wins,
      losses,
      winRate,
      avgPnl,
      sample: total >= 10 ? "sufficient" : total > 0 ? "sparse" : "none",
    };
  });
