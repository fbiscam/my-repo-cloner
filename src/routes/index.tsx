import * as React from "react";
{/* Build a Chrome extension that integrates with my existing ICT/SMC analysis workflow and runs on TradingView pages. */}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CloudOrb } from "@/components/CloudOrb";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { ClientOnly } from "@tanstack/react-router";
import { TradingViewChart } from "@/components/TradingViewChart";


import { useAuthUser } from "@/hooks/useAuthUser";
import { useTrial } from "@/hooks/useTrial";
import { useCurrentPlan } from "@/hooks/useCurrentPlan";
import { useUpgradeLock } from "@/hooks/useUpgradeLock";
import { getMarketSnapshotsBatch } from "@/lib/gold-analysis.functions";

/* ---------- hero background banners (desktop / tablet only) ---------- */
function HeroBanners() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden md:block overflow-hidden">
      {/* Right side candlestick chart panel */}
      <div className="absolute right-0 top-0 h-full w-[32%] max-w-[420px] border-l border-zinc-100/80 bg-gradient-to-l from-zinc-50/90 via-zinc-50/50 to-transparent">
        <svg className="absolute inset-0 h-full w-full opacity-30" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-zinc-300" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          {/* Candlesticks */}
          <g>
            {/* Bullish */}
            <g className="text-emerald-600">
              <rect x="12%" y="62%" width="3%" height="12%" fill="currentColor" />
              <line x1="13.5%" y1="58%" x2="13.5%" y2="78%" stroke="currentColor" strokeWidth="1" />
            </g>
            {/* Bearish */}
            <g className="text-red-600">
              <rect x="26%" y="55%" width="3%" height="9%" fill="currentColor" />
              <line x1="27.5%" y1="50%" x2="27.5%" y2="70%" stroke="currentColor" strokeWidth="1" />
            </g>
            {/* Bullish */}
            <g className="text-emerald-600">
              <rect x="40%" y="48%" width="3%" height="14%" fill="currentColor" />
              <line x1="41.5%" y1="44%" x2="41.5%" y2="68%" stroke="currentColor" strokeWidth="1" />
            </g>
            {/* Bearish */}
            <g className="text-red-600">
              <rect x="54%" y="38%" width="3%" height="10%" fill="currentColor" />
              <line x1="55.5%" y1="35%" x2="55.5%" y2="52%" stroke="currentColor" strokeWidth="1" />
            </g>
            {/* Bullish */}
            <g className="text-emerald-600">
              <rect x="68%" y="30%" width="3%" height="11%" fill="currentColor" />
              <line x1="69.5%" y1="25%" x2="69.5%" y2="46%" stroke="currentColor" strokeWidth="1" />
            </g>
            {/* Bearish */}
            <g className="text-red-600">
              <rect x="82%" y="22%" width="3%" height="9%" fill="currentColor" />
              <line x1="83.5%" y1="18%" x2="83.5%" y2="35%" stroke="currentColor" strokeWidth="1" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}

import { Check, Sparkles, Zap, Crown, Minus, Menu, X } from "lucide-react";

import xaiLogo from "@/assets/xai-logo.png";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Voice Powered Gold Trading Intelligence" },
      {
        name: "description",
        content:
          "Jenvu AI — voice-native gold trading desk narrating live ICT/SMC A+ setups with precision entries, stops and targets across every XAU cross-pair.",
      },
      { property: "og:title", content: "Voice-Native Gold Trading Intelligence — Jenvu" },
      {
        property: "og:description",
        content: "Speak. Analyze. Execute. The voice terminal that narrates institutional-grade XAU signals across every major gold cross-pair.",
      },
      { property: "og:url", content: "https://jenvu.com/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Jenvu AI",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          description:
            "Voice-native AI gold trading terminal with institutional ICT/SMC analysis for every XAU cross-pair.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),

  // Prices are fetched on the server so the ticker is already populated in the
  // very first paint (no "—…" placeholders while the client warms up).
  loader: async () => {
    try {
      const symbols = INITIAL_TICKER
        .map(([label]) => SYMBOL_MAP[label])
        .filter((s): s is string => !!s);
      const res = await Promise.race([
        getMarketSnapshotsBatch({ data: { symbols } }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6_000)),
      ]);
      if (!res?.results) return { tickerRows: INITIAL_TICKER };
      return { tickerRows: snapshotsToRows(res.results, INITIAL_TICKER) };
    } catch {
      return { tickerRows: INITIAL_TICKER };
    }
  },
  component: HomePage,
});

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

/* ---------- mock data ---------- */
const SIGNALS = [
  { pair: "XAUUSD", t: "14:20:02", tag: "SWEEP", note: "Liquidity grab on London high", tone: "ink" },
  { pair: "XAUUSD", t: "14:18:45", tag: "FVG", note: "Fair Value Gap mitigated", tone: "green" },
  { pair: "XAUUSD", t: "14:15:10", tag: "BOS", note: "Break of structure confirmed", tone: "muted" },
  { pair: "XAUUSD", t: "14:11:32", tag: "OB", note: "Bullish order block tap", tone: "ink" },
] as const;

type TickerRow = [string, string, string];
const INITIAL_TICKER: TickerRow[] = [
  ["XAU/USD", "—", "…"],
  ["DXY", "—", "…"],
  ["US10Y", "—", "…"],
  ["XAG/USD", "—", "…"],
  ["EUR/USD", "—", "…"],
  ["USD/JPY", "—", "…"],
  ["S&P 500", "—", "…"],
  ["WTI Oil", "—", "…"],
];


// Server-fn symbol map — routes through getMarketSnapshot to bypass browser
// CORS restrictions on Yahoo Finance and return authoritative live prices.
const SYMBOL_MAP: Record<string, string> = {
  "XAU/USD": "XAUUSD",
  "DXY": "DXY",
  "US10Y": "US10Y",
  "XAG/USD": "XAGUSD",
  "EUR/USD": "EURUSD",
  "USD/JPY": "USDJPY",
  "S&P 500": "SPX",
  "WTI Oil": "WTI",
};



function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

const TICKER_CACHE_KEY = "jenvu:ticker:v1";

function snapshotsToRows(
  results: Array<{ symbol: string; snapshot: { price: number; changePct: number | null } | null }>,
  prev: TickerRow[],
): TickerRow[] {
  const bySym = new Map(
    results
      .filter((r) => r.snapshot && Number.isFinite(r.snapshot.price))
      .map((r) => [r.symbol, r.snapshot!]),
  );
  return prev.map(([label, price, delta]) => {
    const sym = SYMBOL_MAP[label];
    const d = sym ? bySym.get(sym) : undefined;
    if (!d) return [label, price, delta] as TickerRow;
    const sign = (d.changePct ?? 0) >= 0 ? "+" : "";
    const deltaOut = d.changePct == null ? delta : `${sign}${d.changePct.toFixed(2)}%`;
    return [label, fmtPrice(d.price), deltaOut] as TickerRow;
  });
}

function useLiveTicker(): TickerRow[] {
  const loaderData = Route.useLoaderData() as { tickerRows?: TickerRow[] } | undefined;
  const [rows, setRows] = React.useState<TickerRow[]>(
    loaderData?.tickerRows?.length ? loaderData.tickerRows : INITIAL_TICKER,
  );
  const fetchBatch = useServerFn(getMarketSnapshotsBatch);

  // Instant paint on repeat visits / client navigations.
  React.useEffect(() => {
    if (loaderData?.tickerRows?.length) return;
    try {
      const raw = sessionStorage.getItem(TICKER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TickerRow[];
        if (Array.isArray(parsed) && parsed.length) setRows(parsed);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    let alive = true;
    const symbols = INITIAL_TICKER
      .map(([label]) => SYMBOL_MAP[label])
      .filter((s): s is string => !!s);

    const fetchPrices = async () => {
      try {
        const res = await fetchBatch({ data: { symbols } });
        if (!alive || !res?.results) return;
        setRows((prev) => {
          const next = snapshotsToRows(res.results, prev);
          try { sessionStorage.setItem(TICKER_CACHE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
          return next;
        });
      } catch {
        /* ignore */
      }
    };
    fetchPrices();
    const id = setInterval(fetchPrices, 3_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return rows;
}




/* ---------- atoms ---------- */
function TagPill({ tag, tone }: { tag: string; tone: "ink" | "green" | "muted" }) {
  const cls =
    tone === "green"
      ? "bg-emerald-500 text-white"
      : tone === "muted"
      ? "bg-zinc-200 text-zinc-900"
      : "bg-zinc-900 text-white";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${MONO} uppercase tracking-wider ${cls}`}>
      {tag}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-3 ${MONO} text-[10px] tracking-[0.22em] uppercase text-zinc-900`}>
      <span className="h-px w-6 bg-zinc-300" />
      {children}
    </div>
  );
}

/* ---------- page ---------- */
function HomePage() {
  const ticker = useLiveTicker();
  const currentPlan = useCurrentPlan();
  const upgradeLock = useUpgradeLock();
  const trial = useTrial();
  const { user: authUser } = useAuthUser();
  const isAuthed = !!authUser;
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  React.useEffect(() => {
    if (mobileMenuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileMenuOpen]);
  return (
    <>
    <div className={`jenvu-zoom min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased selection:bg-zinc-900 selection:text-white`}>
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-6 sm:py-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
            <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
          </Link>

          <nav className={`hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-7 text-sm text-zinc-900`}>
            <Link to="/signals-live" className="hover:text-zinc-900">Live Signals</Link>
            <Link to="/signals-live" className="hover:text-zinc-900">Signals Live</Link>
            <Link to="/pricing" className="hover:text-zinc-900">Pricing</Link>
            <Link to="/founding" className="hover:text-zinc-900">Founding</Link>
            <Link to="/insights" className="hover:text-zinc-900">Insights</Link>
            <Link to="/contact" className="hover:text-zinc-900">Contact</Link>

          </nav>
          <div className="flex items-center gap-2">
            <div className={isAuthed ? "" : "hidden md:block"}>
              <HeaderAuthButtons />
            </div>
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>


        </div>
        {/* ticker strip */}
        <div className="border-t border-zinc-100 overflow-hidden">
          <div className={`flex w-max gap-8 py-2 ${MONO} text-[11px] text-zinc-900 whitespace-nowrap animate-ticker`}>
            {[...ticker, ...ticker].map(([s, p, d], i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="text-zinc-900 font-medium">{s}</span>
                <span>{p}</span>
                <span className={d === "…" ? "text-zinc-500" : d.startsWith("-") ? "text-red-600" : "text-emerald-700"}>{d}</span>
                <span className="text-zinc-200">•</span>
              </span>
            ))}
          </div>
        </div>

      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-zinc-900/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute inset-x-0 top-0 bg-white border-b border-zinc-100 shadow-lg">
            <div className="flex items-center justify-between px-5 py-3">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2.5">
                <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 rounded-md object-contain" />
                <span className="text-[20px] tracking-tight" style={{ color: "#3c4043", fontFamily: "\"Google Sans\",\"Product Sans\",\"DM Sans\",system-ui,sans-serif", fontWeight: 500 }}>Jenvu</span>
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col px-3 pb-4 pt-1 text-[15px] text-zinc-900">
              {[
                { to: "/signals-live", label: "Live Signals" },
                { to: "/signals-live", label: "Signals Live" },
                { to: "/pricing", label: "Pricing" },
                { to: "/founding", label: "Founding" },
                { to: "/insights", label: "Insights" },
                { to: "/contact", label: "Contact" },
              ].map((it) => (

                <Link
                  key={it.to}
                  to={it.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-3 py-3 hover:bg-zinc-50"
                >
                  {it.label}
                </Link>
              ))}
              {isAuthed ? (
                <Link
                  to="/app"
                  onClick={() => setMobileMenuOpen(false)}
                  className="mx-3 mt-3 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Launch
                  <span className={`${MONO} text-[10px] opacity-70 ml-1.5`}>↗</span>
                </Link>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2 px-3">
                  <Link
                    to="/auth"
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 hover:bg-zinc-50"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/founding"
                    onClick={() => setMobileMenuOpen(false)}
                    className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    Apply
                  </Link>
                </div>
              )}
            </nav>
          </div>
        </div>
      )}


      <main>
      {/* HERO */}
      <section className="relative mx-auto max-w-6xl px-5 pt-10 pb-20 sm:px-6 sm:pt-16 sm:pb-28">
        <HeroBanners />

        <div className="relative z-10 grid gap-8 sm:gap-10 lg:grid-cols-12 lg:items-end">

          <div className="text-left lg:col-span-7 lg:text-left">

            <h1 className="mt-5 max-w-3xl text-[28px] font-semibold tracking-tight leading-[1.1] sm:text-[42px] md:text-[56px] lg:mx-0 text-zinc-900">
              <span className="block sm:whitespace-nowrap">Institutional intelligence</span>
              <span className="block">vocalized in real time.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-[13px] leading-relaxed text-zinc-700 sm:text-base md:text-lg lg:mx-0">
              <span className="sm:hidden">Voice native gold desk narrating live A+ ICT/SMC setups every XAU pair with institutional precision.</span>
              <span className="hidden sm:inline">Voice native gold terminal narrating live A+ ICT/SMC setups<br />across every XAU pair in real time with institutional precision.</span>
            </p>
            <div className="mt-7 flex flex-col items-stretch justify-start gap-3 sm:flex-row sm:items-start lg:justify-start">
              <Link
                to={isAuthed ? "/app" : "/founding"}
                className="hover-lift inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
              >
                {isAuthed ? "Launch Voice Agent" : "Apply for access"}
                <br className="sm:hidden" />
                <span className={`${MONO} text-xs opacity-80`}>→</span>
              </Link>
              <Link
                to={isAuthed ? "/signals-live" : "/auth"}
                className="hover-glow inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-white"
              >
                See Signal Engine
              </Link>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-zinc-200 rounded-xl overflow-hidden border border-zinc-200 shadow-[0_4px_20px_-8px_rgba(24,24,27,0.08)]">
              {[
                ["Markets", "XAU"],
                ["Frameworks", "ICT, SMC"],
                ["Avg. R:R", "1 : 3.2"],
              ].map(([k, v]) => (
                <div key={k} className="bg-white p-5 text-left text-zinc-900 sm:text-left transition-colors hover:bg-zinc-50/60">
                  <div className={`${MONO} text-[10px] uppercase tracking-widest text-zinc-500`}>{k}</div>
                  <div className="mt-2 text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>



      {/* TERMINAL WORKSTATION */}
      <section className="mx-auto max-w-6xl px-5 mt-8 pb-14 sm:px-6 sm:mt-10 sm:pb-20">

        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          {/* terminal header */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 border-b border-zinc-100 bg-white sm:flex sm:justify-between sm:px-6 sm:py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex gap-1.5 shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
              </div>
              <span className={`ml-2 sm:ml-4 text-[10px] sm:text-[11px] ${MONO} tracking-widest text-zinc-900 uppercase truncate`}>
                Jenvu // SYSTEM_ACTIVE
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] sm:text-[11px] font-medium text-emerald-600 tracking-tight">
                  <span className="sm:hidden">LIVE</span>
                  <span className="hidden sm:inline">LIVE FEED</span>
                </span>
              </div>
              <div className="hidden sm:block h-4 w-px bg-zinc-200" />
              <span className={`hidden sm:inline text-[11px] ${MONO} text-zinc-900`}>LATENCY · 14MS</span>
            </div>
          </div>

          {/* body */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-zinc-100">
            {/* LEFT — ICT feed */}
            <div className="lg:col-span-3 bg-white p-5 sm:p-6 flex flex-col gap-5 sm:gap-6">
              <h2 className={`text-[10px] font-bold ${MONO} text-zinc-900 tracking-widest uppercase`}>
                ICT Execution Feed
              </h2>
              <div className="space-y-3">
                {SIGNALS.map((s) => (
                  <div
                    key={s.pair + s.t}
                    className={`p-3 rounded-lg border ${
                      s.tone === "green"
                        ? "border-emerald-100/70 bg-emerald-50/30"
                        : "border-zinc-100 bg-white/40"
                    } space-y-2`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold">{s.pair}</span>
                      <span className={`text-[10px] ${MONO} text-zinc-900`}>{s.t}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TagPill tag={s.tag} tone={s.tone} />
                      <span className={`text-xs ${s.tone === "green" ? "text-zinc-900" : "text-zinc-900"}`}>
                        {s.note}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CENTER — Orb */}
            <div className="lg:col-span-6 bg-white flex flex-col items-center justify-center p-6 sm:p-10 lg:p-12 relative overflow-hidden min-h-[330px] sm:min-h-[440px]">
              <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{
                  backgroundImage: "radial-gradient(#000 0.6px, transparent 0.6px)",
                  backgroundSize: "24px 24px",
                }}
              />
              <div className="relative z-10 flex flex-col items-center">
                <div className="relative h-44 w-44 sm:h-56 sm:w-56">
                  <div className="absolute inset-0 rounded-full border border-zinc-100 animate-[spin_18s_linear_infinite]" />
                  <div className="absolute inset-5 rounded-full border border-zinc-200/60 animate-[spin_24s_linear_infinite_reverse]" />
                  <div className="absolute inset-9">
                    <CloudOrb status="speaking" pulse={1} />
                  </div>
                </div>
                <div className="mt-8 text-center sm:mt-10">
                  <p className={`text-xs font-medium tracking-[0.25em] ${MONO} text-zinc-900 uppercase mb-3`}>
                    Listening for commands
                  </p>
                  <div className="flex items-end justify-center gap-1 h-6">
                    {[2, 4, 5, 3, 4, 2, 2].map((h, i) => (
                      <div
                        key={i}
                        className={`w-1 rounded-full ${i < 5 ? "bg-zinc-900" : "bg-zinc-200"}`}
                        style={{
                          height: `${h * 4}px`,
                          animation: i < 5 ? `bounce 1s infinite ${i * 0.12}s` : undefined,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT — intelligence */}
            <div className="lg:col-span-3 bg-white p-5 sm:p-6 lg:border-l border-zinc-100">
              <h2 className={`text-[10px] font-bold ${MONO} text-zinc-900 tracking-widest uppercase mb-4`}>
                Intelligence Dashboard
              </h2>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className={`text-[10px] ${MONO} text-zinc-900 uppercase`}>DXY Index</span>
                    <span className="text-xs font-semibold">104.22</span>
                  </div>
                  <div className="h-16 w-full bg-white rounded border border-zinc-100 flex items-end p-2 gap-0.5">
                    {[50, 66, 75, 33, 50, 66, 50, 80, 40].map((h, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-t-sm ${
                          h > 70 ? "bg-zinc-900" : h > 50 ? "bg-zinc-400" : "bg-zinc-200"
                        }`}
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-900">Institutional Sentiment</span>
                    <span className="text-xs font-medium text-emerald-600">Bullish</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden flex">
                    <div className="w-3/4 bg-emerald-500" />
                    <div className="w-1/4 bg-zinc-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="p-2 border border-zinc-100 rounded-lg">
                      <p className={`text-[10px] ${MONO} text-zinc-900`}>PDH</p>
                      <p className={`text-xs ${MONO} font-medium`}>1.0922</p>
                    </div>
                    <div className="p-2 border border-zinc-100 rounded-lg">
                      <p className={`text-[10px] ${MONO} text-zinc-900`}>PDL</p>
                      <p className={`text-xs ${MONO} font-medium`}>1.0810</p>
                    </div>
                  </div>
                </div>

                <Link
                  to="/app"
                  className={`w-full inline-flex items-center justify-center mt-2 py-3 bg-zinc-900 text-white text-[11px] font-semibold tracking-[0.18em] rounded-lg hover:bg-zinc-800 transition-colors uppercase`}
                >
                  Execute Voice Trade
                </Link>
              </div>
            </div>
          </div>

          {/* status bar */}
          <div className="px-4 sm:px-6 py-2 border-t border-zinc-100 bg-white flex justify-start sm:justify-between items-center gap-3">
            <div className="flex gap-4 sm:gap-6 items-center">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${MONO} text-zinc-900`}>CPU</span>
                <span className={`text-[10px] ${MONO}`}>04%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${MONO} text-zinc-900`}>MEM</span>
                <span className={`text-[10px] ${MONO}`}>1.2GB</span>
              </div>
            </div>
            <span className={`hidden sm:inline text-[10px] ${MONO} text-zinc-900 tracking-tighter truncate`}>
              PRO_VERSION_2.04.1 // SECURE_ENCRYPTION_ENABLED
            </span>
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="border-t border-zinc-100">
        <div className="mx-auto max-w-6xl px-5 py-10 text-left sm:px-6 sm:py-14 md:text-left">
          
          <h2 className="mt-4 max-w-3xl text-xl font-semibold tracking-tight sm:text-3xl md:mx-0 md:text-4xl md:whitespace-nowrap">
            <span className="sm:hidden">Built like a trading desk<br />spoken just like a real partner</span>
            <span className="hidden sm:inline">Built like a trading desk, spoken like a partner.</span>
          </h2>
          <div className="mt-12 grid gap-px bg-zinc-100 border border-zinc-100 rounded-2xl overflow-hidden md:grid-cols-3">
            {[
              {
                k: "01",
                t: "Voice-Native Workflow",
                d: "Push-to-talk a real institutional analyst that reasons through ICT/SMC live.",
              },
              {
                k: "02",
                t: "ICT & SMC Signal Engine",
                d: "Live FVG, Order Block, BOS, CHoCH and liquidity sweeps marked on charts.",
              },
              {
                k: "03",
                t: "Market Intelligence",
                d: "London fix, DXY, gold-specific Forex Factory news merged into every plan.",
              },
              {
                k: "04",
                t: "A+ Setups Only",
                d: "Confluence-graded entries with structured entry, SL, TP never guessed.",
              },
              {
                k: "05",
                t: "One Pair, Total Focus",
                d: "XAU/USD only — the entire desk is tuned to a single instrument, news, market insights.",
              },
              {
                k: "06",
                t: "Narrated Chart Reviews",
                d: "JENVU walks the structure aloud: highs, lows, mitigations and displacement.",
              },

            ].map((f) => (
              <div key={f.k} className="bg-white p-6 text-left transition-colors hover:bg-white sm:p-7">
                <div className={`flex items-center justify-between ${MONO} text-[10px] uppercase tracking-widest text-zinc-900`}>
                  <span>{f.k}</span>
                  <span>→</span>
                </div>
                <h3 className="mt-5 text-base font-semibold tracking-tight sm:text-lg">{f.t}</h3>
                <p className="mt-2 text-sm text-zinc-900 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COVERAGE */}
      <section className="border-t border-zinc-100 bg-white/40">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
          <div className="grid gap-8 sm:gap-10 lg:grid-cols-12">
            <div className="text-left lg:col-span-4 lg:text-left">
              
              <h2 className="mt-4 text-xl font-semibold tracking-tight sm:text-3xl">
                One terminal.&nbsp;<br className="hidden sm:inline" />
              </h2>
              <p className="mt-4 text-zinc-900 leading-relaxed">
                Jenvu routes liquidity, structure and news context for XAU/USD&nbsp;
              </p>
            </div>
            <div className="lg:col-span-8 grid grid-cols-1 gap-px bg-zinc-100 border border-zinc-100 rounded-xl overflow-hidden">
              {[
                ["XAU / USD", "Primary bullion benchmark"],
              ].map(([k, v]) => (
                <div key={k} className="bg-white p-5 text-left sm:text-left">
                  <div className={`${MONO} text-[10px] uppercase tracking-widest text-zinc-900`}>{k}</div>
                  <div className="mt-2 text-sm font-medium tracking-tight whitespace-nowrap">{v}</div>
                </div>
              ))}
              <div className="bg-white p-2">
                <div className="h-[320px] w-full sm:h-[420px]">
                  <ClientOnly fallback={<div className="h-full w-full animate-pulse rounded-lg bg-zinc-50" />}>
                    <TradingViewChart symbol="XAUUSD" timeframe="15m" theme="light" />
                  </ClientOnly>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* CHANGELOG */}
      <section className="border-t border-zinc-100 bg-white/40">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
          <div className="mb-8 flex flex-col items-start justify-start gap-2 text-left sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:text-left">
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-3xl">Recent shipments</h2>
            </div>
            <span className={`${MONO} text-[11px] text-zinc-900`}>v2.04.1 · stable</span>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            {[
              ["2026.06.28", "v2.04", "Killzone-aware narration for London & NY sessions.", "Killzone narration for London & NY."],
              ["2026.06.14", "v2.03", "FVG + OB auto-markup on 1H and 15m charts.", "FVG + OB auto-markup on 1H/15m."],
              ["2026.05.30", "v2.02", "Red-folder USD, EUR, GBP, JPY, AUD & CHF news injected per XAU cross.", "Red-folder news injected per XAU cross."],
              ["2026.05.12", "v2.01", "Push-to-talk replaces always-on; cleaner mic control.", "Push-to-talk replaces always-on mic."],
              ["2026.04.28", "v2.00", "Voice-native rewrite. New orb. New signal engine.", "Voice-native rewrite. New orb & engine."],
            ].map(([d, v, n, nShort], i) => (
              <div
                key={v}
                className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 py-4 sm:grid-cols-12 sm:items-center sm:gap-y-0 sm:px-6 ${
                  i !== 0 ? "border-t border-zinc-100" : ""
                }`}
              >
                <span className={`min-w-0 sm:col-span-3 ${MONO} text-[11px] text-zinc-900`}>{d}</span>
                <span className={`shrink-0 sm:col-span-2 ${MONO} text-[11px] font-semibold text-zinc-900 text-right sm:text-left`}>{v}</span>
                <span className="col-span-2 text-sm text-zinc-900 sm:col-span-7 truncate sm:whitespace-normal sm:overflow-visible">
                  <span className="sm:hidden">{nShort}</span>
                  <span className="hidden sm:inline">{n}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-zinc-100">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col items-start gap-4 text-left md:flex-row md:items-end md:justify-between md:text-left">
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                Four steps. One voice.
              </h2>
            </div>
            <p className="max-w-md text-zinc-900 leading-relaxed">
              <span className="sm:hidden">Spoken intent to plan — one voice loop.</span>
              <span className="hidden sm:inline">From spoken intent to executable plan — JENVU compresses a full trading desk into one voice loop.</span>
            </p>

          </div>

          <div className="mt-12 grid gap-px bg-zinc-100 border border-zinc-100 rounded-2xl overflow-hidden md:grid-cols-4">
            {[
              { k: "01", t: "Speak", d: "Push-to-talk and ask in plain English anything.", dm: "Push-to-talk in plain English." },
              { k: "02", t: "Reason", d: "JENVU pulls structure, ICT/SMC, DXY and news.", dm: "Structure, ICT/SMC, DXY, news." },
              { k: "03", t: "Mark Up", d: "Charts auto-annotate FVG, OB, BOS and sweeps.", dm: "Auto-marks FVG, OB, BOS, sweeps." },
              { k: "04", t: "Narrate", d: "Hear an A, A+, B, C plans: entry, SL, TP, R:R.", dm: "A/A+/B/C plans: entry, SL, TP." },
            ].map((s) => (
              <div key={s.k} className="bg-white p-6 text-left sm:p-7">
                <div className={`flex items-center justify-between ${MONO} text-[10px] tracking-widest uppercase text-zinc-900`}>
                  <span>{s.k}</span>
                  <span className="h-px w-10 bg-zinc-900" />
                </div>
                <h3 className="mt-5 text-base font-semibold tracking-tight sm:text-lg">{s.t}</h3>
                <p className="mt-2 text-sm text-zinc-900 leading-relaxed sm:line-clamp-2 sm:min-h-[2.75rem]"><span className="sm:hidden whitespace-nowrap block overflow-hidden text-ellipsis text-[13px]">{s.dm}</span><span className="hidden sm:inline">{s.d}</span></p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* PRICING — comparison matrix (old style) */}
      <section className="border-t border-zinc-100 bg-white">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-16 sm:py-20">
          <div className="mb-10">
            <h2 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight max-sm:whitespace-nowrap max-sm:text-[7vw]">
              <span className="sm:hidden">Compare Plans</span>
              <span className="hidden sm:inline">Compare Jenvu Pro and Elite Plans</span>
            </h2>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[760px] text-sm border-collapse">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[22%] bg-amber-50/40" />
                <col className="w-[22%]" />
                <col className="w-[22%]" />
              </colgroup>

              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="p-6 text-left align-bottom">
                    <span className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Pricing Plans</span>
                  </th>
                  {[
                    { name: "Pro", price: currentPlan === null ? "$5" : "$15", tag: "Active", accent: true, key: "pro", to: "/founding" as const, search: undefined },
                    { name: "Elite", price: "$50", tag: "Desk", dark: true, key: "elite", to: "/founding" as const },
                    { name: "Ultra", price: "$100", tag: "Fund / Desk+", key: "ultra", to: "/founding" as const },
                  ].map((p) => {
                    const trialPro = trial.active && p.key === "pro";
                    const isCurrent = currentPlan === p.key && !trialPro;
                    const isLoggedIn = currentPlan !== null;
                    const disabled = !trialPro && isLoggedIn && !isCurrent && upgradeLock.locked;
                    const cta = trialPro
                      ? "Upgrade to Pro"
                      : isCurrent
                      ? "Active"
                      : disabled
                        ? "Locked in trial"
                        : isLoggedIn
                          ? "Upgrade"
                          : "Apply Now";
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
                        {p.price !== "$0" && (
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
                          to={isLoggedIn ? "/dashboard/pay" : p.to}
                          search={isLoggedIn ? undefined : p.search}
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
                  { f: "", b: "$15/mo", c: "$50/mo", d: "$100/mo", isHeading: true },
                  { f: "Monthly wallet (USD)", b: "$15", c: "$50", d: "$100" },
                  { f: "Voice queries / day", b: "Unlimited", c: "Unlimited", d: "Unlimited" },
                  { f: "Signal latency", b: "Realtime", c: "Realtime", d: "Realtime" },
                  { f: "A+ signal access", b: true, c: true, d: true },
                  { f: "ICT / SMC narration", b: true, c: true, d: true },
                  { f: "Multi-timeframe bias", b: true, c: true, d: true },
                  { f: "Trade journal", b: true, c: true, d: true },
                  { f: "Email + push alerts", b: true, c: true, d: true },
                  { f: "Multi-pair scanner", b: false, c: true, d: true, badge: "new" },
                  { f: "Custom alert rules", b: false, c: true, d: true },
                  { f: "Priority desk support", b: false, c: false, d: true },
                ] as ReadonlyArray<{ f: string; b: string | boolean; c: string | boolean; d: string | boolean; isHeading?: boolean; badge?: string }>).map((row, idx) => (
                  <tr
                    key={row.f}
                    className={`border-t border-zinc-200 ${idx % 2 === 1 ? "bg-zinc-50/40" : ""} hover:bg-amber-50/20 transition`}
                  >
                    <td className="px-6 py-3.5 text-zinc-800">
                      <div className="flex items-center gap-2">
                        {row.badge && (
                          <span className={`${MONO} text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-amber-400 text-zinc-900 font-bold`}>
                            {row.badge}
                          </span>
                        )}
                        <span className={row.isHeading ? "text-[11px] uppercase tracking-wider font-semibold text-zinc-500" : ""}>
                          {row.f}
                        </span>
                      </div>
                    </td>
                    {[row.b, row.c, row.d].map((v, i) => (
                      <td
                        key={i}
                        className={`px-2 py-3.5 text-center border-l border-zinc-200 min-w-[120px] ${i === 0 ? "bg-amber-50/40" : ""}`}
                      >
                        {v === true ? (
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-900" />
                        ) : v === false ? (
                          <span className="inline-block h-px w-4 bg-zinc-200" />
                        ) : (
                          <span className={`${MONO} text-[11px] tracking-wider ${row.isHeading ? "text-zinc-900 font-semibold" : "text-zinc-700"}`}>
                            {v}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>


      {/* TESTIMONIALS */}
      <section className="border-t border-zinc-100 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
          <h2 className="mb-10 text-xl font-semibold tracking-tight sm:text-3xl md:text-4xl">Trusted by traders.</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              ["Feels like sitting next to a 25-year desk trader. The narration alone changed how I read structure.", "A. Rahman", "Prop Desk · Dubai"],
              ["ICT setups marked live on the chart, with voice — I stopped second-guessing my entries.", "M. Chen", "Independent · Singapore"],
              ["Gold execution is on another level. The killzone + sweep logic is exactly how I trade.", "S. Patel", "Family Office · London"],
            ].map(([q, n, r]) => (
              <figure key={n} className="rounded-2xl border border-zinc-200 bg-white p-6">
                <blockquote className="text-sm leading-relaxed text-zinc-700">"{q}"</blockquote>
                <figcaption className="mt-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-medium text-zinc-900">{n}</div>
                    <div className="text-zinc-500">{r}</div>
                  </div>
                  <span className="text-zinc-600" aria-hidden="true">↗</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>


      {/* COMPARISON */}
      <section className="border-t border-zinc-100 bg-white/40">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
          <h2 className="text-left text-xl font-semibold tracking-tight sm:text-3xl md:text-left md:text-4xl">
            Why traders move to JENVU.
          </h2>
          <div className="mt-10 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            <div className={`hidden md:grid grid-cols-4 px-6 py-4 border-b border-zinc-200 ${MONO} text-[10px] uppercase tracking-widest text-zinc-900`}>
              <span>Capability</span>
              <span className="text-center">Generic AI</span>
              <span className="text-center">Signal Group</span>
              <span className="text-center text-zinc-900 font-bold">Jenvu</span>
            </div>
            {[
              ["Voice-native interface", false, false, true],
              ["ICT / SMC framework", false, true, true],
              ["Auto chart markup", false, false, true],
              ["Killzone & session bias", false, false, true],
              ["Gold macro & red-folder context", false, false, true],
              ["Sub-20ms latency", false, false, true],
            ].map(([cap, a, b, c], i) => (
              <div
                key={String(cap)}
                className={`px-5 sm:px-6 py-4 text-sm ${i !== 0 ? "border-t border-zinc-100" : ""}`}
              >
                {/* desktop row */}
                <div className="hidden md:grid grid-cols-4 items-center">
                  <span className="text-zinc-900 font-medium">{cap}</span>
                  <span className="text-center text-zinc-900">{a ? "●" : "—"}</span>
                  <span className="text-center text-zinc-900">{b ? "●" : "—"}</span>
                  <span className="text-center text-zinc-900 font-bold">{c ? "●" : "—"}</span>
                </div>
                {/* mobile stacked */}
                <div className="md:hidden space-y-2">
                  <div className="text-zinc-900 font-medium">{cap}</div>
                  <div className={`grid grid-cols-3 gap-2 ${MONO} text-[10px] uppercase tracking-widest text-zinc-500`}>
                    <div className="flex flex-col items-center gap-1">
                      <span>Generic</span>
                      <span className="text-zinc-900 text-sm">{a ? "●" : "—"}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <span>Signals</span>
                      <span className="text-zinc-900 text-sm">{b ? "●" : "—"}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-zinc-900">JENVU</span>
                      <span className="text-zinc-900 text-sm font-bold">{c ? "●" : "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* INTEGRATIONS */}
      <section className="border-t border-zinc-100 bg-white/40">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-12">
          <div className="flex flex-col md:flex-row items-start justify-between gap-6">
            <div className="text-left md:text-left">
              <h3 className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
                Wired into the venues&nbsp;
              </h3>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {["OANDA XAU feeds", "Yahoo Finance", "LBMA fix", "TradingView", "COMEX / COT", "DXY"].map((n) => (
                <span
                  key={n}
                  className={`rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 ${MONO} text-[11px] tracking-wider text-zinc-900`}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* FAQ */}
      <section className="border-t border-zinc-100">

        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-14">
          <div className="grid gap-8 sm:gap-10 lg:grid-cols-12">
            <div className="text-left lg:col-span-4 lg:text-left">
              <h2 className="text-xl font-semibold tracking-tight sm:text-3xl">Asked often.</h2>
              <p className="mt-3 text-zinc-900">Everything else lives in the docs&nbsp;</p>
            </div>
            <div className="lg:col-span-8 divide-y divide-zinc-100 border-y border-zinc-100">
              {[
                {
                  q: "Which pairs does JENVU cover?",
                  a: "JENVU is a gold-only desk focused entirely on XAU/USD — nothing else.",
                },
                {
                  q: "Does it execute trades automatically?",
                  a: "No. JENVU narrates A+ setups with structured entries, stops and targets — execution stays in your hands.",
                },
                {
                  q: "What model powers the voice agent?",
                  a: "A low-latency Gemini-class model wired through Lovable AI, tuned for institutional trading reasoning.",
                },
                {
                  q: "Does it work on mobile?",
                  a: "Yes. The voice loop, signal engine and charts are fully responsive on phones and tablets.",
                },
                {
                  q: "How accurate are the signals?",
                  a: "Every setup is confluence-graded across ICT, SMC, liquidity and news context. JENVU only narrates A+ setups — when conditions don't align, it stays silent instead of forcing trades.",
                },
                {
                  q: "Do I need trading experience to use it?",
                  a: "No. JENVU explains its reasoning in plain English — bias, structure, entry, stop and target — so beginners learn the logic while pros get an institutional second opinion.",
                },

              ].map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                    <span className="min-w-0 text-base font-medium text-zinc-900">{f.q}</span>
                    <span className={`${MONO} shrink-0 text-zinc-900 group-open:rotate-45 transition-transform`}>+</span>
                  </summary>
                  <p className="mt-3 text-sm text-zinc-900 leading-relaxed max-w-2xl">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-100 overflow-hidden">

        <div className="mx-auto max-w-6xl px-5 sm:px-6 pt-6 pb-24">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10 md:p-14 flex flex-col md:flex-row items-center md:items-start justify-between gap-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.12)]">
            <div className="max-w-xl text-left md:text-left">
              <h2 className="text-xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
                Boot the terminal.&nbsp;<br />
                Speak to the market now.
              </h2>
              <p className="mt-3 text-zinc-900 text-[15px] sm:text-base leading-snug">
                Your voice agent is one tap away<br className="md:hidden" />
                <span className="hidden md:inline"> listening<br className="hidden md:inline" /> </span>
                <span className="md:hidden">listening, thinking &amp; narrating.</span>
                <span className="hidden md:inline">reasoning, thinking, research &amp; narrating.</span>
              </p>
              <div className="mt-7 flex flex-col items-stretch justify-start gap-3 sm:flex-row md:justify-start">
                <Link
                  to="/app"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Launch Voice Agent
                </Link>
                <Link
                  to="/signals-live"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-white"
                >
                  Open Signal Engine
                </Link>
              </div>
            </div>
            <div className="relative mx-auto md:mx-0 h-24 w-24 sm:h-56 sm:w-56 shrink-0">
              <CloudOrb status="speaking" pulse={1} />
            </div>
          </div>
        </div>
      </section>
      </main>

      <SiteFooter />
    </div>
    </>

  );
}

