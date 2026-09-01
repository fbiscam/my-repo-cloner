import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ShieldCheck, ShieldAlert, ShieldX, Link2, Mail, MessageSquareText,
  Loader2, Copy, Check, ArrowLeft, Sparkles,
} from "lucide-react";
import { scamCheck, type ScamCheckResult } from "@/lib/scam-check/scam-check.functions";

export const Route = createFileRoute("/scam-check")({
  head: () => ({
    meta: [
      { title: "Free Scam Checker — Link, Email & Text" },
      {
        name: "description",
        content:
          "Paste a link, email address or message and get an instant scam, phishing and spam risk score with a clear breakdown of every warning sign. Free, no sign-up.",
      },
      { property: "og:title", content: "Free Scam Checker — Link, Email & Text" },
      {
        property: "og:description",
        content:
          "Instant scam, phishing and spam analysis for any link, email address or message. Free and no sign-up needed.",
      },
      { property: "og:url", content: "https://jenvu.com/scam-check" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/scam-check" }],
  }),
  component: ScamCheckPage,
});

const SANS = "font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal normal-case tracking-normal";

type Kind = "link" | "email" | "text";

const TABS: { kind: Kind; label: string; icon: typeof Link2; placeholder: string; hint: string }[] = [
  {
    kind: "link",
    label: "Link check",
    icon: Link2,
    placeholder: "https://secure-paypa1-verify.top/login",
    hint: "Paste any URL you were sent — we never open it, we analyse its structure.",
  },
  {
    kind: "email",
    label: "Email check",
    icon: Mail,
    placeholder: "support.billing2291@gmail.com",
    hint: "Paste the sender's address to see if it's disposable, spoofed or impersonating a brand.",
  },
  {
    kind: "text",
    label: "Text check",
    icon: MessageSquareText,
    placeholder: "Congratulations! You have won $5,000. Send your OTP to claim your prize...",
    hint: "Paste the full SMS, WhatsApp or email body — links inside are checked too.",
  },
];

const VERDICT_UI = {
  safe: {
    title: "Looks safe",
    icon: ShieldCheck,
    ring: "ring-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    bar: "bg-emerald-500",
  },
  suspicious: {
    title: "Suspicious",
    icon: ShieldAlert,
    ring: "ring-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-700",
    bar: "bg-amber-500",
  },
  scam: {
    title: "Likely scam",
    icon: ShieldX,
    ring: "ring-red-200",
    bg: "bg-red-50",
    text: "text-red-700",
    bar: "bg-red-500",
  },
} as const;

const SEV_UI: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
  info: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function ScamCheckPage() {
  const [kind, setKind] = useState<Kind>("link");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScamCheckResult | null>(null);
  const [copied, setCopied] = useState(false);

  const run = useServerFn(scamCheck);
  const tab = TABS.find((t) => t.kind === kind)!;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await run({ data: { kind, value: v } });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the check. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchTab(next: Kind) {
    setKind(next);
    setValue("");
    setResult(null);
    setError(null);
  }

  async function copyResult() {
    if (!result) return;
    const lines = [
      `Scam Check — ${VERDICT_UI[result.verdict].title} (${result.score}/100 risk)`,
      `Checked: ${result.subject}`,
      "",
      result.summary,
      "",
      "Signals:",
      ...result.signals.map((s) => `- [${s.severity}] ${s.label}: ${s.detail}`),
      "",
      `What to do: ${result.recommendation}`,
      "",
      "Checked with jenvu.com/scam-check",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  const v = result ? VERDICT_UI[result.verdict] : null;
  const VIcon = v?.icon ?? ShieldCheck;

  return (
    <div className={`min-h-screen bg-white text-slate-900 ${SANS}`}>
      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <header className="mt-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
            <Sparkles className="h-3.5 w-3.5" />
            Free tool · No sign-up · Nothing is stored
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Scam Check</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
            Paste a link, an email address or a message. We run it through a rule engine of known
            phishing and spam patterns, then a second AI review, and show you exactly which warning
            signs fired.
          </p>
        </header>

        {/* Tabs */}
        <div className="mt-8 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.kind === kind;
            return (
              <button
                key={t.kind}
                type="button"
                onClick={() => switchTab(t.kind)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Input */}
        <form onSubmit={onSubmit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {kind === "text" ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={tab.placeholder}
              rows={6}
              maxLength={4000}
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          ) : (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={tab.placeholder}
              maxLength={500}
              inputMode={kind === "email" ? "email" : "url"}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
            />
          )}

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">{tab.hint}</p>
            <button
              type="submit"
              disabled={loading || !value.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {loading ? "Analysing…" : "Check now"}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {/* Result */}
        {result && v && (
          <section className={`mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ${v.ring}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className={`rounded-xl ${v.bg} p-2.5`}>
                  <VIcon className={`h-6 w-6 ${v.text}`} />
                </div>
                <div>
                  <h2 className={`text-xl font-semibold ${v.text}`}>{v.title}</h2>
                  <p className="mt-0.5 break-all text-xs text-slate-500">{result.subject}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={copyResult}
                className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:text-slate-900"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy result"}
              </button>
            </div>

            {/* Score bar */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Risk score</span>
                <span className="tabular-nums">{result.score}/100</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${v.bar} transition-all`} style={{ width: `${result.score}%` }} />
              </div>
            </div>

            <p className="mt-5 text-sm leading-relaxed text-slate-700">{result.summary}</p>

            <div className={`mt-4 rounded-xl ${v.bg} p-4`}>
              <p className="text-xs uppercase tracking-wide text-slate-500">What you should do</p>
              <p className={`mt-1 text-sm ${v.text}`}>{result.recommendation}</p>
            </div>

            <div className="mt-5">
              <p className="text-xs uppercase tracking-wide text-slate-500">Signals detected</p>
              <ul className="mt-2 space-y-2">
                {result.signals.map((s, i) => (
                  <li key={`${s.label}-${i}`} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${SEV_UI[s.severity] ?? SEV_UI.low}`}>
                        {s.severity}
                      </span>
                      <span className="text-sm text-slate-900">{s.label}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{s.detail}</p>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-5 text-[11px] leading-relaxed text-slate-400">
              {result.note
                ? result.note
                : result.aiUsed
                  ? "Rule engine + AI review. Automated guidance only — always verify through official channels."
                  : "Rule engine result. Automated guidance only — always verify through official channels."}
            </p>
          </section>
        )}

        {/* Safety tips */}
        <section className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Three rules that stop most scams</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>• Never share an OTP, password, CVV or wallet recovery phrase — nobody legitimate asks.</li>
            <li>• Urgency is the tell. Real companies do not close your account in ten minutes.</li>
            <li>• Do not use the link you were sent. Open the official app or type the address yourself.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
