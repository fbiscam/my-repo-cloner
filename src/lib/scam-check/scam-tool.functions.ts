import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { callChatCompletion } from "@/lib/ai-gateway";

const InputSchema = z.object({
  kind: z.enum(["broker", "link", "seller", "payment"]),
  value: z.string().trim().min(2, "Enter something to check").max(2000, "Input is too long"),
});

export type ScamToolFlag = {
  label: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

export type ScamToolResult = {
  kind: "broker" | "link" | "seller" | "payment";
  subject: string;
  score: number;
  verdict: "safe" | "suspicious" | "scam";
  summary: string;
  recommendation: string;
  flags: ScamToolFlag[];
  checklist: string[];
  aiUsed: boolean;
  note?: string;
};

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > MAX_PER_WINDOW;
}

function verdictFor(score: number): "safe" | "suspicious" | "scam" {
  if (score >= 60) return "scam";
  if (score >= 30) return "suspicious";
  return "safe";
}

// Deterministic pre-analysis so the AI always has grounded signals to review,
// and so the tool still works if the model is unavailable.
function heuristics(kind: ScamToolResult["kind"], value: string) {
  const v = value.toLowerCase();
  let score = 0;
  const flags: ScamToolFlag[] = [];
  const add = (w: number, label: string, detail: string, severity: ScamToolFlag["severity"]) => {
    score += w;
    flags.push({ label, detail, severity });
  };

  const pressure = [
    "guaranteed",
    "no risk",
    "100% profit",
    "double your",
    "get rich",
    "limited spots",
    "act now",
    "deposit urgently",
    "send funds",
    "account manager",
    "manage your account",
  ];
  for (const p of pressure) {
    if (v.includes(p)) add(12, "High-pressure language", `Contains the phrase "${p}".`, "high");
  }

  if (kind === "link") {
    if (/\b\d{1,3}(\.\d{1,3}){3}\b/.test(v))
      add(14, "Raw IP address", "The link points to an IP instead of a real domain.", "high");
    if (/(\.tk|\.ml|\.ga|\.cf|\.top|\.xyz|\.live|\.click|\.icu|\.rest)\b/.test(v))
      add(10, "High-risk domain ending", "Cheap TLDs are heavily abused by fraud sites.", "medium");
    if (v.includes("login") && v.includes("verify"))
      add(10, "Credential-harvest pattern", "URL mimics a login/verification page.", "high");
    if (/(paypa|amazo|appl3|binanc|coinbas|metaquot|mt[45]|tradingv)/.test(v))
      add(10, "Possible brand impersonation", "Looks like a lookalike of a known platform.", "medium");
    if (/bit\.ly|tinyurl|cutt\.ly|t\.co|is\.gd|shorturl/.test(v))
      add(8, "Shortened link", "Destination is hidden behind a URL shortener.", "medium");
    if (v.startsWith("http://")) add(6, "No HTTPS", "Traffic is not encrypted.", "medium");
  }

  if (kind === "seller") {
    if (/@(gmail|yahoo|hotmail|outlook|protonmail)\.com/.test(v))
      add(8, "Free personal email", "A real firm uses a company domain.", "medium");
    if (v.startsWith("@") || /t\.me\/|whatsapp|telegram/.test(v))
      add(8, "Chat-only identity", "Signal sellers hiding behind handles cannot be verified.", "medium");
    if (/vip|guru|fx|pips|millionaire|forexking|signals?/.test(v))
      add(6, "Typical signal-seller branding", "Name pattern common in copy-trade scams.", "low");
  }

  if (kind === "payment") {
    if (/\bT[A-Za-z0-9]{33}\b/.test(value) || /\b0x[a-fA-F0-9]{40}\b/.test(value))
      add(10, "Irreversible crypto transfer", "Crypto payments cannot be recalled or disputed.", "medium");
    if (/gift ?card|itunes|google play|steam|voucher/.test(v))
      add(30, "Gift-card payment request", "Almost always a scam — no broker accepts gift cards.", "high");
    if (/friends? ?(and|&)? ?family|f&f/.test(v))
      add(14, "No buyer protection", "Friends & Family payments waive chargeback rights.", "high");
    if (/western union|moneygram/.test(v))
      add(18, "Untraceable wire service", "Cash-transfer services are favoured by fraudsters.", "high");
  }

  if (kind === "broker") {
    if (/unregulated|offshore|st\.? vincent|marshall islands|comoros|seychelles/.test(v))
      add(16, "Weak or no regulation", "Offshore registration offers you almost no protection.", "high");
    if (/fca|asic|cysec|bafin|finma|sec\b|mifid|dfsa/.test(v))
      add(-8, "Names a real regulator", "Verify the licence number on the regulator's own register.", "low");
  }

  return { score: Math.max(0, Math.min(100, score)), flags };
}

const SYSTEM = `You are a senior financial-fraud investigator with 20+ years auditing brokers, signal sellers, payment fraud and phishing infrastructure in retail trading.
You are given: the CHECK TYPE, the user's INPUT, and deterministic heuristic signals already detected.
Return STRICT JSON only:
{"score": number 0-100 risk, "verdict": "safe"|"suspicious"|"scam", "summary": string (max 55 words, plain simple English), "recommendation": string (max 35 words, concrete next action), "flags": [{"label": string, "detail": string, "severity":"low"|"medium"|"high"}], "checklist": [string]}
Rules:
- Be decisive but fair. A well-known regulated firm or a plainly harmless input scores low (<25).
- Never invent licence numbers, blacklists, domain ages, or news you cannot verify. Say what should be verified instead.
- flags: up to 5 total, the most decision-relevant risks (you may keep or refine the heuristic ones).
- checklist: 3-5 short verification steps specific to this input.
- Plain English only, no other language, no markdown.`;

export const scamToolCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<ScamToolResult> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("cf-connecting-ip") ||
      (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
      "unknown";

    const base = heuristics(data.kind, data.value);
    const fallbackChecklist: Record<ScamToolResult["kind"], string[]> = {
      broker: [
        "Search the regulator's own public register for the exact legal entity name.",
        "Check the licence covers your country of residence.",
        "Test a small withdrawal before depositing more.",
      ],
      link: [
        "Type the official domain manually instead of clicking the link.",
        "Check the domain's WHOIS creation date.",
        "Never enter login details from a link you did not request.",
      ],
      seller: [
        "Ask for a verified track record on a third-party audited platform.",
        "Never give account credentials or trading authority to anyone.",
        "Search the handle plus the word 'scam' before paying.",
      ],
      payment: [
        "Only pay to the broker's own corporate account, never a personal one.",
        "Use a method with chargeback protection where possible.",
        "Refuse any request for gift cards or crypto to a personal wallet.",
      ],
    };

    const bail = (note: string): ScamToolResult => ({
      kind: data.kind,
      subject: data.value.slice(0, 200),
      score: base.score,
      verdict: verdictFor(base.score),
      summary:
        base.flags.length > 0
          ? "Heuristic screening found the risk signals listed below."
          : "No obvious red flags found by the automated screening. Always verify independently.",
      recommendation: "Verify independently before sending any money.",
      flags: base.flags,
      checklist: fallbackChecklist[data.kind],
      aiUsed: false,
      note,
    });

    if (rateLimited(ip)) return bail("Too many checks in a short time — AI review skipped.");

    const typeLabel = {
      broker: "BROKER / FIRM NAME",
      link: "WEBSITE / REFERRAL LINK",
      seller: "SIGNAL SELLER / ACCOUNT MANAGER IDENTITY",
      payment: "PAYMENT METHOD OR ADDRESS",
    }[data.kind];

    const userMsg = [
      `CHECK TYPE: ${typeLabel}`,
      `INPUT:\n${data.value.slice(0, 2000)}`,
      "",
      "HEURISTIC SIGNALS ALREADY DETECTED:",
      ...(base.flags.length
        ? base.flags.map((f) => `- [${f.severity}] ${f.label}: ${f.detail}`)
        : ["- none"]),
      "",
      `HEURISTIC RISK SCORE: ${base.score}/100`,
    ].join("\n");

    try {
      const res = await callChatCompletion({
        models: ["bmind/gpt-4o", "bmind/gpt-5.2-chat", "google/gemini-2.5-flash"],
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        jsonMode: true,
        maxTokens: 900,
        timeoutMs: 22000,
        retriesPerModel: 1,
        stage: "scam_tool",
      });

      const parsed = JSON.parse(res.content) as Record<string, unknown>;
      const rawScore = Number(parsed["score"]);
      const aiScore = Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : base.score;
      const score = Math.max(0, Math.min(100, Math.round(aiScore * 0.7 + base.score * 0.3)));

      const flags: ScamToolFlag[] = [];
      const rawFlags = parsed["flags"];
      if (Array.isArray(rawFlags)) {
        for (const raw of rawFlags.slice(0, 5)) {
          const o = raw as Record<string, unknown>;
          const label = String(o["label"] ?? "").slice(0, 90);
          if (!label) continue;
          const sev = String(o["severity"] ?? "low");
          flags.push({
            label,
            detail: String(o["detail"] ?? "").slice(0, 240),
            severity: sev === "high" || sev === "medium" ? sev : "low",
          });
        }
      }
      for (const f of base.flags) {
        if (flags.length >= 6) break;
        if (!flags.some((x) => x.label.toLowerCase() === f.label.toLowerCase())) flags.push(f);
      }

      const checklist = Array.isArray(parsed["checklist"])
        ? (parsed["checklist"] as unknown[])
            .slice(0, 5)
            .map((c) => String(c).slice(0, 180))
            .filter(Boolean)
        : fallbackChecklist[data.kind];

      const aiVerdict = String(parsed["verdict"] ?? "");
      const verdict =
        aiVerdict === "safe" || aiVerdict === "suspicious" || aiVerdict === "scam"
          ? (aiVerdict as ScamToolResult["verdict"])
          : verdictFor(score);

      return {
        kind: data.kind,
        subject: data.value.slice(0, 200),
        score,
        verdict,
        summary: String(parsed["summary"] ?? "").slice(0, 500) || bail("").summary,
        recommendation:
          String(parsed["recommendation"] ?? "").slice(0, 300) ||
          "Verify independently before sending any money.",
        flags,
        checklist: checklist.length ? checklist : fallbackChecklist[data.kind],
        aiUsed: true,
      };
    } catch {
      return bail("AI review unavailable right now — heuristic result shown.");
    }
  });
