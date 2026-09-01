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
import { useServerFn } from "@tanstack/react-start";
import { scamToolCheck, type ScamToolResult } from "@/lib/scam-check/scam-tool.functions";

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

function ScamToolPage() {
  const [kind, setKind] = useState<Kind>("broker");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScamToolResult | null>(null);
  const runCheck = useServerFn(scamToolCheck);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runCheck({ data: { kind, value: value.trim() } });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not run the check. Please try again.",
      );
    } finally {
      setLoading(false);
    }
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

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Result */}
        {result && ui && (
          <div className={`mt-8 rounded-xl border ${ui.border} ${ui.bg} p-5 sm:p-6`}>
            <div className="flex items-start gap-4">
              <div className={`rounded-full p-2.5 bg-white/80 ${ui.text}`}>
                <ui.icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className={`text-lg font-medium ${ui.text}`}>{ui.title}</h2>
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

                <p className="mt-3 text-sm text-zinc-800">{result.summary}</p>

                {result.flags.length > 0 && (
                  <ul className="mt-4 space-y-2 text-sm text-zinc-700">
                    {result.flags.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            f.severity === "high"
                              ? "bg-red-500"
                              : f.severity === "medium"
                                ? "bg-amber-500"
                                : "bg-zinc-400"
                          }`}
                        />
                        <span>
                          <span className="font-medium text-black">{f.label}</span>
                          {f.detail ? ` — ${f.detail}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {result.checklist.length > 0 && (
                  <div className="mt-5 rounded-lg bg-white/70 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Verify before you pay
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm text-zinc-700">
                      {result.checklist.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-zinc-400 shrink-0" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="mt-4 text-sm font-medium text-black">
                  {result.recommendation}
                </p>

                <p className="mt-3 text-xs text-zinc-500">
                  {result.aiUsed
                    ? "Reviewed by our AI fraud analyst plus rule-based screening."
                    : "Rule-based screening only."}
                  {result.note ? ` ${result.note}` : ""}
                </p>
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
