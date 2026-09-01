import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PairCheck = {
  pair: string;
  yahooLast: number | null;
  yahooCandles: number;
  reference: number | null;
  referenceSource: string;
  driftPct: number | null;
  status: "ok" | "warn" | "fail" | "no-data";
  candleAlignment: {
    aligned: number;
    total: number;
    maxGapMinutes: number;
  } | null;
  note: string;
};

export type MismatchReport = {
  generatedAt: string;
  thresholds: { warnPct: number; failPct: number };
  pairs: PairCheck[];
};

type Candle = { x: number; o: number; h: number; l: number; c: number };
type CrossFx = { symbol: string; invert: boolean } | null;

const PAIR_FX: Record<string, CrossFx> = {
  XAUUSD: null,
};

async function yahooFetch(sym: string, tf = "15m"): Promise<{ candles: Candle[]; last: number } | null> {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?interval=${tf}&range=2d`;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          Accept: "application/json",
        },
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const j: any = await res.json();
      const result = j?.chart?.result?.[0];
      if (!result) continue;
      const ts: number[] = result.timestamp ?? [];
      const q = result.indicators?.quote?.[0] ?? {};
      const out: Candle[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        out.push({ x: ts[i] * 1000, o, h, l, c });
      }
      if (out.length >= 15) return { candles: out, last: result.meta?.regularMarketPrice ?? out.at(-1)!.c };
    } catch { /* try next */ }
  }
  return null;
}

async function fetchGoldSpot(): Promise<number | null> {
  try {
    const r = await fetch("https://api.gold-api.com/price/XAU", { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    return typeof j?.price === "number" ? j.price : null;
  } catch { return null; }
}

async function fetchFxRates(): Promise<Record<string, number> | null> {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    return j?.rates ?? null;
  } catch { return null; }
}

function computeReference(pair: string, spot: number, rates: Record<string, number>): number | null {
  const quote = pair.slice(3);
  if (quote === "USD") return spot;
  const r = rates[quote];
  if (typeof r !== "number") return null;
  return spot * r;
}

export const runTvMismatchCheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MismatchReport> => {
    const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
    const ok = await isAdminOrOpsUnlocked(context.supabase, context.userId);
    if (!ok) throw new Error("Forbidden: admin access required");

    const [base, spot, rates] = await Promise.all([
      yahooFetch("GC=F", "15m"),
      fetchGoldSpot(),
      fetchFxRates(),
    ]);

    const pairs: PairCheck[] = [];
    const warnPct = 0.25;
    const failPct = 0.75;

    for (const pair of Object.keys(PAIR_FX)) {
      const fx = PAIR_FX[pair];
      let yahooLast: number | null = null;
      let candleCount = 0;
      let alignment: PairCheck["candleAlignment"] = null;
      let note = "";

      if (!base) {
        note = "Yahoo GC=F fetch failed";
      } else if (!fx) {
        yahooLast = base.candles.at(-1)!.c;
        candleCount = base.candles.length;
      } else {
        const fxData = await yahooFetch(fx.symbol, "15m");
        if (!fxData) {
          note = `Yahoo ${fx.symbol} fetch failed`;
        } else {
          const fxByTime = new Map<number, Candle>();
          for (const k of fxData.candles) fxByTime.set(k.x, k);
          const fxTimes = [...fxByTime.keys()];
          let aligned = 0;
          let maxGap = 0;
          const recent = base.candles.slice(-40);
          let lastClose: number | null = null;
          for (const k of recent) {
            let bestDiff = Infinity;
            let bestT: number | null = null;
            for (const ft of fxTimes) {
              const d = Math.abs(ft - k.x);
              if (d < bestDiff) { bestDiff = d; bestT = ft; }
            }
            if (bestT != null && bestDiff <= 30 * 60 * 1000) {
              aligned++;
              const f = fxByTime.get(bestT)!;
              const s = fx.invert ? 1 / f.c : f.c;
              lastClose = k.c * s;
            }
            if (bestDiff !== Infinity) maxGap = Math.max(maxGap, bestDiff);
          }
          yahooLast = lastClose;
          candleCount = aligned;
          alignment = {
            aligned,
            total: recent.length,
            maxGapMinutes: Math.round(maxGap / 60000),
          };
        }
      }

      const reference =
        spot != null && rates ? computeReference(pair, spot, rates) : null;
      let driftPct: number | null = null;
      let status: PairCheck["status"] = "no-data";
      if (yahooLast != null && reference != null) {
        driftPct = ((yahooLast - reference) / reference) * 100;
        const abs = Math.abs(driftPct);
        status = abs >= failPct ? "fail" : abs >= warnPct ? "warn" : "ok";
      } else if (!note) {
        note = reference == null ? "Reference source unavailable" : "No Yahoo data";
      }

      pairs.push({
        pair,
        yahooLast,
        yahooCandles: candleCount,
        reference,
        referenceSource: fx ? "gold-api.com × open.er-api.com" : "gold-api.com",
        driftPct,
        status,
        candleAlignment: alignment,
        note,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      thresholds: { warnPct, failPct },
      pairs,
    };
  });
