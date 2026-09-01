import { createFileRoute } from "@tanstack/react-router";
import {
  resolveTradeOutcome,
  EVAL_WINDOW_HOURS,
} from "@/lib/signals/outcome-resolver";


// Resolves pending paper trades by fetching post-signal price history
// from Yahoo Finance and marking win / loss / timeout.
//
// Rules:
//   - win  = TP hit before SL within evaluation window
//   - loss = SL hit before TP within evaluation window
//   - timeout = neither hit within window; realized_r is
//     unrealized MFE fraction of R (capped ±1)
//
// Called every 30 min by pg_cron.

// PRICE SOURCE — must match the signal engine, which quotes SPOT gold
// (gold-api / PAXG scale). GC=F futures trade ~$50-60 ABOVE spot, so
// resolving spot-scale tickets against futures candles produced fake wins
// (TP looked "already hit") while the live desk saw the real SL fill.
// Spot-tracking klines (PAXG/XAUT, stablecoin-quoted) are the primary feed;
// GC=F is only used as a last resort with a per-trade basis correction.
//
// Cross pairs derive from spot XAU/USD + the matching FX pair:
//   div  → XAU/foreign = spot / fx  (EURUSD, GBPUSD, AUDUSD)
//   mul  → XAU/foreign = spot * fx  (USDJPY, USDCHF)
//   none → XAUUSD, use spot directly
type PairSpec = { fx?: string; op: "none" | "mul" | "div" | "direct"; yahoo?: string };
const PAIR_SPECS: Record<string, PairSpec> = {
  XAUUSD: { op: "none" },
  // Non-gold tickets are priced straight off their own feed.
  EURUSD: { op: "direct", yahoo: "EURUSD=X" },
  GBPUSD: { op: "direct", yahoo: "GBPUSD=X" },
  AUDUSD: { op: "direct", yahoo: "AUDUSD=X" },
  USDJPY: { op: "direct", yahoo: "USDJPY=X" },
  USDCHF: { op: "direct", yahoo: "USDCHF=X" },
  NAS100: { op: "direct", yahoo: "^NDX" },
  US30: { op: "direct", yahoo: "^DJI" },
  SPX500: { op: "direct", yahoo: "^GSPC" },
};



type Candles = { ts: number[]; highs: number[]; lows: number[] };

// Per-run cache: a single pass resolves many trades that share the same FX
// leg (USDCHF, EURUSD ...). Without this we hammered Yahoo once per trade and
// got rate-limited, which left every cross pair stuck on "pending" forever.
const candleCache = new Map<string, Candles | null>();

async function fetchYahooOnce(
  host: string,
  sym: string,
  from: number,
  to: number,
): Promise<Candles | null> {
  const url = `https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?period1=${from}&period2=${to}&interval=5m`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    chart: {
      result?: Array<{
        timestamp?: number[];
        indicators: { quote: Array<{ high?: number[]; low?: number[] }> };
      }>;
    };
  };
  const r = json.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0];
  const highs = q?.high ?? [];
  const lows = q?.low ?? [];
  if (!ts.length) return null;
  return { ts, highs, lows };
}

async function fetchCandles(sym: string, from: number, to: number): Promise<Candles | null> {
  // Bucket the window so trades fired minutes apart still share a cache key.
  const key = `${sym}:${Math.floor(from / 900)}:${Math.floor(to / 900)}`;
  if (candleCache.has(key)) return candleCache.get(key) ?? null;

  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let out: Candles | null = null;
  for (let attempt = 0; attempt < hosts.length * 2 && !out; attempt++) {
    const host = hosts[attempt % hosts.length];
    try {
      out = await fetchYahooOnce(host, sym, from, to);
    } catch {
      out = null;
    }
    if (!out && attempt < hosts.length * 2 - 1) {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  candleCache.set(key, out);
  return out;
}

// Backup FX source. Yahoo rate-limits our egress IPs hard, and when the FX
// leg failed the whole cross-pair ticket stayed "pending" forever (that is
// why XAUCHF / XAUJPY tickets never got a result). fxratesapi serves free
// hourly closes; we forward-fill them onto the 5m gold buckets.
const FX_FALLBACK: Record<string, { code: string; invert: boolean }> = {
  "EURUSD=X": { code: "EUR", invert: true },
  "GBPUSD=X": { code: "GBP", invert: true },
  "AUDUSD=X": { code: "AUD", invert: true },
  "USDJPY=X": { code: "JPY", invert: false },
  "USDCHF=X": { code: "CHF", invert: false },
};

async function fetchFxFallback(sym: string, from: number, to: number): Promise<Candles | null> {
  const spec = FX_FALLBACK[sym];
  if (!spec) return null;
  try {
    const url =
      `https://api.fxratesapi.com/timeseries?start_date=${new Date(from * 1000).toISOString()}` +
      `&end_date=${new Date(to * 1000).toISOString()}&base=USD&currencies=${spec.code}&accuracy=hour&resolution=1h`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      rates?: Record<string, Record<string, number>>;
    };
    if (!json.success || !json.rates) return null;
    const hourly = Object.entries(json.rates)
      .map(([iso, r]) => {
        const raw = r?.[spec.code];
        if (!Number.isFinite(raw) || !raw) return null;
        const rate = spec.invert ? 1 / raw : raw;
        return { ts: Math.floor(new Date(iso).getTime() / 1000), rate };
      })
      .filter((x): x is { ts: number; rate: number } => x !== null)
      .sort((a, b) => a.ts - b.ts);
    if (!hourly.length) return null;

    // Forward-fill each hourly close across its twelve 5m buckets.
    const ts: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    let idx = 0;
    for (let t = from - (from % 300); t <= to; t += 300) {
      while (idx + 1 < hourly.length && hourly[idx + 1].ts <= t) idx++;
      const rate = hourly[idx].rate;
      ts.push(t);
      highs.push(rate);
      lows.push(rate);
    }
    return { ts, highs, lows };
  } catch {
    return null;
  }
}

/** FX leg with Yahoo primary and hourly fallback. */
async function fetchFxCandles(sym: string, from: number, to: number): Promise<Candles | null> {
  const key = `fx:${sym}:${Math.floor(from / 900)}:${Math.floor(to / 900)}`;
  if (candleCache.has(key)) return candleCache.get(key) ?? null;
  let out = await fetchCandles(sym, from, to);
  if (!out || !out.ts.length) out = await fetchFxFallback(sym, from, to);
  candleCache.set(key, out);
  return out;
}


// Spot-scale gold klines from Binance gold tokens (5m). PAXG tracks spot
// within ~$1; XAUT is the backup.
async function fetchTokenCandles(symbol: string, from: number, to: number): Promise<Candles | null> {
  const key = `bin:${symbol}:${Math.floor(from / 900)}:${Math.floor(to / 900)}`;
  if (candleCache.has(key)) return candleCache.get(key) ?? null;
  const out = await fetchTokenCandlesRaw(symbol, from, to);
  candleCache.set(key, out);
  return out;
}

async function fetchTokenCandlesRaw(symbol: string, from: number, to: number): Promise<Candles | null> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&startTime=${from * 1000}&endTime=${to * 1000}&limit=1000`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Array<string | number>>;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const ts: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    for (const k of rows) {
      const t = Math.floor(Number(k[0]) / 1000);
      const h = Number(k[2]);
      const l = Number(k[3]);
      if (!Number.isFinite(h) || !Number.isFinite(l)) continue;
      // snap to 5m bucket so it aligns with Yahoo FX timestamps
      ts.push(t - (t % 300));
      highs.push(h);
      lows.push(l);
    }
    return ts.length ? { ts, highs, lows } : null;
  } catch {
    return null;
  }
}

// Spot XAU/USD candles with fallbacks. `anchor` is the trade's own entry price
// (spot scale) used to de-bias GC=F futures if we have to fall back to them.
async function fetchSpotGoldCandles(
  from: number,
  to: number,
  anchor: number,
): Promise<{ candles: Candles; source: string } | null> {
  const paxg = await fetchTokenCandles("PAXGUSDT", from, to);
  if (paxg) return { candles: paxg, source: "PAXG" };
  const xaut = await fetchTokenCandles("XAUTUSDT", from, to);
  if (xaut) return { candles: xaut, source: "XAUT" };

  const fut = await fetchCandles("GC=F", from, to);
  if (!fut || !fut.highs.length) return null;
  // Basis correction: futures premium ≈ first bar mid − entry (entry was taken
  // at/near spot when the signal fired).
  const h0 = fut.highs.find((n) => typeof n === "number");
  const l0 = fut.lows.find((n) => typeof n === "number");
  if (typeof h0 !== "number" || typeof l0 !== "number") return null;
  const basis = (h0 + l0) / 2 - anchor;
  // Sanity: gold basis is tens of dollars, never hundreds.
  if (!Number.isFinite(basis) || Math.abs(basis) > 150) return null;
  return {
    candles: {
      ts: fut.ts,
      highs: fut.highs.map((n) => (typeof n === "number" ? n - basis : n)),
      lows: fut.lows.map((n) => (typeof n === "number" ? n - basis : n)),
    },
    source: "GCF_debiased",
  };
}



export const Route = createFileRoute("/api/public/hooks/paper-trade-resolver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!apikey || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Fresh price cache each run so we never score against stale candles.
        candleCache.clear();

        // Fetch pending paper trades older than 30 minutes so recent
        // ones still have time to reach a target.
        const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data: pending, error } = await supabaseAdmin
          .from("signal_paper_trades")
          .select("id, pair, direction, entry, sl, tp, fired_at")
          .eq("outcome", "pending")
          .lte("fired_at", cutoff)
          .limit(200);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        if (!pending || pending.length === 0) {
          return Response.json({ ok: true, resolved: 0 });
        }

        let resolved = 0;
        const results: Array<Record<string, unknown>> = [];

        for (const t of pending) {
          const spec = PAIR_SPECS[t.pair];
          if (!spec) {
            results.push({ id: t.id, action: "unknown_symbol" });
            continue;
          }
          const firedAt = new Date(t.fired_at).getTime();
          const now = Date.now();
          const ageH = (now - firedAt) / 3_600_000;
          // Only evaluate after enough time or on timeout
          if (ageH < 0.5) {
            results.push({ id: t.id, action: "too_recent" });
            continue;
          }

          try {
            const from = Math.floor(firedAt / 1000);
            const to = Math.floor(
              Math.min(now, firedAt + EVAL_WINDOW_HOURS * 3_600_000) / 1000,
            );
            let highs: number[] = [];
            let lows: number[] = [];
            let priceSource = "";

            if (spec.op === "direct" && spec.yahoo) {
              const own = await fetchFxCandles(spec.yahoo, from, to);
              if (!own || !own.ts.length) {
                results.push({ id: t.id, action: "fetch_failed", sym: spec.yahoo });
                continue;
              }
              priceSource = spec.yahoo;
              highs = own.highs.filter((n) => typeof n === "number");
              lows = own.lows.filter((n) => typeof n === "number");
            } else if (spec.op === "none" || !spec.fx) {
              const spot = await fetchSpotGoldCandles(from, to, Number(t.entry));
              if (!spot) {
                results.push({ id: t.id, action: "fetch_failed", sym: "spot" });
                continue;
              }
              priceSource = spot.source;
              highs = spot.candles.highs.filter((n) => typeof n === "number");
              lows = spot.candles.lows.filter((n) => typeof n === "number");
            } else {
              const fx = await fetchFxCandles(spec.fx, from, to);
              if (!fx || !fx.ts.length) {
                results.push({ id: t.id, action: "fetch_failed", sym: spec.fx });
                continue;
              }
              // Convert the cross-scale entry into a USD-scale anchor so the
              // futures fallback can de-bias correctly.
              const fh = fx.highs.find((n) => typeof n === "number");
              const fl = fx.lows.find((n) => typeof n === "number");
              if (typeof fh !== "number" || typeof fl !== "number") {
                results.push({ id: t.id, action: "no_candles", sym: spec.fx });
                continue;
              }
              const fxMid = (fh + fl) / 2;
              const anchorUsd =
                spec.op === "mul" ? Number(t.entry) / fxMid : Number(t.entry) * fxMid;
              const spot = await fetchSpotGoldCandles(from, to, anchorUsd);
              if (!spot) {
                results.push({ id: t.id, action: "fetch_failed", sym: "spot" });
                continue;
              }
              priceSource = spot.source;
              const base = spot.candles;
              // Align by 5m timestamp bucket.
              const fxByTs = new Map<number, { h: number; l: number }>();
              for (let i = 0; i < fx.ts.length; i++) {
                const h = fx.highs[i];
                const l = fx.lows[i];
                if (typeof h === "number" && typeof l === "number") {
                  fxByTs.set(fx.ts[i] - (fx.ts[i] % 300), { h, l });
                }
              }
              for (let i = 0; i < base.ts.length; i++) {
                const bh = base.highs[i];
                const bl = base.lows[i];
                const fxRow = fxByTs.get(base.ts[i]);
                if (
                  typeof bh !== "number" ||
                  typeof bl !== "number" ||
                  !fxRow
                ) continue;
                if (spec.op === "mul") {
                  highs.push(bh * fxRow.h);
                  lows.push(bl * fxRow.l);
                } else {
                  // div: XAU/foreign = spot / fx
                  highs.push(bh / fxRow.l);
                  lows.push(bl / fxRow.h);
                }
              }
            }
            void priceSource;

            if (highs.length === 0 || lows.length === 0) {
              results.push({ id: t.id, action: "no_candles" });
              continue;
            }

            const candles = highs.map((h, i) => ({ high: h, low: lows[i] }));
            const res = resolveTradeOutcome({
              direction: t.direction,
              entry: Number(t.entry),
              sl: Number(t.sl),
              tp: Number(t.tp),
              candles,
              ageHours: ageH,
              evalWindowHours: EVAL_WINDOW_HOURS,
            });

            if (res.outcome === "pending") {
              results.push({ id: t.id, action: "still_open", reason: res.reason });
              continue;
            }

            await supabaseAdmin
              .from("signal_paper_trades")
              .update({
                outcome: res.outcome,
                realized_r: res.realizedR === null ? null : Number(res.realizedR.toFixed(3)),
                resolved_at: new Date().toISOString(),
                resolution_method: res.method,
              })
              .eq("id", t.id)
              // Single-writer guard: never overwrite a row another resolver
              // already closed.
              .eq("outcome", "pending");
            resolved++;
            results.push({
              id: t.id,
              action: "resolved",
              outcome: res.outcome,
              r: res.realizedR,
              reason: res.reason,
            });

          } catch (e) {
            results.push({
              id: t.id,
              action: "error",
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        return Response.json({ ok: true, resolved, checked: pending.length, results });
      },
    },
  },
});
