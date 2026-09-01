import { createServerFn } from "@tanstack/react-start";

import { z } from "zod";
import { callChatCompletion } from "@/lib/ai-gateway";
import { runRules, verdictFor, type Signal, type Verdict } from "@/lib/scam-check/rules";

const InputSchema = z.object({
  kind: z.enum(["link", "email", "text"]),
  value: z.string().trim().min(1, "Enter something to check").max(4000, "Input is too long"),
});

export type ScamCheckResult = {
  kind: "link" | "email" | "text";
  subject: string;
  score: number;
  verdict: Verdict;
  signals: Signal[];
  summary: string;
  recommendation: string;
  aiUsed: boolean;
  note?: string;
};

// -- crude per-IP rate limit (per worker instance) --------------------------
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > MAX_PER_WINDOW;
}

const SYSTEM = `You are a fraud analyst. You judge whether a link, email address, or message is a scam/phishing/spam attempt.
You receive the raw input plus deterministic heuristic signals already detected.
Return STRICT JSON only:
{"score": number 0-100 risk, "summary": string (max 45 words, plain simple English), "recommendation": string (max 30 words, what the person should do), "extra_signals": [{"label": string, "detail": string, "severity": "low"|"medium"|"high"}]}
Rules: be decisive but fair. Write every string in plain English only — never mix in other languages. A normal well-known domain or a plain harmless message must score low (<25). Never invent facts about domain age or blacklists you cannot verify. extra_signals may be an empty array; include at most 3 that the heuristics missed.`;

export const scamCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<ScamCheckResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("cf-connecting-ip") ||
      (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
      "unknown";

    const rules = runRules(data.kind, data.value);

    if (rateLimited(ip)) {
      return {
        kind: rules.kind,
        subject: rules.subject,
        score: rules.score,
        verdict: verdictFor(rules.score),
        signals: rules.signals,
        summary: "Heuristic result only — you have run many checks in a short time.",
        recommendation: "Wait a minute and run the check again for the full AI review.",
        aiUsed: false,
        note: "Rate limit reached — AI review skipped.",
      };
    }

    const label = data.kind === "link" ? "URL" : data.kind === "email" ? "EMAIL ADDRESS" : "MESSAGE TEXT";
    const userMsg = [
      `TYPE: ${label}`,
      `INPUT:\n${data.value.slice(0, 4000)}`,
      "",
      "HEURISTIC SIGNALS ALREADY DETECTED:",
      ...rules.signals.map((s) => `- [${s.severity}] ${s.label}: ${s.detail}`),
      "",
      `HEURISTIC RISK SCORE: ${rules.score}/100`,
    ].join("\n");

    let aiScore: number | null = null;
    let summary = "";
    let recommendation = "";
    const extra: Signal[] = [];
    let note: string | undefined;

    try {
      const res = await callChatCompletion({
        models: ["openai/gpt-5.4-mini", "google/gemini-2.5-flash", "openai/gpt-5.5"],
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        jsonMode: true,
        maxTokens: 700,
        timeoutMs: 20000,
        retriesPerModel: 1,
        stage: "scam_check",
      });
      const parsed = JSON.parse(res.content) as {
        score?: unknown;
        summary?: unknown;
        recommendation?: unknown;
        extra_signals?: unknown;
      };
      const s = Number(parsed.score);
      if (Number.isFinite(s)) aiScore = Math.max(0, Math.min(100, Math.round(s)));
      summary = String(parsed.summary ?? "").slice(0, 400);
      recommendation = String(parsed.recommendation ?? "").slice(0, 300);
      if (Array.isArray(parsed.extra_signals)) {
        for (const raw of parsed.extra_signals.slice(0, 3)) {
          const o = raw as { label?: unknown; detail?: unknown; severity?: unknown };
          const lbl = String(o?.label ?? "").slice(0, 80);
          if (!lbl) continue;
          const sev = ["low", "medium", "high"].includes(String(o?.severity))
            ? (String(o?.severity) as "low" | "medium" | "high")
            : "low";
          extra.push({
            label: lbl,
            detail: String(o?.detail ?? "").slice(0, 240),
            weight: 0,
            severity: sev,
          });
        }
      }
    } catch {
      note = "AI review unavailable right now — this result is based on the rule engine only.";
    }

    const aiUsed = aiScore !== null;
    const finalScore = aiUsed ? Math.round(rules.score * 0.55 + (aiScore as number) * 0.45) : rules.score;
    const verdict = verdictFor(finalScore);

    if (!summary) {
      summary =
        verdict === "scam"
          ? "Multiple strong fraud indicators were found. Treat this as a scam attempt."
          : verdict === "suspicious"
            ? "Some warning signs were found. Verify through an official channel before acting."
            : "No meaningful fraud indicators were found in this check.";
    }
    if (!recommendation) {
      recommendation =
        verdict === "safe"
          ? "Stay alert anyway: never share passwords, OTPs or wallet phrases."
          : "Do not click, reply, pay or share any code. Contact the company through its official app or website.";
    }

    return {
      kind: rules.kind,
      subject: rules.subject,
      score: finalScore,
      verdict,
      signals: [...rules.signals, ...extra],
      summary,
      recommendation,
      aiUsed,
      ...(note ? { note } : {}),
    };
  });
