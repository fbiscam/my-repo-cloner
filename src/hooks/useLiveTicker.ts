import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMarketSnapshotsBatch } from "@/lib/gold-analysis.functions";

export type TickerRow = [string, string, string];

export const DEFAULT_TICKER_ROWS: TickerRow[] = [
  ["XAU/USD", "—", "…"],
  ["DXY", "—", "…"],
  ["US10Y", "—", "…"],
  ["XAG/USD", "—", "…"],
  ["EUR/USD", "—", "…"],
  ["USD/JPY", "—", "…"],
  ["S&P 500", "—", "…"],
  ["WTI Oil", "—", "…"],
];

const SYMBOL_MAP: Record<string, string> = {
  "XAU/USD": "XAUUSD",
  DXY: "DXY",
  US10Y: "US10Y",
  "XAG/USD": "XAGUSD",
  "EUR/USD": "EURUSD",
  "USD/JPY": "USDJPY",
  "S&P 500": "SPX",
  "WTI Oil": "WTI",
};


function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

export function useLiveTicker(initial: TickerRow[] = DEFAULT_TICKER_ROWS): TickerRow[] {
  const [rows, setRows] = React.useState<TickerRow[]>(initial);
  const fetchBatch = useServerFn(getMarketSnapshotsBatch);
  React.useEffect(() => {
    let alive = true;
    const symbols = initial
      .map(([label]) => SYMBOL_MAP[label])
      .filter((s): s is string => !!s);

    const run = async () => {
      try {
        const res = await fetchBatch({ data: { symbols } });
        if (!alive || !res?.results) return;
        const bySym = new Map(
          res.results
            .filter((r) => r.snapshot && Number.isFinite(r.snapshot.price))
            .map((r) => [r.symbol, r.snapshot!]),
        );
        setRows((prev) =>
          prev.map(([label, price, delta]) => {
            const sym = SYMBOL_MAP[label];
            const d = sym ? bySym.get(sym) : undefined;
            if (!d) return [label, price, delta];
            const sign = (d.changePct ?? 0) >= 0 ? "+" : "";
            const deltaOut = d.changePct == null ? delta : `${sign}${d.changePct.toFixed(2)}%`;
            return [label, fmtPrice(d.price), deltaOut];
          }),
        );
      } catch {
        /* ignore */
      }
    };
    run();
    const id = setInterval(run, 5_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return rows;
}
