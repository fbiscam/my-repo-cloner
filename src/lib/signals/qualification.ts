// Single source of truth for "is this setup allowed to become an alert?".
//
// Both the manual scan path and the scheduled auto-scan run these exact
// rules, so thresholds, HTF alignment, grading, level validity and price
// freshness can no longer drift apart between the two surfaces.
//
// Pure module: no network, no DB, no clock reads (the caller passes `now`).

export type Direction = "BUY" | "SELL";

/**
 * Global quality floor. Runtime config may raise it, never lower it.
 * Kept at 75 — quality is enforced by the confluence/veto/regime gates
 * below plus the per-session calibration bump, not by the raw number.
 */
export const MIN_CONFIDENCE = 75;
/** Counter-trend (against HTF bias) needs much higher conviction. */
export const COUNTER_TREND_MIN_CONFIDENCE = 88;
/** Outside an active killzone only an exceptional setup may fire. */
export const OUTSIDE_KILLZONE_MIN_CONFIDENCE = 85;
/** Ranging tape needs more conviction; choppy tape is blocked outright. */
export const RANGING_MIN_CONFIDENCE = 82;

/** Mandatory ICT confluences out of the tracked checklist. */
export const MIN_CONFLUENCES = 4;
/** Broadcast tickets must carry at least a 2R target. */
export const MIN_RR = 2;
/** A live tick older than this must not be used for gating decisions. */
export const MAX_TICK_AGE_MS = 5 * 60_000;

/** Setup checks coming from the scoring engine (`plan.setupChecks`). */
export type SetupCheckLike = { key: string; pass: boolean; label?: string };

/**
 * Core ICT confluence buckets. A bucket passes when ANY of its member
 * checks passed, so alternative detectors for the same idea still count.
 */
export const CONFLUENCE_BUCKETS: Record<string, string[]> = {
  bias: ["bias", "htf_poi"],
  sweep: ["sweep", "turtle", "eqhl"],
  structure: ["structure", "displacement"],
  poi: ["zone", "confluence", "mitigation", "ce"],
  pd: ["pd", "rejection"],
};

export type ConfluenceSummary = {
  passed: string[];
  failed: string[];
  count: number;
  biasAligned: boolean;
  sweepConfirmed: boolean;
  structureConfirmed: boolean;
  /** Hard engine vetoes (setupChecks pushed with a `veto_` prefix). */
  vetoes: string[];
};

export function summarizeConfluences(checks: SetupCheckLike[] | null | undefined): ConfluenceSummary {
  const list = Array.isArray(checks) ? checks : [];
  const byKey = new Map(list.map((c) => [String(c.key), !!c.pass]));
  const passed: string[] = [];
  const failed: string[] = [];
  for (const [bucket, keys] of Object.entries(CONFLUENCE_BUCKETS)) {
    const known = keys.filter((k) => byKey.has(k));
    // Unknown bucket (detector not computed) counts as NOT passed — fail closed.
    const ok = known.some((k) => byKey.get(k) === true);
    (ok ? passed : failed).push(bucket);
  }
  const vetoes = list
    .filter((c) => String(c.key).startsWith("veto_") || String(c.key).endsWith("_veto"))
    .map((c) => String(c.key));
  return {
    passed,
    failed,
    count: passed.length,
    biasAligned: passed.includes("bias"),
    sweepConfirmed: passed.includes("sweep"),
    structureConfirmed: passed.includes("structure"),
    vetoes,
  };
}


/** Plausible quote ranges — a cross priced outside these is a scale bug. */
export const PAIR_PRICE_RANGE: Record<string, [number, number]> = {
  XAUUSD: [500, 20_000],
};

export function isPriceScaleValid(pair: string, price: number): boolean {
  const range = PAIR_PRICE_RANGE[pair.toUpperCase()];
  if (!Number.isFinite(price) || price <= 0) return false;
  // Unknown pair: only reject non-finite/negative, do not guess a range.
  if (!range) return true;
  return price >= range[0] && price <= range[1];
}

export function gradeFor(confidence: number): "A+" | "A" | "B" | "C" {
  const c = Math.round(confidence);
  if (c >= 92) return "A+";
  if (c >= 85) return "A";
  if (c >= 70) return "B";

  return "C";
}

export function sessionFor(utcHour: number): string {
  if (utcHour < 7) return "Asia";
  if (utcHour < 12) return "London";
  if (utcHour < 16) return "London/NY Overlap";
  if (utcHour < 21) return "New York";
  return "After Hours";
}

/** Recognize only active trading-session labels; "Outside Killzone" must fail. */
export function isActiveKillzone(label: string | null | undefined): boolean {
  const value = String(label ?? "").trim().toLowerCase();
  if (!value || /(outside|none|off|no killzone|inactive|closed)/i.test(value)) return false;
  return /(london|new york|ny\b|asia|tokyo|frankfurt|silver bullet|killzone)/i.test(value);
}

/** Gold trades Sunday 22:00 UTC → Friday 21:00 UTC. */
export function isMarketClosed(now: Date): boolean {
  const dow = now.getUTCDay();
  const h = now.getUTCHours();
  return dow === 6 || (dow === 5 && h >= 21) || (dow === 0 && h < 22);
}

export type QualifyInput = {
  pair: string;
  direction?: string | null;
  confidence: number;
  entry: number;
  sl: number;
  /** Preferred target first; the first finite value is used. */
  tpCandidates: Array<number | null | undefined>;
  htfBias?: string | null;
  /** UTC hour of the scan, used for the session-relaxed HTF gate. */
  utcHour: number;
  inKillzone?: boolean;
  minConf?: number;
  minRR?: number;
  /** Engine setup checks — used for the mandatory confluence gate. */
  checks?: SetupCheckLike[] | null;
  /** Market regime from the engine ("trending" | "ranging" | "choppy" | "volatile"). */
  regime?: string | null;
  /** Skip the confluence/regime layer (used by back-tests/replays). */
  skipConfluenceGate?: boolean;
};


export type QualifyReject = { ok: false; reason: string; detail?: Record<string, unknown> };
export type QualifyPass = {
  ok: true;
  direction: Direction;
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  riskDist: number;
  confidence: number;
  grade: "A+" | "A" | "B" | "C";
  session: string;
  /** True when TP was stretched up to the 2R floor. */
  tpAdjusted: boolean;
  /** Which core ICT confluences backed this ticket. */
  confluences: string[];
};
export type QualifyResult = QualifyPass | QualifyReject;

export function qualifySignal(input: QualifyInput): QualifyResult {
  const pair = String(input.pair ?? "").toUpperCase();
  const dir = input.direction === "BUY" ? "BUY" : input.direction === "SELL" ? "SELL" : null;
  if (!dir) return { ok: false, reason: "no_direction" };

  const minConf = Math.max(MIN_CONFIDENCE, Number(input.minConf ?? MIN_CONFIDENCE) || MIN_CONFIDENCE);
  const conf = Number(input.confidence);
  if (!Number.isFinite(conf)) return { ok: false, reason: "no_confidence" };
  if (conf < minConf) return { ok: false, reason: "below_threshold", detail: { conf, minConf } };

  // ---- Confluence + veto layer (the 85% accuracy gate) ----
  const gateOn = !input.skipConfluenceGate;
  const cf = summarizeConfluences(input.checks);
  if (gateOn && Array.isArray(input.checks) && input.checks.length > 0) {
    if (cf.vetoes.length > 0) {
      return { ok: false, reason: "hard_veto", detail: { vetoes: cf.vetoes } };
    }
    if (cf.count < MIN_CONFLUENCES) {
      return {
        ok: false,
        reason: "insufficient_confluence",
        detail: { passed: cf.passed, failed: cf.failed, need: MIN_CONFLUENCES },
      };
    }
  }

  // Regime discipline: choppy tape never trades; ranging needs extra conviction.
  const regime = String(input.regime ?? "").toLowerCase();
  if (gateOn && regime) {
    if (regime === "choppy") {
      return { ok: false, reason: "regime_choppy", detail: { regime } };
    }
    if ((regime === "ranging" || regime === "volatile") && conf < RANGING_MIN_CONFIDENCE) {
      return { ok: false, reason: "regime_low_quality", detail: { regime, conf, need: RANGING_MIN_CONFIDENCE } };
    }
  }

  // HTF bias alignment is now mandatory. A counter-trend / neutral-bias setup
  // only survives at ≥92% conviction WITH a confirmed sweep and structure shift.
  const htfBias = String(input.htfBias ?? "neutral");
  const strictlyAligned =
    (dir === "BUY" && htfBias === "bullish") || (dir === "SELL" && htfBias === "bearish");
  const exceptional =
    conf >= COUNTER_TREND_MIN_CONFIDENCE &&
    (!gateOn || (cf.sweepConfirmed && cf.structureConfirmed));
  if (!strictlyAligned && !exceptional) {
    return { ok: false, reason: "htf_bias_conflict", detail: { htfBias, dir, conf } };
  }

  // Killzone gate: mandatory. Only a ≥95% setup may fire outside a session.
  const inKillzone = !!input.inKillzone;
  if (!inKillzone && conf < OUTSIDE_KILLZONE_MIN_CONFIDENCE) {
    return { ok: false, reason: "outside_killzone", detail: { conf } };
  }


  const entry = Number(input.entry);
  const sl = Number(input.sl);
  const tpRaw = input.tpCandidates.map(Number).find((n) => Number.isFinite(n) && n > 0);
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || tpRaw === undefined) {
    return { ok: false, reason: "invalid_levels" };
  }
  // Fail closed on scale-invalid cross prices instead of shipping a trade.
  if (!isPriceScaleValid(pair, entry) || !isPriceScaleValid(pair, sl) || !isPriceScaleValid(pair, tpRaw)) {
    return { ok: false, reason: "price_scale_invalid", detail: { pair, entry, sl, tp: tpRaw } };
  }

  const riskDist = Math.abs(entry - sl);
  if (riskDist <= 0) return { ok: false, reason: "zero_risk_distance" };
  if (dir === "BUY" && sl >= entry) return { ok: false, reason: "levels_wrong_side" };
  if (dir === "SELL" && sl <= entry) return { ok: false, reason: "levels_wrong_side" };

  const minRR = Number(input.minRR ?? MIN_RR) || MIN_RR;
  let tp = tpRaw;
  let tpAdjusted = false;
  const onCorrectSide = dir === "BUY" ? tp > entry : tp < entry;
  if (!onCorrectSide || Math.abs(tp - entry) < riskDist * minRR) {
    tp = dir === "BUY" ? entry + riskDist * minRR : entry - riskDist * minRR;
    tpAdjusted = true;
  }
  const rr = Math.abs(tp - entry) / riskDist;

  return {
    ok: true,
    direction: dir,
    entry,
    sl,
    tp,
    rr,
    riskDist,
    confidence: conf,
    grade: gradeFor(conf),
    session: sessionFor(input.utcHour),
    tpAdjusted,
    confluences: cf.passed,

  };
}

export type FreshnessInput = {
  direction: Direction;
  entry: number;
  sl: number;
  tp: number;
  livePrice: number | null | undefined;
  /** Epoch ms of the live tick, when the feed provides one. */
  tickTs?: number | null;
  nowMs: number;
  maxTickAgeMs?: number;
};

export type FreshnessResult = { ok: boolean; reason: string; detail?: Record<string, unknown> };

/**
 * Refuse to broadcast on a stale or already-consumed price.
 * Fails CLOSED: a missing or aged tick blocks the alert rather than
 * shipping levels the market has already left behind.
 */
export function checkFreshness(input: FreshnessInput): FreshnessResult {
  const lp = Number(input.livePrice);
  if (!Number.isFinite(lp) || lp <= 0) {
    return { ok: false, reason: "no_live_price" };
  }
  const maxAge = input.maxTickAgeMs ?? MAX_TICK_AGE_MS;
  if (input.tickTs != null && Number.isFinite(input.tickTs)) {
    const age = input.nowMs - Number(input.tickTs);
    if (age > maxAge) {
      return { ok: false, reason: "stale_tick", detail: { age_ms: age } };
    }
  }
  const isBuy = input.direction === "BUY";
  const riskDist = Math.abs(input.entry - input.sl);
  const rewardDist = Math.abs(input.tp - input.entry);
  if (riskDist <= 0) return { ok: false, reason: "zero_risk_distance" };

  const towardSL = isBuy ? input.entry - lp : lp - input.entry;
  const towardTP = isBuy ? lp - input.entry : input.entry - lp;
  if (towardSL > 0.4 * riskDist) {
    return { ok: false, reason: "drifted_toward_sl", detail: { entry: input.entry, live: lp } };
  }
  if (rewardDist > 0 && towardTP > 0.6 * rewardDist) {
    return { ok: false, reason: "already_past_tp", detail: { entry: input.entry, live: lp } };
  }
  return { ok: true, reason: "fresh" };
}
