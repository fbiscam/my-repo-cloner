import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import * as React from "react";
import { toast } from "sonner";
import { Mic, X, Plus, Sliders, LogOut, ArrowUp } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SignalCard } from "@/components/SignalCard";
import { NewsPanel } from "@/components/NewsPanel";
import { useSpeech, VOICE_PRESETS, type VoicePresetKey } from "@/hooks/useSpeech";
import { analyzeGold, getSignalPlan, normalizeQuery, type GoldSignal, type SignalPlan } from "@/lib/gold-analysis.functions";
import { getGoldNews } from "@/lib/news.functions";
import { useCredits } from "@/hooks/useCredits";
import { appendVoiceTurn } from "@/lib/voice-history";
import { voiceQuickReply } from "@/lib/voice-quick-reply.functions";
import PageLoading from "@/components/PageLoading";
import { CloudOrb as SharedCloudOrb } from "@/components/CloudOrb";
import { useAuthUser } from "@/hooks/useAuthUser";


import { cn } from "@/lib/utils";

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

function clearStoredAuthSession() {
  if (typeof window === "undefined") return;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) {
        storage.removeItem(key);
      }
    }
  }
}

/* ---------- ticker (matches homepage) ---------- */
import { useLiveTicker, type TickerRow } from "@/hooks/useLiveTicker";



export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Voice Terminal — Jenvu" },
      { name: "robots", content: "noindex, follow" },
      {
        name: "description",
        content:
          "Speak to Jenvu and get live institutional ICT/SMC analysis for XAU/USD gold — A+ setups, structured entries, stops and targets narrated in real time.",
      },
      { name: "keywords", content: "voice gold trading agent, XAU/USD voice analysis, ICT gold agent, SMC bullion AI, XAUUSD voice signals" },
      { property: "og:title", content: "Voice Gold Trading Terminal — Jenvu" },
      { property: "og:description", content: "Voice-native institutional bullion desk focused on XAU/USD." },
      { property: "og:url", content: "https://jenvu.com/app" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Voice Trading Terminal — Jenvu" },
      { name: "twitter:description", content: "Speak. Analyze. Execute. Institutional ICT/SMC narrated live." },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/app" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Jenvu Voice Terminal",
          url: "https://jenvu.com/app",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          description:
            "Voice-native AI gold trading terminal that narrates institutional ICT/SMC analysis for XAU/USD in real time.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: Home,
});

const TF_REGEX =
  /\b(1\s*m(?:in)?|5\s*m(?:in)?|15\s*m(?:in)?|30\s*m(?:in)?|1\s*h(?:our)?|4\s*h(?:our)?|1\s*d(?:ay)?|one\s+minute|five\s+minute|fifteen\s+minute|thirty\s+minute|one\s+hour|four\s+hour|daily)\b/i;

function parseTimeframe(text: string, fallback: string): string {
  const m = text.match(TF_REGEX);
  if (!m) return fallback;
  const t = m[1].toLowerCase().replace(/\s+/g, "");
  if (t.startsWith("one") && t.includes("minute")) return "1m";
  if (t.startsWith("five")) return "5m";
  if (t.startsWith("fifteen")) return "15m";
  if (t.startsWith("thirty")) return "30m";
  if (t.startsWith("onehour")) return "1h";
  if (t.startsWith("fourhour")) return "4h";
  if (t === "daily") return "1d";
  if (t.startsWith("1m") || t === "1min") return "1m";
  if (t.startsWith("5m")) return "5m";
  if (t.startsWith("15m")) return "15m";
  if (t.startsWith("30m")) return "30m";
  if (t.startsWith("1h")) return "1h";
  if (t.startsWith("4h")) return "4h";
  if (t.startsWith("1d")) return "1d";
  return fallback;
}

const SYMBOL_KEYWORDS: Array<{ rx: RegExp; sym: string }> = [
  // Silver
  { rx: /\b(silver|xag(?:\/?usd)?|chandi)\b/i, sym: "XAGUSD" },
  // Crypto
  { rx: /\b(btc|bitcoin|bit\s*coin)\b/i, sym: "BTCUSDT" },
  { rx: /\b(eth|ether(?:eum)?)\b/i, sym: "ETHUSDT" },
  { rx: /\b(sol|solana)\b/i, sym: "SOLUSDT" },
  { rx: /\b(xrp|ripple)\b/i, sym: "XRPUSDT" },
  // Forex majors
  { rx: /\beur\s*\/?\s*usd\b|\beuro?\s*dollar\b/i, sym: "EURUSD" },
  { rx: /\bgbp\s*\/?\s*usd\b|\bcable\b|\bpound\s*dollar\b/i, sym: "GBPUSD" },
  { rx: /\busd\s*\/?\s*jpy\b|\bdollar\s*yen\b/i, sym: "USDJPY" },
  { rx: /\baud\s*\/?\s*usd\b/i, sym: "AUDUSD" },
  { rx: /\bnzd\s*\/?\s*usd\b/i, sym: "NZDUSD" },
  { rx: /\busd\s*\/?\s*cad\b/i, sym: "USDCAD" },
  { rx: /\busd\s*\/?\s*chf\b/i, sym: "USDCHF" },
  // Gold default (last, so specific crosses win)
  { rx: /\b(gold|sona|xau(?:\/?usd)?|bullion)\b/i, sym: "XAUUSD" },
  { rx: /\bdxy\b|\bdollar\s*index\b/i, sym: "DXY" },
];

function detectSymbol(query: string): string {
  const q = normalizeQuery(query);
  for (const { rx, sym } of SYMBOL_KEYWORDS) if (rx.test(q)) return sym;
  return "XAUUSD";
}

// Broad intent detection. `normalizeQuery` already folds Roman-Urdu variants
// ("anlyze", "analays", "kro analysis" → "analyze"), so we just need a wide
// English keyword net. Explicit Urdu/Hindi verbs are added for phrases the
// normalizer can't fully rewrite ("signal do", "trade batao", "chart dekho").
const ANALYZE_INTENT_RX =
  /\b(signal|setup|trade\s*idea|trade\s*plan|analyze|analys(?:i|e)s|scan|scanning|new\s*signal|full\s*analysis|market\s*analysis|forecast|prediction|forecast|read\s*(?:the\s*)?market|check\s*(?:the\s*)?(?:market|chart|price)|entry|buy\s*or\s*sell|buy\/sell|long\s*or\s*short|do\s*analysis|run\s*analysis|analyze\s*kar|signal\s*de|signal\s*do|trade\s*batao|batao|dekho|chart\s*pe|kya\s*trade|kya\s*setup)\b/i;
const OPEN_CHART_RX =
  /\b(live\s*chart|show\s*chart|chart\s*open|open\s*chart|view\s*chart|signal\s*desk|charts?\s*kholo|desk\s*kholo)\b/i;

function signalPlanToGoldSignal(plan: SignalPlan): GoldSignal {
  const d = Math.max(0, Math.min(6, plan.instrument.decimals ?? 2));
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const tps: string[] = [];
  if (typeof plan.trade.tp1 === "number") tps.push(fmt(plan.trade.tp1));
  if (typeof plan.trade.tp2 === "number") tps.push(fmt(plan.trade.tp2));
  if (typeof plan.trade.tp3 === "number") tps.push(fmt(plan.trade.tp3));
  if (tps.length === 0) tps.push(fmt(plan.trade.tp));
  const biasMap = { bullish: "BULLISH", bearish: "BEARISH", neutral: "NEUTRAL" } as const;
  return {
    bias: biasMap[plan.htfBias] ?? "NEUTRAL",
    direction: plan.trade.direction,
    entry: fmt(plan.trade.entry),
    stopLoss: fmt(plan.trade.sl),
    takeProfits: tps,
    riskReward: `1:${(plan.trade.rr ?? 0).toFixed(2)}`,
    confidence: plan.trade.confidence,
    killzone: plan.killzone,
    confluences: plan.confluences ?? [],
    ictAnalysis: plan.htfNarrative,
    smcAnalysis: plan.ltfNarrative,
    marketStructure: plan.alignmentLabel,
    spokenSummary: plan.trade.summary,
    fullAnalysis: `${plan.intro}\n\n${plan.htfNarrative}\n\n${plan.ltfNarrative}`,
    timeframe: "HTF+LTF",
    currentPrice: plan.currentPrice,
    generatedAt: plan.generatedAt,
  };
}

function Home() {
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading } = useAuthUser();
  useEffect(() => {
    if (authLoading || authUser) return;
    navigate({ to: "/auth", replace: true });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/auth", replace: true });
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [authLoading, authUser, navigate]);

  const signOut = async () => {
    // NOTE: Do NOT revoke the trusted-device row here — a normal sign-out
    // must keep this browser trusted so the user isn't prompted for MFA on
    // every subsequent login. Trusted devices are only cleared when the user
    // explicitly uses "Forget this device" / "Revoke" in Security settings.
    clearStoredAuthSession();
    void supabase.auth.signOut({ scope: "global" }).catch(() => { /* ignore network errors */ });
    navigate({ to: "/auth", replace: true });
  };


  const analyze = useServerFn(analyzeGold);
  const fetchSignalPlan = useServerFn(getSignalPlan);
  const quickReply = useServerFn(voiceQuickReply);
  const credits = useCredits();

  const fetchNews = useServerFn(getGoldNews);

  const [timeframe, setTimeframe] = useState<string>("15m");
  const [signal, setSignal] = useState<GoldSignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const speech = useSpeech();
  const lastHandled = useRef("");
  const loadingRef = useRef(false);
  const greetedRef = useRef(false);
  const alertedRef = useRef<Set<string>>(new Set());
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferRef = useRef("");
  const interimRef = useRef("");
  const transcriptRef = useRef("");
  useEffect(() => { interimRef.current = speech.interim; }, [speech.interim]);
  useEffect(() => { transcriptRef.current = speech.transcript; }, [speech.transcript]);

  const [dark, setDark] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem("jenvu.theme");
    if (v) setDark(v === "dark");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("jenvu.theme", dark ? "dark" : "light");
  }, [dark]);

  const news = useQuery({
    queryKey: ["gold-news"],
    queryFn: () => fetchNews(),
    refetchInterval: 1000 * 60 * 5, // 5 min
    staleTime: 1000 * 60 * 2,
  });

  const status: "idle" | "listening" | "thinking" | "speaking" = loading
    ? "thinking"
    : speech.speaking
      ? "speaking"
      : speech.listening
        ? "listening"
        : "idle";

  function armSleep() {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = setTimeout(() => {
      speech.stopListening();
    }, 45_000); // go back to standby after 45s of silence
  }

  const handleCommand = useCallback(async (query: string) => {
    if (loadingRef.current || !query.trim()) return;
    const q = normalizeQuery(query);

    const analyzeIntent = ANALYZE_INTENT_RX.test(q);
    const openChartIntent = OPEN_CHART_RX.test(q);

    // Gold-only guard: if user references a non-XAU instrument, refuse politely.
    if (analyzeIntent || openChartIntent) {
      const symbol = detectSymbol(query);
      const mentionsNonGold = /\b(xau\s*\/?\s*(?:eur|gbp|jpy|aud|chf)|gold\s*(?:in\s*)?(?:eur|euro|gbp|pound|sterling|jpy|yen|aud|chf|franc)|silver|xag|btc|bitcoin|eth|ether|solana|\bsol\b|xrp|ripple|eur\s*\/?\s*usd|gbp\s*\/?\s*usd|usd\s*\/?\s*jpy|aud\s*\/?\s*usd|nzd\s*\/?\s*usd|usd\s*\/?\s*cad|usd\s*\/?\s*chf|dxy|dollar\s*index|cable|euro\s*dollar|dollar\s*yen)\b/i.test(q);
      if (symbol !== "XAUUSD" || mentionsNonGold) {
        const reply = "I only analyze XAU/USD gold. Please ask about XAU/USD.";
        speech.speak(reply, () => {
          speech.resumeIfWanted();
          armSleep();
        });
        appendVoiceTurn({ query, reply });
        return;
      }

      // "open chart / show chart / live chart" → route to the full desk
      if (openChartIntent) {
        speech.stopSpeaking();
        speech.pauseListening();
        navigate({ to: "/signals-live", replace: true });
        return;
      }

      // Analyze / signal / setup / trade-idea intent → open the full Live Signals
      speech.stopSpeaking();
      speech.pauseListening();
      navigate({ to: "/signals-live", replace: true });
      return;
    }


    loadingRef.current = true;
    setLoading(true);
    speech.pauseListening();
    const tf = parseTimeframe(query, timeframe);
    if (tf !== timeframe) setTimeframe(tf);
    try {
      if (analyzeIntent) {
        const symbol = detectSymbol(query);
        // Pre-flight low-balance guard — block before hitting the server.
        if (!credits.isLoading && credits.balance < 0.20) {
          const msg = `Your balance is $${credits.balance.toFixed(2)}. You need at least $0.20 to run a signal scan.`;
          toast.error("Balance too low", {
            description: `${msg} Add funds to continue.`,
            action: { label: "Add funds", onClick: () => (window.location.href = "/dashboard/billing") },
          });
          speech.speak("Your balance is too low to run a signal analysis. Please add funds.", () => {
            speech.resumeIfWanted();
            armSleep();
          });
          loadingRef.current = false;
          setLoading(false);
          return;
        }
        const scanId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const ok = await credits.spend("signal", { symbol, scanId, caller: "app.tsx:handleCommand" });
        if (!ok) {
          loadingRef.current = false;
          setLoading(false);
          speech.resumeIfWanted();
          return;
        }
        const signalResult = await fetchSignalPlan({ data: { symbol, force: true, scanId } });
        if (!signalResult.ok) throw new Error(signalResult.error);
        const plan = signalResult.plan;
        const mapped = signalPlanToGoldSignal(plan);
        setSignal(mapped);
        appendVoiceTurn({ query, reply: mapped.spokenSummary });
        speech.speak(mapped.spokenSummary, () => {
          speech.resumeIfWanted();
          armSleep();
        });
      } else {
        const ok = await credits.spend("voice_query", { query: query.slice(0, 80) });
        if (!ok) {
          loadingRef.current = false;
          setLoading(false);
          speech.resumeIfWanted();
          return;
        }
        const result = await quickReply({ data: { query } });
        const reply = result.reply;
        appendVoiceTurn({ query, reply });
        speech.speak(reply, () => {
          speech.resumeIfWanted();
          armSleep();
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "Analysis failed");
      speech.speak("Sorry, the analysis failed.", () => {
        speech.resumeIfWanted();
        armSleep();
      });
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [analyze, fetchSignalPlan, quickReply, speech, timeframe, navigate, credits]);

  // Accumulate final transcripts into a buffer while listening (do NOT send yet)
  useEffect(() => {
    const t = speech.transcript;
    const key = `${speech.transcriptId}:${t}`;
    if (!t || key === lastHandled.current) return;
    lastHandled.current = key;
    bufferRef.current = (bufferRef.current ? bufferRef.current + " " : "") + t;
  }, [speech.transcript, speech.transcriptId]);

  // News alert: announce high-impact events <=15 min away
  useEffect(() => {
    const events = news.data;
    if (!events || !events.length) return;
    for (const e of events) {
      if (e.impact !== "High") continue;
      if (e.minutesUntil < 0 || e.minutesUntil > 15) continue;
      const key = e.date + e.title;
      if (alertedRef.current.has(key)) continue;
      alertedRef.current.add(key);
      const line = `Heads up. High-impact ${e.country} news in ${e.minutesUntil} minutes: ${e.title}. Expect volatility on gold.`;
      toast.warning(line);
      if (!loadingRef.current) {
        speech.pauseListening();
        speech.speak(line, () => speech.resumeIfWanted());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news.data]);

  const toggleMic = () => {
    if (!speech.supported) { toast.error("Voice not supported. Use Chrome."); return; }
    if (speech.listening) {
      // User pressed stop → wait for final results to flush, then send
      speech.stopListening();
      const tryFlush = (attempt = 0) => {
        const captured = (bufferRef.current + " " + (interimRef.current || "") + " " + (transcriptRef.current || "")).trim();
        if (!captured && attempt < 6) {
          window.setTimeout(() => tryFlush(attempt + 1), 90);
          return;
        }
        bufferRef.current = "";
        if (!captured) {
          toast.message("Didn't catch that — please try again.");
          return;
        }
        const lower = captured.toLowerCase();
        const wakeMatch = lower.match(/\b(hey|hi|ok|okay)?\s*(jenvu|janvu|jarvis|jen view|jen vu)\b[\s,.!?]*(.*)/i);
        const cmd = (wakeMatch?.[3]?.trim() || captured).trim();
        if (cmd.length > 0) handleCommand(cmd);
      };
      window.setTimeout(() => tryFlush(0), 100);
      return;
    }
    bufferRef.current = "";
    speech.startListening();
  };




  const submitText = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    handleCommand(t);
  };

  const endAll = () => {
    speech.stopListening();
    speech.stopSpeaking();
  };


  const ticker = useLiveTicker();

  if (authLoading || !authUser) {
    return <PageLoading label="Opening voice terminal" />;
  }

  return (
    <div className={cn(`overflow-hidden flex flex-col ${SANS} antialiased overscroll-none`, "bg-white text-zinc-900")} style={{ zoom: 1.1, height: "calc(100dvh / 1.1)", width: "calc(100vw / 1.1)" }}>
      {/* HEADER (matches homepage) */}
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md shrink-0">
        <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
            <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
          </Link>
          <div className="hidden md:flex pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="pointer-events-auto">
              <StatusPill status={status} supported={speech.supported} dark={false} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 transition text-xs font-normal"
              style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif' }}
            >
              Dashboard
            </Link>
            <div
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-100 bg-white text-xs font-normal text-zinc-900"
              style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif' }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse" />
                <span className="relative rounded-full bg-emerald-500 h-1.5 w-1.5" />
              </span>
              App Terminal · Online
            </div>


            <button
              onClick={signOut}
              className="h-8 w-8 rounded-lg flex items-center justify-center border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN: voice agent surface */}
      <main className={cn(
        "relative flex-1 min-h-0 flex flex-col lg:flex-row items-center justify-center px-6 gap-6 lg:gap-10 overflow-hidden transition-colors duration-300",
        dark ? "bg-neutral-950 text-neutral-100" : "bg-white text-neutral-900",
      )}>
        <div className="flex flex-col items-center justify-center gap-4 flex-1 min-h-0 w-full">
          <div className="flex-1 min-h-0 flex items-center justify-center w-full">
            <div className="aspect-square w-[min(32vw,7.2rem)] sm:w-[8.4rem] lg:w-[10.2rem]">
              <SharedCloudOrb status={status} pulse={speech.wordPulse} />
            </div>
          </div>
          {!speech.supported && (
            <div className="text-center text-sm text-red-500 px-4">
              Voice not supported in this browser. Please open in Chrome (desktop) or use the text box below.
            </div>
          )}
        </div>

        {signal && signal.direction !== "WAIT" && signal.confidence > 0 && (
          <aside className="w-full lg:w-[380px] lg:max-w-[380px] shrink-0 space-y-4 overflow-y-auto max-h-full">
            <SignalCard signal={signal} />
          </aside>
        )}
      </main>

      {/* COMPOSER — in flow above footer */}
      <div className={cn(
        "shrink-0 px-4 pt-4 pb-3",
        dark ? "bg-neutral-950" : "bg-white border-t border-zinc-100",
      )}>
        <div className="max-w-3xl mx-auto">
          <div className={cn(
            "flex items-center gap-2 rounded-full border pl-4 pr-1.5 py-1.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.15)]",
            dark ? "bg-neutral-900 border-neutral-800" : "bg-white border-zinc-200",
          )}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitText()}
              placeholder="Type"
              disabled={loading}
              className={cn(
                "flex-1 min-w-0 bg-transparent text-[15px] focus:outline-none px-1 py-1",
                dark ? "text-neutral-100 placeholder:text-neutral-500" : "text-neutral-900 placeholder:text-neutral-500",
              )}
            />
            <button
              onClick={toggleMic}
              className={cn(
                "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition",
                speech.listening
                  ? "bg-emerald-500 text-white"
                  : dark ? "hover:bg-white/10 text-neutral-200" : "hover:bg-black/5 text-neutral-700",
              )}
              aria-label="Toggle microphone"
            >
              <Mic className="h-4.5 w-4.5" />
            </button>
            {text.trim() && (
              <button
                onClick={submitText}
                disabled={loading}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition disabled:opacity-50",
                  dark ? "bg-white text-black hover:bg-neutral-200" : "bg-black text-white hover:bg-neutral-800",
                )}
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>



    </div>
  );
}


function StatusPill({ status, supported, dark }: { status: "idle" | "listening" | "thinking" | "speaking"; supported: boolean; dark?: boolean }) {
  if (!supported) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-neutral-100 border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 whitespace-nowrap">
        <span className="h-2 w-2 rounded-full bg-neutral-400" />
        Voice not supported
      </div>
    );
  }
  const map = {
    idle: {
      dot: "bg-neutral-400", label: "Standby", pulse: false,
      ring: "ring-1 ring-neutral-200",
      bg: "bg-white",
      text: "text-neutral-700",
    },
    listening: {
      dot: "bg-emerald-500", label: "Listening", pulse: true,
      ring: "ring-1 ring-emerald-200",
      bg: "bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50",
      text: "text-emerald-700",
    },
    thinking: {
      dot: "bg-amber-500", label: "Thinking", pulse: true,
      ring: "ring-1 ring-amber-200",
      bg: "bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50",
      text: "text-amber-700",
    },
    speaking: {
      dot: "bg-sky-500", label: "Speaking", pulse: true,
      ring: "ring-1 ring-sky-200",
      bg: "bg-gradient-to-r from-sky-50 via-indigo-50 to-fuchsia-50",
      text: "text-sky-700",
    },
  } as const;
  const s = map[status];
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full shadow-sm px-3 py-1.5 text-xs font-normal whitespace-nowrap transition-colors duration-300",
        s.bg, s.ring, s.text,
      )}
      style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif' }}
    >
      <span className="relative flex h-2 w-2">
        {s.pulse && <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping", s.dot)} />}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", s.dot)} />
      </span>
      <span>Voice</span>
      <span className="opacity-50">·</span>
      <span>{s.label}</span>
    </div>
  );
}

function CloudOrb({ status, pulse = 0 }: { status: "idle" | "listening" | "thinking" | "speaking"; pulse?: number }) {
  const speaking = status === "speaking";
  // each word bumps `pulse` → cycle a hue offset and a tiny scale kick
  const hueShift = (pulse * 47) % 360;
  const kick = speaking ? 1 + ((pulse % 2) === 0 ? 0.04 : 0.07) : 1;
  const baseScale =
    status === "speaking" ? 1.05 :
    status === "listening" ? 1.02 :
    status === "thinking" ? 1.0 : 0.97;
  const scale = baseScale * kick;

  const iridescent =
    "conic-gradient(from 200deg, #ff6ba6 0%, #ff9966 12%, #ffd86b 24%, #6ee7b7 38%, #38bdf8 52%, #a78bfa 68%, #f472b6 84%, #ff6ba6 100%)";

  return (
    <div
      className="relative aspect-square w-[min(54vw,12rem)] sm:w-[14rem] lg:w-[17rem] flex items-center justify-center"
      style={{
        transform: `scale(${scale})`,
        transition: "transform 220ms cubic-bezier(0.4,0,0.2,1)",
        filter: speaking ? `hue-rotate(${hueShift}deg) saturate(1.3)` : "none",
      }}
    >
      {/* halo and ring waves removed */}


      {/* Light sky-blue sphere with swirling water-wave currents */}
      <div className="relative h-full w-full rounded-full flex items-center justify-center">


        <div
          className="relative h-[60%] w-[60%] rounded-full overflow-hidden"
          style={{
            background:
              "radial-gradient(circle at 50% 25%, #f4faff 0%, #b8dcff 28%, #5ea8ee 60%, #1f5fb0 90%, #0b3a7a 100%)",
            boxShadow:
              "inset -10px -16px 44px rgba(20,60,140,0.6), inset 8px 12px 32px rgba(255,255,255,0.85), 0 0 60px rgba(120,180,240,0.55)",
          }}
        >
          {/* Flowing vivid color blobs — organic drift */}
          <div
            className="absolute -inset-1/3"
            style={{
              animation: `orb-drift-a ${status === "speaking" ? "7s" : status === "thinking" ? "9s" : "14s"} ease-in-out infinite, orb-hue 18s linear infinite`,
              background:
                "radial-gradient(30% 24% at 28% 30%, rgba(244,114,182,0.95), transparent 70%), radial-gradient(28% 22% at 72% 26%, rgba(251,191,36,0.9), transparent 70%), radial-gradient(32% 26% at 30% 74%, rgba(52,211,153,0.95), transparent 70%), radial-gradient(30% 24% at 74% 72%, rgba(167,139,250,0.95), transparent 70%)",
              mixBlendMode: "screen",
            }}
          />

          {/* Counter-flow aurora ribbon */}
          <div
            className="absolute -inset-1/3"
            style={{
              animation: `orb-drift-b ${status === "speaking" ? "9s" : "18s"} ease-in-out infinite`,
              background:
                "conic-gradient(from 90deg, rgba(255,90,160,0.7) 0%, rgba(56,189,248,0.0) 18%, rgba(255,200,80,0.7) 35%, rgba(255,255,255,0.0) 50%, rgba(80,230,180,0.7) 65%, rgba(56,189,248,0.0) 80%, rgba(170,130,255,0.7) 100%)",
              filter: "blur(24px)",
              mixBlendMode: "screen",
            }}
          />

          {/* Shimmering foamy crest */}
          <div
            className="absolute -inset-1/4"
            style={{
              animation: `orb-shimmer ${status === "speaking" ? "2.2s" : "5s"} ease-in-out infinite`,
              background:
                "radial-gradient(36% 12% at 50% 50%, rgba(255,255,255,0.9), transparent 70%), radial-gradient(26% 9% at 36% 58%, rgba(255,210,235,0.75), transparent 70%), radial-gradient(28% 10% at 66% 46%, rgba(200,245,255,0.85), transparent 70%)",
              filter: "blur(6px)",
              mixBlendMode: "screen",
            }}
          />


          {/* Glossy top highlight */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_18%,rgba(255,255,255,0.95),transparent_48%)]" />

          {/* Soft sky rim */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ boxShadow: "inset 0 0 26px rgba(160,210,255,0.6)" }}
          />

          {/* Speaking ripple */}
          {status === "speaking" && (
            <div
              className="absolute inset-0 animate-pulse"
              style={{
                background:
                  "radial-gradient(circle at 50% 55%, rgba(120,180,240,0.45), transparent 60%)",
                animationDuration: "0.9s",
                mixBlendMode: "screen",
              }}
            />
          )}
        </div>
      </div>

    </div>
  );
}

function VoicePicker({ value, onChange }: { value: VoicePresetKey; onChange: (k: VoicePresetKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "h-9 w-9 rounded-full flex items-center justify-center transition",
          open ? "bg-black text-white" : "hover:bg-black/5 text-neutral-600",
        )}
        aria-label="Voice settings"
      >
        <Sliders className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-neutral-200 bg-white shadow-xl p-2 z-30 animate-in fade-in slide-in-from-top-1">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Voice
          </div>
          <div className="flex flex-col">
            {VOICE_PRESETS.map((p) => {
              const active = p.key === value;
              return (
                <button
                  key={p.key}
                  onClick={() => { onChange(p.key); setOpen(false); }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl text-left transition",
                    active ? "bg-neutral-100" : "hover:bg-neutral-50",
                  )}
                >
                  <span className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0",
                    p.key === "aria"  && "bg-gradient-to-br from-rose-400 to-fuchsia-500",
                    p.key === "nova"  && "bg-gradient-to-br from-sky-400 to-indigo-500",
                    p.key === "orion" && "bg-gradient-to-br from-emerald-500 to-teal-700",
                    p.key === "atlas" && "bg-gradient-to-br from-amber-500 to-orange-600",
                  )}>
                    {p.label[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-neutral-900">{p.label}</div>
                    <div className="text-xs text-neutral-500 truncate">{p.desc}</div>
                  </div>
                  {active && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


