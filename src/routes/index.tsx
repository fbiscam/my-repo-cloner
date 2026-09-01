import * as React from "react";
{/* Build a Chrome extension that integrates with my existing ICT/SMC analysis workflow and runs on TradingView pages. */}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CloudOrb } from "@/components/CloudOrb";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";


import { useAuthUser } from "@/hooks/useAuthUser";
import { useTrial } from "@/hooks/useTrial";
import { useCurrentPlan } from "@/hooks/useCurrentPlan";
import { useUpgradeLock } from "@/hooks/useUpgradeLock";
import { getMarketSnapshotsBatch } from "@/lib/gold-analysis.functions";
import { getXauProjection, getXauTick, type XauProjection, type XauTick } from "@/lib/home-projection.functions";
import {
  getCorrelatedMarkets,
  type CorrelatedBoard,
  type CorrelatedMarket,
} from "@/lib/correlated-markets.functions";

/* Neutral skeleton rows shown until the live macro feed hydrates. */
const CORR_PLACEHOLDER: CorrelatedMarket[] = [
  { symbol: "DXY", display: "DXY", note: "USD strength — inverse driver" },
  { symbol: "US10Y", display: "US10Y", note: "Real yields — inverse driver" },
  { symbol: "XAGUSD", display: "XAG/USD", note: "Silver beta — confirms metals" },
  { symbol: "EURUSD", display: "EUR/USD", note: "USD leg — positive driver" },
  { symbol: "USDJPY", display: "USD/JPY", note: "Carry / risk — inverse driver" },
  { symbol: "SPX", display: "S&P 500", note: "Risk appetite — rotation cue" },
  { symbol: "WTI", display: "WTI Oil", note: "Inflation impulse — positive" },
].map((m) => ({
  ...m,
  price: 0,
  decimals: 2,
  changePct: 0,
  high: 0,
  low: 0,
  rangePos: 50,
  series: [],
  correlation: 0,
  impact: "neutral" as const,
}));

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

  // Keep SSR independent from third-party market feeds. Live prices hydrate
  // after first paint, so a slow provider can never prevent the page loading.
  // The XAU projection is primed server-side (5-min cache) so the very first
  // paint shows the real live price instead of a stale placeholder.
  loader: async () => {
    const [projection, board] = await Promise.all([
      getXauProjection().catch(() => null),
      getCorrelatedMarkets().catch(() => null),
    ]);
    return { tickerRows: INITIAL_TICKER, projection, board };
  },
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-sm text-zinc-600">{(error as Error)?.message ?? "Something went wrong."}</div>
  ),
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
    // One refresh per minute is sufficient for the compact homepage ticker and
    // avoids exhausting the server runtime's outbound connection limit.
    fetchPrices();
    const id = setInterval(fetchPrices, 60_000);
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
function useXauProjection(initial: XauProjection | null): XauProjection | null {
  const [data, setData] = React.useState<XauProjection | null>(initial);
  // Full ICT/SMC engine read + BluesMind gpt-4o senior review (server cached).
  const fetchProjection = useServerFn(getXauProjection);
  // 1s spot tick — keeps the printed price live between analysis refreshes.
  const fetchTick = useServerFn(getXauTick);

  React.useEffect(() => {
    let alive = true;
    let analysisInFlight = false;
    let tickInFlight = false;

    const runAnalysis = async () => {
      if (analysisInFlight) return;
      analysisInFlight = true;
      try {
        const res = await fetchProjection();
        if (alive && res) setData(res as XauProjection);
      } catch { /* keep last known values */ } finally { analysisInFlight = false; }
    };

    const runTick = async () => {
      if (tickInFlight) return;
      tickInFlight = true;
      try {
        const tick = (await fetchTick()) as XauTick | null;
        if (alive && tick) {
          setData((prev) =>
            prev
              ? { ...prev, price: tick.price, changePct: tick.changePct, updatedAt: tick.updatedAt }
              : prev,
          );
        }
      } catch { /* keep last known price */ } finally { tickInFlight = false; }
    };

    runAnalysis();
    runTick();
    const analysisId = setInterval(runAnalysis, 60_000);
    const tickId = setInterval(runTick, 1_000);
    return () => { alive = false; clearInterval(analysisId); clearInterval(tickId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return data;
}

/* Live macro board: markets that materially move the XAU/USD price. */
function useCorrelatedMarkets(initial: CorrelatedBoard | null): CorrelatedBoard | null {
  const [data, setData] = React.useState<CorrelatedBoard | null>(initial);
  const fetchBoard = useServerFn(getCorrelatedMarkets);

  React.useEffect(() => {
    let alive = true;
    let inFlight = false;
    const run = async () => {
      if (inFlight) return; // never stack requests on the 5s tick
      inFlight = true;
      try {
        const res = await fetchBoard();
        if (alive && res) setData(res as CorrelatedBoard);
      } catch { /* keep last known values */ } finally { inFlight = false; }
    };
    run();
    const id = setInterval(run, 1_000);
    return () => { alive = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return data;
}

/* Tiny low/high sparkline for one correlated market row. */
function Sparkline({ series, up }: { series: number[]; up: boolean }) {
  if (!series || series.length < 3) {
    return <div className="h-8 w-full rounded bg-zinc-50" />;
  }
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;
  const W = 120;
  const H = 32;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * W;
    const y = H - 3 - ((v - lo) / span) * (H - 6);
    return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
  });
  const stroke = up ? "#10b981" : "#ef4444";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-[110px]" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={`0,${H} ${pts.join(" ")} ${W},${H}`}
        fill={up ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
        stroke="none"
      />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={W} cy={pts[pts.length - 1].split(",")[1]} r="2" fill={stroke} />
    </svg>
  );
}

/* Turns the engine/AI projection into display strings + SVG chart geometry.
   While live data is missing we render a neutral loading read-out — never
   stale prices, which used to flash an old ~2,4xx quote on first paint. */
function buildProjectionView(p: XauProjection | null) {
  const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  if (!p) {
    return {
      live: false,
      price: "—",
      changePct: "—",
      up: true,
      biasLabel: "—",
      longPct: 50,
      confidence: 0,
      confidenceSeries: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      tf: [["H1", "—"], ["H4", "—"], ["1D", "—"], ["1W", "—"]] as [string, string][],
      readout: [["Target", "—"], ["Invalidation", "—"], ["Key Level", "—"], ["Est. R:R", "—"]] as [string, string][],
      actualPath: "",
      actualArea: "",
      forecastPath: "",
      bandPath: "",
      nowY: 130,
      endY: 130,
      note: "Connecting to live XAU/USD feed…",
      model: "",
    };
  }

  const series = p.series.length >= 8 ? p.series : [p.price, p.price];
  const fc = [p.price, p.targets.h1, p.targets.h4, p.targets.d1, p.targets.w1];
  const all = [...series, ...fc, p.invalidation, p.keyLevel];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const y = (v: number) => Math.round(((max - v) / span) * 190 + 20);

  const step = 360 / Math.max(1, series.length - 1);
  const pts = series.map((v, i) => `${Math.round(i * step)} ${y(v)}`);
  const actualPath = `M${pts.join(" L")}`;
  const actualArea = `${actualPath} L360 240 L0 240 Z`;

  const fxs = fc.map((v, i) => `${360 + i * 60} ${y(v)}`);
  const forecastPath = `M${fxs.join(" L")}`;
  const spread = (i: number) => 6 + i * 7;
  const upper = fc.map((v, i) => `${360 + i * 60} ${y(v) - spread(i)}`);
  const lower = fc.map((v, i) => `${360 + i * 60} ${y(v) + spread(i)}`).reverse();
  const bandPath = `M${upper.join(" L")} L${lower.join(" L")} Z`;

  const up = p.changePct >= 0;
  return {
    live: true,
    price: num(p.price),
    changePct: `${up ? "+" : ""}${p.changePct.toFixed(2)}%`,
    up,
    biasLabel: p.bias.charAt(0).toUpperCase() + p.bias.slice(1),
    longPct: p.longPct,
    confidence: p.confidence,
    confidenceSeries: p.confidenceSeries,
    tf: [
      ["H1", num(p.targets.h1)],
      ["H4", num(p.targets.h4)],
      ["1D", num(p.targets.d1)],
      ["1W", num(p.targets.w1)],
    ] as [string, string][],
    readout: [
      ["Target", num(p.targets.d1)],
      ["Invalidation", num(p.invalidation)],
      ["Key Level", num(p.keyLevel)],
      ["Est. R:R", `1 : ${p.rr.toFixed(1)}`],
    ] as [string, string][],
    actualPath,
    actualArea,
    forecastPath,
    bandPath,
    nowY: y(p.price),
    endY: y(p.targets.w1),
    note: p.narrative,
    model: p.model,
  };
}

function HomePage() {
  const ticker = useLiveTicker();
  const initialProjection = (Route.useLoaderData() as { projection?: XauProjection | null } | undefined)?.projection ?? null;
  const projection = useXauProjection(initialProjection);
  const board = useCorrelatedMarkets(
    (Route.useLoaderData() as { board?: CorrelatedBoard | null } | undefined)?.board ?? null,
  );
  const proj = React.useMemo(() => buildProjectionView(projection), [projection]);
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
          <div className="relative">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-zinc-100 select-none">
              {/* LEFT — prediction chart */}
              <div className="relative lg:col-span-8 bg-white p-5 sm:p-6 flex flex-col min-h-[330px] sm:min-h-[440px] select-none">
                <div className="flex flex-1 flex-col">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 className={`text-[10px] font-bold ${MONO} text-zinc-900 tracking-widest uppercase`}>
                        XAU/USD · Price Projection
                      </h2>
                      <div className="mt-2 flex items-end gap-3">
                        <span className="text-2xl font-semibold tracking-tight sm:text-3xl">{proj.price}</span>
                        <span className={`pb-1 text-xs font-medium ${proj.up ? "text-emerald-600" : "text-red-600"}`}>{proj.changePct}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="h-px w-5 bg-zinc-900" />
                        <span className={`text-[10px] ${MONO} uppercase text-zinc-500`}>Actual</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-px w-5 bg-emerald-500 [background-image:repeating-linear-gradient(90deg,currentColor_0,currentColor_3px,transparent_3px,transparent_6px)] text-emerald-500" />
                        <span className={`text-[10px] ${MONO} uppercase text-zinc-500`}>Forecast</span>
                      </div>
                    </div>
                  </div>

                  <div className="relative mt-6 flex-1">
                    <svg viewBox="0 0 600 240" preserveAspectRatio="none" className="h-full min-h-[190px] w-full">
                      <defs>
                        <linearGradient id="xauFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#18181b" stopOpacity="0.14" />
                          <stop offset="100%" stopColor="#18181b" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="xauBand" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      {[40, 90, 140, 190].map((y) => (
                        <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#f4f4f5" strokeWidth="1" />
                      ))}
                      {/* forecast confidence band */}
                      <path d={proj.bandPath} fill="url(#xauBand)" />
                      {/* historical area + line */}
                      <path d={proj.actualArea} fill="url(#xauFill)" />
                      <path
                        d={proj.actualPath}
                        fill="none"
                        stroke="#18181b"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {/* forecast line */}
                      <path
                        d={proj.forecastPath}
                        fill="none"
                        stroke={proj.biasLabel === "Bearish" ? "#ef4444" : "#10b981"}
                        strokeWidth="2"
                        strokeDasharray="5 5"
                        strokeLinecap="round"
                      />
                      <line x1="360" y1="0" x2="360" y2="240" stroke="#e4e4e7" strokeWidth="1" strokeDasharray="3 4" />
                      <circle cx="360" cy={proj.nowY} r="4" fill="#18181b" />
                      <circle cx="600" cy={proj.endY} r="4" fill={proj.biasLabel === "Bearish" ? "#ef4444" : "#10b981"} />
                    </svg>
                    <span className={`absolute left-[59%] top-0 text-[9px] ${MONO} uppercase text-zinc-400`}>now</span>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-zinc-100 bg-zinc-100">
                    {proj.tf.map(([k, v]) => (
                      <div key={k} className="bg-white px-3 py-2">
                        <div className={`text-[9px] ${MONO} uppercase tracking-widest text-zinc-400`}>{k}</div>
                        <div className={`mt-1 text-xs font-semibold ${MONO}`}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* RIGHT — model read-out (always visible) */}
              <div className="lg:col-span-4 bg-white p-5 sm:p-6 lg:border-l border-zinc-100">
                <h2 className={`text-[10px] font-bold ${MONO} text-zinc-900 tracking-widest uppercase mb-4`}>
                  Model Read-Out
                </h2>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-900">Directional Bias</span>
                      <span className={`text-xs font-medium ${proj.biasLabel === "Bearish" ? "text-red-600" : proj.biasLabel === "Neutral" ? "text-zinc-500" : "text-emerald-600"}`}>
                        {proj.biasLabel}
                      </span>
                    </div>
                    <div className="flex h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={proj.biasLabel === "Bearish" ? "bg-red-500" : "bg-emerald-500"}
                        style={{ width: `${proj.longPct}%` }}
                      />
                      <div className="bg-zinc-200" style={{ width: `${100 - proj.longPct}%` }} />
                    </div>
                    <div className={`flex justify-between text-[10px] ${MONO} text-zinc-400`}>
                      <span>{proj.longPct}% long</span>
                      <span>{100 - proj.longPct}% short</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-end justify-between">
                      <span className={`text-[10px] ${MONO} uppercase text-zinc-500`}>Model Confidence</span>
                      <span className="text-xs font-semibold">{proj.confidence}%</span>
                    </div>
                    <div className="flex h-16 items-end gap-0.5 rounded border border-zinc-100 p-2">
                      {proj.confidenceSeries.map((h, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-t-sm ${h > 75 ? "bg-emerald-500" : h > 60 ? "bg-zinc-400" : "bg-zinc-200"}`}
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {proj.readout.map(([k, v]) => (
                      <div key={k} className="rounded-lg border border-zinc-100 p-2">
                        <p className={`text-[10px] ${MONO} text-zinc-500`}>{k}</p>
                        <p className={`text-xs ${MONO} font-medium`}>{v}</p>
                      </div>
                    ))}
                  </div>

                  <Link
                    to="/signals-live"
                    className={`w-full inline-flex items-center justify-center mt-2 py-3 bg-zinc-900 text-white text-[11px] font-semibold tracking-[0.18em] rounded-lg hover:bg-zinc-800 transition-colors uppercase`}
                  >
                    View Live Signals
                  </Link>
                </div>
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

          {/* CORRELATED MARKETS — live prices that move XAU/USD */}
          <div className="mt-12 overflow-hidden rounded-2xl border border-zinc-100 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3.5">
              <h3 className={`text-[10px] font-bold ${MONO} uppercase tracking-widest text-zinc-900`}>
                Markets that move XAU/USD
              </h3>
              <span className={`flex items-center gap-2 text-[9px] ${MONO} uppercase tracking-widest text-zinc-400`}>
                <span className={`h-1.5 w-1.5 rounded-full ${board ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`} />
                {board ? "live · 24h range" : "connecting feed"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className={`text-left text-[9px] ${MONO} uppercase tracking-widest text-zinc-400`}>
                    <th className="px-5 py-2.5 font-medium">Market</th>
                    <th className="px-3 py-2.5 text-right font-medium">Price</th>
                    <th className="px-3 py-2.5 text-right font-medium">24h</th>
                    <th className="px-3 py-2.5 font-medium">Low / High</th>
                    <th className="px-3 py-2.5 font-medium">Trend</th>
                    <th className="px-5 py-2.5 text-right font-medium">Gold impact</th>
                  </tr>
                </thead>
                <tbody>
                  {(board?.markets ?? CORR_PLACEHOLDER).map((m) => {
                    const live = !!board;
                    const up = m.changePct >= 0;
                    return (
                      <tr key={m.symbol} className="border-t border-zinc-100 align-middle">
                        <td className="px-5 py-3.5">
                          <div className="text-[13px] font-semibold tracking-tight text-zinc-900">{m.display}</div>
                          <div className="mt-0.5 text-[11px] leading-tight text-zinc-500">{m.note}</div>
                        </td>
                        <td className={`px-3 py-3.5 text-right text-[13px] font-semibold ${MONO} text-zinc-900`}>
                          {live
                            ? m.price.toLocaleString("en-US", {
                                minimumFractionDigits: Math.min(m.decimals, 3),
                                maximumFractionDigits: Math.min(m.decimals, 3),
                              })
                            : "—"}
                        </td>
                        <td className={`px-3 py-3.5 text-right text-[13px] font-semibold ${MONO} ${live ? (up ? "text-emerald-600" : "text-red-500") : "text-zinc-300"}`}>
                          {live ? `${up ? "+" : ""}${m.changePct.toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="w-[132px]">
                            <div className="relative h-1 w-full rounded-full bg-zinc-100">
                              <span
                                className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-white ${up ? "bg-emerald-500" : "bg-red-500"}`}
                                style={{ left: `calc(${live ? Math.min(96, Math.max(2, m.rangePos)) : 50}% - 5px)` }}
                              />
                            </div>
                            <div className={`mt-1.5 flex justify-between text-[9px] ${MONO} text-zinc-400`}>
                              <span>{live ? m.low.toLocaleString("en-US") : "—"}</span>
                              <span>{live ? m.high.toLocaleString("en-US") : "—"}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <Sparkline series={m.series} up={up} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold ${MONO} uppercase tracking-widest ${
                              !live
                                ? "bg-zinc-50 text-zinc-400"
                                : m.impact === "bullish"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : m.impact === "bearish"
                                    ? "bg-red-50 text-red-600"
                                    : "bg-zinc-100 text-zinc-500"
                            }`}
                          >
                            {live ? m.impact : "—"}
                          </span>
                          <div className={`mt-1 text-[9px] ${MONO} text-zinc-400`}>
                            corr {live ? (m.correlation > 0 ? "+" : "") + m.correlation.toFixed(2) : "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={`border-t border-zinc-100 px-5 py-3 text-[9px] ${MONO} uppercase tracking-widest text-zinc-400`}>
              Correlation vs XAU/USD hourly returns · context feeds only — Jenvu trades XAU/USD exclusively
            </div>
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
                  { f: "ICT / SMC narration", b: true, c: true, d: true, badge: "New" },
                  { f: "Multi-timeframe bias", b: true, c: true, d: true },
                  { f: "Trade journal", b: true, c: true, d: true },
                  { f: "Email + push alerts", b: true, c: true, d: true },
                  
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

