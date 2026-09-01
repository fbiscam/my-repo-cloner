import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PerfBucket = {
  pair: string;
  direction: "BUY" | "SELL" | "ALL";
  total: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number; // 0..1 (decided only)
  avgRR: number;
  expectancyR: number; // (wins - losses)/decided in R (assuming losers = -1R, winners = +rr)
};

export type PerfSignalRow = {
  id: string;
  pair: string;
  direction: "BUY" | "SELL";
  entry: number;
  sl: number;
  tp: number;
  rr: number | null;
  confidence: number | null;
  grade: string;
  fired_at: string;
  outcome: "WIN" | "LOSS" | "OPEN";
  resolved_at: string | null;
};

export type SignalPerformanceReport = {
  windowDays: number;
  evaluatedAt: string;
  totals: PerfBucket;
  byPair: PerfBucket[];
  byPairDirection: PerfBucket[];
  recent: PerfSignalRow[];
  dataSource: string;
  warnings: string[];
};

type Candle = { t: number; o: number; h: number; l: number; c: number };

async function ensureAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
  const ok = await isAdminOrOpsUnlocked(supabaseAdmin as any, userId);
  if (!ok) throw new Error("Forbidden");
}

const YAHOO_MAP: Record<string, string> = {
  XAUUSD: "XAUUSD=X",
};

async function fetchCandles(pair: string, range: string): Promise<Candle[]> {
  const sym = YAHOO_MAP[pair.toUpperCase()] ?? `${pair}=X`;
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?interval=15m&range=${range}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "application/json",
        },
      });
      if (!res.ok) continue;
      const j: any = await res.json();
      const r = j?.chart?.result?.[0];
      const ts: number[] = r?.timestamp ?? [];
      const q = r?.indicators?.quote?.[0] ?? {};
      const candles: Candle[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = Number(q.open?.[i]);
        const h = Number(q.high?.[i]);
        const l = Number(q.low?.[i]);
        const c = Number(q.close?.[i]);
        if (![o, h, l, c].every((n) => Number.isFinite(n) && n > 0)) continue;
        candles.push({ t: ts[i] * 1000, o, h, l, c });
      }
      if (candles.length > 20) return candles;
    } catch {
      /* try next */
    }
  }
  return [];
}

function evaluateSignal(
  candles: Candle[],
  firedAt: number,
  direction: "BUY" | "SELL",
  entry: number,
  sl: number,
  tp: number,
): { outcome: "WIN" | "LOSS" | "OPEN"; resolved_at: string | null } {
  if (candles.length === 0) return { outcome: "OPEN", resolved_at: null };
  // Walk candles at or after fired_at
  for (const c of candles) {
    if (c.t < firedAt) continue;
    const hitTP = direction === "BUY" ? c.h >= tp : c.l <= tp;
    const hitSL = direction === "BUY" ? c.l <= sl : c.h >= sl;
    if (hitTP && hitSL) {
      // Ambiguous within same bar — conservative: assume SL first
      return { outcome: "LOSS", resolved_at: new Date(c.t).toISOString() };
    }
    if (hitTP) return { outcome: "WIN", resolved_at: new Date(c.t).toISOString() };
    if (hitSL) return { outcome: "LOSS", resolved_at: new Date(c.t).toISOString() };
  }
  return { outcome: "OPEN", resolved_at: null };
}

function bucket(rows: PerfSignalRow[], pair: string, direction: "BUY" | "SELL" | "ALL"): PerfBucket {
  const decided = rows.filter((r) => r.outcome !== "OPEN");
  const wins = decided.filter((r) => r.outcome === "WIN").length;
  const losses = decided.filter((r) => r.outcome === "LOSS").length;
  const open = rows.length - decided.length;
  const rrs = rows.map((r) => Number(r.rr) || 0).filter((n) => n > 0);
  const avgRR = rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0;
  const expectancyR = decided.length
    ? decided.reduce((acc, r) => acc + (r.outcome === "WIN" ? Number(r.rr) || 1 : -1), 0) / decided.length
    : 0;
  return {
    pair,
    direction,
    total: rows.length,
    wins,
    losses,
    open,
    winRate: decided.length ? wins / decided.length : 0,
    avgRR: Number(avgRR.toFixed(2)),
    expectancyR: Number(expectancyR.toFixed(2)),
  };
}

export const getSignalPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as { days?: number };
    const days = Math.min(60, Math.max(1, Number(o.days ?? 30)));
    return { days };
  })
  .handler(async ({ data, context }): Promise<SignalPerformanceReport> => {
    await ensureAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = Date.now();
    const since = new Date(now - data.days * 86400 * 1000).toISOString();

    const { data: alerts, error } = await supabaseAdmin
      .from("signal_alerts")
      .select("id,pair,direction,entry,sl,tp,rr,confidence,grade,fired_at")
      .gte("fired_at", since)
      .order("fired_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const warnings: string[] = [];
    const rows: PerfSignalRow[] = [];
    const pairs = Array.from(new Set((alerts ?? []).map((a) => String(a.pair).toUpperCase())));

    // Range needed for Yahoo 15m: cap at 60d
    const range = data.days <= 7 ? "10d" : data.days <= 30 ? "30d" : "60d";
    const candleMap = new Map<string, Candle[]>();
    await Promise.all(
      pairs.map(async (p) => {
        const c = await fetchCandles(p, range);
        candleMap.set(p, c);
        if (c.length === 0) warnings.push(`No candles for ${p}`);
      }),
    );

    for (const a of alerts ?? []) {
      const pair = String(a.pair).toUpperCase();
      const dir = String(a.direction).toUpperCase() as "BUY" | "SELL";
      const candles = candleMap.get(pair) ?? [];
      const firedAt = new Date(a.fired_at as string).getTime();
      const entry = Number(a.entry);
      const sl = Number(a.sl);
      const tp = Number(a.tp);
      const outcome = evaluateSignal(candles, firedAt, dir, entry, sl, tp);
      rows.push({
        id: a.id as string,
        pair,
        direction: dir,
        entry,
        sl,
        tp,
        rr: a.rr != null ? Number(a.rr) : null,
        confidence: a.confidence != null ? Number(a.confidence) : null,
        grade: String(a.grade ?? ""),
        fired_at: a.fired_at as string,
        outcome: outcome.outcome,
        resolved_at: outcome.resolved_at,
      });
    }

    const byPair: PerfBucket[] = [];
    const byPairDirection: PerfBucket[] = [];
    for (const p of pairs) {
      const inPair = rows.filter((r) => r.pair === p);
      byPair.push(bucket(inPair, p, "ALL"));
      for (const d of ["BUY", "SELL"] as const) {
        const sub = inPair.filter((r) => r.direction === d);
        if (sub.length) byPairDirection.push(bucket(sub, p, d));
      }
    }
    byPair.sort((a, b) => b.total - a.total);
    byPairDirection.sort((a, b) => (a.pair === b.pair ? a.direction.localeCompare(b.direction) : b.total - a.total));

    return {
      windowDays: data.days,
      evaluatedAt: new Date().toISOString(),
      totals: bucket(rows, "ALL", "ALL"),
      byPair,
      byPairDirection,
      recent: rows.slice(0, 50),
      dataSource: "Yahoo Finance 15m candles",
      warnings,
    };
  });
