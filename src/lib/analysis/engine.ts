// Deterministic ICT/SMC analysis engine.
// No AI. Pure math on OHLCV. The LLM only narrates what this produces.

export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

export type Swing = { i: number; t: number; price: number; kind: "high" | "low" };

export type FVG = {
  fromTime: number; toTime: number;
  priceLow: number; priceHigh: number;
  kind: "bullish" | "bearish";
  mitigated: boolean;
  size: number;
};

export type OB = {
  fromTime: number; toTime: number;
  priceLow: number; priceHigh: number;
  kind: "demand" | "supply";
  mitigated: boolean;
};

export type StructureEvent = {
  kind: "BOS" | "CHoCH";
  dir: "bullish" | "bearish";
  fromTime: number; toTime: number;
  price: number;
};

export type LiquidityPool = {
  price: number;
  side: "buy" | "sell";  // BSL above / SSL below
  label: string;
  swept: boolean;
};

export type TFAnalysis = {
  trend: "bullish" | "bearish" | "ranging";
  swings: Swing[];
  lastStructure: StructureEvent | null;
  fvgs: FVG[];
  obs: OB[];
  swingHigh: number;
  swingLow: number;
  equilibrium: number;
};

// ---------- swing / structure ----------

export function findSwings(candles: Candle[], lookback = 3): Swing[] {
  const out: Swing[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].h <= candles[i - j].h || candles[i].h <= candles[i + j].h) isHigh = false;
      if (candles[i].l >= candles[i - j].l || candles[i].l >= candles[i + j].l) isLow = false;
    }
    if (isHigh) out.push({ i, t: Math.floor(candles[i].t / 1000), price: candles[i].h, kind: "high" });
    if (isLow) out.push({ i, t: Math.floor(candles[i].t / 1000), price: candles[i].l, kind: "low" });
  }
  return out;
}

export function detectStructure(candles: Candle[], swings: Swing[]): { events: StructureEvent[]; trend: TFAnalysis["trend"] } {
  const events: StructureEvent[] = [];
  if (swings.length < 4) return { events, trend: "ranging" };

  let trend: TFAnalysis["trend"] = "ranging";
  let lastHigh: Swing | null = null;
  let lastLow: Swing | null = null;
  let lastTrend: "bullish" | "bearish" | "ranging" = "ranging";

  for (const s of swings) {
    if (s.kind === "high") {
      if (lastHigh && s.price > lastHigh.price) {
        const kind = lastTrend === "bearish" ? "CHoCH" : "BOS";
        events.push({ kind, dir: "bullish", fromTime: lastHigh.t, toTime: s.t, price: s.price });
        lastTrend = "bullish";
      }
      lastHigh = s;
    } else {
      if (lastLow && s.price < lastLow.price) {
        const kind = lastTrend === "bullish" ? "CHoCH" : "BOS";
        events.push({ kind, dir: "bearish", fromTime: lastLow.t, toTime: s.t, price: s.price });
        lastTrend = "bearish";
      }
      lastLow = s;
    }
  }
  trend = lastTrend;
  return { events, trend };
}

// ---------- FVG ----------

export function detectFVGs(candles: Candle[], currentPrice: number): FVG[] {
  const out: FVG[] = [];
  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2], c = candles[i];
    // Bullish FVG: a.high < c.low → gap between
    if (a.h < c.l) {
      const lo = a.h, hi = c.l;
      const mitigated = candles.slice(i + 1).some(k => k.l <= lo);
      out.push({
        fromTime: Math.floor(a.t / 1000),
        toTime: Math.floor(c.t / 1000),
        priceLow: lo, priceHigh: hi, kind: "bullish", mitigated, size: hi - lo,
      });
    }
    // Bearish FVG: a.low > c.high
    if (a.l > c.h) {
      const lo = c.h, hi = a.l;
      const mitigated = candles.slice(i + 1).some(k => k.h >= hi);
      out.push({
        fromTime: Math.floor(a.t / 1000),
        toTime: Math.floor(c.t / 1000),
        priceLow: lo, priceHigh: hi, kind: "bearish", mitigated, size: hi - lo,
      });
    }
  }
  // Keep last 10 unmitigated, sorted by closeness to price
  return out
    .filter(f => !f.mitigated)
    .sort((a, b) => Math.abs(((a.priceLow + a.priceHigh) / 2) - currentPrice) - Math.abs(((b.priceLow + b.priceHigh) / 2) - currentPrice))
    .slice(0, 10);
}

// ---------- Order Blocks ----------

export function detectOBs(candles: Candle[], structure: StructureEvent[]): OB[] {
  const out: OB[] = [];
  // For each BOS event, the OB = last opposing-color candle before the impulsive move
  for (const ev of structure.slice(-12)) {
    const idx = candles.findIndex(c => Math.floor(c.t / 1000) === ev.toTime);
    if (idx < 2) continue;
    if (ev.dir === "bullish") {
      // last bearish candle before idx
      for (let k = idx - 1; k >= Math.max(0, idx - 8); k--) {
        if (candles[k].c < candles[k].o) {
          const lo = candles[k].l, hi = candles[k].o;
          const mitigated = candles.slice(idx + 1).some(c => c.l <= lo);
          out.push({
            fromTime: Math.floor(candles[k].t / 1000),
            toTime: Math.floor(candles[Math.min(candles.length - 1, k + 3)].t / 1000),
            priceLow: lo, priceHigh: hi, kind: "demand", mitigated,
          });
          break;
        }
      }
    } else {
      for (let k = idx - 1; k >= Math.max(0, idx - 8); k--) {
        if (candles[k].c > candles[k].o) {
          const lo = candles[k].o, hi = candles[k].h;
          const mitigated = candles.slice(idx + 1).some(c => c.h >= hi);
          out.push({
            fromTime: Math.floor(candles[k].t / 1000),
            toTime: Math.floor(candles[Math.min(candles.length - 1, k + 3)].t / 1000),
            priceLow: lo, priceHigh: hi, kind: "supply", mitigated,
          });
          break;
        }
      }
    }
  }
  return out.filter(o => !o.mitigated).slice(-6);
}

// ---------- Liquidity ----------

export function buildLiquidityPools(htf: Candle[], ltf: Candle[]): LiquidityPool[] {
  const out: LiquidityPool[] = [];
  if (htf.length < 24 || ltf.length < 12) return out;
  const last = ltf[ltf.length - 1].c;
  const tol = last * 0.0005;

  // Prior day (last 24 1H candles)
  const prevDay = htf.slice(-24);
  const pdh = Math.max(...prevDay.map(c => c.h));
  const pdl = Math.min(...prevDay.map(c => c.l));
  out.push({ price: pdh, side: "buy", label: "PDH", swept: ltf.slice(-6).some(c => c.h >= pdh - tol) });
  out.push({ price: pdl, side: "sell", label: "PDL", swept: ltf.slice(-6).some(c => c.l <= pdl + tol) });

  // Asia range (00-07 UTC of today)
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const asia = htf.filter(c => c.t >= today.getTime() && c.t < today.getTime() + 7 * 3600_000);
  if (asia.length) {
    const ah = Math.max(...asia.map(c => c.h));
    const al = Math.min(...asia.map(c => c.l));
    out.push({ price: ah, side: "buy", label: "Asia High", swept: ltf.slice(-12).some(c => c.h >= ah - tol) });
    out.push({ price: al, side: "sell", label: "Asia Low", swept: ltf.slice(-12).some(c => c.l <= al + tol) });
  }

  // HTF swing extremes — dynamic swept check (was hard-coded false, causing false no_sweep vetoes)
  const sh = Math.max(...htf.slice(-80).map(c => c.h));
  const sl = Math.min(...htf.slice(-80).map(c => c.l));
  out.push({ price: sh, side: "buy",  label: "HTF Swing High", swept: ltf.slice(-24).some(c => c.h >= sh - tol) });
  out.push({ price: sl, side: "sell", label: "HTF Swing Low",  swept: ltf.slice(-24).some(c => c.l <= sl + tol) });

  return out;
}

// ---------- Per-TF analysis ----------

export function analyzeTF(candles: Candle[]): TFAnalysis {
  const swings = findSwings(candles, 3);
  const { events, trend } = detectStructure(candles, swings);
  const last = candles[candles.length - 1];
  const fvgs = detectFVGs(candles, last.c);
  const obs = detectOBs(candles, events);
  const recent = candles.slice(-80);
  const sh = Math.max(...recent.map(c => c.h));
  const sl = Math.min(...recent.map(c => c.l));
  return {
    trend,
    swings,
    lastStructure: events[events.length - 1] ?? null,
    fvgs, obs,
    swingHigh: sh, swingLow: sl,
    equilibrium: (sh + sl) / 2,
  };
}

// ---------- Killzone ----------

export function killzoneOf(d = new Date()): { session: string; killzone: string; inKillzone: boolean } {
  const h = d.getUTCHours();
  let session = "Off-Session";
  if (h < 7) session = "Asia"; else if (h < 12) session = "London"; else if (h < 17) session = "New York AM"; else if (h < 21) session = "New York PM";
  let kz = "Outside Killzone"; let inK = false;
  if (h >= 7 && h < 10) { kz = "London Killzone"; inK = true; }
  else if (h >= 12 && h < 15) { kz = "NY AM Killzone"; inK = true; }
  else if (h >= 17 && h < 20) { kz = "NY PM Killzone"; inK = true; }
  else if (h >= 0 && h < 4) { kz = "Asia Killzone"; inK = true; }
  return { session, killzone: kz, inKillzone: inK };
}

// ---------- Trade builder ----------

export type BuiltTrade = {
  direction: "BUY" | "SELL" | "WAIT";
  entryType: "MARKET" | "LIMIT";
  entry: number; sl: number; tp: number; rr: number;
  tp1?: number; tp2?: number; tp3?: number;
  zone: { kind: "OB" | "FVG" | "OTE"; priceLow: number; priceHigh: number } | null;
  reason: string;
  notes?: string[];
};


// Per-asset risk profile. Each asset class has different typical wick sizes,
// spread, and news volatility — using the same buffer for XAU and EURUSD is wrong.
const RISK_PROFILE: Record<
  "crypto" | "metal" | "forex" | "index" | "stock",
  {
    pctBuffer: number;
    minRiskPct: number;
    atrMult: number;
    maxDistPct: number;
    entryWindowPct: number;
    maxRiskPct: number;
  }
> = {
  crypto: { pctBuffer: 0.0012, minRiskPct: 0.0015, atrMult: 0.45, maxDistPct: 0.0090, entryWindowPct: 0.0030, maxRiskPct: 0.0075 },
  // Metals: tickets were still printing ~0.6% stops (≈ $28 on gold) with 3R
  // targets ≈ $85. Tightened again so a normal XAU ticket sits around
  // 0.12-0.30% risk (≈ $6-$14) and the 3R target stays under ~0.9%.
  metal:  { pctBuffer: 0.0005, minRiskPct: 0.0010, atrMult: 0.32, maxDistPct: 0.0035, entryWindowPct: 0.0015, maxRiskPct: 0.0032 },
  forex:  { pctBuffer: 0.0003, minRiskPct: 0.0005, atrMult: 0.28, maxDistPct: 0.0025, entryWindowPct: 0.0012, maxRiskPct: 0.0025 },
  index:  { pctBuffer: 0.0005, minRiskPct: 0.0008, atrMult: 0.32, maxDistPct: 0.0040, entryWindowPct: 0.0018, maxRiskPct: 0.0045 },
  stock:  { pctBuffer: 0.0008, minRiskPct: 0.0012, atrMult: 0.35, maxDistPct: 0.0055, entryWindowPct: 0.0022, maxRiskPct: 0.0060 },


};

function smartPrice(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const a = Math.abs(n);
  const d = a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : a >= 0.0001 ? 7 : 10;
  return n.toFixed(d);
}

export function buildTrade(
  htf: TFAnalysis,
  ltf: TFAnalysis,
  pools: LiquidityPool[],
  lastPrice: number,
  atr?: number, // optional ATR — enables volatility-adaptive SL buffer
  assetKind: "crypto" | "metal" | "forex" | "index" | "stock" = "metal",
): BuiltTrade {
  const profile = RISK_PROFILE[assetKind] ?? RISK_PROFILE.metal;
  // Direction is anchored on HTF bias (institutional bias). In ICT / SMC an
  // opposing LTF leg is a pullback INTO the HTF-aligned zone, so LTF
  // disagreement is expected on retracement setups — it is not a WAIT reason.
  // If HTF is ranging, fall back to LTF direction. When BOTH are ranging we no
  // longer hard-WAIT: gold spends most of the day in a range, and a permanent
  // WAIT meant "market is on HOLD" on ~80% of scans. Instead we take the
  // classic ICT range play — price in premium → look for SELL back to
  // equilibrium, price in discount → look for BUY. The setup still has to pass
  // the zone, risk and confidence gates downstream, and the ranging structure
  // keeps its confidence score low, so only clean range reversals survive.
  let rangeFallback = false;
  let dir: "BUY" | "SELL" | "WAIT" =
    htf.trend === "bullish" ? "BUY" :
    htf.trend === "bearish" ? "SELL" :
    ltf.trend === "bullish" ? "BUY" :
    ltf.trend === "bearish" ? "SELL" : "WAIT";

  if (dir === "WAIT") {
    const rangeHigh = htf.swingHigh;
    const rangeLow = htf.swingLow;
    const span = rangeHigh - rangeLow;
    if (span > 0 && Number.isFinite(lastPrice) && lastPrice > 0) {
      const pos = (lastPrice - rangeLow) / span; // 0 = range low, 1 = range high
      // Only act from the outer thirds of the range; mid-range is genuine chop.
      if (pos >= 0.62) { dir = "SELL"; rangeFallback = true; }
      else if (pos <= 0.38) { dir = "BUY"; rangeFallback = true; }
    }
  }

  if (dir === "WAIT") {
    return { direction: "WAIT", entryType: "MARKET", entry: 0, sl: 0, tp: 0, rr: 0, zone: null, reason: "HTF and LTF are both ranging and price sits mid-range — no edge, waiting for a sweep of the range extreme." };
  }

  // Collect all UNMITIGATED LTF FVG/OB on the trade side, regardless of whether
  // price already tapped. We rank by distance and pick MARKET vs LIMIT below.
  type ZoneCandidate = { kind: "OB" | "FVG" | "OTE"; priceLow: number; priceHigh: number; dist: number };
  const candidates: ZoneCandidate[] = [];
  const distanceFromExecutionZone = (lo: number, hi: number) => {
    if (lastPrice >= lo && lastPrice <= hi) return 0;
    return dir === "BUY" ? Math.max(0, lo - lastPrice, lastPrice - hi) : Math.max(0, lastPrice - hi, lo - lastPrice);
  };
  for (const f of ltf.fvgs) {
    if (f.mitigated) continue;
    if (dir === "BUY" && f.kind !== "bullish") continue;
    if (dir === "SELL" && f.kind !== "bearish") continue;
    candidates.push({ kind: "FVG", priceLow: f.priceLow, priceHigh: f.priceHigh, dist: distanceFromExecutionZone(f.priceLow, f.priceHigh) });
  }
  for (const o of ltf.obs) {
    if (o.mitigated) continue;
    if (dir === "BUY" && o.kind !== "demand") continue;
    if (dir === "SELL" && o.kind !== "supply") continue;
    candidates.push({ kind: "OB", priceLow: o.priceLow, priceHigh: o.priceHigh, dist: distanceFromExecutionZone(o.priceLow, o.priceHigh) });
  }

  // Fallback: synthesize an OTE (62-79%) zone from HTF swing range if no fresh OB/FVG.
  if (!candidates.length) {
    const range = htf.swingHigh - htf.swingLow;
    if (range > 0) {
      const oteLo = dir === "BUY" ? htf.swingLow + range * 0.21 : htf.swingLow + range * 0.62;
      const oteHi = dir === "BUY" ? htf.swingLow + range * 0.38 : htf.swingLow + range * 0.79;
      candidates.push({ kind: "OTE", priceLow: oteLo, priceHigh: oteHi, dist: distanceFromExecutionZone(oteLo, oteHi) });
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);
  const zone = candidates[0] ?? null;

  if (!zone) {
    return { direction: "WAIT", entryType: "MARKET", entry: 0, sl: 0, tp: 0, rr: 0, zone: null, reason: "No fresh (unmitigated) OB/FVG aligned with bias and no valid OTE fallback." };
  }

  const notes: string[] = [];
  if (rangeFallback) {
    notes.push("Range play: both timeframes ranging, trading back from the range extreme toward equilibrium");
  }
  const zoneMid = (zone.priceLow + zone.priceHigh) / 2;
  const zoneDistance = distanceFromExecutionZone(zone.priceLow, zone.priceHigh);
  const distPct = zoneDistance / lastPrice;

  // Reject only truly stale/distant zones. Otherwise choose MARKET vs LIMIT.
  if (distPct > profile.maxDistPct) {
    return { direction: "WAIT", entryType: "MARKET", entry: 0, sl: 0, tp: 0, rr: 0, zone: null, reason: `Nearest ${zone.kind} is ${(distPct * 100).toFixed(2)}% from live price — outside chase range, wait for pullback.` };
  }

  const marketWindow = Math.max(lastPrice * profile.entryWindowPct, atr && atr > 0 ? atr * 0.20 : 0);
  const entryType: "MARKET" | "LIMIT" = zoneDistance <= marketWindow ? "MARKET" : "LIMIT";

  // MARKET → enter at live price. LIMIT → enter at zone midpoint (waiting for tap).
  const entry = entryType === "MARKET" ? lastPrice : zoneMid;
  const zoneHeight = Math.abs(zone.priceHigh - zone.priceLow);

  // SL buffer — asset-aware. max(pct × price, atrMult × ATR, 0.5 × zoneHeight)
  // Tightened buffer (0.33x zone height floor) for ultra-precision SL placement
  const pctBuffer = lastPrice * profile.pctBuffer;
  const atrBuffer = atr && atr > 0 ? atr * profile.atrMult : 0;
  const zoneBuffer = zoneHeight * 0.20;
  const buffer = Math.max(pctBuffer, atrBuffer, zoneBuffer);
  let sl = dir === "BUY" ? zone.priceLow - buffer : zone.priceHigh + buffer;

  // LIQUIDITY-GRAB PROTECTION — the classic killer: price sweeps a low, we buy
  // the reversal, then the SAME pool gets re-swept a few points deeper and our
  // stop dies before the real leg. So the stop must sit BEYOND the stop-side
  // liquidity pool (already swept or still resting) that price is hunting,
  // never in front of it.
  const stopSide: "buy" | "sell" = dir === "BUY" ? "sell" : "buy";
  const stopSidePools = pools
    .filter((p) => p.side === stopSide && (dir === "BUY" ? p.price < entry : p.price > entry))
    .sort((a, b) => Math.abs(a.price - entry) - Math.abs(b.price - entry));
  const guardPool = stopSidePools.find((p) => {
    const d = Math.abs(entry - p.price);
    // A liquidity pool is useful as stop protection only when it is still
    // executable inside this asset's ticket-risk envelope. The old 2.5%
    // allowance routinely selected an HTF extreme $70–$90 away on gold,
    // pushed an otherwise valid 0.3–0.6% stop out to 1.5–1.8%, and made every
    // manual/automatic scan return WAIT. Distant pools remain valid targets,
    // but must not distort the protective stop for the current entry.
    return d > 0 && d <= lastPrice * profile.maxRiskPct;
  });
  if (guardPool) {
    const poolStop = dir === "BUY" ? guardPool.price - buffer : guardPool.price + buffer;
    const deeper = dir === "BUY" ? poolStop < sl : poolStop > sl;
    if (deeper) {
      sl = poolStop;
      notes.push("SL pushed beyond swept liquidity pool (anti stop-hunt)");
    }
  }

  // Enforce MINIMUM risk distance so tickets don't get wicked out on normal noise.
  const minRisk = lastPrice * profile.minRiskPct;
  let risk = Math.abs(entry - sl);
  if (risk < minRisk) {
    sl = dir === "BUY" ? entry - minRisk : entry + minRisk;
    risk = minRisk;
    notes.push("SL widened to minimum safe distance");
  }


  // Cap the ticket size. A structural stop that lands slightly beyond the cap
  // gets TIGHTENED to the cap (keeps the signal, keeps SL/TP readable); only a
  // wildly wide structure (> 1.8x the cap) is rejected outright.
  // Do NOT reject a setup just because the structural stop is wider than the
  // preferred ticket size — the anti-stop-hunt guard routinely pushes SL beyond
  // a liquidity pool, which used to blow past the cap and force a permanent
  // WAIT ("market is on HOLD" on every scan). Only a genuinely absurd stop
  // (> 2.5x the cap) is rejected; everything else is tightened to the cap below.
  const maxRisk = lastPrice * profile.maxRiskPct;
  if (risk > maxRisk * 2.5) {
    return {
      direction: "WAIT", entryType: "MARKET", entry: 0, sl: 0, tp: 0, rr: 0, zone: null,
      reason: `Risk from entry to protected stop is ${(risk / lastPrice * 100).toFixed(2)}%, too wide for ${assetKind}. Wait for a tighter re-entry.`,
    };
  }

  if (risk > maxRisk) {
    sl = dir === "BUY" ? entry - maxRisk : entry + maxRisk;
    risk = maxRisk;
    notes.push(`SL tightened to max ticket risk (${(profile.maxRiskPct * 100).toFixed(2)}% of price)`);
  }

  // TP1/2/3 based on R-multiples first, so partials always exist.
  const tp1 = dir === "BUY" ? entry + risk * 1 : entry - risk * 1;
  const tp2 = dir === "BUY" ? entry + risk * 2 : entry - risk * 2;

  // Final TP = nearest unswept opposing liquidity pool, but CAPPED at 3R and floored at 2R.
  // Using institutional targets (Draw on Liquidity) aligned with 1.5R - 3.0R ICT range.
  const targetSide: "buy" | "sell" = dir === "BUY" ? "buy" : "sell";
  const liquidityTargets = pools
    .filter(p => p.side === targetSide && !p.swept && (dir === "BUY" ? p.price > entry : p.price < entry))
    .sort((a, b) => Math.abs(a.price - entry) - Math.abs(b.price - entry));
  const nearestLiquidity = liquidityTargets[0]?.price;

  const rMax = dir === "BUY" ? entry + risk * 3.0 : entry - risk * 3.0;
  const rMin = dir === "BUY" ? entry + risk * 1.5 : entry - risk * 1.5;

  let tp: number;
  if (nearestLiquidity == null) {
    tp = rMax;
  } else {
    const distR = Math.abs(nearestLiquidity - entry) / risk;
    if (distR < 1.5) {
      tp = rMin;
      notes.push("TP extended to 1.5R (liquidity target too close)");
    } else if (distR > 3.0) {
      tp = rMax;
      notes.push("TP capped at 3.0R (liquidity target too far)");
    } else {
      tp = nearestLiquidity;
    }
  }

  const reward = Math.abs(tp - entry);
  const rr = risk > 0 ? reward / risk : 0;
  const tp3 = tp;

  const label = entryType === "LIMIT" ? `${dir} LIMIT (pending tap)` : dir;
  const reason = entryType === "MARKET"
    ? `${dir} at market ${smartPrice(entry)} inside fresh ${zone.kind} (${smartPrice(zone.priceLow)}–${smartPrice(zone.priceHigh)}), SL beyond the protected zone, TP ${liquidityTargets[0]?.label ? "at " + liquidityTargets[0].label : "at " + rr.toFixed(1) + "R"}.`
    : `${label} at ${smartPrice(entry)} — waiting for price to tap fresh ${zone.kind} (${smartPrice(zone.priceLow)}–${smartPrice(zone.priceHigh)}) from live ${smartPrice(lastPrice)}. SL beyond zone, TP ${liquidityTargets[0]?.label ? "at " + liquidityTargets[0].label : "at " + rr.toFixed(1) + "R"}.`;

  return {
    direction: dir,
    entryType,
    entry, sl, tp, rr,
    tp1, tp2, tp3,
    zone: { kind: zone.kind, priceLow: zone.priceLow, priceHigh: zone.priceHigh },
    reason,

    notes: notes.length ? notes : undefined,
  };
}


// ---------- Score (asset-aware weighted + hard-veto gates) ----------

export type AssetKind = "crypto" | "metal" | "forex" | "index" | "stock";
export type ScoreFactor = { key: string; label: string; weight: number; pass: boolean; detail: string };
export type VetoResult = { key: string; label: string; reason: string };

// Per-asset factor weights. Factors that don't apply to a class get weight 0
// and are dropped from the score (the remaining weights are re-normalised to 100).
// These are the SEED defaults — the live active set is loaded from
// public.signal_weight_configs and can be tuned via /dashboard/admin/tuning.
export const DEFAULT_FACTOR_WEIGHTS: Record<AssetKind, Record<string, number>> = {
  metal:  { bias: 12, sweep: 9, zone: 8, pd: 4, killzone: 6, dxy: 6, rr: 5, structure: 5, smt: 3, session_align: 3, displacement: 6, rejection: 5, confluence: 3, freshness: 2, eqhl: 3, turtle: 3, htf_poi: 5, silver_bullet: 3, power3: 3, mitigation: 3, ce: 4, liq_void: 4, momentum_div: 4, vol_spike: 3, midnight: 3, asian_range: 4, daily_open: 4, atr_room: 4, ltf_momentum: 3, range_pos: 3, swing_room: 4 },
  forex:  { bias: 12, sweep: 9, zone: 8, pd: 4, killzone: 7, dxy: 4, rr: 5, structure: 5, smt: 4, session_align: 3, displacement: 6, rejection: 5, confluence: 3, freshness: 2, eqhl: 4, turtle: 3, htf_poi: 5, silver_bullet: 3, power3: 4, mitigation: 3, ce: 4, liq_void: 4, momentum_div: 4, vol_spike: 2, midnight: 3, asian_range: 5, daily_open: 4, atr_room: 4, ltf_momentum: 3, range_pos: 3, swing_room: 4 },
  index:  { bias: 14, sweep: 9, zone: 8, pd: 4, killzone: 7, dxy: 0, rr: 5, structure: 6, smt: 4, session_align: 4, displacement: 8, rejection: 5, confluence: 2, freshness: 2, eqhl: 3, turtle: 3, htf_poi: 5, silver_bullet: 4, power3: 3, mitigation: 3, ce: 4, liq_void: 5, momentum_div: 4, vol_spike: 5, midnight: 3, asian_range: 3, daily_open: 5, atr_room: 4, ltf_momentum: 3, range_pos: 3, swing_room: 4 },
  crypto: { bias: 16, sweep: 12, zone: 9, pd: 4, killzone: 0, dxy: 0, rr: 7, structure: 7, smt: 3, session_align: 2, displacement: 9, rejection: 5, confluence: 2, freshness: 0, eqhl: 4, turtle: 4, htf_poi: 5, silver_bullet: 0, power3: 0, mitigation: 3, ce: 4, liq_void: 6, momentum_div: 4, vol_spike: 6, midnight: 0, asian_range: 2, daily_open: 4, atr_room: 5, ltf_momentum: 4, range_pos: 3, swing_room: 4 },
  stock:  { bias: 14, sweep: 9, zone: 8, pd: 4, killzone: 7, dxy: 0, rr: 5, structure: 6, smt: 4, session_align: 4, displacement: 8, rejection: 5, confluence: 2, freshness: 2, eqhl: 3, turtle: 3, htf_poi: 5, silver_bullet: 4, power3: 3, mitigation: 3, ce: 4, liq_void: 5, momentum_div: 4, vol_spike: 5, midnight: 3, asian_range: 3, daily_open: 5, atr_room: 4, ltf_momentum: 3, range_pos: 3, swing_room: 4 },
};
const FACTOR_WEIGHTS = DEFAULT_FACTOR_WEIGHTS;
export type FactorWeightsByAsset = Record<AssetKind, Record<string, number>>;


export function scoreSetup(args: {
  trade: BuiltTrade;
  htf: TFAnalysis;
  ltf: TFAnalysis;
  pools: LiquidityPool[];
  inKillzone: boolean;
  imminentHighNews: boolean;
  dxyConfirms: boolean | null;     // null = unknown / N/A
  lastPrice: number;
  kind: AssetKind;
  // ---- optional new signals (safe defaults) ----
  structureQuality?: number | null;  // 0..1 quality of last HTF BOS/CHoCH (impulse vs choppy)
  smtDivergence?: boolean | null;    // true = correlated instrument diverges in our favor
  nativeSession?: boolean | null;    // true = current killzone is the native/prime session for this pair
  zoneMitigated?: boolean;           // true = entry zone already tagged
  // ---- pro-trader layer ----
  displacement?: { strength: number; passed: boolean; detail: string } | null;
  rejection?: { confirmed: boolean; detail: string } | null;
  confluence?: { confluent: boolean; detail: string } | null;
  freshness?: { freshness: number; fresh: boolean; detail: string } | null;
  // ---- veteran-tier layer ----
  equalHL?: { present: boolean; detail: string } | null;
  turtleSoup?: { triggered: boolean; detail: string } | null;
  htfPOI?: { aligned: boolean; detail: string } | null;
  silverBullet?: { inWindow: boolean; detail: string } | null;
  powerOf3?: { phase: "accumulation" | "manipulation" | "distribution" | "unknown"; aligned: boolean; detail: string } | null;
  mitigationBlock?: { present: boolean; detail: string } | null;
  // ---- elite-tier layer ----
  ceTap?: { tapped: boolean; detail: string } | null;
  liquidityVoid?: { present: boolean; detail: string } | null;
  momentumDivergence?: { present: boolean; detail: string } | null;
  volumeSpike?: { spike: boolean; detail: string } | null;
  midnightOpen?: { aligned: boolean; detail: string } | null;
  // ---- expert-tier layer (30+ experts) ----
  asianRange?: { aligned: boolean; detail: string } | null;
  dailyOpenSide?: { aligned: boolean; detail: string } | null;
  atrRoom?: { ok: boolean; detail: string } | null;
  ltfMomentum?: { aligned: boolean; detail: string } | null;
  rangePosition?: { ok: boolean; detail: string } | null;
  swingRoom?: { clear: boolean; detail: string } | null;
  // ---- tuning override: swap in a candidate weight set without changing the module default ----
  weightsOverride?: FactorWeightsByAsset | null;
}): {
  score: number;
  grade: "A+" | "A" | "B" | "C";
  factors: ScoreFactor[];
  vetos: VetoResult[];
} {
  const {
    trade, htf, ltf, pools, inKillzone, imminentHighNews, dxyConfirms, lastPrice, kind,
    structureQuality, smtDivergence, nativeSession, zoneMitigated,
    displacement, rejection, confluence, freshness,
    equalHL, turtleSoup, htfPOI, silverBullet, powerOf3, mitigationBlock,
    ceTap, liquidityVoid, momentumDivergence, volumeSpike, midnightOpen,
    asianRange, dailyOpenSide, atrRoom, ltfMomentum, rangePosition, swingRoom,
    weightsOverride,
  } = args;
  const table = weightsOverride ?? FACTOR_WEIGHTS;
  const w = table[kind] ?? table.metal ?? FACTOR_WEIGHTS.metal;

  const f: ScoreFactor[] = [];
  const vetos: VetoResult[] = [];
  const dir = trade.direction;

  // ---- HARD VETO GATES — reserved for genuine red flags only ----
  // (no_sweep is not a veto anymore; it's already a scored factor. This prevents
  // the engine from downgrading every off-session setup to grade C.)
  if (dir !== "WAIT") {
    // 1. HTF/LTF bias conflict is NOT a veto — a counter-trend LTF pullback
    //    is exactly the entry window into HTF bias. The `bias` scored factor
    //    below already rewards alignment, so we don't double-punish disagreement.
    // 2. Entry zone already mitigated
    if (zoneMitigated === true) {
      vetos.push({ key: "mitigated", label: "Entry zone already mitigated", reason: "Zone was tagged — imbalance filled" });
    }
    // 3. High-impact news imminent
    if (imminentHighNews) {
      vetos.push({ key: "news", label: "High-impact news imminent", reason: "News event within 60m — stand aside" });
    }
    // 3b. DXY contradiction on metals — Gold vs DXY inverse correlation is the
    // single strongest bias filter for XAU; ignore only when DXY data missing.
    if (kind === "metal" && dxyConfirms === false) {
      vetos.push({ key: "dxy_contra", label: "DXY contradicts trade direction", reason: "DXY not confirming inverse move — high failure risk on metals" });
    }
    // 4. R:R < 1.2
    if (trade.rr < 1.2) {
      vetos.push({ key: "rr_low", label: "R:R below 1.2", reason: `Only 1:${trade.rr.toFixed(2)} — not worth the risk` });
    }
  }


  const push = (key: string, label: string, pass: boolean, detail: string) => {
    const weight = w[key] ?? 0;
    if (weight > 0) f.push({ key, label, weight, pass, detail });
  };

  push("bias", "HTF bias aligned with trade",
    dir !== "WAIT" && htf.trend === (dir === "BUY" ? "bullish" : "bearish"),
    `HTF: ${htf.trend} · LTF: ${ltf.trend}${htf.trend !== ltf.trend && ltf.trend !== "ranging" ? " (LTF pullback into HTF bias — normal)" : ""}`);

  const sweptPool = pools.find(p => p.swept && (dir === "BUY" ? p.side === "sell" : p.side === "buy"));
  push("sweep", "Liquidity sweep before entry", !!sweptPool,
    sweptPool ? `${sweptPool.label} swept @ ${sweptPool.price.toFixed(2)}` : "No recent sweep detected");

  push("zone", "Unmitigated OB/FVG at entry", !!trade.zone && zoneMitigated !== true,
    trade.zone ? `${trade.zone.kind} ${trade.zone.priceLow.toFixed(2)}–${trade.zone.priceHigh.toFixed(2)}` : "No clean zone");

  const inPremium = lastPrice > htf.equilibrium;
  const pdOk = dir === "BUY" ? !inPremium : dir === "SELL" ? inPremium : false;
  push("pd", "Premium/Discount correct side", pdOk,
    `Price is in ${inPremium ? "premium" : "discount"}, trade is ${dir}`);

  push("killzone", kind === "crypto" ? "Session momentum (24/7)" : "Inside active killzone",
    kind === "crypto" ? true : inKillzone,
    kind === "crypto" ? "Crypto trades 24/7" : (inKillzone ? "Killzone active" : "Outside killzone"));

  // DXY — only score when data available; unknown = don't penalise
  if (dxyConfirms !== null && dxyConfirms !== undefined) {
    push("dxy", "DXY correlation confirms", dxyConfirms === true,
      dxyConfirms ? "DXY moving inverse" : "DXY not confirming");
  }

  push("rr", "Clean R:R ≥ 1:3", trade.rr >= 3, `R:R 1:${trade.rr.toFixed(2)}`);

  // Structure quality — only score when computable
  if (structureQuality !== null && structureQuality !== undefined) {
    push("structure", "Clean HTF structure (impulse BOS/CHoCH)",
      structureQuality >= 0.6,
      `Impulse strength ${(structureQuality * 100).toFixed(0)}%`);
  }

  // SMT — only score when computable
  if (smtDivergence !== null && smtDivergence !== undefined) {
    push("smt", "SMT divergence with correlated pair",
      smtDivergence === true,
      smtDivergence ? "Correlated pair diverges (institutional footprint)" : "No SMT divergence");
  }

  // Session — only score when computable
  if (nativeSession !== null && nativeSession !== undefined) {
    push("session_align", "Native/prime session for this pair",
      nativeSession === true,
      nativeSession ? "Trading in this pair's prime hours" : "Off-hours for this pair");
  }

  // ---- Pro-trader factors ----
  // Displacement: post-BOS impulse strength (institutional intent)
  if (displacement) {
    push("displacement", "Displacement leg after BOS/CHoCH",
      displacement.passed, displacement.detail);
  }
  // Rejection: LTF rejection wick at the entry zone
  if (rejection) {
    push("rejection", "Rejection wick confirms zone",
      rejection.confirmed, rejection.detail);
  }
  // Confluence: OB + FVG stacked in the same pocket
  if (confluence) {
    push("confluence", "OB + FVG confluence at entry",
      confluence.confluent, confluence.detail);
  }
  // Freshness: entry zone recency (3-15 candles is prime)
  if (freshness) {
    push("freshness", "Zone is fresh (unstale)",
      freshness.fresh, freshness.detail);
  }

  // ---- Veteran-tier factors ----
  if (equalHL) {
    push("eqhl", "Equal highs/lows liquidity available",
      equalHL.present, equalHL.detail);
  }
  if (turtleSoup) {
    push("turtle", "Turtle Soup (failed sweep reversal)",
      turtleSoup.triggered, turtleSoup.detail);
  }
  if (htfPOI) {
    push("htf_poi", "LTF zone nested inside HTF POI",
      htfPOI.aligned, htfPOI.detail);
  }
  if (silverBullet) {
    push("silver_bullet", "Silver Bullet window active",
      silverBullet.inWindow, silverBullet.detail);
  }
  if (powerOf3) {
    push("power3", "Power of 3 (AMD) phase aligned",
      powerOf3.aligned, powerOf3.detail);
  }
  if (mitigationBlock) {
    push("mitigation", "Mitigation block at entry",
      mitigationBlock.present, mitigationBlock.detail);
  }

  // ---- Elite-tier factors ----
  if (ceTap) {
    push("ce", "Consequent Encroachment (50% of zone) tapped",
      ceTap.tapped, ceTap.detail);
  }
  if (liquidityVoid) {
    push("liq_void", "Liquidity void aligned with bias",
      liquidityVoid.present, liquidityVoid.detail);
  }
  if (momentumDivergence) {
    push("momentum_div", "RSI momentum divergence",
      momentumDivergence.present, momentumDivergence.detail);
  }
  if (volumeSpike) {
    push("vol_spike", "Institutional volume spike on break",
      volumeSpike.spike, volumeSpike.detail);
  }
  if (midnightOpen) {
    push("midnight", "Price on correct side of Midnight Open",
      midnightOpen.aligned, midnightOpen.detail);
  }

  // ---- Expert-tier factors (takes the desk past 30 experts) ----
  if (asianRange) {
    push("asian_range", "Asian range expansion aligned",
      asianRange.aligned, asianRange.detail);
  }
  if (dailyOpenSide) {
    push("daily_open", "Correct side of daily open",
      dailyOpenSide.aligned, dailyOpenSide.detail);
  }
  if (atrRoom) {
    push("atr_room", "Enough ATR room to first target",
      atrRoom.ok, atrRoom.detail);
  }
  if (ltfMomentum) {
    push("ltf_momentum", "LTF momentum agrees with direction",
      ltfMomentum.aligned, ltfMomentum.detail);
  }
  if (rangePosition) {
    push("range_pos", "Entry not stuck mid-range",
      rangePosition.ok, rangePosition.detail);
  }
  if (swingRoom) {
    push("swing_room", "Clear path to target (no blocking swing)",
      swingRoom.clear, swingRoom.detail);
  }




  const totalWeight = f.reduce((s, x) => s + x.weight, 0) || 1;
  const earned = f.reduce((s, x) => s + (x.pass ? x.weight : 0), 0);
  let score = Math.round((earned / totalWeight) * 100);
  if (imminentHighNews) score = Math.min(score, 55); // hard-block: below 75% broadcast threshold

  // Vetoes lower the measured score, but never force a magic floor. A hard
  // 38% minimum made unrelated market conditions repeatedly display exactly
  // 38%, which looked like a failed/stale analysis instead of a live score.
  if (vetos.length === 1) {
    score = Math.max(0, score - 8);
  } else if (vetos.length >= 2) {
    score = Math.max(0, score - vetos.length * 15);
  }

  // Grade thresholds — A reserved for genuinely high-conviction setups
  const grade: "A+" | "A" | "B" | "C" =
    vetos.length >= 2 ? "C" :
    score >= 90 ? "A+" :
    score >= 75 ? "A" :
    score >= 65 ? "B" : "C";


  return { score, grade, factors: f, vetos };
}

// ============================================================
// EXPANDED ICT/SMC DETECTORS
// ============================================================

// ---------- ATR (volatility) ----------
export function computeATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((s, x) => s + x, 0) / slice.length;
}

// ---------- Market Regime (wisdom layer) ----------
// Detects whether the market is trending, ranging, choppy or volatile so the
// score/AI can adapt. This is what a 25-year veteran does implicitly before
// even looking at a setup: "what kind of tape are we in?"
export type MarketRegime = {
  regime: "trending" | "ranging" | "choppy" | "volatile";
  confidence: number;      // 0-100 — how sure we are
  trendStrength: number;   // 0-100 — ADX-like
  volatility: number;      // ATR / price (%)
  rangeCompression: number;// last-20 range / last-50 range
  warning: string | null;  // human-readable caution
  favorable: boolean;      // true = ICT signals typically work here
};

export function detectMarketRegime(candles: Candle[]): MarketRegime {
  if (candles.length < 30) {
    return {
      regime: "ranging", confidence: 30, trendStrength: 0,
      volatility: 0, rangeCompression: 1,
      warning: "Not enough data — trade with reduced size",
      favorable: false,
    };
  }

  const last = candles[candles.length - 1].c;
  const atr = computeATR(candles, 14);
  const atrPct = last > 0 ? (atr / last) * 100 : 0;

  // Trend strength via directional movement (simplified ADX)
  let posDM = 0, negDM = 0, sumTR = 0;
  const period = Math.min(14, candles.length - 1);
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    const upMove = c.h - p.h;
    const dnMove = p.l - c.l;
    if (upMove > dnMove && upMove > 0) posDM += upMove;
    if (dnMove > upMove && dnMove > 0) negDM += dnMove;
    sumTR += Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
  }
  const posDI = sumTR > 0 ? (posDM / sumTR) * 100 : 0;
  const negDI = sumTR > 0 ? (negDM / sumTR) * 100 : 0;
  const dx = posDI + negDI > 0 ? (Math.abs(posDI - negDI) / (posDI + negDI)) * 100 : 0;
  const trendStrength = Math.min(100, dx);

  // Range compression: last 20 range vs last 50 range
  const last20 = candles.slice(-20);
  const last50 = candles.slice(-50);
  const range20 = Math.max(...last20.map(c => c.h)) - Math.min(...last20.map(c => c.l));
  const range50 = Math.max(...last50.map(c => c.h)) - Math.min(...last50.map(c => c.l));
  const rangeCompression = range50 > 0 ? range20 / range50 : 1;

  // Classification thresholds — tuned for gold/forex intraday
  // volatile: extreme ATR% (news/gap moves)
  // trending: ADX > 25 AND range not compressed
  // ranging: ADX < 20 AND range compressed
  // choppy: everything else (whipsaws, no edge)
  let regime: MarketRegime["regime"];
  let warning: string | null = null;
  let favorable = false;
  let confidence = 50;

  if (atrPct > 1.5) {
    regime = "volatile";
    warning = "Extreme volatility — spreads widen, SLs get hunted. Reduce size or skip.";
    confidence = 75;
    favorable = false;
  } else if (trendStrength >= 25 && rangeCompression >= 0.6) {
    regime = "trending";
    confidence = Math.min(90, 50 + trendStrength);
    favorable = true;
  } else if (trendStrength < 20 && rangeCompression < 0.55) {
    regime = "ranging";
    warning = "Range-bound market — FVG/OB signals often fail. Fade extremes only.";
    confidence = 70;
    favorable = false;
  } else {
    regime = "choppy";
    warning = "Choppy tape — no clear direction. Prefer waiting for regime shift.";
    confidence = 60;
    favorable = false;
  }

  return {
    regime,
    confidence: Math.round(confidence),
    trendStrength: Math.round(trendStrength),
    volatility: +atrPct.toFixed(3),
    rangeCompression: +rangeCompression.toFixed(2),
    warning,
    favorable,
  };
}

// ---------- Breaker Blocks ----------
// A breaker = OB whose extreme was broken then price returned to it,
// now acting as flipped support/resistance.
export type Breaker = {
  fromTime: number; toTime: number;
  priceLow: number; priceHigh: number;
  kind: "bullish" | "bearish"; // bullish breaker = old supply flipped demand
};

export function detectBreakerBlocks(candles: Candle[], structure: StructureEvent[]): Breaker[] {
  const out: Breaker[] = [];
  // Look at last few structure events. A CHoCH implies the prior OB flipped.
  for (const ev of structure.slice(-8)) {
    if (ev.kind !== "CHoCH") continue;
    const idx = candles.findIndex(c => Math.floor(c.t / 1000) === ev.toTime);
    if (idx < 4) continue;
    // Find the last opposing candle before the CHoCH — that becomes the breaker.
    for (let k = idx - 1; k >= Math.max(0, idx - 10); k--) {
      const c = candles[k];
      if (ev.dir === "bullish" && c.c < c.o) {
        out.push({
          fromTime: Math.floor(c.t / 1000),
          toTime: Math.floor(candles[Math.min(candles.length - 1, k + 3)].t / 1000),
          priceLow: c.l, priceHigh: c.o, kind: "bullish",
        });
        break;
      }
      if (ev.dir === "bearish" && c.c > c.o) {
        out.push({
          fromTime: Math.floor(c.t / 1000),
          toTime: Math.floor(candles[Math.min(candles.length - 1, k + 3)].t / 1000),
          priceLow: c.o, priceHigh: c.h, kind: "bearish",
        });
        break;
      }
    }
  }
  return out.slice(-4);
}

// ---------- Inverted FVG (IFVG) ----------
// An FVG that got violated → now acts as opposite bias imbalance.
export type IFVG = FVG & { originalKind: "bullish" | "bearish" };

export function detectIFVGs(candles: Candle[], fvgs: FVG[]): IFVG[] {
  const out: IFVG[] = [];
  for (const g of fvgs) {
    // If the gap has been fully violated (price closed through both edges), invert its bias.
    const gapIdx = candles.findIndex(c => Math.floor(c.t / 1000) === g.toTime);
    if (gapIdx < 0) continue;
    const after = candles.slice(gapIdx + 1);
    const violated = g.kind === "bullish"
      ? after.some(c => c.c < g.priceLow)
      : after.some(c => c.c > g.priceHigh);
    if (violated) {
      out.push({
        ...g,
        originalKind: g.kind,
        kind: g.kind === "bullish" ? "bearish" : "bullish", // flipped bias
      });
    }
  }
  return out.slice(-4);
}

// ---------- Structure quality (impulse vs choppy) ----------
// Returns 0..1. Higher = cleaner impulsive move on last BOS/CHoCH.
export function computeStructureQuality(candles: Candle[], structure: StructureEvent[]): number {
  const last = structure[structure.length - 1];
  if (!last) return 0;
  const idx = candles.findIndex(c => Math.floor(c.t / 1000) === last.toTime);
  if (idx < 5) return 0;
  // Look at the 5 candles that produced the move — measure body:range ratio.
  const impulse = candles.slice(Math.max(0, idx - 5), idx + 1);
  let bodyTotal = 0, rangeTotal = 0;
  for (const c of impulse) {
    bodyTotal += Math.abs(c.c - c.o);
    rangeTotal += (c.h - c.l);
  }
  if (rangeTotal === 0) return 0;
  return Math.min(1, bodyTotal / rangeTotal);
}

// ---------- SMT Divergence ----------
// If two correlated instruments (Gold vs DXY, EURUSD vs GBPUSD, JPY crosses vs USDJPY)
// print divergent highs/lows in the recent window → institutional footprint.
export function detectSMTDivergence(
  main: Candle[],
  correlated: Candle[],
  inverse: boolean, // true when they should move opposite (Gold↔DXY, EUR↔DXY)
): boolean | null {
  if (main.length < 10 || correlated.length < 10) return null;
  const n = Math.min(main.length, correlated.length, 20);
  const mainSlice = main.slice(-n);
  const corrSlice = correlated.slice(-n);
  const mainHigh = Math.max(...mainSlice.map(c => c.h));
  const mainLow = Math.min(...mainSlice.map(c => c.l));
  const corrHigh = Math.max(...corrSlice.map(c => c.h));
  const corrLow = Math.min(...corrSlice.map(c => c.l));
  const mainHighIdx = mainSlice.findIndex(c => c.h === mainHigh);
  const mainLowIdx = mainSlice.findIndex(c => c.l === mainLow);
  const corrHighIdx = corrSlice.findIndex(c => c.h === corrHigh);
  const corrLowIdx = corrSlice.findIndex(c => c.l === corrLow);
  // Divergence: highs made at different times → hidden strength/weakness
  const highDiv = Math.abs(mainHighIdx - (inverse ? corrLowIdx : corrHighIdx)) > 3;
  const lowDiv = Math.abs(mainLowIdx - (inverse ? corrHighIdx : corrLowIdx)) > 3;
  return highDiv || lowDiv;
}

// ============================================================
// PRO-TRADER LAYER — post-BOS displacement, rejection confirmation,
// zone confluence stacking, zone freshness. These are what a 25-yr
// veteran actually checks before pulling the trigger.
// ============================================================

// ---------- Displacement ----------
// Measures the impulse leg AFTER the last BOS/CHoCH: strong displacement =
// large-body candles with minimal wick, in the bias direction. Returns 0..1.
// Higher = more institutional intent behind the break.
export function computeDisplacement(
  candles: Candle[],
  structure: StructureEvent[],
): { strength: number; passed: boolean; detail: string } {
  const last = structure[structure.length - 1];
  if (!last || candles.length < 6) return { strength: 0, passed: false, detail: "No structure event to measure" };
  const idx = candles.findIndex((c) => Math.floor(c.t / 1000) === last.toTime);
  if (idx < 0 || idx >= candles.length - 1) return { strength: 0, passed: false, detail: "Structure at chart edge" };
  // Inspect the 3 candles AFTER the BOS — that's the displacement leg.
  const leg = candles.slice(idx, Math.min(candles.length, idx + 4));
  if (leg.length < 2) return { strength: 0, passed: false, detail: "Displacement leg incomplete" };
  let bodySum = 0, rangeSum = 0, dirBias = 0;
  for (const c of leg) {
    const body = Math.abs(c.c - c.o);
    const range = Math.max(c.h - c.l, 1e-9);
    bodySum += body;
    rangeSum += range;
    if (last.dir === "bullish" && c.c > c.o) dirBias += 1;
    else if (last.dir === "bearish" && c.c < c.o) dirBias += 1;
  }
  const bodyRatio = rangeSum > 0 ? bodySum / rangeSum : 0;
  const alignRatio = leg.length > 0 ? dirBias / leg.length : 0;
  // Strength = weighted mix of body cleanliness and directional agreement
  const strength = Math.max(0, Math.min(1, bodyRatio * 0.7 + alignRatio * 0.3));
  const passed = strength >= 0.55;
  const detail = `Displacement ${(strength * 100).toFixed(0)}% (body ${(bodyRatio * 100).toFixed(0)}% · aligned ${Math.round(alignRatio * 100)}%)`;
  return { strength, passed, detail };
}

// ---------- Rejection confirmation ----------
// Checks the LAST 1-2 LTF candles at or near the entry zone for a rejection
// wick in the trade direction (pin/hammer/inverted-hammer style). This is
// the classic "confirmation" veterans wait for before entering a limit zone.
export function detectRejectionConfirmation(
  candles: Candle[],
  zone: { priceLow: number; priceHigh: number } | null,
  dir: "BUY" | "SELL" | "WAIT",
): { confirmed: boolean; detail: string } {
  if (!zone || dir === "WAIT" || candles.length < 2) {
    return { confirmed: false, detail: "No zone or no directional bias" };
  }
  // Look at the last 2 closed candles.
  const scan = candles.slice(-2);
  for (const c of scan) {
    const range = Math.max(c.h - c.l, 1e-9);
    const body = Math.abs(c.c - c.o);
    const upperWick = c.h - Math.max(c.o, c.c);
    const lowerWick = Math.min(c.o, c.c) - c.l;
    // Touched or wicked into the zone?
    const touched = dir === "BUY"
      ? c.l <= zone.priceHigh && c.h >= zone.priceLow
      : c.h >= zone.priceLow && c.l <= zone.priceHigh;
    if (!touched) continue;
    // Rejection = wick opposite the trade direction ≥ 55% of range, body ≤ 40% of range.
    if (dir === "BUY" && lowerWick / range >= 0.55 && body / range <= 0.40 && c.c > c.o) {
      return { confirmed: true, detail: `Bullish rejection wick tapped zone (wick ${(lowerWick / range * 100).toFixed(0)}%)` };
    }
    if (dir === "SELL" && upperWick / range >= 0.55 && body / range <= 0.40 && c.c < c.o) {
      return { confirmed: true, detail: `Bearish rejection wick tapped zone (wick ${(upperWick / range * 100).toFixed(0)}%)` };
    }
  }
  return { confirmed: false, detail: "Awaiting rejection confirmation at zone" };
}

// ---------- Zone confluence (OB + FVG stacked) ----------
// When an unmitigated OB and unmitigated FVG overlap on the SAME side of the
// trade, that stacked zone is a premium institutional pocket. Returns the
// intersected sub-zone if a confluence exists.
export function detectZoneConfluence(
  ltf: TFAnalysis,
  dir: "BUY" | "SELL" | "WAIT",
): { confluent: boolean; priceLow: number; priceHigh: number; detail: string } | null {
  if (dir === "WAIT") return null;
  const wantFvg = dir === "BUY" ? "bullish" : "bearish";
  const wantOb = dir === "BUY" ? "demand" : "supply";
  const fvgs = ltf.fvgs.filter((f) => !f.mitigated && f.kind === wantFvg);
  const obs = ltf.obs.filter((o) => !o.mitigated && o.kind === wantOb);
  for (const f of fvgs) {
    for (const o of obs) {
      const lo = Math.max(f.priceLow, o.priceLow);
      const hi = Math.min(f.priceHigh, o.priceHigh);
      if (hi > lo) {
        return {
          confluent: true,
          priceLow: lo,
          priceHigh: hi,
          detail: `OB + FVG stacked (${lo.toFixed(4)}–${hi.toFixed(4)})`,
        };
      }
    }
  }
  return null;
}

// ---------- Zone freshness ----------
// A zone formed 3-15 candles ago is prime. Older zones (>60 candles) are stale
// and much less likely to hold. Returns freshness 0..1 based on age of the zone
// used for the entry.
export function computeZoneFreshness(
  candles: Candle[],
  zone: { fromTime: number } | null,
): { freshness: number; ageCandles: number; fresh: boolean; detail: string } {
  if (!zone || !candles.length) return { freshness: 0, ageCandles: 999, fresh: false, detail: "No zone" };
  const lastT = Math.floor(candles[candles.length - 1].t / 1000);
  const dt = Math.max(0, lastT - zone.fromTime);
  const tfSec = candles.length >= 2
    ? Math.max(60, Math.floor((candles[candles.length - 1].t - candles[candles.length - 2].t) / 1000))
    : 900;
  const ageCandles = Math.round(dt / tfSec);
  let freshness = 0;
  if (ageCandles <= 3) freshness = 0.7;              // very fresh but unconfirmed
  else if (ageCandles <= 15) freshness = 1.0;         // prime window
  else if (ageCandles <= 30) freshness = 0.75;
  else if (ageCandles <= 60) freshness = 0.45;
  else freshness = 0.20;                              // stale
  const fresh = freshness >= 0.6;
  return { freshness, ageCandles, fresh, detail: `${ageCandles} candles old (freshness ${(freshness * 100).toFixed(0)}%)` };
}


// ============================================================
// PAIR PROFILES — killzones, correlations, native sessions per instrument
// ============================================================

export type PairProfile = {
  key: string;
  killzones: { name: string; startUTC: number; endUTC: number }[];
  primeSession: { name: string; startUTC: number; endUTC: number };
  correlated?: { symbol: string; inverse: boolean }; // for SMT
};

export const PAIR_PROFILES: Record<string, PairProfile> = {
  // Metals — London + NY overlap
  XAUUSD: {
    key: "XAUUSD",
    killzones: [
      { name: "London Killzone", startUTC: 7, endUTC: 10 },
      { name: "NY AM Killzone", startUTC: 12, endUTC: 15 },
    ],
    primeSession: { name: "London/NY overlap", startUTC: 7, endUTC: 15 },
    correlated: { symbol: "DXY", inverse: true },
  },
  XAGUSD: {
    key: "XAGUSD",
    killzones: [
      { name: "London Killzone", startUTC: 7, endUTC: 10 },
      { name: "NY AM Killzone", startUTC: 12, endUTC: 15 },
    ],
    primeSession: { name: "London/NY overlap", startUTC: 7, endUTC: 15 },
    correlated: { symbol: "DXY", inverse: true },
  },

  // EUR/GBP — London prime
  EURUSD: {
    key: "EURUSD",
    killzones: [
      { name: "London Killzone", startUTC: 7, endUTC: 10 },
      { name: "NY AM Killzone", startUTC: 12, endUTC: 15 },
    ],
    primeSession: { name: "London", startUTC: 7, endUTC: 12 },
    correlated: { symbol: "GBPUSD", inverse: false },
  },
  GBPUSD: {
    key: "GBPUSD",
    killzones: [
      { name: "London Killzone", startUTC: 7, endUTC: 10 },
      { name: "NY AM Killzone", startUTC: 12, endUTC: 15 },
    ],
    primeSession: { name: "London", startUTC: 7, endUTC: 12 },
    correlated: { symbol: "EURUSD", inverse: false },
  },
  // JPY pairs — Tokyo + London
  USDJPY: {
    key: "USDJPY",
    killzones: [
      { name: "Tokyo Killzone", startUTC: 0, endUTC: 3 },
      { name: "London Killzone", startUTC: 7, endUTC: 10 },
    ],
    primeSession: { name: "Tokyo/London", startUTC: 0, endUTC: 10 },
    correlated: { symbol: "DXY", inverse: false },
  },
  EURJPY: {
    key: "EURJPY",
    killzones: [
      { name: "Tokyo Killzone", startUTC: 0, endUTC: 3 },
      { name: "London Killzone", startUTC: 7, endUTC: 10 },
    ],
    primeSession: { name: "Tokyo/London", startUTC: 0, endUTC: 10 },
    correlated: { symbol: "USDJPY", inverse: false },
  },
  GBPJPY: {
    key: "GBPJPY",
    killzones: [
      { name: "Tokyo Killzone", startUTC: 0, endUTC: 3 },
      { name: "London Killzone", startUTC: 7, endUTC: 10 },
    ],
    primeSession: { name: "Tokyo/London", startUTC: 0, endUTC: 10 },
    correlated: { symbol: "USDJPY", inverse: false },
  },
  // AUD/NZD — Sydney/Tokyo
  AUDUSD: {
    key: "AUDUSD",
    killzones: [
      { name: "Sydney Killzone", startUTC: 22, endUTC: 24 },
      { name: "Tokyo Killzone", startUTC: 0, endUTC: 3 },
    ],
    primeSession: { name: "Sydney/Tokyo", startUTC: 22, endUTC: 3 },
    correlated: { symbol: "DXY", inverse: true },
  },
  NZDUSD: {
    key: "NZDUSD",
    killzones: [
      { name: "Sydney Killzone", startUTC: 22, endUTC: 24 },
      { name: "Tokyo Killzone", startUTC: 0, endUTC: 3 },
    ],
    primeSession: { name: "Sydney/Tokyo", startUTC: 22, endUTC: 3 },
    correlated: { symbol: "DXY", inverse: true },
  },
  USDCAD: {
    key: "USDCAD",
    killzones: [{ name: "NY AM Killzone", startUTC: 12, endUTC: 15 }],
    primeSession: { name: "NY", startUTC: 12, endUTC: 17 },
    correlated: { symbol: "DXY", inverse: false },
  },
  // Indices — NY session
  NAS100: {
    key: "NAS100",
    killzones: [
      { name: "NY AM Killzone", startUTC: 13, endUTC: 16 },
      { name: "NY PM Killzone", startUTC: 18, endUTC: 20 },
    ],
    primeSession: { name: "NY RTH", startUTC: 13, endUTC: 20 },
    correlated: { symbol: "SPX500", inverse: false },
  },
  SPX500: {
    key: "SPX500",
    killzones: [
      { name: "NY AM Killzone", startUTC: 13, endUTC: 16 },
      { name: "NY PM Killzone", startUTC: 18, endUTC: 20 },
    ],
    primeSession: { name: "NY RTH", startUTC: 13, endUTC: 20 },
    correlated: { symbol: "NAS100", inverse: false },
  },
  US30: {
    key: "US30",
    killzones: [{ name: "NY AM Killzone", startUTC: 13, endUTC: 16 }],
    primeSession: { name: "NY RTH", startUTC: 13, endUTC: 20 },
    correlated: { symbol: "SPX500", inverse: false },
  },
  // Crypto — 24/7 but NY + Asian retail are prime
  BTCUSD: {
    key: "BTCUSD",
    killzones: [
      { name: "NY AM Killzone", startUTC: 13, endUTC: 16 },
      { name: "Asian Killzone", startUTC: 0, endUTC: 4 },
    ],
    primeSession: { name: "NY / Asia", startUTC: 13, endUTC: 16 },
  },
  ETHUSD: {
    key: "ETHUSD",
    killzones: [
      { name: "NY AM Killzone", startUTC: 13, endUTC: 16 },
      { name: "Asian Killzone", startUTC: 0, endUTC: 4 },
    ],
    primeSession: { name: "NY / Asia", startUTC: 13, endUTC: 16 },
    correlated: { symbol: "BTCUSD", inverse: false },
  },
};

export function getPairProfile(symbol: string): PairProfile | null {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (PAIR_PROFILES[s]) return PAIR_PROFILES[s];
  if (s === "GOLD" || s === "XAU") return PAIR_PROFILES.XAUUSD;
  return PAIR_PROFILES.XAUUSD;
}


// Pair-aware killzone check. Falls back to generic global killzones if pair unknown.
export function killzoneForPair(
  symbol: string,
  d = new Date(),
): { session: string; killzone: string; inKillzone: boolean; nativeSession: boolean } {
  const h = d.getUTCHours();
  const profile = getPairProfile(symbol);
  if (profile) {
    const active = profile.killzones.find(k =>
      k.startUTC <= k.endUTC ? h >= k.startUTC && h < k.endUTC : h >= k.startUTC || h < k.endUTC,
    );
    const prime = profile.primeSession;
    const nativeSession = prime.startUTC <= prime.endUTC
      ? h >= prime.startUTC && h < prime.endUTC
      : h >= prime.startUTC || h < prime.endUTC;
    const base = killzoneOf(d);
    return {
      session: base.session,
      killzone: active ? active.name : "Outside Killzone",
      inKillzone: !!active,
      nativeSession,
    };
  }
  const base = killzoneOf(d);
  return { ...base, nativeSession: base.inKillzone };
}


// ============================================================
// VETERAN-TIER DETECTORS — EQH/EQL, Turtle Soup, HTF POI,
// Silver Bullet, Power of 3 (AMD), Mitigation Blocks, proper OTE
// ============================================================

// ---------- Equal Highs / Equal Lows (EQH/EQL) ----------
// Relative-equal swing tops/bottoms create engineered liquidity pools —
// prime targets for stop hunts before reversals.
export function detectEqualHighsLows(
  candles: Candle[],
  swings: Swing[],
  lastPrice: number,
): { present: boolean; eqh: number | null; eql: number | null; detail: string } {
  if (swings.length < 4 || !candles.length) {
    return { present: false, eqh: null, eql: null, detail: "Not enough swings" };
  }
  const tol = lastPrice * 0.0006; // ~6bps tolerance
  const highs = swings.filter(s => s.kind === "high").slice(-8);
  const lows = swings.filter(s => s.kind === "low").slice(-8);
  let eqh: number | null = null, eql: number | null = null;
  for (let i = 0; i < highs.length; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[i].price - highs[j].price) <= tol) {
        eqh = Math.max(highs[i].price, highs[j].price);
        break;
      }
    }
    if (eqh) break;
  }
  for (let i = 0; i < lows.length; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[i].price - lows[j].price) <= tol) {
        eql = Math.min(lows[i].price, lows[j].price);
        break;
      }
    }
    if (eql) break;
  }
  const present = eqh !== null || eql !== null;
  const parts: string[] = [];
  if (eqh) parts.push(`EQH @ ${eqh.toFixed(4)}`);
  if (eql) parts.push(`EQL @ ${eql.toFixed(4)}`);
  return {
    present,
    eqh, eql,
    detail: present ? parts.join(" · ") : "No relative-equal levels engineered",
  };
}

// ---------- Turtle Soup (failed swing sweep → reversal) ----------
// Price briefly breaks a prior swing high/low then closes back inside — a
// textbook stop-run reversal. Aligned with the intended trade direction
// = high-probability entry.
export function detectTurtleSoup(
  candles: Candle[],
  swings: Swing[],
  dir: "BUY" | "SELL" | "WAIT",
): { triggered: boolean; detail: string } {
  if (dir === "WAIT" || candles.length < 5 || swings.length < 2) {
    return { triggered: false, detail: "No directional bias for Turtle Soup" };
  }
  const recent = candles.slice(-6);
  if (dir === "BUY") {
    const priorLow = Math.min(...swings.filter(s => s.kind === "low").slice(-4).map(s => s.price));
    if (!Number.isFinite(priorLow)) return { triggered: false, detail: "No prior low" };
    const swept = recent.some(c => c.l < priorLow);
    const reclaimed = recent[recent.length - 1].c > priorLow;
    if (swept && reclaimed) {
      return { triggered: true, detail: `SSL @ ${priorLow.toFixed(4)} swept then reclaimed (Turtle Soup long)` };
    }
  } else {
    const priorHigh = Math.max(...swings.filter(s => s.kind === "high").slice(-4).map(s => s.price));
    if (!Number.isFinite(priorHigh)) return { triggered: false, detail: "No prior high" };
    const swept = recent.some(c => c.h > priorHigh);
    const reclaimed = recent[recent.length - 1].c < priorHigh;
    if (swept && reclaimed) {
      return { triggered: true, detail: `BSL @ ${priorHigh.toFixed(4)} swept then reclaimed (Turtle Soup short)` };
    }
  }
  return { triggered: false, detail: "No Turtle Soup pattern" };
}

// ---------- HTF POI alignment ----------
// The LTF entry zone should nest inside an HTF Order Block or FVG — that's
// the confluence institutions actually use. Cheap HTF-agnostic LTF entries
// are the #1 reason retail SMC fails.
export function detectHTFPOIAlignment(
  htf: TFAnalysis,
  ltfZone: { priceLow: number; priceHigh: number } | null,
  dir: "BUY" | "SELL" | "WAIT",
): { aligned: boolean; detail: string } {
  if (!ltfZone || dir === "WAIT") return { aligned: false, detail: "No LTF zone" };
  const wantOB = dir === "BUY" ? "demand" : "supply";
  const wantFvg = dir === "BUY" ? "bullish" : "bearish";
  const zones = [
    ...htf.obs.filter(o => !o.mitigated && o.kind === wantOB).map(o => ({ lo: o.priceLow, hi: o.priceHigh, tag: "HTF OB" })),
    ...htf.fvgs.filter(f => !f.mitigated && f.kind === wantFvg).map(f => ({ lo: f.priceLow, hi: f.priceHigh, tag: "HTF FVG" })),
  ];
  for (const z of zones) {
    const overlap = Math.min(ltfZone.priceHigh, z.hi) - Math.max(ltfZone.priceLow, z.lo);
    if (overlap > 0) {
      return { aligned: true, detail: `LTF zone nested inside ${z.tag} (${z.lo.toFixed(4)}–${z.hi.toFixed(4)})` };
    }
  }
  return { aligned: false, detail: "LTF zone not backed by an HTF POI" };
}

// ---------- Silver Bullet window ----------
// ICT Silver Bullet = 3 highest-probability 1-hour windows:
// London 03:00–04:00 NY, AM 10:00–11:00 NY, PM 14:00–15:00 NY.
// (NY = UTC-5 winter, UTC-4 summer. We use UTC hours 8, 15, 19 as approximation.)
export function detectSilverBullet(d = new Date()): { inWindow: boolean; detail: string } {
  const h = d.getUTCHours();
  if (h === 8) return { inWindow: true, detail: "London Silver Bullet (08:00 UTC)" };
  if (h === 15) return { inWindow: true, detail: "NY AM Silver Bullet (15:00 UTC)" };
  if (h === 19) return { inWindow: true, detail: "NY PM Silver Bullet (19:00 UTC)" };
  return { inWindow: false, detail: "Outside Silver Bullet windows" };
}

// ---------- Power of 3 (AMD — Accumulation / Manipulation / Distribution) ----------
// Compare today's session structure vs Asia range:
// - Asia = accumulation (tight range)
// - London = manipulation (sweeps Asia extreme)
// - NY = distribution (expansion in bias direction)
export function detectPowerOf3(
  htf: Candle[],
  dir: "BUY" | "SELL" | "WAIT",
  d = new Date(),
): { phase: "accumulation" | "manipulation" | "distribution" | "unknown"; aligned: boolean; detail: string } {
  if (dir === "WAIT" || htf.length < 24) return { phase: "unknown", aligned: false, detail: "No bias / not enough data" };
  const today = new Date(d); today.setUTCHours(0, 0, 0, 0);
  const asia = htf.filter(c => c.t >= today.getTime() && c.t < today.getTime() + 7 * 3600_000);
  if (!asia.length) return { phase: "unknown", aligned: false, detail: "No Asia session data" };
  const ah = Math.max(...asia.map(c => c.h));
  const al = Math.min(...asia.map(c => c.l));
  const h = d.getUTCHours();
  const last = htf[htf.length - 1];
  if (h < 7) {
    return { phase: "accumulation", aligned: false, detail: `Asia accumulation: ${al.toFixed(4)}–${ah.toFixed(4)}` };
  }
  if (h >= 7 && h < 12) {
    // Manipulation phase — did London sweep Asia extreme against bias?
    const london = htf.filter(c => c.t >= today.getTime() + 7 * 3600_000 && c.t < today.getTime() + 12 * 3600_000);
    if (!london.length) return { phase: "manipulation", aligned: false, detail: "London manipulation forming" };
    const sweptHigh = london.some(c => c.h > ah);
    const sweptLow = london.some(c => c.l < al);
    // For BUY we want London to sweep Asia LOW first (manipulation down before expansion up)
    const aligned = dir === "BUY" ? sweptLow : sweptHigh;
    return { phase: "manipulation", aligned, detail: aligned ? `London swept Asia ${dir === "BUY" ? "low" : "high"} — expansion likely` : "London manipulation unclear" };
  }
  // NY session — distribution / expansion
  const aligned = dir === "BUY" ? last.c > ah : last.c < al;
  return { phase: "distribution", aligned, detail: aligned ? `NY expansion beyond Asia ${dir === "BUY" ? "high" : "low"}` : "NY expansion not confirmed" };
}

// ---------- Mitigation Block ----------
// Similar to OB but formed from a swing that already mitigated a prior imbalance.
// Detected as: opposing-color candle whose extreme is beyond a recent swing
// and price has since retraced without violating the block.
export function detectMitigationBlocks(
  candles: Candle[],
  swings: Swing[],
): { blocks: { priceLow: number; priceHigh: number; kind: "demand" | "supply" }[] } {
  const out: { priceLow: number; priceHigh: number; kind: "demand" | "supply" }[] = [];
  if (candles.length < 10 || swings.length < 3) return { blocks: out };
  const recentSwings = swings.slice(-6);
  for (const sw of recentSwings) {
    if (sw.i < 2 || sw.i >= candles.length - 2) continue;
    const c = candles[sw.i];
    if (sw.kind === "low" && c.c < c.o) {
      // Bearish candle at swing low = potential demand mitigation block
      const lo = c.l, hi = c.o;
      const later = candles.slice(sw.i + 1);
      const violated = later.some(k => k.c < lo);
      if (!violated && later.length > 0) out.push({ priceLow: lo, priceHigh: hi, kind: "demand" });
    } else if (sw.kind === "high" && c.c > c.o) {
      const lo = c.o, hi = c.h;
      const later = candles.slice(sw.i + 1);
      const violated = later.some(k => k.c > hi);
      if (!violated && later.length > 0) out.push({ priceLow: lo, priceHigh: hi, kind: "supply" });
    }
  }
  return { blocks: out.slice(-4) };
}

export function detectMitigationAtEntry(
  candles: Candle[],
  swings: Swing[],
  zone: { priceLow: number; priceHigh: number } | null,
  dir: "BUY" | "SELL" | "WAIT",
): { present: boolean; detail: string } {
  if (!zone || dir === "WAIT") return { present: false, detail: "No zone/bias" };
  const { blocks } = detectMitigationBlocks(candles, swings);
  const want = dir === "BUY" ? "demand" : "supply";
  const hit = blocks.find(b => b.kind === want && Math.min(b.priceHigh, zone.priceHigh) > Math.max(b.priceLow, zone.priceLow));
  if (hit) return { present: true, detail: `Mitigation ${hit.kind} block overlaps entry zone` };
  return { present: false, detail: "No mitigation block at entry" };
}

// ---------- Proper OTE (Optimal Trade Entry) fib levels ----------
// Standard ICT OTE = 62%, 70.5%, 79% retracement of the last impulse leg.
// Returns the three levels + a "sweet spot" (70.5%) for limit entries.
export function computeOTE(
  htf: TFAnalysis,
  dir: "BUY" | "SELL" | "WAIT",
): { level62: number; level705: number; level79: number; sweet: number; zoneLow: number; zoneHigh: number } | null {
  if (dir === "WAIT") return null;
  const range = htf.swingHigh - htf.swingLow;
  if (range <= 0) return null;
  if (dir === "BUY") {
    const level62 = htf.swingHigh - range * 0.62;
    const level705 = htf.swingHigh - range * 0.705;
    const level79 = htf.swingHigh - range * 0.79;
    return { level62, level705, level79, sweet: level705, zoneLow: level79, zoneHigh: level62 };
  }
  const level62 = htf.swingLow + range * 0.62;
  const level705 = htf.swingLow + range * 0.705;
  const level79 = htf.swingLow + range * 0.79;
  return { level62, level705, level79, sweet: level705, zoneLow: level62, zoneHigh: level79 };
}

// ---------- Judas Swing (false open reversal) ----------
// Early-session (first 1-2 hours of London or NY) prints a fake direction
// then reverses. Detects if the current move is a Judas by comparing the
// first hour's high/low to subsequent action.
export function detectJudasSwing(
  htf: Candle[],
  dir: "BUY" | "SELL" | "WAIT",
  d = new Date(),
): { triggered: boolean; detail: string } {
  if (dir === "WAIT" || htf.length < 12) return { triggered: false, detail: "No bias / insufficient data" };
  const today = new Date(d); today.setUTCHours(0, 0, 0, 0);
  // London open window 07:00-08:00 UTC
  const lo = htf.filter(c => c.t >= today.getTime() + 7 * 3600_000 && c.t < today.getTime() + 8 * 3600_000);
  const after = htf.filter(c => c.t >= today.getTime() + 8 * 3600_000);
  if (!lo.length || !after.length) return { triggered: false, detail: "London open data unavailable" };
  const openHigh = Math.max(...lo.map(c => c.h));
  const openLow = Math.min(...lo.map(c => c.l));
  const last = after[after.length - 1];
  if (dir === "BUY") {
    // Judas long = fake break below open low, then reversal up
    const faked = after.some(c => c.l < openLow);
    const reclaimed = last.c > openLow;
    if (faked && reclaimed) return { triggered: true, detail: `Judas long: fake break of London open low @ ${openLow.toFixed(4)}` };
  } else {
    const faked = after.some(c => c.h > openHigh);
    const reclaimed = last.c < openHigh;
    if (faked && reclaimed) return { triggered: true, detail: `Judas short: fake break of London open high @ ${openHigh.toFixed(4)}` };
  }
  return { triggered: false, detail: "No Judas swing detected" };
}


// ============================================================
// ELITE-TIER DETECTORS — CE, Liquidity Voids, Momentum Divergence,
// Volume Spikes, Opening Gaps (NWOG/NDOG), Midnight Open, Asian
// Range Projections, Consolidation Compression, Trap Candles.
// These are the sharpest tools in a 20+yr trader's bag.
// ============================================================

// ---------- Consequent Encroachment (CE = 50% of FVG) ----------
// ICT institutional reference: the 50% line of any FVG is the "consequent
// encroachment". Price tapping past CE = imbalance considered filled by
// smart money even if the whole gap isn't closed. Best limit entry level.
export function computeCE(fvg: { priceLow: number; priceHigh: number }): number {
  return (fvg.priceLow + fvg.priceHigh) / 2;
}

export function detectCETap(
  candles: Candle[],
  zone: { priceLow: number; priceHigh: number } | null,
  dir: "BUY" | "SELL" | "WAIT",
): { tapped: boolean; ce: number | null; detail: string } {
  if (!zone || dir === "WAIT" || !candles.length) return { tapped: false, ce: null, detail: "No zone/bias" };
  const ce = computeCE(zone);
  const recent = candles.slice(-4);
  const tapped = dir === "BUY"
    ? recent.some(c => c.l <= ce && c.c >= zone.priceLow)
    : recent.some(c => c.h >= ce && c.c <= zone.priceHigh);
  return {
    tapped, ce,
    detail: tapped ? `Price tagged CE @ ${ce.toFixed(4)} (50% of zone)` : `CE @ ${ce.toFixed(4)} not yet tapped`,
  };
}

// ---------- Liquidity Void (large single-candle imbalance) ----------
// A single displacement candle whose range >> local ATR leaves a "void".
// Price statistically retraces to fill part of it before continuing.
export type LiquidityVoid = {
  fromTime: number; toTime: number;
  priceLow: number; priceHigh: number;
  kind: "bullish" | "bearish";
  size: number;
  atrMultiple: number;
};

export function detectLiquidityVoids(candles: Candle[]): LiquidityVoid[] {
  if (candles.length < 20) return [];
  const atr = computeATR(candles, 14);
  if (atr <= 0) return [];
  const out: LiquidityVoid[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const range = c.h - c.l;
    const body = Math.abs(c.c - c.o);
    // Void = body ≥ 1.8x ATR AND body dominates range (>70%)
    if (body >= atr * 1.8 && body / Math.max(range, 1e-9) >= 0.7) {
      const kind: "bullish" | "bearish" = c.c > c.o ? "bullish" : "bearish";
      out.push({
        fromTime: Math.floor(c.t / 1000),
        toTime: Math.floor(c.t / 1000),
        priceLow: Math.min(c.o, c.c),
        priceHigh: Math.max(c.o, c.c),
        kind, size: body,
        atrMultiple: +(body / atr).toFixed(2),
      });
    }
  }
  return out.slice(-6);
}

export function detectLiquidityVoidAtEntry(
  candles: Candle[],
  dir: "BUY" | "SELL" | "WAIT",
  lastPrice: number,
): { present: boolean; detail: string } {
  if (dir === "WAIT") return { present: false, detail: "No bias" };
  const voids = detectLiquidityVoids(candles);
  const want = dir === "BUY" ? "bullish" : "bearish";
  const recent = voids.filter(v => v.kind === want).slice(-3);
  if (!recent.length) return { present: false, detail: "No recent liquidity void aligned with bias" };
  const strongest = recent.reduce((a, b) => (b.atrMultiple > a.atrMultiple ? b : a));
  return {
    present: true,
    detail: `${strongest.kind} liquidity void at ${strongest.priceLow.toFixed(4)}–${strongest.priceHigh.toFixed(4)} (${strongest.atrMultiple}× ATR)`,
  };
}

// ---------- RSI (Wilder) & Momentum Divergence ----------
export function computeRSI(candles: Candle[], period = 14): number[] {
  if (candles.length < period + 1) return [];
  const rsi: number[] = [];
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i].c - candles[i - 1].c;
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  rsi[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i].c - candles[i - 1].c;
    const g = Math.max(0, d), l = Math.max(0, -d);
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    rsi[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return rsi;
}

export function detectMomentumDivergence(
  candles: Candle[],
  swings: Swing[],
  dir: "BUY" | "SELL" | "WAIT",
): { present: boolean; kind: "regular" | "hidden" | null; detail: string } {
  if (dir === "WAIT" || candles.length < 30 || swings.length < 2) {
    return { present: false, kind: null, detail: "Insufficient data" };
  }
  const rsi = computeRSI(candles, 14);
  if (!rsi.length) return { present: false, kind: null, detail: "RSI unavailable" };
  if (dir === "BUY") {
    const lows = swings.filter(s => s.kind === "low").slice(-3);
    if (lows.length < 2) return { present: false, kind: null, detail: "Need 2 recent lows" };
    const [a, b] = [lows[lows.length - 2], lows[lows.length - 1]];
    const rsiA = rsi[a.i] ?? null, rsiB = rsi[b.i] ?? null;
    if (rsiA == null || rsiB == null) return { present: false, kind: null, detail: "RSI missing at swings" };
    if (b.price < a.price && rsiB > rsiA + 2) {
      return { present: true, kind: "regular", detail: `Bullish regular divergence: price LL @ ${b.price.toFixed(4)}, RSI HL (${rsiA.toFixed(0)}→${rsiB.toFixed(0)})` };
    }
    if (b.price > a.price && rsiB < rsiA - 2) {
      return { present: true, kind: "hidden", detail: `Bullish hidden divergence: price HL, RSI LL (${rsiA.toFixed(0)}→${rsiB.toFixed(0)})` };
    }
  } else {
    const highs = swings.filter(s => s.kind === "high").slice(-3);
    if (highs.length < 2) return { present: false, kind: null, detail: "Need 2 recent highs" };
    const [a, b] = [highs[highs.length - 2], highs[highs.length - 1]];
    const rsiA = rsi[a.i] ?? null, rsiB = rsi[b.i] ?? null;
    if (rsiA == null || rsiB == null) return { present: false, kind: null, detail: "RSI missing at swings" };
    if (b.price > a.price && rsiB < rsiA - 2) {
      return { present: true, kind: "regular", detail: `Bearish regular divergence: price HH @ ${b.price.toFixed(4)}, RSI LH (${rsiA.toFixed(0)}→${rsiB.toFixed(0)})` };
    }
    if (b.price < a.price && rsiB > rsiA + 2) {
      return { present: true, kind: "hidden", detail: `Bearish hidden divergence: price LH, RSI HH (${rsiA.toFixed(0)}→${rsiB.toFixed(0)})` };
    }
  }
  return { present: false, kind: null, detail: "No divergence" };
}

// ---------- Volume Spike on BOS/CHoCH ----------
// Institutional intent leaves a volume footprint. Spike at the break = real.
export function detectVolumeSpikeOnBreak(
  candles: Candle[],
  structure: StructureEvent[],
): { spike: boolean; multiple: number; detail: string } {
  const last = structure[structure.length - 1];
  if (!last || candles.length < 25) return { spike: false, multiple: 0, detail: "No structure/data" };
  const idx = candles.findIndex(c => Math.floor(c.t / 1000) === last.toTime);
  if (idx < 20) return { spike: false, multiple: 0, detail: "Break too early to measure volume" };
  const breakVol = candles[idx].v;
  const avgVol = candles.slice(Math.max(0, idx - 20), idx).reduce((s, c) => s + c.v, 0) / 20;
  if (avgVol <= 0) return { spike: false, multiple: 0, detail: "Volume data unavailable" };
  const multiple = breakVol / avgVol;
  const spike = multiple >= 1.5;
  return { spike, multiple: +multiple.toFixed(2), detail: `Break volume ${multiple.toFixed(2)}× 20-bar avg${spike ? " (institutional footprint)" : ""}` };
}

// ---------- Opening Gaps (NDOG / NWOG) ----------
// New Day Opening Gap: 17:00 NY (previous close) → 18:00 NY (next open).
// New Week Opening Gap: Friday 17:00 NY close → Sunday 18:00 NY open.
// Institutions treat these gaps as high-probability magnets/reference zones.
export type OpeningGap = {
  kind: "NDOG" | "NWOG";
  priceLow: number; priceHigh: number;
  midpoint: number;
  filled: boolean;
};

export function detectOpeningGaps(candles: Candle[]): OpeningGap[] {
  if (candles.length < 24) return [];
  const out: OpeningGap[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1], cur = candles[i];
    const gap = Math.min(cur.o, cur.c) - Math.max(prev.o, prev.c);
    const gapDn = Math.min(prev.o, prev.c) - Math.max(cur.o, cur.c);
    const dayChange = new Date(prev.t).getUTCDate() !== new Date(cur.t).getUTCDate();
    const isMonday = new Date(cur.t).getUTCDay() === 1;
    if (!dayChange) continue;
    const priceLow = Math.min(prev.c, cur.o);
    const priceHigh = Math.max(prev.c, cur.o);
    if (Math.abs(prev.c - cur.o) < 1e-9) continue;
    const later = candles.slice(i + 1);
    const filled = later.some(c => c.l <= priceLow && c.h >= priceHigh);
    if (gap > 0 || gapDn > 0) {
      out.push({
        kind: isMonday ? "NWOG" : "NDOG",
        priceLow, priceHigh,
        midpoint: (priceLow + priceHigh) / 2,
        filled,
      });
    }
  }
  return out.filter(g => !g.filled).slice(-4);
}

// ---------- Midnight Open (True Day Open reference) ----------
// The 00:00 NY (05:00 UTC) price is a key institutional reference. Retail
// stops sit above/below; smart money uses it as bias divider.
export function computeMidnightOpen(candles: Candle[], d = new Date()): number | null {
  if (!candles.length) return null;
  const today = new Date(d); today.setUTCHours(5, 0, 0, 0); // 00:00 NY ≈ 05:00 UTC
  let closest: Candle | null = null;
  let bestDelta = Infinity;
  for (const c of candles) {
    const delta = Math.abs(c.t - today.getTime());
    if (delta < bestDelta) { bestDelta = delta; closest = c; }
  }
  return closest ? closest.o : null;
}

export function detectMidnightOpenBias(
  candles: Candle[],
  dir: "BUY" | "SELL" | "WAIT",
): { aligned: boolean; midnight: number | null; detail: string } {
  if (dir === "WAIT" || !candles.length) return { aligned: false, midnight: null, detail: "No bias" };
  const mo = computeMidnightOpen(candles);
  if (mo == null) return { aligned: false, midnight: null, detail: "Midnight open unavailable" };
  const last = candles[candles.length - 1].c;
  const aligned = dir === "BUY" ? last > mo : last < mo;
  return {
    aligned, midnight: mo,
    detail: aligned
      ? `Price ${dir === "BUY" ? "above" : "below"} Midnight Open @ ${mo.toFixed(4)} (bias aligned)`
      : `Price on wrong side of Midnight Open @ ${mo.toFixed(4)}`,
  };
}

// ---------- Asian Range Projections (0.5x / 1x / 2x) ----------
// Institutions project Asian session range multiples as intraday targets.
export function computeAsianRangeProjections(
  htf: Candle[],
  d = new Date(),
): { high: number; low: number; range: number; proj: { level: string; up: number; down: number }[] } | null {
  if (htf.length < 24) return null;
  const today = new Date(d); today.setUTCHours(0, 0, 0, 0);
  const asia = htf.filter(c => c.t >= today.getTime() && c.t < today.getTime() + 7 * 3600_000);
  if (!asia.length) return null;
  const high = Math.max(...asia.map(c => c.h));
  const low = Math.min(...asia.map(c => c.l));
  const range = high - low;
  return {
    high, low, range,
    proj: [
      { level: "0.5x", up: high + range * 0.5, down: low - range * 0.5 },
      { level: "1.0x", up: high + range, down: low - range },
      { level: "2.0x", up: high + range * 2, down: low - range * 2 },
    ],
  };
}

// ---------- Consolidation Compression (Squeeze) ----------
// Range compression before expansion — like a coiled spring. Detects when
// the last N candles' range is <60% of the prior N (imminent breakout).
export function detectCompression(candles: Candle[], window = 10): { compressed: boolean; ratio: number; detail: string } {
  if (candles.length < window * 2) return { compressed: false, ratio: 1, detail: "Insufficient data" };
  const recent = candles.slice(-window);
  const prior = candles.slice(-window * 2, -window);
  const rRecent = Math.max(...recent.map(c => c.h)) - Math.min(...recent.map(c => c.l));
  const rPrior = Math.max(...prior.map(c => c.h)) - Math.min(...prior.map(c => c.l));
  const ratio = rPrior > 0 ? rRecent / rPrior : 1;
  const compressed = ratio < 0.6;
  return {
    compressed, ratio: +ratio.toFixed(2),
    detail: compressed ? `Range compressed ${(ratio * 100).toFixed(0)}% vs prior — breakout imminent` : `Range ratio ${ratio.toFixed(2)} (no compression)`,
  };
}

// ---------- Trap Candle (long wick both sides) ----------
// A "shark fin" candle with long upper AND lower wicks = whipsaw, both
// sides' stops taken. Signals indecision / manipulation zone.
export function detectTrapCandles(candles: Candle[]): { indices: number[]; latest: number | null } {
  const idxs: number[] = [];
  for (let i = candles.length - 10; i < candles.length; i++) {
    if (i < 0) continue;
    const c = candles[i];
    const range = Math.max(c.h - c.l, 1e-9);
    const body = Math.abs(c.c - c.o);
    const upper = c.h - Math.max(c.o, c.c);
    const lower = Math.min(c.o, c.c) - c.l;
    if (body / range < 0.3 && upper / range > 0.3 && lower / range > 0.3) idxs.push(i);
  }
  return { indices: idxs, latest: idxs.length ? idxs[idxs.length - 1] : null };
}

// ---------- Weekly / Daily / H4 Opening (institutional refs) ----------
export function computeSessionOpens(htf: Candle[], d = new Date()): { dailyOpen: number | null; weeklyOpen: number | null } {
  if (!htf.length) return { dailyOpen: null, weeklyOpen: null };
  const today = new Date(d); today.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday 00:00 UTC
  const dailyCandle = htf.find(c => c.t >= today.getTime());
  const weeklyCandle = htf.find(c => c.t >= weekStart.getTime());
  return {
    dailyOpen: dailyCandle?.o ?? null,
    weeklyOpen: weeklyCandle?.o ?? null,
  };
}

// ============================================================
// EXPERT-TIER DETECTORS (expands the desk past 30 experts)
// ============================================================

// ---------- Expert 26: Asian range expansion ----------
// The Asian session (00:00–06:00 UTC) builds the range that London/NY expand
// out of. A trade in the direction of the break away from that range is
// aligned with the daily expansion leg.
export function detectAsianRange(
  ltf: Candle[],
  lastPrice: number,
  dir: "BUY" | "SELL" | "WAIT",
): { aligned: boolean; detail: string; high: number | null; low: number | null } {
  if (dir === "WAIT" || !ltf.length) return { aligned: false, detail: "No direction", high: null, low: null };
  const now = new Date(ltf[ltf.length - 1].t);
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const asian = ltf.filter((c) => c.t >= dayStart && c.t < dayStart + 6 * 3600_000);
  if (asian.length < 3) return { aligned: false, detail: "Asian range not formed yet", high: null, low: null };
  const high = Math.max(...asian.map((c) => c.h));
  const low = Math.min(...asian.map((c) => c.l));
  const aligned = dir === "BUY" ? lastPrice > high : lastPrice < low;
  const detail = aligned
    ? `Price expanding ${dir === "BUY" ? "above" : "below"} Asian range (${low.toFixed(2)}–${high.toFixed(2)})`
    : `Price still inside/against Asian range (${low.toFixed(2)}–${high.toFixed(2)})`;
  return { aligned, detail, high, low };
}

// ---------- Expert 27: Daily open side ----------
export function detectDailyOpenSide(
  dailyOpen: number | null,
  lastPrice: number,
  dir: "BUY" | "SELL" | "WAIT",
): { aligned: boolean; detail: string } {
  if (dir === "WAIT" || dailyOpen == null) return { aligned: false, detail: "Daily open unavailable" };
  const aligned = dir === "BUY" ? lastPrice > dailyOpen : lastPrice < dailyOpen;
  return {
    aligned,
    detail: `${lastPrice > dailyOpen ? "Above" : "Below"} daily open ${dailyOpen.toFixed(2)} — trade is ${dir}`,
  };
}

// ---------- Expert 28: ATR room to first target ----------
export function detectAtrRoom(
  candles: Candle[],
  entry: number,
  tp1: number,
): { ok: boolean; detail: string } {
  const atr = computeATR(candles);
  if (!atr) return { ok: false, detail: "ATR unavailable" };
  const dist = Math.abs(tp1 - entry);
  const mult = dist / atr;
  return {
    ok: mult >= 1,
    detail: `TP1 is ${mult.toFixed(2)}× ATR (${atr.toFixed(2)}) away`,
  };
}

// ---------- Expert 29: LTF momentum agreement ----------
// Two of the last three closes pushing in trade direction = live momentum,
// not a stalling tape.
export function detectLtfMomentum(
  ltf: Candle[],
  dir: "BUY" | "SELL" | "WAIT",
): { aligned: boolean; detail: string } {
  if (dir === "WAIT" || ltf.length < 4) return { aligned: false, detail: "Not enough candles" };
  const last3 = ltf.slice(-3);
  const up = last3.filter((c) => c.c > c.o).length;
  const down = last3.length - up;
  const aligned = dir === "BUY" ? up >= 2 : down >= 2;
  return { aligned, detail: `Last 3 LTF closes: ${up} bullish / ${down} bearish` };
}

// ---------- Expert 30: Range position (avoid mid-range entries) ----------
export function detectRangePosition(
  ltf: Candle[],
  entry: number,
  lookback = 40,
): { ok: boolean; detail: string } {
  const slice = ltf.slice(-lookback);
  if (slice.length < 10) return { ok: false, detail: "Not enough candles" };
  const hi = Math.max(...slice.map((c) => c.h));
  const lo = Math.min(...slice.map((c) => c.l));
  const span = Math.max(hi - lo, 1e-9);
  const pos = (entry - lo) / span; // 0 = range low, 1 = range high
  const ok = pos <= 0.4 || pos >= 0.6;
  return { ok, detail: `Entry sits at ${(pos * 100).toFixed(0)}% of the recent range` };
}

// ---------- Expert 31: Swing room / clear path to target ----------
// A protected swing sitting between entry and TP1 is a wall; institutions
// rarely deliver straight through it on the first leg.
export function detectSwingRoom(
  swings: Swing[],
  entry: number,
  tp1: number,
  dir: "BUY" | "SELL" | "WAIT",
): { clear: boolean; detail: string } {
  if (dir === "WAIT" || !swings.length) return { clear: false, detail: "No swings available" };
  const recent = swings.slice(-14);
  const blockers = recent.filter((s) =>
    dir === "BUY"
      ? s.kind === "high" && s.price > entry && s.price < tp1
      : s.kind === "low" && s.price < entry && s.price > tp1,
  );
  return {
    clear: blockers.length === 0,
    detail: blockers.length
      ? `${blockers.length} opposing swing(s) between entry and TP1 (nearest ${blockers[0].price.toFixed(2)})`
      : "No blocking swing between entry and TP1",
  };
}
