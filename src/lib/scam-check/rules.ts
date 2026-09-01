// Pure, network-free scam/spam heuristics.
// Used by the public Scam Check tool. No secrets, no imports with side effects.

import { DISPOSABLE_EMAIL_DOMAINS } from "@/lib/disposable-email-domains";

export type CheckKind = "link" | "email" | "text";

export type Signal = {
  /** Short label shown in the UI */
  label: string;
  /** Why it matters, plain language */
  detail: string;
  /** Positive = risk, negative = trust */
  weight: number;
  severity: "info" | "low" | "medium" | "high";
};

export type RuleResult = {
  kind: CheckKind;
  score: number; // 0-100 risk
  signals: Signal[];
  /** Normalised subject line, e.g. host or email */
  subject: string;
};

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly", "cutt.ly",
  "rebrand.ly", "shorturl.at", "rb.gy", "bit.do", "s.id", "tiny.cc", "lnkd.in",
  "t.ly", "shorturl.com", "clck.ru", "u.to", "v.gd", "soo.gd", "qr.ae",
]);

const RISKY_TLDS = new Set([
  "zip", "mov", "top", "xyz", "gq", "cf", "ml", "tk", "ga", "buzz", "click",
  "country", "kim", "work", "party", "science", "review", "loan", "date",
  "racing", "stream", "download", "bid", "win", "quest", "rest", "cyou", "sbs",
]);

const BRANDS = [
  "paypal", "google", "facebook", "instagram", "whatsapp", "apple", "icloud",
  "microsoft", "outlook", "netflix", "amazon", "binance", "coinbase", "metamask",
  "trustwallet", "dhl", "fedex", "usps", "hmrc", "irs", "nadra", "easypaisa",
  "jazzcash", "hbl", "meezan", "revolut", "wise", "payoneer", "steam", "roblox",
  "telegram", "linkedin", "tiktok", "snapchat", "bankofamerica", "chase", "wellsfargo",
];

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com", "aol.com",
  "icloud.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "yandex.com",
  "rediffmail.com", "zoho.com",
]);

const CRED_PATHS = [
  "login", "signin", "sign-in", "verify", "verification", "account-update",
  "secure", "security-alert", "wallet", "seed", "recover", "unlock", "confirm",
  "billing", "invoice", "update-payment", "webscr", "authenticate", "otp",
];

type KeywordFamily = {
  name: string;
  detail: string;
  weight: number;
  severity: Signal["severity"];
  patterns: RegExp[];
};

const KEYWORD_FAMILIES: KeywordFamily[] = [
  {
    name: "Urgency / pressure",
    detail: "Scammers create panic so you act before you think.",
    weight: 14,
    severity: "medium",
    patterns: [
      /\b(urgent|immediately|right now|within \d+ (hours?|minutes?)|last warning|final notice|act now|expires? (today|soon|in \d+))\b/i,
      /\b(account (will be|is) (suspended|blocked|closed|locked|deactivated))\b/i,
      /\b(fori|jaldi|foran)\b/i,
    ],
  },
  {
    name: "Prize / lottery",
    detail: "Unsolicited winnings are one of the oldest scam formats.",
    weight: 22,
    severity: "high",
    patterns: [
      /\b(you (have )?won|congratulations[!,. ]|lucky (winner|draw)|lottery|jackpot|prize money|claim your (prize|reward|gift))\b/i,
      /\b(inam|lucky number)\b/i,
    ],
  },
  {
    name: "Investment / crypto doubling",
    detail: "Guaranteed or doubled returns are always fraudulent.",
    weight: 24,
    severity: "high",
    patterns: [
      /\b(double your (money|investment|btc|usdt)|guaranteed (profit|return|income)|risk[- ]free (profit|return)|\d{2,}% (daily|weekly|monthly) (profit|return))\b/i,
      /\b(signal group|vip signals|copy trading|forex expert|recovery expert)\b/i,
    ],
  },
  {
    name: "Payment rail typical of fraud",
    detail: "Gift cards, crypto and instant transfers are irreversible.",
    weight: 20,
    severity: "high",
    patterns: [
      /\b(gift card|itunes card|google play card|steam card|amazon card)\b/i,
      /\b(usdt|btc|bitcoin|trc20|erc20|wallet address|binance pay)\b/i,
      /\b(western union|moneygram|easypaisa|jazzcash|bank transfer to)\b/i,
    ],
  },
  {
    name: "Credential / OTP request",
    detail: "No legitimate company ever asks for your password or OTP.",
    weight: 30,
    severity: "high",
    patterns: [
      /\b(send (me )?(the )?(otp|code|pin|password)|share your (otp|code|pin|password|cvv)|verification code|one[- ]time password)\b/i,
      /\b(seed phrase|recovery phrase|private key|12[- ]word)\b/i,
      /\b(cnic|card number|cvv|atm pin)\b/i,
    ],
  },
  {
    name: "Refund / tax / fee bait",
    detail: "Fake refunds and 'small fees' are used to harvest payment details.",
    weight: 16,
    severity: "medium",
    patterns: [
      /\b(tax refund|refund is pending|customs (fee|duty)|clearance fee|processing fee|delivery fee|small fee|advance payment)\b/i,
      /\b(parcel (is )?(held|waiting|undelivered)|package could not be delivered)\b/i,
    ],
  },
  {
    name: "Job / work-from-home bait",
    detail: "Task-based 'easy earning' offers are a common recruitment scam.",
    weight: 15,
    severity: "medium",
    patterns: [
      /\b(work from home|part[- ]time job|earn \$?\d+ (per|a) (day|hour|week)|daily payout|easy (money|income)|no experience (needed|required))\b/i,
      /\b(like and subscribe task|hotel booking task|review task)\b/i,
    ],
  },
  {
    name: "Romance / emotional hook",
    detail: "Emotional openers from strangers usually lead to money requests.",
    weight: 12,
    severity: "low",
    patterns: [
      /\b(i (am|'m) (lonely|a widow)|my dear|dearest one|god bless you my (child|friend)|i need your help urgently)\b/i,
      /\b(inheritance|next of kin|beneficiary of \$)\b/i,
    ],
  },
  {
    name: "Authority impersonation",
    detail: "Claims to be a bank, courier, tax office or platform support desk.",
    weight: 12,
    severity: "medium",
    patterns: [
      /\b(this is (your )?(bank|customer (care|support)|helpline)|official notice|department of|federal|police|court order)\b/i,
      /\b(your (netflix|paypal|amazon|apple|facebook|whatsapp) account)\b/i,
    ],
  },
];

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}

function registrable(host: string): { sld: string; tld: string } {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  const tld = parts[parts.length - 1] ?? "";
  const sld = parts[parts.length - 2] ?? "";
  return { sld, tld };
}

function brandLookalike(host: string): string | null {
  const { sld } = registrable(host);
  const bare = sld.replace(/[^a-z0-9]/g, "");
  for (const brand of BRANDS) {
    if (bare === brand) return null; // exact = the real thing (or at least not a typo)
    if (bare.includes(brand) && bare !== brand) return brand;
    if (bare.length >= 4 && Math.abs(bare.length - brand.length) <= 2 && levenshtein(bare, brand) <= 1) {
      return brand;
    }
  }
  // brand appears in a subdomain but not in the registrable domain
  const lower = host.toLowerCase();
  for (const brand of BRANDS) {
    if (lower.includes(brand) && !bare.includes(brand)) return brand;
  }
  return null;
}

export function normaliseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname || !u.hostname.includes(".")) {
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) return null;
    }
    return u;
  } catch {
    return null;
  }
}

export function analyseLink(raw: string): RuleResult {
  const signals: Signal[] = [];
  const u = normaliseUrl(raw);
  if (!u) {
    return {
      kind: "link",
      subject: raw.slice(0, 120),
      score: 55,
      signals: [{
        label: "Not a valid URL",
        detail: "This does not parse as a web address, so it cannot be verified.",
        weight: 55,
        severity: "medium",
      }],
    };
  }

  const host = u.hostname.toLowerCase();
  const { sld, tld } = registrable(host);
  const hadProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim());

  if (u.protocol === "http:" && hadProtocol) {
    signals.push({
      label: "No HTTPS",
      detail: "Traffic is unencrypted — anything you type can be intercepted.",
      weight: 12,
      severity: "medium",
    });
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    signals.push({
      label: "IP address instead of a domain",
      detail: "Real businesses use a domain name, not a bare IP.",
      weight: 35,
      severity: "high",
    });
  }

  if (host.startsWith("xn--") || host.includes(".xn--")) {
    signals.push({
      label: "Punycode domain",
      detail: "Non-Latin characters are used to imitate a familiar brand name.",
      weight: 30,
      severity: "high",
    });
  }

  if (SHORTENERS.has(host)) {
    signals.push({
      label: "URL shortener",
      detail: "The real destination is hidden behind a redirect.",
      weight: 22,
      severity: "medium",
    });
  }

  if (RISKY_TLDS.has(tld)) {
    signals.push({
      label: `High-abuse extension .${tld}`,
      detail: "This TLD is cheap/free and heavily used for phishing.",
      weight: 20,
      severity: "medium",
    });
  }

  const labels = host.split(".");
  if (labels.length >= 5) {
    signals.push({
      label: "Too many subdomains",
      detail: `"${labels.slice(0, -2).join(".")}" is stacked in front of the real domain to look legitimate.`,
      weight: 16,
      severity: "medium",
    });
  }

  const brand = brandLookalike(host);
  if (brand) {
    signals.push({
      label: `Imitates "${brand}"`,
      detail: `The real domain here is "${sld}.${tld}", not ${brand}.`,
      weight: 34,
      severity: "high",
    });
  }

  if ((sld.match(/-/g) ?? []).length >= 2) {
    signals.push({
      label: "Hyphen-stuffed domain",
      detail: "Multiple hyphens are typical of throwaway phishing domains.",
      weight: 12,
      severity: "low",
    });
  }

  if (/[0o][0o]|rn|1l|vv/.test(sld) && brand) {
    signals.push({
      label: "Character-swap trick",
      detail: "Look-alike characters are used to fake a trusted name.",
      weight: 10,
      severity: "medium",
    });
  }

  if (raw.includes("@") && raw.indexOf("@") > raw.indexOf("//")) {
    signals.push({
      label: "@ inside the URL",
      detail: "Everything before the @ is ignored by the browser — a classic disguise.",
      weight: 28,
      severity: "high",
    });
  }

  const path = (u.pathname + u.search).toLowerCase();
  const hitPaths = CRED_PATHS.filter((p) => path.includes(p));
  if (hitPaths.length) {
    signals.push({
      label: "Credential-harvest path",
      detail: `The link goes straight to "${hitPaths.slice(0, 3).join(", ")}" — typical of fake login pages.`,
      weight: 18,
      severity: "medium",
    });
  }

  if (path.length > 120) {
    signals.push({
      label: "Unusually long link",
      detail: "Long random paths are used to hide tracking and redirect chains.",
      weight: 8,
      severity: "low",
    });
  }

  if (/\.(exe|apk|scr|bat|msi|dmg|zip|rar)$/i.test(u.pathname)) {
    signals.push({
      label: "Direct file download",
      detail: "The link downloads an executable/archive — a common malware delivery method.",
      weight: 30,
      severity: "high",
    });
  }

  if (!signals.length) {
    signals.push({
      label: "No structural red flags",
      detail: "The address is well-formed with no known phishing patterns.",
      weight: -10,
      severity: "info",
    });
  }

  const score = clamp(signals.reduce((s, x) => s + x.weight, 0) + 8);
  return { kind: "link", subject: host, score, signals };
}

export function analyseEmail(raw: string): RuleResult {
  const value = raw.trim().toLowerCase();
  const signals: Signal[] = [];

  const match = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/.exec(value);
  if (!match) {
    return {
      kind: "email",
      subject: value.slice(0, 120),
      score: 60,
      signals: [{
        label: "Invalid email format",
        detail: "This is not a well-formed email address.",
        weight: 60,
        severity: "high",
      }],
    };
  }

  const local = match[1] ?? "";
  const domain = match[2] ?? "";
  const { sld, tld } = registrable(domain);

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    signals.push({
      label: "Disposable / throwaway domain",
      detail: "This mailbox self-destructs — nobody accountable is behind it.",
      weight: 45,
      severity: "high",
    });
  }

  const brand = brandLookalike(domain);
  if (brand && !FREEMAIL.has(domain)) {
    signals.push({
      label: `Domain imitates "${brand}"`,
      detail: `Real ${brand} mail never comes from "${domain}".`,
      weight: 38,
      severity: "high",
    });
  }

  if (FREEMAIL.has(domain)) {
    const impersonating = BRANDS.find((b) => local.includes(b)) ??
      (/(support|service|billing|security|admin|help ?desk|noreply|no-reply|official|team)/.test(local) ? "a support desk" : null);
    if (impersonating) {
      signals.push({
        label: "Free mailbox posing as official",
        detail: `"${local}" claims to be ${impersonating}, but sends from a free ${domain} account.`,
        weight: 34,
        severity: "high",
      });
    } else {
      signals.push({
        label: "Personal free mailbox",
        detail: "Fine for an individual, but not for a company that contacts you about money.",
        weight: 5,
        severity: "info",
      });
    }
  }

  if (RISKY_TLDS.has(tld)) {
    signals.push({
      label: `High-abuse extension .${tld}`,
      detail: "This domain extension is disproportionately used for fraud.",
      weight: 20,
      severity: "medium",
    });
  }

  const digits = (local.match(/\d/g) ?? []).length;
  if (local.length >= 10 && digits >= 5) {
    signals.push({
      label: "Machine-generated local part",
      detail: `"${local}" looks auto-created for bulk sending.`,
      weight: 16,
      severity: "medium",
    });
  }

  if (/^[a-z]{12,}$/.test(local) && !/[aeiou]{1,}/.test(local.slice(0, 6))) {
    signals.push({
      label: "Random-looking address",
      detail: "The name has no readable structure — typical of throwaway accounts.",
      weight: 12,
      severity: "low",
    });
  }

  if ((sld.match(/-/g) ?? []).length >= 2) {
    signals.push({
      label: "Hyphen-stuffed sender domain",
      detail: "Cheap disposable domains are usually built this way.",
      weight: 12,
      severity: "low",
    });
  }

  if (local.length > 40) {
    signals.push({
      label: "Unusually long address",
      detail: "Long local parts are used to push the real domain out of view on mobile.",
      weight: 10,
      severity: "low",
    });
  }

  if (!signals.length) {
    signals.push({
      label: "No sender red flags",
      detail: "The address is well-formed on a normal domain.",
      weight: -10,
      severity: "info",
    });
  }

  const score = clamp(signals.reduce((s, x) => s + x.weight, 0) + 8);
  return { kind: "email", subject: value, score, signals };
}

const URL_RE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/gi;

export function analyseText(raw: string): RuleResult {
  const text = raw.trim();
  const signals: Signal[] = [];

  for (const fam of KEYWORD_FAMILIES) {
    const hit = fam.patterns.find((p) => p.test(text));
    if (hit) {
      const m = hit.exec(text);
      signals.push({
        label: fam.name,
        detail: m?.[0] ? `${fam.detail} Matched: "${m[0].slice(0, 60)}".` : fam.detail,
        weight: fam.weight,
        severity: fam.severity,
      });
    }
  }

  const urls = Array.from(new Set((text.match(URL_RE) ?? []).map((u) => u.trim()))).slice(0, 5);
  for (const u of urls) {
    const link = analyseLink(u);
    const worst = link.signals
      .filter((s) => s.weight > 0)
      .sort((a, b) => b.weight - a.weight)[0];
    if (link.score >= 45 && worst) {
      signals.push({
        label: `Risky link: ${link.subject}`,
        detail: `${worst.label} — ${worst.detail}`,
        weight: Math.min(30, Math.round(link.score / 3)),
        severity: "high",
      });
    }
  }

  const letters = text.replace(/[^a-z]/gi, "");
  const upper = (text.match(/[A-Z]/g) ?? []).length;
  if (letters.length > 30 && upper / letters.length > 0.5) {
    signals.push({
      label: "Shouting in ALL CAPS",
      detail: "Heavy caps is a pressure tactic rarely used by real companies.",
      weight: 8,
      severity: "low",
    });
  }

  if ((text.match(/!/g) ?? []).length >= 3) {
    signals.push({
      label: "Excessive exclamation marks",
      detail: "Hype punctuation is a spam marker.",
      weight: 6,
      severity: "low",
    });
  }

  if (/\b(\+?\d[\d\s-]{7,}\d)\b/.test(text) && /\b(whatsapp|telegram|contact|message me|dm)\b/i.test(text)) {
    signals.push({
      label: "Pushes you off-platform",
      detail: "Moving the conversation to WhatsApp/Telegram avoids platform protection.",
      weight: 14,
      severity: "medium",
    });
  }

  if (/\b(dear (customer|user|sir\/madam|beneficiary))\b/i.test(text)) {
    signals.push({
      label: "Generic greeting",
      detail: "A real provider knows and uses your name.",
      weight: 10,
      severity: "low",
    });
  }

  if (!signals.length) {
    signals.push({
      label: "No known scam patterns",
      detail: "None of the common fraud wording families were detected.",
      weight: -10,
      severity: "info",
    });
  }

  const score = clamp(signals.reduce((s, x) => s + x.weight, 0) + 6);
  return { kind: "text", subject: text.slice(0, 80), score, signals };
}

export function runRules(kind: CheckKind, value: string): RuleResult {
  if (kind === "link") return analyseLink(value);
  if (kind === "email") return analyseEmail(value);
  return analyseText(value);
}

export type Verdict = "safe" | "suspicious" | "scam";

export function verdictFor(score: number): Verdict {
  if (score >= 65) return "scam";
  if (score >= 35) return "suspicious";
  return "safe";
}
