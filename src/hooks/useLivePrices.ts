import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getLiveTick } from "@/lib/gold-analysis.functions";

/**
 * Live price map for XAU pairs. Polls the server tick endpoint for each
 * requested symbol — Jenvu is gold-only, so there are no crypto WebSocket
 * feeds to fall back to.
 */
export function useLivePrices(symbols: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const fetchTick = useServerFn(getLiveTick);
  const key = symbols.map((s) => s.toUpperCase()).sort().join(",");

  useEffect(() => {
    if (!key) return;
    const list = key.split(",").filter(Boolean);
    let stopped = false;

    const isHidden = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden";

    const set = (sym: string, p: number) => {
      if (!Number.isFinite(p)) return;
      setPrices((prev) => (prev[sym] === p ? prev : { ...prev, [sym]: p }));
    };

    const poll = async () => {
      if (isHidden()) return;
      for (const sym of list) {
        try {
          const t = await fetchTick({ data: { symbol: sym } });
          if (stopped) return;
          if (t && typeof t.price === "number") set(sym, t.price);
        } catch { /* keep last */ }
      }
    };

    void poll();
    const pollId = setInterval(poll, 5000);
    const onVis = () => { if (!isHidden()) void poll(); };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }

    return () => {
      stopped = true;
      clearInterval(pollId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);


  return prices;
}
