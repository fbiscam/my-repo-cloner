import SiteNavLinks from "@/components/SiteNavLinks";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { useCurrentPlan } from "@/hooks/useCurrentPlan";
import { useUpgradeLock } from "@/hooks/useUpgradeLock";
import { useTrial } from "@/hooks/useTrial";

import { Check, Sparkles, Zap, Crown, Minus } from "lucide-react";
import pricingVoice from "@/assets/pricing-voice.jpg";
import pricingIct from "@/assets/pricing-ict.jpg";
import pricingAlerts from "@/assets/pricing-alerts.jpg";
import pricingJournal from "@/assets/pricing-journal.jpg";
import pricingScanner from "@/assets/pricing-scanner.jpg";
import pricingApi from "@/assets/pricing-api.jpg";
import xaiLogo from "@/assets/xai-logo.png";

const MONO = "font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal normal-case tracking-normal";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing Plans — Jenvu" },
      { name: "description", content: "Every plan includes the full platform — voice agent, A+ signals, ICT & SMC narration, trade journal, and realtime alerts. Invite-only." },
      { property: "og:title", content: "Jenvu Pricing — Pro & Elite Plans" },
      { property: "og:description", content: "Realtime A+ gold setups, voice intelligence, and trade journal — Pro $15/mo, Elite $50/mo." },
      { property: "og:url", content: "https://jenvu.com/pricing" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/pricing" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map(([q, a]) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }),
      },
    ],
  }),
  component: PricingPage,
});


const TIERS = [
  {
    id: "pro",
    name: "Pro",
    price: 15,
    icon: Zap,
    bestFor: "Active trader",
    tagline: "For serious gold traders.",
    cta: "Notify me when live",
    ctaTo: "/contact",
    credits: 35,
    features: [

      "Voice queries free",
      "A+ / A institutional signals",
      "Institutional-grade signal engine",
      "Realtime email & push alerts",
      "Full ICT / SMC narration",
      "Trade journal & analytics",
      "Multi-timeframe bias engine",
    ],

    highlight: true,
  },
  {
    id: "elite",
    name: "Elite",
    price: 50,
    icon: Crown,
    bestFor: "Desk / fund",
    tagline: "For prop desks & funds.",
    cta: "Talk to sales",
    ctaTo: "/contact",
    credits: 85,
    features: [

      "Voice queries free",
      "Everything in Pro",
      "Institutional-grade signal engine",
      "Priority A+ alerts (< 30s)",
      "Dedicated XAU/USD scanner with DXY overlay",
      "API access & webhooks",
      "Custom alert rules",
      "Dedicated onboarding & SLA",
    ],

    highlight: false,
  },
] as const;

const FEATURE_BLOCKS = [
  { img: pricingVoice, tag: "01 / VOICE", title: "Voice-first analysis", desc: "Speak your query. Get an institutional narration in seconds — no typing.", tone: "Pro · Elite · Ultra" },
  { img: pricingIct, tag: "02 / ICT · SMC", title: "ICT & SMC narration", desc: "Fair value gaps, order blocks, liquidity sweeps and BOS — all called live on chart.", tone: "Pro · Elite · Ultra" },
  { img: pricingAlerts, tag: "03 / ALERTS", title: "Realtime A+ alerts", desc: "Email + push the instant a 4★ confluence setup forms. No noise. Only A+.", tone: "Pro · Elite" },
  { img: pricingJournal, tag: "04 / JOURNAL", title: "Trade journal & analytics", desc: "Auto-log every trade. Track equity curve, win rate, RR and emotional state.", tone: "Pro · Elite · Ultra" },
  { img: pricingScanner, tag: "05 / SCANNER", title: "XAU/USD scanner", desc: "Bias engine on XAU/USD plus DXY overlay — synced timeframes.", tone: "Elite" },
  { img: pricingApi, tag: "06 / API", title: "API access & webhooks", desc: "Pipe signals into your stack. JSON webhooks, REST endpoints, custom rules.", tone: "Elite" },
];

type Mark = boolean | string;
const MATRIX: Array<{ feature: string; free: Mark; pro: Mark; elite: Mark }> = [
  { feature: "Voice queries / day", free: "Unlimited", pro: "Unlimited", elite: "Unlimited" },
  { feature: "A+ signal access", free: true, pro: true, elite: true },
  { feature: "AI models", free: "OpenAI", pro: "OpenAI + DeepSeek + Google", elite: "OpenAI + DeepSeek + Google" },
  { feature: "Alert latency", free: "No alerts", pro: "Realtime", elite: "Realtime" },
  { feature: "ICT / SMC narration", free: true, pro: true, elite: true },
  { feature: "Multi-timeframe bias", free: true, pro: true, elite: true },
  { feature: "Trade journal", free: true, pro: true, elite: true },
  { feature: "Multi-pair scanner", free: false, pro: false, elite: true },
  { feature: "API & webhooks", free: false, pro: false, elite: true },
  { feature: "Custom alert rules", free: false, pro: false, elite: true },
  { feature: "Dedicated onboarding", free: false, pro: false, elite: true },
];

export const FAQ = [
  ["Is this financial advice?", "No. Jenvu is an institutional-grade analysis tool. Every setup is for educational purposes. You remain responsible for your trades."],
  ["When does billing go live?", "We're finalising our payment infrastructure. Join the waitlist via the CTA above — you'll be notified the moment Pro is purchasable."],
  ["Can I cancel anytime?", "Yes. Subscriptions are month-to-month with no lock-in. You'll keep access until the end of the billing cycle."],
  ["What markets are covered?", "Gold only. Jenvu trades XAU/USD exclusively — with DXY overlay for confluence."],
];

function PricingPage() {
  const currentPlan = useCurrentPlan();
  const upgradeLock = useUpgradeLock();
  const trial = useTrial();
  const signedOut = currentPlan === null;
  const [billing, setBilling] = React.useState<"monthly" | "annual">("monthly");
  const priceOf = (t: { id: string; price: number }) => {
    const base = signedOut && t.id === "pro" ? 5 : t.price;
    return billing === "annual" && base > 0 ? Math.round((base * 12 * 0.83) / 10) * 10 : base;
  };
  const suffix = billing === "annual" ? "/yr" : "/mo";
  return (
    <div className={`min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased md:[zoom:1.375]`}>

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
        <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
            <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
          </Link>
          <SiteNavLinks active="/pricing" />
          <HeaderAuthButtons />

        </div>
      </header>

      {/* HERO */}
      <section className="relative border-b border-zinc-100 overflow-hidden">
        <div className="relative mx-auto max-w-6xl px-5 sm:px-6 py-16 sm:py-24 text-left sm:text-center">
          
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
            Trade gold with an institutional edge.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-zinc-600 sm:text-lg">
            One voice agent. A+ realtime setups. Built on ICT, SMC, and 25 years of professional desk methodology.
          </p>
          <div className="mt-8 flex flex-wrap justify-start sm:justify-center gap-2">
            {["A+ Setups", "ICT / SMC", "< 30s Alerts", "25Y Methodology"].map((s) => (
              <span key={s} className={`${MONO} text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-zinc-200 bg-white text-zinc-700`}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>


      {/* COMPARISON MATRIX — homepage Beanstalk style */}
      <section className="mx-auto max-w-7xl px-5 sm:px-8 py-16 sm:py-20">
        <div className="mb-10">
          
          <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight max-sm:whitespace-nowrap max-sm:text-[7vw]">Compare Jenvu Plans</h2>
        </div>





        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">

          <table className="w-full min-w-[760px] text-sm border-collapse">
            <colgroup>
              <col className="w-[28%]" />
              <col className={`w-[24%] ${currentPlan === "pro" ? "bg-emerald-50/50" : "bg-amber-50/40"}`} />
              <col className={`w-[24%] ${currentPlan === "elite" ? "bg-emerald-50/50" : ""}`} />
              <col className={`w-[24%] ${currentPlan === "ultra" ? "bg-emerald-50/50" : ""}`} />
            </colgroup>

            <thead>
              <tr className="border-b border-zinc-200">
                <th className="p-6 text-left align-bottom">
                  <span className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Pricing Plan</span>
                </th>
                {[
                  { name: "Pro", price: signedOut ? (billing === "annual" ? "$50" : "$5") : (billing === "annual" ? "$150" : "$15"), tag: "Active", anonTo: "/founding" as const, search: undefined, dark: false, accent: true, key: "pro" },
                  { name: "Elite", price: billing === "annual" ? "$500" : "$50", tag: "Desk", anonTo: "/founding" as const, dark: true, key: "elite" },
                  { name: "Ultra", price: billing === "annual" ? "$1,000" : "$100", tag: "Fund / Desk+", anonTo: "/founding" as const, dark: false, key: "ultra" },
                ].map((p) => {
                  const trialPro = trial.active && p.key === "pro";
                  const isCurrent = currentPlan === p.key && !trialPro;
                  const isLoggedIn = currentPlan !== null;
                  const disabled = !trialPro && isLoggedIn && !isCurrent && upgradeLock.locked;
                  const cta = trialPro
                    ? "Upgrade to Pro"
                    : disabled
                    ? "Locked in trial"
                    : isLoggedIn
                      ? "Upgrade"
                      : "Apply Now";
                  const to = isLoggedIn ? "/dashboard/pay" : p.anonTo;
                  return (
                  <th
                    key={p.name}
                    className={`p-6 text-left align-top border-l border-zinc-200 ${isCurrent ? "bg-emerald-50/50" : p.accent ? "bg-amber-50/50" : ""}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-base font-semibold ${isCurrent ? "text-emerald-700" : p.accent ? "text-amber-700" : "text-zinc-900"}`}>{p.name}</span>
                      {isCurrent && (
                        <span className={`${MONO} text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-emerald-600 text-white font-bold`}>
                          Current
                        </span>
                      )}
                      {p.accent && !isCurrent && (
                        <span className={`${MONO} text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-400 text-zinc-900 font-bold`}>
                          Popular
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl tracking-tight text-zinc-900 price-font">{p.price}</span>
                      {p.price.startsWith("$") && p.price !== "$0" && (
                        <span className="text-[11px] text-zinc-500 price-font">/credits</span>
                      )}
                    </div>
                    <p className={`mt-1 ${MONO} text-[9px] uppercase tracking-wider text-zinc-500`}>{p.tag}</p>
                    
                    {isCurrent ? (
                      <div className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                        Active
                      </div>
                    ) : disabled ? (
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title={
                          upgradeLock.reason === "docs_pending"
                            ? "Upgrades unlock after your ID and driving license are verified and your 30-day trial ends."
                            : `Upgrades unlock in ${upgradeLock.daysLeft ?? 30} day${upgradeLock.daysLeft === 1 ? "" : "s"} once your ID and driving license are verified.`
                        }
                        className="mt-3 inline-flex w-full cursor-not-allowed items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500"
                      >
                        {cta}
                      </button>
                    ) : (
                      <Link
                        to={to}
                        search={p.search}
                        className={`mt-3 inline-flex w-full items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          p.accent || p.dark
                            ? "bg-zinc-900 text-white hover:bg-black"
                            : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
                        }`}
                      >
                        {cta}
                      </Link>
                    )}
                  </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {([
                { f: "Monthly wallet (USD)", b: "$15", c: "$50", d: "$100" },

                { f: "Voice queries / day", b: "Unlimited", c: "Unlimited", d: "Unlimited" },

                { f: "Signal latency", b: "Realtime", c: "Realtime", d: "Realtime" },
                { f: "AI models", b: "__MODELS_PLUS__", c: "__MODELS_PLUS__", d: "__MODELS_PLUS__" },
                { f: "A+ signal access", b: true, c: true, d: true },
                { f: "ICT / SMC narration", b: true, c: true, d: true },
                { f: "Multi-timeframe bias", b: true, c: true, d: true },
                { f: "Trade journal", b: true, c: true, d: true },
                { f: "Email + push alerts", b: true, c: true, d: true },
                { f: "Multi-pair scanner", b: false, c: true, d: true, badge: "new" },

                { f: "Custom alert rules", b: false, c: true, d: true },

                { f: "Priority desk support", b: false, c: false, d: true },
              ] as ReadonlyArray<{ f: string; b: Mark; c: Mark; d: Mark; isHeading?: boolean; badge?: string }>).map((row, idx) => (
                <tr
                  key={row.f}
                  className={`border-t border-zinc-200 ${idx % 2 === 1 ? "bg-zinc-50/40" : ""} hover:bg-amber-50/20 transition`}
                >
                  <td className="px-6 py-3.5 text-zinc-800">
                    <div className="flex items-center gap-2">
                      {"badge" in row && row.badge && (
                        <span className={`${MONO} text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-400 text-zinc-900 font-bold`}>
                          {row.badge}
                        </span>
                      )}
                      <span className={row.isHeading ? "text-[11px] uppercase tracking-wider font-semibold text-zinc-500" : ""}>
                        {row.f}
                      </span>
                    </div>
                  </td>
                  {[row.b, row.c, row.d].map((v, i) => {
                    const colKey = (["pro", "elite", "ultra"] as const)[i];
                    const isCurrentCol = currentPlan === colKey;
                    return (
                    <td
                      key={i}
                      className={`px-2 py-3.5 text-center border-l border-zinc-200 min-w-[120px] ${isCurrentCol ? "bg-emerald-50/60" : i === 0 ? "bg-amber-50/40" : ""}`}
                    >
                      {v === true ? (
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${isCurrentCol ? "bg-emerald-600" : "bg-zinc-900"}`} />
                      ) : v === false ? (
                        <span className="inline-block h-px w-4 bg-zinc-200" />
                      ) : v === "__MODELS__" || v === "__GPT_ONLY__" || v === "__MODELS_PLUS__" ? (
                        <span className="inline-flex flex-col items-center justify-center gap-1">
                          <span className="inline-flex flex-col sm:flex-row flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5">
                              <svg viewBox="0 0 24 24" width="10" height="10" fill="#000" aria-hidden="true"><path d="M22.28 9.82a5.98 5.98 0 0 0-.51-4.91 6.05 6.05 0 0 0-6.52-2.9A6 6 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A6 6 0 0 0 19.02 19.8a5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.74-7.1zm-9.06 12.67a4.5 4.5 0 0 1-2.88-1.04l.14-.08 4.79-2.77a.78.78 0 0 0 .39-.68v-6.76l2.03 1.17.02.05v5.6a4.5 4.5 0 0 1-4.49 4.51zM3.5 18.55a4.47 4.47 0 0 1-.54-3.03l.14.08 4.79 2.77a.78.78 0 0 0 .79 0l5.85-3.38v2.35l.02.05-4.85 2.8a4.5 4.5 0 0 1-6.2-1.64zM2.24 8.03a4.5 4.5 0 0 1 2.35-1.98v5.7a.77.77 0 0 0 .39.68l5.83 3.36-2.03 1.17a.07.07 0 0 1-.07 0l-4.84-2.8a4.5 4.5 0 0 1-1.63-6.13zm16.63 3.87-5.85-3.4L15.05 7.34a.07.07 0 0 1 .07 0l4.84 2.8a4.5 4.5 0 0 1-.68 8.11v-5.7a.79.79 0 0 0-.4-.65zm2.02-3.04-.14-.09-4.78-2.79a.78.78 0 0 0-.79 0L9.33 9.36V7.01l-.02-.05 4.85-2.8a4.5 4.5 0 0 1 6.68 4.66zM8.22 12.99l-2.03-1.17-.02-.05v-5.6a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.62 5.57a.78.78 0 0 0-.4.68zm1.1-2.38 2.61-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z"/></svg>
                              <span className="text-[10px] font-medium text-zinc-800 whitespace-nowrap">OpenAI</span>
                            </span>
                          </span>
                          {(v === "__MODELS__" || v === "__MODELS_PLUS__") && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5">
                              <img src="https://www.google.com/s2/favicons?domain=deepseek.com&sz=32" alt="" width={10} height={10} className="h-2.5 w-2.5 rounded-sm object-contain" loading="lazy" />
                              <span className="text-[10px] font-medium text-zinc-800 whitespace-nowrap">DeepSeek</span>
                              <span className="text-zinc-300">·</span>
                              <img src="https://www.google.com/s2/favicons?domain=google.com&sz=32" alt="" width={10} height={10} className="h-2.5 w-2.5 rounded-sm object-contain" loading="lazy" />
                              <span className="text-[10px] font-medium text-zinc-800 whitespace-nowrap">Google</span>
                              
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className={`${MONO} text-[11px] tracking-wider ${row.isHeading ? "text-zinc-900 font-semibold" : isCurrentCol ? "text-emerald-700 font-semibold" : "text-zinc-700"}`}>
                          {v}
                        </span>
                      )}
                    </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FEATURE CARDS — 6 modules */}
      <section className="border-y border-zinc-100 bg-white">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 py-16 sm:py-20">
          <div className="mb-12 max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Everything in the platform.
            </h2>
            <p className="mt-3 text-zinc-600">
              Six modules for serious gold traders voice, narration, alerts, journal, scanner, and API.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_BLOCKS.map((b) => (
              <article
                key={b.tag}
                className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-[0_20px_60px_-30px_rgba(0,0,0,0.2)] transition"
              >
                <div className="px-6 pt-6">
                  <span className={`${MONO} inline-block text-[9px] uppercase tracking-wider px-2 py-1 rounded-sm bg-white text-zinc-900 border border-zinc-200`}>
                    {b.tag}
                  </span>
                </div>


                <div className="p-6">
                  <h3 className="text-base font-semibold tracking-tight text-zinc-900">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{b.desc}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4">
                    <span className={`${MONO} text-[10px] uppercase tracking-wider text-zinc-500`}>
                      {b.tone}
                    </span>
                    <span className={`${MONO} text-[10px] uppercase tracking-wider text-emerald-600`}>
                      Included →
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* TOP-UP PACKS */}
      <section className="mx-auto max-w-7xl px-5 sm:px-8 py-12 sm:py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            
            <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">Need more wallet balance?</h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-600 lg:max-w-none lg:whitespace-nowrap">One-time top-ups that never expire. $1 top-up = $1 wallet — same as plans. Each real signal costs $0.20.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { price: 5, sub: "Starter" },
            { price: 10, sub: "Boost" },
            { price: 25, sub: "Trader", accent: true },
            { price: 50, sub: "Power" },
          ].map((p) => (
            <div key={p.price} className={`rounded-2xl border ${p.accent ? "border-amber-300 bg-amber-50/40" : "border-zinc-200 bg-white"} p-5`}>
              <div className="flex items-center justify-between">
                <span className={`${MONO} text-[10px] uppercase tracking-wider text-zinc-500`}>{p.sub}</span>
                {p.accent && (
                  <span className={`${MONO} text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-400 text-zinc-900 font-bold`}>Best value</span>
                )}
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl tabular-nums price-font">${p.price}</span>
                <span className="text-xs text-zinc-500">wallet</span>
              </div>
              <div className="mt-1 text-sm text-zinc-700">${p.price} one-time · ~{Math.floor(p.price / 0.2)} signals</div>
              {signedOut ? (
                <Link to="/founding" className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-black">
                  Buy Now
                </Link>
              ) : (
                <Link to="/dashboard/pay" search={{ amount: p.price }} className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-black">
                  Buy Now
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* CUSTOM AMOUNT */}
        <CustomTopUp signedOut={signedOut} />

        
      </section>


      {/* FAQ */}
      <section className="border-t border-zinc-100 bg-zinc-50/50">
        <div className="mx-auto max-w-3xl px-5 sm:px-6 py-16 sm:py-20">
          <div className="text-left sm:text-center mb-10">
            
            <h3 className="mt-3 text-3xl font-semibold tracking-tight">Frequently asked</h3>
          </div>
          <div className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-5 hover:bg-zinc-50/50 transition">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-sm font-medium text-zinc-900">
                  <span>{q}</span>
                  <span className={`${MONO} text-[10px] text-zinc-400 group-open:rotate-45 transition`}>+</span>
                </summary>
                <p className="mt-3 text-sm text-zinc-600 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Cell({ value, highlight }: { value: Mark; highlight?: boolean }) {
  const base = `px-5 py-3.5 text-center ${highlight ? "bg-amber-50/40" : ""}`;
  if (value === true) {
    return (
      <td className={base}>
        <Check className="inline h-4 w-4 text-emerald-600" />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className={base}>
        <Minus className="inline h-4 w-4 text-zinc-300" />
      </td>
    );
  }
  return <td className={`${base} ${MONO} text-[11px] uppercase tracking-wider text-zinc-700`}>{value}</td>;
}

function CustomTopUp({ signedOut }: { signedOut: boolean }) {
  const [amount, setAmount] = React.useState<number>(15);
  const safe = Math.max(5, Math.min(1000, Number.isFinite(amount) ? amount : 5));
  const estSignals = Math.floor(safe / 0.2);
  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5">
        <div>
          
          <h3 className="mt-2 text-lg font-semibold tracking-tight">Pick your own amount</h3>
          <p className="mt-1 text-sm text-zinc-600">Minimum $5. $1 top-up = $1 wallet. Each real signal costs $0.20. Balance never expires.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-md border border-zinc-300 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-amber-400">
            <span className="px-3 text-sm text-zinc-500 border-r border-zinc-200 bg-white">$</span>
            <input
              type="number"
              min={5}
              step={1}
              value={Number.isFinite(amount) ? amount : ""}
              onChange={(e) => setAmount(parseInt(e.target.value || "0", 10))}
              className={`w-24 px-3 py-2 text-sm tabular-nums outline-none ${MONO}`}
            />
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold tabular-nums ${MONO}`}>${safe}</div>
            <div className="text-[11px] text-zinc-500">wallet · ~{estSignals} signals</div>
          </div>
          {signedOut ? (
            <Link
              to="/founding"
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-black whitespace-nowrap"
            >
              Buy Now
            </Link>
          ) : (
            <Link
              to="/dashboard/pay"
              search={{ amount: safe }}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-black whitespace-nowrap"
            >
              Buy Now
            </Link>
          )}
        </div>
      </div>
      {amount < 5 && (
        <p className="mt-3 text-[12px] text-rose-600">Minimum top-up is $5.</p>
      )}
    </div>
  );
}
