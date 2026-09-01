import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLivePrices } from "@/hooks/useLivePrices";
import { toast } from "sonner";
import { useAuthUser } from "@/hooks/useAuthUser";

type OpenTrade = {
  id: string;
  pair: string;
  direction: "long" | "short";
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  outcome: string;
};

/**
 * Global watcher — polls the user's open trades and auto-closes them when
 * live price touches SL or TP. Runs on any authenticated page.
 */
export function useAutoCloseTrades() {
  const { user, loading } = useAuthUser();
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([]);

  // Refresh open trades every 20s so newly logged trades enter the monitor.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setOpenTrades([]);
      return;
    }
    let stopped = false;
    const fetchOpen = async () => {
      const { data } = await supabase
        .from("trade_journal")
        .select("id, pair, direction, entry, stop_loss, take_profit, outcome")
        .eq("user_id", user.id)
        .in("outcome", ["open", "pending"]);
      if (!stopped) setOpenTrades((data as unknown as OpenTrade[]) ?? []);
    };
    fetchOpen();
    const id = setInterval(fetchOpen, 20000);
    return () => { stopped = true; clearInterval(id); };
  }, [loading, user?.id]);

  const symbols = useMemo(
    () => Array.from(new Set(openTrades.filter((t) => t.entry != null).map((t) => t.pair))),
    [openTrades],
  );
  const livePrices = useLivePrices(symbols);

  // Auto-fill pending → open using real limit-order semantics: a BUY limit
  // fills as soon as price trades AT OR BELOW entry, a SELL limit at or above.
  // The old version needed price to sit inside a ±0.02% band at the exact
  // 3s poll tick, so fast pullbacks through entry were missed entirely and
  // the trade stayed "pending" while the market ran to target.
  useEffect(() => {
    const filling = openTrades.filter((t) => {
      if (t.outcome !== "pending" || t.entry == null) return false;
      const px = livePrices[t.pair.toUpperCase()];
      if (px == null) return false;
      // Small tolerance so a near-touch still counts as a fill.
      const tol = Math.max(t.entry * 0.0002, 0.01);
      const touched =
        t.direction === "long" ? px <= t.entry + tol : px >= t.entry - tol;
      if (!touched) return false;
      // Refuse to fill if price has already crossed SL or TP —
      // that trade never actually filled in the real market.
      if (t.stop_loss != null) {
        if (t.direction === "long" && px <= t.stop_loss) return false;
        if (t.direction === "short" && px >= t.stop_loss) return false;
      }
      if (t.take_profit != null) {
        if (t.direction === "long" && px >= t.take_profit) return false;
        if (t.direction === "short" && px <= t.take_profit) return false;
      }
      return true;
    });

    if (!filling.length) return;
    (async () => {
      for (const t of filling) {
        const { error } = await supabase
          .from("trade_journal")
          .update({ outcome: "open", opened_at: new Date().toISOString() })
          .eq("id", t.id)
          .eq("outcome", "pending");
        if (!error) {
          setOpenTrades((prev) => prev.map((x) => x.id === t.id ? { ...x, outcome: "open" } : x));
          toast.success(`Entry filled · ${t.pair} @ ${t.entry}`);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrices]);

  // Auto-close open trades on SL / TP touch
  useEffect(() => {
    const closing = openTrades.filter((t) => {
      if (t.outcome !== "open" || t.entry == null) return false;
      const px = livePrices[t.pair.toUpperCase()];
      if (px == null) return false;
      if (t.direction === "long") {
        if (t.take_profit != null && px >= t.take_profit) return true;
        if (t.stop_loss != null && px <= t.stop_loss) return true;
      } else {
        if (t.take_profit != null && px <= t.take_profit) return true;
        if (t.stop_loss != null && px >= t.stop_loss) return true;
      }
      return false;
    });
    if (!closing.length) return;
    (async () => {
      for (const t of closing) {
        const px = livePrices[t.pair.toUpperCase()];
        const hitTp =
          t.take_profit != null &&
          (t.direction === "long" ? px >= t.take_profit : px <= t.take_profit);
        const outcome = hitTp ? "win" : "loss";
        const exit = hitTp ? t.take_profit! : t.stop_loss!;
        const pnl = t.direction === "long" ? exit - t.entry! : t.entry! - exit;
        const { error } = await supabase
          .from("trade_journal")
          .update({ outcome, pnl, closed_at: new Date().toISOString() })
          .eq("id", t.id)
          .eq("outcome", "open");
        if (!error) {
          setOpenTrades((prev) => prev.filter((x) => x.id !== t.id));
          toast.success(`Trade ${outcome === "win" ? "won" : "lost"} · ${t.pair} ${outcome === "win" ? "TP" : "SL"} hit`);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrices]);
}
