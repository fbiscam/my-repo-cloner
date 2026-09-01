// Shared Lovable AI Gateway helper used by every server-side analyzer call.
//
// Purpose:
//   1. One place to switch models (25-year-veteran quality tier).
//   2. Auto retry (429 / 5xx / timeout) with exponential backoff.
//   3. Model fallback chain when the primary is exhausted.
//   4. Priority-tier ("fast mode") only for models that support it.
//   5. Clear typed errors so callers can surface the right message.
//
// This module has NO Supabase / Node-only imports, so it can be top-level
// imported from *.functions.ts without leaking a server-only surface.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

// Models that support the OpenAI priority serving tier (fast mode).
// Anything else must not send service_tier: "priority".
const PRIORITY_TIER_MODELS = new Set([
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5.2",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.5",
  "google/gemini-3.7-flash",
  "google/gemini-3.1-pro-preview",
]);

export type CallChatOptions = {
  // Ordered list: try [0] first; if it exhausts retries, try [1]; etc.
  models: string[];
  messages: ChatMessage[];
  // Force JSON response mode (uses response_format: json_object).
  jsonMode?: boolean;
  maxTokens?: number;
  // Milliseconds per attempt. Defaults to 25000.
  timeoutMs?: number;
  // Hard wall-clock budget for the whole chain-walk (all models + retries).
  deadlineMs?: number;

  // If true and the model supports priority tier, request fast mode.
  priority?: boolean;
  // Max attempts per model on retryable failures (429, 5xx, timeout).
  retriesPerModel?: number;
  // For telemetry / debugging.
  stage?: string;
};

export class AiGatewayError extends Error {
  status: number;
  terminal: boolean;
  constructor(message: string, status: number, terminal: boolean) {
    super(message);
    this.status = status;
    this.terminal = terminal;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function providerConfigured(model: string): boolean {
  if (model.startsWith("blackboxai/")) return Boolean(process.env.BLACKBOX_API_KEY);
  if (model.startsWith("nvapi/")) return Boolean(process.env.NVIDIA_API_KEY);
  if (model.startsWith("bmind/")) return Boolean(process.env.OPENAI_API_KEY || process.env.BLUESMINDS_API_KEY);
  if (model.startsWith("dsofficial/")) return Boolean(process.env.DEEPSEEK_API_KEY);
  if (model.startsWith("oai/")) return Boolean(process.env.OPENAI_API_KEY);
  return Boolean(process.env.LOVABLE_API_KEY);
}

// -------- Per-worker model health cache -----------------------------------
// When a model returns "model_not_found" (503/404) or a hard upstream error
// (500 "do_request_failed", ngrok offline), we mark it unhealthy for a TTL
// so the next chain-walk skips it instead of paying its full timeout.
const modelUnhealthyUntil = new Map<string, number>();
export function markModelUnhealthy(model: string, ttlMs: number): void {
  modelUnhealthyUntil.set(model, Date.now() + ttlMs);
}
export function isModelUnhealthy(model: string): boolean {
  const until = modelUnhealthyUntil.get(model);
  if (!until) return false;
  if (until < Date.now()) { modelUnhealthyUntil.delete(model); return false; }
  return true;
}

export type UsageInfo = { promptTokens: number; completionTokens: number; totalTokens: number };


async function singleAttempt(
  model: string,
  opts: CallChatOptions,
  apiKey: string | undefined,
  timeoutMs: number,
): Promise<{ content: string; usage: UsageInfo }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  // Route by prefix:
  //   `blackboxai/*` → Blackbox API
  //   `nvapi/*`      → NVIDIA Integrate API (strip prefix to get real model id)
  //   `bmind/*`      → Bluesminds unified gateway (OpenAI-compatible)
  //   `dsofficial/*` → DeepSeek official API (OpenAI-compatible)
  //   else           → Lovable AI Gateway
  const isBlackbox = model.startsWith("blackboxai/");
  const isNvidia = model.startsWith("nvapi/");
  const isBmind = model.startsWith("bmind/");
  const isDsOfficial = model.startsWith("dsofficial/");
  const isOai = model.startsWith("oai/");
  const blackboxKey = process.env.BLACKBOX_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY;
  // The newest Bluesminds key was saved under OPENAI_API_KEY, so prefer it and
  // fall back to the legacy BLUESMINDS_API_KEY.
  const bmindKey = process.env.OPENAI_API_KEY || process.env.BLUESMINDS_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const endpoint = isOai
    ? "https://api.openai.com/v1/chat/completions"
    : isBlackbox
    ? "https://api.blackbox.ai/v1/chat/completions"
    : isNvidia
    ? "https://integrate.api.nvidia.com/v1/chat/completions"
    : isBmind
    ? "https://api.bluesminds.com/v1/chat/completions"
    : isDsOfficial
    ? "https://api.deepseek.com/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isBlackbox) {
    if (!blackboxKey) throw new AiGatewayError("BLACKBOX_API_KEY missing on server", 0, true);
    headers["Authorization"] = `Bearer ${blackboxKey}`;
  } else if (isNvidia) {
    if (!nvidiaKey) throw new AiGatewayError("NVIDIA_API_KEY missing on server", 0, true);
    headers["Authorization"] = `Bearer ${nvidiaKey}`;
  } else if (isBmind) {
    if (!bmindKey) throw new AiGatewayError("BLUESMINDS_API_KEY missing on server", 0, true);
    headers["Authorization"] = `Bearer ${bmindKey}`;
  } else if (isDsOfficial) {
    if (!deepseekKey) throw new AiGatewayError("DEEPSEEK_API_KEY missing on server", 0, true);
    headers["Authorization"] = `Bearer ${deepseekKey}`;
  } else if (isOai) {
    if (!openaiKey) throw new AiGatewayError("OPENAI_API_KEY missing on server", 0, true);
    headers["Authorization"] = `Bearer ${openaiKey}`;
  } else {
    if (!apiKey) throw new AiGatewayError("LOVABLE_API_KEY missing on server", 0, true);
    headers["Lovable-API-Key"] = apiKey;
  }


  // Strip provider prefixes to expose the real upstream model id.
  const wireModel = isOai
    ? model.slice("oai/".length)
    : isNvidia
    ? model.slice("nvapi/".length)
    : isBmind
    ? model.slice("bmind/".length)
    : isDsOfficial
    ? model.slice("dsofficial/".length)
    : model;

  // Determinism: temperature 0 + top_p 1 + stable seed so the same input
  // produces the same confidence within a short window. Seed derives from the
  // conversation content bucketed to the current minute — prevents 61% → 55%
  // flip-flop on back-to-back scans of the same setup.
  const seedBase = (opts.messages.map((m) => m.content).join("|") + "|" + Math.floor(Date.now() / 60000));
  let seed = 0;
  for (let i = 0; i < seedBase.length; i++) seed = ((seed << 5) - seed + seedBase.charCodeAt(i)) | 0;
  seed = Math.abs(seed) || 1;

  // GPT-5 family only accepts default temperature (1); skip temp/top_p there,
  // keep seed for determinism.
  const isGpt5Family = /(^|\/)gpt-5/i.test(wireModel);

  const body: Record<string, unknown> = {
    model: wireModel,
    messages: opts.messages,
    seed,
    ...(isGpt5Family ? {} : { temperature: 0, top_p: 1 }),
  };
  // Blackbox/NVIDIA/Bluesminds/DeepSeek-official: don't force response_format — rely on system prompt.
  if (opts.jsonMode && isOai) body.response_format = { type: "json_object" };
  else if (opts.jsonMode && !isBlackbox && !isNvidia && !isBmind && !isDsOfficial && !isOai) body.response_format = { type: "json_object" };
  if (opts.maxTokens) {
    if ((isOai && /^gpt-5/i.test(wireModel)) || (!isBlackbox && !isNvidia && !isBmind && !isDsOfficial && !isOai && model.startsWith("openai/gpt-5"))) {
      body.max_completion_tokens = opts.maxTokens;
    } else {
      body.max_tokens = opts.maxTokens;
    }
  }
  if (!isBlackbox && !isNvidia && !isBmind && !isDsOfficial && !isOai && opts.priority && PRIORITY_TIER_MODELS.has(model)) {
    body.service_tier = "priority";
  }



  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(t);
    if (err?.name === "AbortError") {
      throw new AiGatewayError("Server busy — please try again in a moment.", 0, false);
    }
    throw new AiGatewayError("Server busy — please try again in a moment.", 0, false);
  }
  clearTimeout(t);

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const terminal = (isBlackbox || isNvidia || isBmind || isDsOfficial || isOai)
      ? !(res.status === 429 || res.status >= 500 || res.status === 403 || res.status === 400 || res.status === 401 || res.status === 404)
      : !(res.status === 429 || res.status >= 500);

    let msg: string;
    if (res.status === 429) msg = "Server busy — please try again in a moment.";
    else if (res.status === 503 || res.status === 502 || res.status === 504) msg = "Server busy — please try again in a moment.";
    else if (res.status >= 500) msg = "Server busy — please try again in a moment.";
    else if (res.status === 402) msg = "AI credits exhausted. Please top up your workspace.";
    else if (res.status === 401) msg = "AI key rejected. Please contact support.";
    else if (res.status === 400) msg = "Server busy — please try again in a moment.";
    else msg = "Server busy — please try again in a moment.";
    // Attach Retry-After (seconds) as ms, if provided by the upstream.
    const ra = res.headers.get("retry-after");
    const raMs = ra ? (Number.isFinite(+ra) ? +ra * 1000 : Math.max(0, Date.parse(ra) - Date.now())) : 0;
    const e = new AiGatewayError(msg, res.status, terminal);
    (e as any).retryAfterMs = Number.isFinite(raMs) && raMs > 0 ? Math.min(raMs, 8000) : 0;
    // Mark model unhealthy for TTL when it looks structurally dead
    // (not just busy). This lets the runner skip it on the next call
    // instead of burning retries + timeout on a known-dead upstream.
    const bodyLower = txt.toLowerCase();
    const modelNotFound = bodyLower.includes("model_not_found") || bodyLower.includes("no available channel");
    const upstreamDead = bodyLower.includes("upstream error") || bodyLower.includes("do_request_failed") || bodyLower.includes("endpoint") && bodyLower.includes("offline") || bodyLower.includes("err_ngrok");
    if (res.status === 404 || modelNotFound) {
      markModelUnhealthy(model, 15 * 60 * 1000); // 15 min — model not provisioned
    } else if (res.status >= 500 && upstreamDead) {
      markModelUnhealthy(model, 5 * 60 * 1000);  // 5 min — upstream flaky
    }
    throw e;
  }



  const json: any = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.length) {
    throw new AiGatewayError("AI returned empty response.", 0, false);
  }
  const u = json?.usage ?? {};
  let promptTokens = Number(u.prompt_tokens ?? u.promptTokens ?? 0) || 0;
  let completionTokens = Number(u.completion_tokens ?? u.completionTokens ?? 0) || 0;
  let totalTokens = Number(u.total_tokens ?? u.totalTokens ?? 0) || 0;
  // Fallback: some providers (e.g. Bluesminds/bmind) omit `usage`. Approximate
  // from character counts (~4 chars/token) so the billing history isn't blank.
  if (promptTokens === 0 && completionTokens === 0) {
    try {
      const promptChars = (opts.messages ?? []).reduce(
        (n, m) => n + (typeof m?.content === "string" ? m.content.length : 0),
        0,
      );
      promptTokens = Math.max(1, Math.round(promptChars / 4));
      completionTokens = Math.max(1, Math.round(String(content).length / 4));
      totalTokens = promptTokens + completionTokens;
    } catch {}
  }
  if (totalTokens === 0) totalTokens = promptTokens + completionTokens;
  const usage: UsageInfo = { promptTokens, completionTokens, totalTokens };
  return { content, usage };
}


// Main entrypoint. Returns raw assistant content string plus model/usage.
// Throws AiGatewayError with `terminal` flag on final failure.
export async function callChatCompletion(opts: CallChatOptions): Promise<{ content: string; model: string; usage: UsageInfo }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const timeoutMs = opts.timeoutMs ?? 25000;
  const retriesPerModel = Math.max(1, opts.retriesPerModel ?? 3);
  // Hard wall-clock budget for the whole chain-walk (all models + retries).
  // Without it a busy provider chain can keep a scan open until the platform
  // request timeout kills it, which is what made scans "hang" with no result.
  const deadlineMs = opts.deadlineMs ?? Math.max(timeoutMs + 5000, 45000);
  const startedAt = Date.now();
  const remaining = () => deadlineMs - (Date.now() - startedAt);
  const configured = opts.models.filter(Boolean).filter(providerConfigured);
  if (!configured.length) throw new AiGatewayError(`No configured AI provider for ${opts.stage ?? "AI call"}`, 0, true);
  // Skip models that recently returned model_not_found or hard upstream errors.
  // If every candidate is cooling, fall back to the original list so we still
  // attempt (in case the outage cleared).
  const healthy = configured.filter((m) => !isModelUnhealthy(m));
  const models = healthy.length ? healthy : configured;


  let lastErr: AiGatewayError | null = null;

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    const isLastModel = mi === models.length - 1;
    for (let attempt = 1; attempt <= retriesPerModel; attempt++) {
      if (remaining() < 3000) {
        throw lastErr ?? new AiGatewayError("Server busy — please try again in a moment.", 0, false);
      }
      try {
        const attemptTimeout = Math.max(4000, Math.min(timeoutMs, remaining() - 1000));
        const { content, usage } = await singleAttempt(model, opts, apiKey, attemptTimeout);

        return { content, model, usage };
      } catch (err) {
        lastErr = err instanceof AiGatewayError
          ? err
          : new AiGatewayError(String((err as any)?.message ?? err), 0, false);

        // Terminal errors (auth, 402 credits, bad key, etc.) — do not retry
        // or fall back; caller must surface as-is.
        if (lastErr.terminal) {
          const isAuthOrBilling = lastErr.status === 401 || lastErr.status === 402 || lastErr.status === 403;
          if (isAuthOrBilling) throw lastErr;
          // Other terminals: still try next provider in the chain.
          break;
        }

        // On 429/503/502/504 or timeout (status 0), fall back to the next
        // provider immediately on the last retry attempt for this model.
        const busy = lastErr.status === 429 || lastErr.status === 503 || lastErr.status === 502 || lastErr.status === 504;
        if (busy && attempt >= 2 && !isLastModel) break; // hop provider fast

        if (attempt === retriesPerModel) break;

        // Exponential backoff w/ jitter, honoring upstream Retry-After (capped).
        const retryAfterMs = (lastErr as any).retryAfterMs as number | undefined;
        const base = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : 500 * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 250);
        await sleep(Math.min(6000, base + jitter));
      }
    }
  }

  throw lastErr ?? new AiGatewayError("AI call failed with no error captured", 0, false);
}

// -------- JSON convenience wrapper with brace-repair -----------------------

export function tryParseJsonLoose(raw: string): any {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  const clean = (s: string) =>
    s
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .replace(/[\x00-\x1F\x7F]/g, " ")
      .replace(/,\s*([}\]])/g, "$1");

  let parsed = tryParse(raw);
  if (parsed) return parsed;

  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return {};
  parsed = tryParse(m[0]) ?? tryParse(clean(m[0]));
  if (parsed) return parsed;

  // Auto-close unbalanced brackets.
  let s = clean(m[0]);
  const opens = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
  const opensA = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
  s = s.replace(/,\s*$/, "") + "]".repeat(Math.max(0, opensA)) + "}".repeat(Math.max(0, opens));
  return tryParse(s) ?? {};
}

// -------- Per-user soft rate limit (in-memory, per worker) -----------------

type Bucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, Bucket>();
const RATE_LIMIT_MAX = 30;         // requests
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // per hour

export function checkAnalyzeRateLimit(userId: string): { allowed: boolean; retryInSec: number } {
  const now = Date.now();
  const b = rateBuckets.get(userId);
  if (!b || b.resetAt < now) {
    rateBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryInSec: 0 };
  }
  if (b.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryInSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count++;
  return { allowed: true, retryInSec: 0 };
}

// -------- Per-symbol short-lived plan cache (in-memory, per worker) --------

type CacheEntry<T> = { value: T; expiresAt: number };
const planCache = new Map<string, CacheEntry<unknown>>();
const PLAN_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

export function getCachedPlan<T>(key: string): T | null {
  const e = planCache.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) { planCache.delete(key); return null; }
  return e.value as T;
}

export function setCachedPlan<T>(key: string, value: T, ttlMs: number = PLAN_CACHE_TTL_MS): void {
  planCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  // Light eviction: cap at 200 entries.
  if (planCache.size > 200) {
    const oldestKey = planCache.keys().next().value;
    if (oldestKey) planCache.delete(oldestKey);
  }
}

// -------- Model chains (single source of truth) ----------------------------

// Senior review = SEQUENTIAL "best-available" chain.
// Ordered strongest → weakest. The runner tries #1 first; if that model is
// down / rate-limited / times out, it hops to the next best one that responds.
// Health cache: markModelUnhealthy() is called automatically on 404 /
// model_not_found / "upstream do_request_failed" / ngrok-offline, so the next
// chain-walk skips a known-dead endpoint instead of paying its timeout.
// TTLs: 15 min for "model_not_found" (not provisioned), 5 min for flaky
// upstream. If every candidate is cooling, we still try the whole chain.
// NOTE (Aug 29 2026 live audit against the Bluesminds key): routable + fast =
// `gpt-5.6-sol` (best), `gpt-5.6-luna` (fastest), `gpt-5.2-chat`, `gpt-5-mini`,
// `gpt-4o`. `gpt-5.5` / `gpt-5.6-terra` / `kimi-k2.5` time out (>60s) and
// `deepseek-v4-pro` returns a bad upstream body, so they are out of the chains.

// Live-probed Aug 30 2026: only `gpt-5.6-sol`, `gpt-5.2-chat` and `gpt-4o`
// answer on Bluesminds. `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.5`,
// `gpt-5-mini`, `kimi-k2.5`, `gemma-4-26b`, `gpt-oss-20b` hang until timeout,
// `deepseek-v4-pro` 500s, the nemotron/llama ids are 410 Gone, and the NVIDIA
// deepseek endpoint never responds. Dead ids are removed from every chain so a
// scan no longer burns 30–60s per dead hop before falling back.
const WORKING_BMIND = [
  "bmind/gpt-5.6-sol",
  "bmind/gpt-5.2-chat",
  "bmind/gpt-4o",
  // Workspace-safe fallbacks. These use LOVABLE_API_KEY, so a stale or
  // unavailable Bluesminds route cannot silently remove AI review in another
  // browser or production worker.
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.7-flash",
] as const;
// Narration must return before the deterministic plan is presented. GPT-4o is
// the consistently low-latency route on Bluesminds, while GPT-5.6 Sol remains
// first for the mandatory senior review where maximum scrutiny matters.
const FAST_NARRATION_BMIND = [
  "bmind/gpt-4o",
  "google/gemini-3.7-flash",
  "bmind/gpt-5.6-sol",
  "bmind/gpt-5.2-chat",
] as const;

export const MODEL_CHAIN = {
  intent: WORKING_BMIND,
  narration: FAST_NARRATION_BMIND,
  seniorReview: WORKING_BMIND,
  macroContext: WORKING_BMIND,
  chat: WORKING_BMIND,
} as const;

export const MACRO_CONTEXT_CHAIN = WORKING_BMIND;

export const SENIOR_REVIEW_CHAIN = WORKING_BMIND;

// -------- Stage 2: independent SMC second-opinion chain --------------------
// A SECOND pass that must not reuse the senior-review primary, so the desk
// never rubber-stamps its own answer. This stage is ENRICHMENT ONLY — it can
// agree (small confidence lift) or flag a risk note, but never vetoes.
export const DEEPSEEK_REVIEW_CHAIN = [
  "bmind/gpt-5.2-chat",
  "google/gemini-3.7-flash",
  "bmind/gpt-4o",
  "bmind/gpt-5.6-sol",
] as const;

/** @deprecated legacy alias — use DEEPSEEK_REVIEW_CHAIN */
export const CROSS_CHECK_CHAIN = DEEPSEEK_REVIEW_CHAIN;

