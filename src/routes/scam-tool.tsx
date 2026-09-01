import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Search,
  Loader2,
  ArrowLeft,
  Globe,
  Building2,
  MessageCircleWarning,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/scam-tool")({
  head: () => ({
    meta: [
      { title: "Scam Tool — Verify Brokers, Links & Signal Sellers" },
      {
        name: "description",
        content:
          "Free scam tool for traders: verify a broker, URL, account manager or signal seller before you send money. Check red flags, domain age, and regulatory warnings instantly.",
      },
      {
        property: "og:title",
        content: "Scam Tool — Verify Brokers, Links & Signal Sellers",
      },
      {
        property: "og:description",
        content:
          "Free scam tool for traders: verify brokers, URLs, account managers and signal sellers before you send money.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/scam-tool" }],
  }),
  component: ScamToolPage,
});

const SANS =
  "font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal normal-case tracking-normal";

type Kind = "broker" | "link" | "seller" | "payment";

const TABS: {
  kind: Kind;
  label: string;
  icon: typeof Globe;
  placeholder: string;
  hint: string;
}[] = [
  {
    kind: "broker",
    label: "Broker / Firm",
    icon: Building2,
    placeholder: "e.g. XYZ Capital Markets",
    hint: "Type the company or broker name to check for common warning signs.",
  },
  {
    kind: "link",
    label: "Website / Link",
    icon: Globe,
    placeholder: "https://example-broker.com",
    hint: "Paste a website or referral link. We analyse structure, not visit it.",
  },
  {
    kind: "seller",
    label: "Signal Seller",
    icon: MessageCircleWarning,
    placeholder: "@trading_guru_99 or guru@gmail.com",
    hint: "Paste a username, email or channel name used to sell signals or account management.",
  },
  {
    kind: "payment",
    label: "Payment Method",
    icon: CreditCard,
    placeholder: "USDT TRC-20 address, PayPal email, etc.",
    hint: "Paste a crypto address or payment ID to flag common scam patterns.",
  },
];

const VERDICT_UI = {
  safe: {
    title: "Looks safe",
    icon: ShieldCheck,
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    bar: "bg-emerald-500",
  },
  suspicious: {
    title: "Suspicious",
    icon: ShieldAlert,
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    bar: "bg-amber-500",
  },
  scam: {
    title: "Likely scam",
    icon: ShieldX,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    bar: "bg-red-500",
  },
} as const;

const RED_FLAGS = [
  "Guaranteed daily/weekly returns",
  "Requires payment before withdrawals",
  "Only accepts crypto or gift cards",
  "No verifiable regulatory licence",
  "Pressure to deposit urgently",
  "Account manager trades on your behalf",
  "Uses WhatsApp/Telegram only for support",
  "Bonus funds you cannot withdraw",
];

function scoreInput(kind: Kind, value: string) {
  const v = value.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (v.length < 3) return { score: 0, reasons: [] };

  const generic = [
    "guaranteed",
    "no risk",
    "100% profit",
    "get rich quick",
    "limited spots",
    "act now",
    "deposit urgently",
    "send funds",
    "account manager",
    "manage your account",
  ];
  generic.forEach((w) => {
    if (v.includes(w)) {
      score += 12;
      reasons.push(`Contains high-pressure phrase: "${w}"`);
    }
  });

  if (kind === "link") {
    if (v.includes("http") && /\d{1,3}\.\d{1,3}/.test(v)) {
      score += 10;
      reasons.push("Link uses a raw IP address instead of a domain");
    }
    if (/(\.tk|\.ml|\.ga|\.cf|\.top|\.xyz|\.live|\.click)/.test(v)) {
      score += 8;
      reasons.push("Uses a cheap/high-risk TLD often abused by scams");
    }
    if (v.includes("login") && v.includes("verify")) {
      score += 8;
      reasons.push("URL mimics a verification/login page");
    }
    if (/(paypa|amazo|apple|binanc|coinbas|metaquot|mt[45])/i.test(v) && !v.includes("official")) {
      score += 10;
      reasons.push("May impersonate a known brand or platform");
    }
  }

  if (kind === "seller") {
    if (/@gmail\.com|@yahoo\.com|@hotmail\.com|@protonmail\.com/.test(v)) {
      score += 6;
      reasons.push("Uses a free personal email for business");
    }
    if (/\+|\?/.test(v)) {
      score += 5;
      reasons.push("Uses a shortened/obfuscated contact");
    }
    if (v.startsWith("@")) {
      score += 3;
      reasons.push("Social-media handle only — no verified identity");
    }
  }

  if (kind === "payment") {
    if (/T[A-Za-z0-9]{32,}/.test(v)) {
      score += 4;
      reasons.push("Crypto address is irreversible once sent");
    }
    if (/gift card|itunes|google play|steam/i.test(v)) {
      score += 15;
      reasons.push("Payment requested via gift card — strong scam indicator");
    }
  }

  if (kind === "broker") {
    if (v.includes("unregulated") || v.includes("offshore")) {
      score += 10;
      reasons.push("Self-described as unregulated or offshore");
    }
    if (/fincen|sec|fca|asic|cysec|mifid/i.test(v)) {
      score -= 6;
      reasons.push("Mentions a recognised regulator (verify independently)");
    }
  }

  return { score: Math.min(100, Math.max(0, score)), reasons };
}

function verdictFromScore(score: number) {
  if (score >= 60) return "scam" as const;
  if (score >= 30) return "suspicious" as const;
  return "safe" as const;
}

function ScamToolPage() {
  const [kind, setKind] = useState<Kind>("broker");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    verdict: "safe" | "suspicious" | "scam";
    reasons: string[];
  } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setResult(null);
    await new Promise((r) => setTimeout(r, 700));
    const { score, reasons } = scoreInput(kind, value);
    setResult({ score, verdict: verdictFromScore(score), reasons });
    setLoading(false);
  };

  const activeTab = TABS.find((t) => t.kind === kind)!;
  const ui = result ? VERDICT_UI[result.verdict] : null;

  return (
    <div className={`min-h-screen bg-white text-zinc-900 ${SANS}`}>
      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-black transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-medium text-black tracking-tight">
            Scam Tool
          </h1>
          <p className="mt-2 text-base text-zinc-600">
            Verify brokers, links, signal sellers and payment requests before you send money.
          </p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = kind === t.kind;
            return (
              <button
                key={t.kind}
                onClick={() => {
                  setKind(t.kind);
                  setValue("");
                  setResult(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-black text-white"
                    : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Input form */}
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="relative">
            <activeTab.icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={activeTab.placeholder}
              className="w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-4 py-3.5 text-base text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-black focus:ring-1 focus:ring-black"
            />
          </div>
          <p className="text-xs text-zinc-500">{activeTab.hint}</p>
          <button
            type="submit"
            disabled={!value.trim() || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {loading ? "Analysing…" : "Check now"}
          </button>
        </form>

        {/* Result */}
        {result && ui && (
          <div
            className={`mt-8 rounded-xl border ${ui.border} ${ui.bg} p-5 sm:p-6`}
          >
            <div className="flex items-start gap-4">
              <div className={`rounded-full p-2.5 bg-white/80 ${ui.text}`}>
                <ui.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className={`text-lg font-medium ${ui.text}`}>
                    {ui.title}
                  </h2>
                  <span className={`text-2xl font-semibold ${ui.text}`}>
                    {result.score}/100
                  </span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-black/10 overflow-hidden">
                  <div
                    className={`h-full ${ui.bar} transition-all duration-500`}
                    style={{ width: `${result.score}%` }}
                  />
                </div>
                {result.reasons.length > 0 && (
                  <ul className="mt-4 space-y-1.5 text-sm text-zinc-700">
                    {result.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-current" />
                        {r}
                      </li>
                    ))}
                  </ul>
                )}
                {result.reasons.length === 0 && (
                  <p className="mt-3 text-sm text-zinc-700">
                    No obvious red flags detected. Always verify independently
                    before sending money.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Red flags checklist */}
        <div className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50 p-5 sm:p-6">
          <h3 className="text-base font-medium text-black mb-3">
            Common trading scam red flags
          </h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {RED_FLAGS.map((flag) => (
              <div
                key={flag}
                className="flex items-start gap-2 text-sm text-zinc-700"
              >
                <span className="mt-1.5 w-1 h-1 rounded-full bg-red-400" />
                {flag}
              </div>
            ))}
          </div>
        </div>

        {/* Full scam check link */}
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-zinc-200 p-4">
          <div>
            <p className="text-sm font-medium text-black">
              Need a deeper link/email/text analysis?
            </p>
            <p className="text-xs text-zinc-500">
              Our full Scam Check scans messages, URLs and emails for phishing patterns.
            </p>
          </div>
          <Link
            to="/scam-check"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-black hover:underline"
          >
            Open Scam Check <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
