// Live correlated-market board for the public homepage.
//
// These instruments materially drive the XAU/USD price (USD strength, real
// yields, silver beta, risk appetite, oil-led inflation). Jenvu still trades
// XAU/USD only — this feed is macro context.

import { createServerFn } from "@tanstack/react-start";
import { fetchInstrumentCandles, resolveInstrument } from "./gold-analysis.functions";
import type { Candle } from "./analysis/engine";

export type CorrelatedMarket = {
  symbol: string;
  display: string;
  note: string;
  price: number;
  decimals: number;
  changePct: number;
  high: number;
  low: number;
  rangePos: number; // 0..100 position of price inside 24h range
  series: number[];
  correlation: number; // -1..1 vs XAU/USD hourly returns
  impact: "bullish" | "bearish" | "neutral"; // implication for gold
};

export type CorrelatedBoard = { markets: CorrelatedMarket[]; updatedAt: number };

const TTL_MS = 60_000;
let cache: { at: number; data: CorrelatedBoard } | null = null;

const CONTEXT: Array<{ symbol: string; note: string; decimals: number }> = [
  { symbol: "DXY", note: "USD strength — inverse driver", decimals: 3 },
  { symbol: "US10Y", note: "Real yields — inverse driver", decimals: 2 },
  { symbol: "XAGUSD", note: "Silver beta — confirms metals", decimals: 3 },
  { symbol: "EURUSD", note: "USD leg — positive driver", decimals: 4 },
  { symbol: "USDJPY", note: "Carry / risk — inverse driver", decimals: 3 },
  { symbol: "SPX", note: "Risk appetite — rotation cue", decimals: 2 },
  { symbol: "WTI", note: "Inflation impulse — positive", decimals: 2 },
];

const rets = (xs: number[]) => xs.slice(1).map((v, i) => (xs[i] ? (v - xs[i]) / xs[i] : 0));

function corr(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 8) return 0;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a1 = x[i] - mx;
    const b1 = y[i] - my;
    num += a1 * b1;
    dx += a1 * a1;
    dy += b1 * b1;
  }
  const den = Math.sqrt(dx * dy);
  if (!den) return 0;
  return Math.max(-1, Math.min(1, num / den));
}

const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export const getCorrelatedMarkets = createServerFn({ method: "GET" }).handler(
  async (): Promise<CorrelatedBoard | null> => {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
    try {
      const gold = await fetchInstrumentCandles(resolveInstrument("XAUUSD"), "1h").catch(
        () => [] as Candle[],
      );
      const goldCloses = gold.slice(-72).map((c) => c.c);
      const goldRets = rets(goldCloses);

      const results = await Promise.all(
        CONTEXT.map(async (cfg) => {
          try {
            const inst = resolveInstrument(cfg.symbol);
            const candles = await fetchInstrumentCandles(inst, "1h");
            if (!candles || candles.length < 10) return null;
            const win = candles.slice(-72);
            const closes = win.map((c) => c.c);
            const price = closes[closes.length - 1];
            const day = win.slice(-24);
            const high = Math.max(...day.map((c) => c.h));
            const low = Math.min(...day.map((c) => c.l));
            const prev = day.length > 1 ? day[0].o : closes[0];
            const changePct = prev ? ((price - prev) / prev) * 100 : 0;
            const correlation = corr(goldRets, rets(closes));
            const dec = inst.decimals ?? cfg.decimals;
            const impact: CorrelatedMarket["impact"] =
              Math.abs(changePct) < 0.05 || Math.abs(correlation) < 0.15
                ? "neutral"
                : (correlation > 0) === changePct > 0
                  ? "bullish"
                  : "bearish";
            return {
              symbol: cfg.symbol,
              display: inst.display ?? cfg.symbol,
              note: cfg.note,
              price: r(price, dec),
              decimals: dec,
              changePct: Math.round(changePct * 100) / 100,
              high: r(high, dec),
              low: r(low, dec),
              rangePos:
                high > low ? Math.round(((price - low) / (high - low)) * 100) : 50,
              series: closes.slice(-48).map((v) => r(v, dec)),
              correlation: Math.round(correlation * 100) / 100,
              impact,
            } satisfies CorrelatedMarket;
          } catch {
            return null;
          }
        }),
      );

      const markets = results.filter((m): m is CorrelatedMarket => !!m);
      if (!markets.length) return cache?.data ?? null;
      const data: CorrelatedBoard = { markets, updatedAt: Date.now() };
      cache = { at: Date.now(), data };
      return data;
    } catch {
      return cache?.data ?? null;
    }
  },
);
