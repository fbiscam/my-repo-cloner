import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw, Pause, AlertTriangle, Check, X, Activity, TrendingUp, TrendingDown, Minus, Sparkles, Send, Mic, Lock, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { getSignalPlan, getNewsRisk, getChartCandles, type SignalPlan, type Marking } from "@/lib/gold-analysis.functions";
import { getBacktestStats, type BacktestStats } from "@/lib/backtest.functions";
import { runHistoricalBacktest, type HistoricalBacktestResult } from "@/lib/backtest-historical.functions";
import { askSignalAgent } from "@/lib/signal-agent.functions";
import { broadcastCurrentSignal } from "@/lib/broadcast-alert.functions";
import { runManualScanBroadcast } from "@/lib/manual-scan-broadcast.functions";
import { getAlertsEnabled, setAlertsEnabled } from "@/lib/alert-toggle.functions";
import { Bell, BellOff } from "lucide-react";
import SignalChart, { type SignalChartHandle } from "@/components/SignalChart";

import { stopAllBrowserSpeech, useSpeech } from "@/hooks/useSpeech";
import { supabase } from "@/integrations/supabase/client";
import { useLivePriceStream } from "@/hooks/useLivePriceStream";
import { cn } from "@/lib/utils";
import { useSignalAlerts } from "@/hooks/useSignalAlerts";
import { appendVoiceTurn } from "@/lib/voice-history";

import AlertsHistoryPanel from "@/components/AlertsHistoryPanel";
import { useCredits } from "@/hooks/useCredits";
import { useAuthUser } from "@/hooks/useAuthUser";
import PageLoading from "@/components/PageLoading";
import { killzoneForPair, getPairProfile } from "@/lib/analysis/engine";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { isActiveKillzone, MIN_CONFIDENCE, qualifySignal } from "@/lib/signals/qualification";
import { getSignalPerformance, type SignalPerformance } from "@/lib/signals/stats.functions";
import { useVerification } from "@/hooks/useVerification";
import { VerificationLocked } from "@/components/VerificationGate";



const MONO = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

type SignalSearch = { symbol?: string; savedId?: string; alertId?: string };
export const Route = createFileRoute("/signal")({
  validateSearch: (s: Record<string, unknown>): SignalSearch => ({
    symbol: typeof s.symbol === "string" ? s.symbol : undefined,
    savedId: typeof s.savedId === "string" ? s.savedId : undefined,
    alertId: typeof s.alertId === "string" ? s.alertId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Gold Signal Desk — Jenvu" },
      { name: "robots", content: "noindex, follow" },
      {
        name: "description",
        content:
          "Institutional ICT/SMC signal desk for XAU/USD and every major XAU cross. Multi-timeframe bias, A+ setup scoring and voice narration.",
      },
      { name: "keywords", content: "XAUUSD signals, gold trading, XAU EUR, XAU GBP, XAU JPY, gold ICT SMC, A+ gold setup, gold voice agent, bullion desk" },
      { property: "og:title", content: "Gold Signal Desk — Jenvu" },
      { property: "og:description", content: "AI gold desk covering all XAU cross-pairs with ICT/SMC analysis, A+ setup scoring and voice narration." },
      { property: "og:url", content: "https://jenvu.com/signal" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Gold Signal Desk — Jenvu" },
      { name: "twitter:description", content: "Institutional gold signal desk with voice narration for every XAU cross-pair." },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/signal" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Jenvu Gold Signal Desk",
          url: "https://jenvu.com/signal",
          applicationCategory: "FinanceApplication",
          operatingSystem: "Web",
          description:
            "Institutional ICT/SMC gold signal desk focused exclusively on XAU/USD with A+ setup grading and voice narration.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),

  component: SignalPageGuarded,
});

/* ---------- helpers ---------- */
function isMarketOpen(_sym: string, d: Date = new Date()): boolean {
  // Gold market: closed Fri 22:00 UTC → Sun 22:00 UTC
  const day = d.getUTCDay();
  const h = d.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && h >= 22) return false;
  if (day === 0 && h < 22) return false;
  return true;
}

function tagOf(text: string): { tag: string; tone: "violet" | "blue" | "emerald" | "amber" | "rose" | "zinc" } {
  const t = text.toLowerCase();
  if (/\bfvg|fair\s*value\s*gap\b/.test(t)) return { tag: "FVG", tone: "violet" };
  if (/\border\s*block|\bob\b/.test(t)) return { tag: "OB", tone: "blue" };
  if (/\bbos\b|break\s*of\s*structure/.test(t)) return { tag: "BOS", tone: "emerald" };
  if (/\bchoch\b|change\s*of\s*character/.test(t)) return { tag: "CHoCH", tone: "rose" };
  if (/\bsweep|liquidity\s*grab|stop\s*hunt\b/.test(t)) return { tag: "SWEEP", tone: "amber" };
  if (/\bentry|tp|sl|target|stop\b/.test(t)) return { tag: "EXEC", tone: "zinc" };
  return { tag: "NOTE", tone: "zinc" };
}
const toneClass: Record<string, string> = {
  violet: "bg-emerald-500 text-white",
  blue: "bg-zinc-900 text-white",
  emerald: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  amber: "bg-zinc-900 text-white",
  rose: "bg-zinc-900 text-white",
  zinc: "bg-zinc-100 text-zinc-700 border border-zinc-200",
};
const toneCardClass: Record<string, string> = {
  violet: "bg-emerald-50/60 border-emerald-100",
  blue: "bg-white border-zinc-200",
  emerald: "bg-white border-zinc-200",
  amber: "bg-white border-zinc-200",
  rose: "bg-white border-zinc-200",
  zinc: "bg-white border-zinc-200",
};

function hhmmss(d = new Date()): string {
  return d.toTimeString().slice(0, 8);
}

function withSignalIntelligence(plan: SignalPlan): SignalPlan {
  const dec = plan.instrument?.decimals ?? 2;
  const pricePrefix = plan.instrument?.kind === "crypto" ? "" : "$";
  const fmt = (n: number) => `${pricePrefix}${Number(n || 0).toFixed(dec)}`;
  const current = Number.isFinite(plan.currentPrice) && plan.currentPrice > 0 ? plan.currentPrice : Math.max(plan.trade.entry, 1);
  const findLevel = (re: RegExp) => plan.keyLevels.find((k) => re.test(k.label))?.price;
  const swingHigh = findLevel(/swing high|pdh|high/i) ?? Math.max(current, plan.trade.tp || current) * 1.003;
  const swingLow = findLevel(/swing low|pdl|low/i) ?? Math.min(current, plan.trade.tp || current) * 0.997;
  const equilibrium = findLevel(/equilibrium|eq/i) ?? (swingHigh + swingLow) / 2;
  const inPremium = current >= equilibrium;
  const ltfBias = plan.multiTf.find((tf) => tf.tf === "15M")?.bias ?? plan.htfBias;
  const ltfAligned = plan.htfBias !== "neutral" && ltfBias === plan.htfBias;

  const htfLock = plan.htfLock?.reason ? plan.htfLock : {
    bias: plan.htfBias,
    reason: `HTF structure is ${plan.htfBias} with price in the ${inPremium ? "premium" : "discount"} side of the ${fmt(swingLow)}–${fmt(swingHigh)} dealing range. LTF bias is ${ltfBias}, so execution must respect equilibrium near ${fmt(equilibrium)}.`,
    ltfAligned,
  };

  const failedChecks = plan.setupChecks.filter((c) => c.pass === false).map((c) => c.reason).filter(Boolean);
  const risks = plan.selfCritique?.risks?.length
    ? plan.selfCritique.risks
    : [
        ...failedChecks,
        plan.newsRisk.severity !== "low" ? plan.newsRisk.warning : "",
        plan.trade.direction === "WAIT" ? plan.trade.summary : "Respect live volatility and session quality before entry.",
      ].filter(Boolean).slice(0, 6);
  const invalidationTriggers = plan.selfCritique?.invalidationTriggers?.length
    ? plan.selfCritique.invalidationTriggers
    : [
        plan.trade.invalidation,
        plan.trade.direction === "BUY"
          ? `15M close below ${fmt(plan.trade.sl)} invalidates the long setup.`
          : plan.trade.direction === "SELL"
            ? `15M close above ${fmt(plan.trade.sl)} invalidates the short setup.`
            : `No trigger until price returns to a valid HTF/LTF POI with confirmation.`,
      ].filter(Boolean).slice(0, 6);
  const selfCritique = (risks.length || invalidationTriggers.length) ? {
    risks,
    invalidationTriggers,
    confidenceSelfScore: plan.selfCritique?.confidenceSelfScore && plan.selfCritique.confidenceSelfScore > 0
      ? plan.selfCritique.confidenceSelfScore
      : Math.max(0, Math.min(10, Math.round((plan.trade.confidence / 10) * 10) / 10)),
  } : plan.selfCritique;

  const existingScenarios = plan.scenarios;
  const hasScenarios = !!(existingScenarios?.bullish?.path || existingScenarios?.base?.path || existingScenarios?.bearish?.path);
  const scenarios = hasScenarios ? existingScenarios : {
    bullish: { probability: plan.htfBias === "bullish" ? (ltfAligned ? 55 : 45) : 25, path: `Reclaim and hold above ${fmt(equilibrium)} opens continuation toward ${fmt(swingHigh)}.`, keyLevel: +swingHigh.toFixed(dec) },
    base: { probability: plan.htfBias === "neutral" ? 50 : 30, path: `Range rotation around equilibrium ${fmt(equilibrium)} while the desk waits for cleaner displacement.`, keyLevel: +equilibrium.toFixed(dec) },
    bearish: { probability: plan.htfBias === "bearish" ? (ltfAligned ? 55 : 45) : 25, path: `Rejection below ${fmt(equilibrium)} keeps sellers in control toward ${fmt(swingLow)}.`, keyLevel: +swingLow.toFixed(dec) },
  };

  return { ...plan, htfLock, selfCritique, scenarios };
}

/* ---------- page ---------- */
function SignalPageGuarded() {
  const { status, verified, loading } = useVerification();
  if (!loading && status && !verified) return <VerificationLocked />;
  return <SignalPage />;
}

function SignalPage() {
  const navigate = useNavigate();
  const { symbol, savedId, alertId } = Route.useSearch();
  const fetchPlan = useServerFn(getSignalPlan);
  const triggerManualBroadcast = useServerFn(runManualScanBroadcast);
  const speech = useSpeech();
  const credits = useCredits();

  // Kill any narration / listening when the signal page unmounts
  useEffect(() => {
    return () => {
      try { window.dispatchEvent(new Event("jenvu:speech:stop-all")); } catch { /* noop */ }
      try { speech.stopSpeaking(); } catch { /* noop */ }
      try { speech.stopListening(); } catch { /* noop */ }
      stopAllBrowserSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const { user: authUser, loading: authLoading, rawUser } = useAuthUser();
  // Signal page is accessible to MFA-pending sessions (AAL1 waiting for AAL2)
  // — gate on rawUser so those users can still run scans.
  const authReady = !authLoading && !!rawUser;
  const dark = false;
  const [plan, setPlan] = useState<SignalPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [broadcastStatus, setBroadcastStatus] = useState<
    | { kind: "sent"; pair: string; conf: number; at: number }
    | { kind: "blocked"; pair: string; reason: string; at: number }
    | null
  >(null);
  const [passedConfluences, setPassedConfluences] = useState<string[]>([]);
  const [perf, setPerf] = useState<SignalPerformance | null>(null);
  const loadPerf = useServerFn(getSignalPerformance);
  useEffect(() => {
    let alive = true;
    loadPerf({ data: { days: 30 } })
      .then((p) => { if (alive) setPerf(p); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const activeScanRef = useRef<string | null>(null);
  const [analyzeElapsed, setAnalyzeElapsed] = useState(0);
  useEffect(() => {
    if (!loading) { setAnalyzeElapsed(0); return; }
    const started = Date.now();
    setAnalyzeElapsed(0);
    const id = window.setInterval(() => {
      setAnalyzeElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [loading]);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const broadcastFn = useServerFn(broadcastCurrentSignal);
  const getAlertsEnabledFn = useServerFn(getAlertsEnabled);
  const setAlertsEnabledFn = useServerFn(setAlertsEnabled);
  const [alertsOn, setAlertsOn] = useState<boolean | null>(null);
  const [alertsSaving, setAlertsSaving] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      try {
        const r = await getAlertsEnabledFn({});
        setAlertsOn(!!r.enabled);
      } catch { setAlertsOn(true); }
    })();
  }, [authUser, getAlertsEnabledFn]);

  const toggleAlerts = useCallback(async () => {
    if (alertsOn === null || alertsSaving) return;
    const next = !alertsOn;
    setAlertsSaving(true);
    try {
      await setAlertsEnabledFn({ data: { enabled: next } });
      setAlertsOn(next);
      toast.success(next ? "Alerts enabled · $0.20 will be charged per signal" : "Alerts disabled · no charges, no notifications");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update alerts");
    } finally {
      setAlertsSaving(false);
    }
  }, [alertsOn, alertsSaving, setAlertsEnabledFn]);

  type BroadcastedAlert = {
    id: string;
    pair: string;
    grade: string;
    direction: "BUY" | "SELL";
    entry: number;
    sl: number;
    tp: number;
    rr: number;
    confidence: number;
    session: string | null;
    killzone: string | null;
    htf_bias: string | null;
    rationale: string | null;
    fired_at: string;
  };
  const [broadcastedAlert, setBroadcastedAlert] = useState<BroadcastedAlert | null>(null);
  const [broadcastedLoading, setBroadcastedLoading] = useState(false);

  useEffect(() => {
    if (!authUser) { setIsAdmin(false); return; }
    (async () => {
      try {
        const { data } = await supabase.rpc("has_role", { _user_id: authUser.id, _role: "admin" });
        setIsAdmin(!!data);
      } catch { setIsAdmin(false); }
    })();
  }, [authUser]);

  const handleBroadcast = useCallback(async () => {
    if (!plan) return;
    if (plan.trade.direction === "WAIT") {
      toast.error("No active trade — plan is in WAIT.");
      return;
    }
    const ok = window.confirm(
      `Send this ${plan.trade.direction} ${plan.instrument.symbol} alert to all paid subscribers?`,
    );
    if (!ok) return;
    setBroadcasting(true);
    try {
      const res = await broadcastFn({
        data: {
          pair: plan.instrument.symbol,
          grade: plan.setupGrade,
          direction: plan.trade.direction as "BUY" | "SELL",
          entry: plan.trade.entry,
          sl: plan.trade.sl,
          tp: plan.trade.tp,
          rr: plan.trade.rr,
          confidence: plan.trade.confidence,
          session: plan.session,
          killzone: plan.killzone,
          htfBias: plan.htfBias,
          rationale: plan.trade.summary?.slice(0, 500) ?? "",
          decimals: plan.instrument.decimals,
          setupScore: plan.setupScore,
        },
      });
      toast.success(
        `Alert sent — ${res.enqueued} emails queued, ${res.notified_in_app} in-app notifications.`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Broadcast failed");
    } finally {
      setBroadcasting(false);
    }
  }, [plan, broadcastFn]);

  const alertsPair = (plan?.instrument.symbol ?? symbol ?? "XAUUSD").toUpperCase();
  const { alerts: alertHistory, loading: alertsLoading } = useSignalAlerts(alertsPair);

  const htfRef = useRef<SignalChartHandle>(null);
  const ltfRef = useRef<SignalChartHandle>(null);
  const abortRef = useRef(false);
  const feedScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !rawUser) navigate({ to: "/auth", replace: true });
  }, [authLoading, rawUser, navigate]);

  // ---------- Killzone warning popup ----------
  const [kzDismissed, setKzDismissed] = useState<boolean | null>(null);
  const [kzDialog, setKzDialog] = useState<{ pair: string; kzText: string } | null>(null);
  const kzShownFor = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady) return;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("killzone_notice_dismissed")
        .eq("id", data.user.id)
        .maybeSingle();
      setKzDismissed(!!prof?.killzone_notice_dismissed);
    });
  }, [authReady]);

  const dismissKzForever = useCallback(async () => {
    setKzDialog(null);
    setKzDismissed(true);
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("profiles").update({ killzone_notice_dismissed: true }).eq("id", data.user.id);
  }, []);



  const [voiceBlocked, setVoiceBlocked] = useState(false);
  const [activeTf, setActiveTf] = useState<"htf" | "ltf" | null>(null);

  const speakWait = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!text || !text.trim()) return resolve();
        const words = text.split(/\s+/).filter(Boolean).length;
        const minMs = Math.max(2500, words * 320);
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        // Hard ceiling so a stuck onend never blocks the walkthrough.
        const ceiling = setTimeout(finish, Math.max(minMs + 4000, words * 600));
        try {
          let started = false;
          const startCheck = setTimeout(() => {
            // If speech never started within 400ms, treat as blocked → caption mode.
            if (!started) {
              setVoiceBlocked(true);
              setTimeout(() => { clearTimeout(ceiling); finish(); }, minMs);
            }
          }, 400);
          // monkey-patch onstart detection by piggy-backing on speaking flag tick
          const tick = setInterval(() => {
            if (window.speechSynthesis?.speaking) { started = true; clearInterval(tick); clearTimeout(startCheck); }
          }, 80);
          speech.speak(text, () => {
            clearInterval(tick); clearTimeout(startCheck); clearTimeout(ceiling);
            // Guarantee minimum pause even if TTS finished too fast.
            const elapsed = 0;
            setTimeout(finish, Math.max(0, minMs - elapsed));
          });
        } catch {
          setVoiceBlocked(true);
          setTimeout(finish, minMs);
        }
      }),
    [speech],
  );

  const runNarration = useCallback(
    async (p: SignalPlan) => {
      htfRef.current?.clear();
      ltfRef.current?.clear();
      setStep(-1);
      setActiveTf(null);
      setPlaying(true);
      abortRef.current = false;

      // Pre-draw static context zones (Premium/Discount/OTE/Liquidity/EQH/EQL)
      // as PERSISTENT background context so they stay visible the whole walkthrough.
      const autoTypes = new Set([
        "premiumZone", "discountZone", "oteZone", "liquidity", "eqh", "eql",
      ]);
      for (const m of p.markings) {
        if (autoTypes.has(m.type)) {
          const target = m.tf === "htf" ? htfRef.current : ltfRef.current;
          try { target?.drawMarking(m, { transient: false }); } catch (e) { console.warn("drawMarking failed", e); }
        }
      }

      try {
        await speakWait(p.intro);
        for (let i = 0; i < p.narration.length; i++) {
          if (abortRef.current) break;
          const n = p.narration[i];
          setStep(i);
          setActiveTf(n.tf);
          const target = n.tf === "htf" ? htfRef.current : ltfRef.current;
          // Sequential lifecycle: clear previous transient marking, draw + pan to the new one,
          // then narrate. Only ONE active ICT/SMC marking is visible at a time.
          htfRef.current?.clearTransient();
          ltfRef.current?.clearTransient();
          if (n.markingIndex != null && p.markings[n.markingIndex]) {
            const m = p.markings[n.markingIndex];
            const drawTarget = m.tf === "htf" ? htfRef.current : ltfRef.current;
            try {
              drawTarget?.drawMarking(m, { transient: true });
              drawTarget?.panToMarking(m);
              await new Promise((r) => setTimeout(r, 80));
              drawTarget?.focusMarking(m);
            } catch (e) {
              console.warn("marking step failed", e);
            }
          } else if (target) {
            // No specific marking — just keep current view
          }
          await speakWait(n.say);
          // Brief fade-out pause before next step
          if (i < p.narration.length - 1) {
            await new Promise((r) => setTimeout(r, 220));
          }
        }
        if (!abortRef.current) {
          // Final reveal — clear any transient marker, then draw entry/sl/tp together (persistent).
          htfRef.current?.clearTransient();
          ltfRef.current?.clearTransient();
          setActiveTf("ltf");
          for (const m of p.markings) {
            if (m.type === "entry" || m.type === "sl" || m.type === "tp") {
              try { ltfRef.current?.drawMarking(m, { transient: false }); } catch (e) { console.warn("final marking failed", e); }
            }
          }
          const entry = p.markings.find((m) => m.type === "entry");
          if (entry) {
            try {
              ltfRef.current?.panToMarking(entry);
              ltfRef.current?.focusMarking(entry);
            } catch (e) { console.warn("entry focus failed", e); }
          }
          await speakWait(p.trade.summary);
          const hasLevels =
            Number.isFinite(p.trade.entry) && Number.isFinite(p.trade.sl) && Number.isFinite(p.trade.tp);
          if ((p.trade.confidence ?? 0) >= MIN_CONFIDENCE && hasLevels && p.trade.direction !== "WAIT") {
            toast.success(`Setup ready · ${p.setupGrade}`);
          }
        }
      } finally {
        setPlaying(false);
        setActiveTf(null);
      }
    },
    [speakWait],
  );


  const load = useCallback(async () => {
    const sym = symbol || "XAUUSD";
    if (activeScanRef.current === sym) return;
    // Free plan removed — all authenticated users are on a paid plan and can scan any XAU pair.

    activeScanRef.current = sym;
    setLoading(true);
    setAnalysisError(null);
    abortRef.current = true;
    speech.stopSpeaking();
    try {
      const scanId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const result = await fetchPlan({ data: { symbol: sym, scanId, force: true } });
      if (!result.ok) {
        setPlan(null);
        setAnalysisError(result.error);
        toast.error(result.error);
        return;
      }
      const p = withSignalIntelligence(result.plan);

      // Use the same qualification function as the scheduled worker so manual
      // and automated scans cannot drift on confidence, HTF or Killzone rules.
      const dir = p.trade?.direction;
      const conf = Number(p.trade?.confidence ?? 0);
      const htfBias = String((p as unknown as { htfBias?: string }).htfBias ?? "neutral");
      const utcH = new Date().getUTCHours();
      const qualification = qualifySignal({
        pair: sym,
        direction: dir,
        confidence: conf,
        entry: Number(p.trade?.entry),
        sl: Number(p.trade?.sl),
        tpCandidates: [p.trade?.tp, p.trade?.tp3, p.trade?.tp2, p.trade?.tp1],
        htfBias,
        utcHour: utcH,
        inKillzone: isActiveKillzone(p.killzone),
        checks: (p as unknown as { setupChecks?: Array<{ key: string; pass: boolean }> }).setupChecks ?? null,
        regime: (p as unknown as { marketRegime?: { regime?: string } }).marketRegime?.regime ?? null,
      });
      const rejectDetail = qualification.ok ? null : (qualification.detail ?? null);
      const gateBlock = qualification.ok
        ? null
        : qualification.reason === "no_direction"
          ? "No directional setup right now — market is in HOLD. Auto-scan pipeline would skip this too."
          : qualification.reason === "below_threshold"
            ? `Confidence ${Math.round(conf)}% is below the ${MIN_CONFIDENCE}% minimum. No trade this scan — wait for the next qualifying setup.`
            : qualification.reason === "insufficient_confluence"
              ? `Only ${(rejectDetail?.passed as string[] | undefined)?.length ?? 0}/5 core confluences confirmed (missing: ${((rejectDetail?.failed as string[] | undefined) ?? []).join(", ") || "n/a"}). At least 4 are required.`
              : qualification.reason === "hard_veto"
                ? `Hard veto active (${((rejectDetail?.vetoes as string[] | undefined) ?? []).join(", ").replace(/veto_/g, "") || "engine veto"}) — stand aside.`
                : qualification.reason === "regime_choppy"
                  ? "Choppy tape — no trades in this regime. Waiting for a clean trending/ranging structure."
                  : qualification.reason === "regime_low_quality"
                    ? `Ranging/volatile tape needs ≥90% conviction; this setup is ${Math.round(conf)}%.`
                    : qualification.reason === "outside_killzone"
                      ? `Outside an active Killzone (${p.killzone || "n/a"}). Wait for London or New York Killzone.`
                      : qualification.reason === "htf_bias_conflict"
                        ? `${dir} conflicts with HTF bias (${htfBias}). Pipeline rejects counter-trend setups — waiting for alignment.`
                        : "Trade levels did not pass the shared signal safety checks.";


      // Always show the panel + intelligence so the user can still inspect
      // structure/context, but suppress the broadcast when any gate fails.
      setPlan(p);
      setPassedConfluences(
        qualification.ok
          ? ((qualification as unknown as { confluences?: string[] }).confluences ?? [])
          : ((rejectDetail?.passed as string[] | undefined) ?? []),
      );
      if (gateBlock) {
        setAnalysisError(gateBlock);
        setBroadcastStatus({ kind: "blocked", pair: sym.toUpperCase(), reason: gateBlock, at: Date.now() });
        toast.error("Signal rejected by pipeline gates", { description: gateBlock });
      } else {
        setBroadcastStatus({ kind: "sent", pair: sym.toUpperCase(), conf: Math.round(conf), at: Date.now() });
        // Fire the shared auto-scan broadcast pipeline (fan-out to paid subscribers,
        // WhatsApp, email, in-app) using the same gates as scheduled scans.
        // Runs in the background — never blocks the on-screen result.
        void triggerManualBroadcast({ data: { pair: sym.toUpperCase() } }).catch(
          (e) => console.error("manual broadcast failed", e),
        );
      }


      // ICT narration is included in the single "signal" charge above — no extra deduction.
      // Free users still don't get the guided narration.
      if (credits.features.full_ict) {
        setTimeout(() => runNarration(p), 400);
      } else if (!credits.isLoading && credits.plan?.id === "free") {
        toast.info("Full ICT narration is a Pro feature", {
          description: "Upgrade to unlock the guided multi-timeframe walkthrough.",
          action: { label: "Upgrade", onClick: () => (window.location.href = "/pricing") },
        });
      } else {
        // Credits still loading or paid plan — assume entitled and run narration
        setTimeout(() => runNarration(p), 400);
      }

    } catch (e: any) {
      const msg = e?.message || "Failed to load signal";
      setAnalysisError(msg);
      toast.error(msg);
    } finally {
      activeScanRef.current = null;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPlan, runNarration, symbol, credits]);

  const loadSaved = useCallback(async (id: string) => {
    setLoading(true);
    abortRef.current = true;
    speech.stopSpeaking();
    try {
      const { data, error } = await supabase
        .from("saved_signals")
        .select("snapshot")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const snap: any = data?.snapshot ?? null;
      if (snap?.plan) {
        setPlan(withSignalIntelligence(snap.plan as SignalPlan));
        // Redraw persistent entry/sl/tp + context zones without re-charging credits.
        setTimeout(() => {
          const p = withSignalIntelligence(snap.plan as SignalPlan);
          htfRef.current?.clear();
          ltfRef.current?.clear();
          const autoTypes = new Set(["premiumZone", "discountZone", "oteZone", "liquidity", "eqh", "eql"]);
          for (const m of p.markings) {
            const target = m.tf === "htf" ? htfRef.current : ltfRef.current;
            if (autoTypes.has(m.type) || m.type === "entry" || m.type === "sl" || m.type === "tp") {
              try { target?.drawMarking(m, { transient: false }); } catch {}
            }
          }
          const entry = p.markings.find((m) => m.type === "entry");
          if (entry) { try { ltfRef.current?.panToMarking(entry); ltfRef.current?.focusMarking(entry); } catch {} }
        }, 400);
        toast.success("Saved signal restored");
      } else {
        toast.error("Saved snapshot missing — running fresh analysis");
        await load();
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not open saved signal");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, speech]);


  useEffect(() => {
    if (!authReady) return;
    // If opening from a broadcasted alert notification, show the stored admin
    // signal directly — do NOT run a fresh AI analysis (saves credits).
    if (alertId) {
      setBroadcastedLoading(true);
      (async () => {
        const { data, error } = await supabase
          .from("signal_alerts")
          .select("id, pair, grade, direction, entry, sl, tp, rr, confidence, session, killzone, htf_bias, rationale, fired_at")
          .eq("id", alertId)
          .maybeSingle();
        if (!error && data) setBroadcastedAlert(data as BroadcastedAlert);
        else toast.error("This alert is no longer available.");
        setBroadcastedLoading(false);
      })();
      return () => { abortRef.current = true; speech.stopSpeaking(); };
    }
    if (savedId) loadSaved(savedId);
    else load();
    return () => {
      abortRef.current = true;
      speech.stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, symbol, savedId, alertId]);

  // Killzone popup: fire once per pair-symbol when analysis returns outside its killzone
  useEffect(() => {
    if (!plan || kzDismissed !== false) return;
    const sym = plan.instrument.symbol;
    if (kzShownFor.current === sym) return;
    const kz = killzoneForPair(sym);
    if (kz.inKillzone) return;
    const profile = getPairProfile(sym);
    const fmt = (utcHour: number) => {
      const d = new Date();
      d.setUTCHours(utcHour % 24, 0, 0, 0);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };
    const zones = profile?.killzones ?? [];
    const kzText = zones.length
      ? zones.map(z => `${z.name} (${fmt(z.startUTC)}–${fmt(z.endUTC)} your time)`).join(", ")
      : "the pair's active session window";
    kzShownFor.current = sym;
    setKzDialog({ pair: plan.instrument.display || sym, kzText });
  }, [plan, kzDismissed]);



  // auto-scroll narration feed
  useEffect(() => {
    const el = feedScrollRef.current;
    if (!el || step < 0) return;
    const active = el.querySelector<HTMLElement>(`[data-step="${step}"]`);
    active?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [step]);

  const stop = () => {
    abortRef.current = true;
    speech.stopSpeaking();
    setPlaying(false);
  };

  /* ---------- NEWS AUTO-REFRESH (every 3 min) ---------- */
  const fetchNews = useServerFn(getNewsRisk);
  const [newsUpdatedAt, setNewsUpdatedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!plan) return;
    let stopped = false;
    const symbol = plan.instrument.symbol;
    const tick = async () => {
      try {
        const next = await fetchNews({ data: { symbol } });
        if (stopped) return;
        setPlan((prev) => prev ? { ...prev, newsRisk: { severity: next.severity, warning: next.warning, events: next.events } } : prev);
        setNewsUpdatedAt(next.generatedAt);
      } catch {}
    };
    const id = setInterval(tick, 3 * 60 * 1000);
    tick();
    return () => { stopped = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.instrument.symbol]);

  /* ---------- LIVE CANDLE REFRESH (every 60s) ---------- */
  const fetchCandles = useServerFn(getChartCandles);
  const [candlesUpdatedAt, setCandlesUpdatedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!plan) return;
    let stopped = false;
    const symbol = plan.instrument.symbol;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r: any = await fetchCandles({ data: { symbol } });
        if (stopped || !r?.ok) return;
        setPlan((prev) =>
          prev && prev.instrument.symbol === symbol
            ? {
                ...prev,
                htfCandles: r.htfCandles?.length ? r.htfCandles : prev.htfCandles,
                ltfCandles: r.ltfCandles?.length ? r.ltfCandles : prev.ltfCandles,
              }
            : prev,
        );
        setCandlesUpdatedAt(r.at ?? Date.now());
      } catch { /* keep last candles */ }
    };
    const id = setInterval(tick, 60_000);
    tick();
    return () => { stopped = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.instrument.symbol]);

  /* ---------- BACKTEST STATS (per plan) ---------- */
  const fetchBacktest = useServerFn(getBacktestStats);
  const [backtest, setBacktest] = useState<BacktestStats | null>(null);
  useEffect(() => {
    if (!plan) { setBacktest(null); return; }
    const dir = plan.trade.direction;
    if (dir !== "BUY" && dir !== "SELL") { setBacktest(null); return; }
    let cancelled = false;
    fetchBacktest({ data: { pair: plan.instrument.symbol, direction: dir } })
      .then((r) => { if (!cancelled) setBacktest(r); })
      .catch(() => { if (!cancelled) setBacktest(null); });
    return () => { cancelled = true; };
  }, [plan?.instrument.symbol, plan?.trade.direction, fetchBacktest]);




  /* ---------- LIVE TRADE TRACKER (streaming) ---------- */
  const [trackerStatus, setTrackerStatus] = useState<"PENDING" | "RUNNING" | "WIN" | "LOSS">("PENDING");
  const [sparkline, setSparkline] = useState<number[]>([]);
  const eventsFiredRef = useRef<Set<string>>(new Set());
  const trackerStatusRef = useRef(trackerStatus);
  trackerStatusRef.current = trackerStatus;
  const stoppedRef = useRef(false);
  const lastSparkPushRef = useRef(0);

  /* journal/save state */
  const journalRowIdRef = useRef<string | null>(null);
  const [tradeLogged, setTradeLogged] = useState(false);
  const [logging, setLogging] = useState(false);
  const [signalSaved, setSignalSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    eventsFiredRef.current = new Set();
    stoppedRef.current = false;
    setTrackerStatus("PENDING");
    journalRowIdRef.current = null;
    setTradeLogged(false);
    setSignalSaved(false);
    if (plan) setSparkline([plan.currentPrice]);
  }, [plan?.instrument.symbol]);


  const handleStreamTick = useCallback((priceTick: number, tMs: number) => {
    if (!plan || stoppedRef.current) return;

    // Sparkline — throttle to ~2/sec to keep DOM cheap on WS streams.
    if (tMs - lastSparkPushRef.current > 450) {
      lastSparkPushRef.current = tMs;
      setSparkline((arr) => [...arr.slice(-59), priceTick]);
    }

    const tSec = Math.floor(tMs / 1000);
    try { htfRef.current?.updateLivePrice(priceTick, tSec); } catch { /* noop */ }
    try { ltfRef.current?.updateLivePrice(priceTick, tSec); } catch { /* noop */ }

    // Skip TP/SL/entry-fill events when market is closed (weekends for FX/metals/indices).
    if (!isMarketOpen(plan.instrument.symbol)) return;
    if (plan.trade.direction === "WAIT") return;
    // Only track & fire notifications when confidence ≥ MIN_CONFIDENCE AND entry/SL/TP are valid.
    if ((plan.trade.confidence ?? 0) < MIN_CONFIDENCE) return;
    if (!Number.isFinite(plan.trade.entry) || !Number.isFinite(plan.trade.sl) || !Number.isFinite(plan.trade.tp)) return;

    const tr = plan.trade;
    const dir = tr.direction;
    const fire = (key: string, msg: string) => {
      if (eventsFiredRef.current.has(key)) return;
      eventsFiredRef.current.add(key);
      toast.success(msg);
      speech.speak(msg);
    };
    const tol = plan.currentPrice * 0.0003;
    const closeJournal = (outcome: "win" | "loss", exit: number) => {
      const id = journalRowIdRef.current;
      if (!id) return;
      journalRowIdRef.current = null;
      const pnl = dir === "BUY" ? exit - tr.entry : tr.entry - exit;
      const patch: Record<string, unknown> = {
        outcome,
        pnl: Number(pnl.toFixed(plan.instrument.decimals)),
        closed_at: new Date().toISOString(),
      };
      if (outcome === "win") patch.tp2_hit_at = new Date().toISOString();
      supabase.from("trade_journal").update(patch as never).eq("id", id).then(({ error }) => {
        if (!error) toast.success(`Journal updated · ${outcome.toUpperCase()}`);
      });
    };
    const markTp1 = () => {
      const id = journalRowIdRef.current;
      if (!id) return;
      supabase.from("trade_journal")
        .update({ tp1_hit_at: new Date().toISOString() } as never)
        .eq("id", id)
        .is("tp1_hit_at", null as never);
    };
    const fillJournal = () => {
      const id = journalRowIdRef.current;
      if (!id) return;
      supabase.from("trade_journal")
        .update({ outcome: "open", opened_at: new Date().toISOString() })
        .eq("id", id)
        .eq("outcome", "pending");
    };
    // +1R checkpoint (informational — matches Trade Management ladder Step 1).
    // Full trade closes only at the plan's take-profit (tr.tp).
    const risk = Math.abs(tr.entry - tr.sl);
    const tp1 = dir === "BUY" ? tr.entry + risk : tr.entry - risk;
    if (dir === "BUY") {
      if (priceTick <= tr.entry + tol && trackerStatusRef.current === "PENDING") {
        fire("filled", `Entry filled at ${priceTick.toFixed(plan.instrument.decimals)}`);
        setTrackerStatus("RUNNING");
        fillJournal();
      }
      if (trackerStatusRef.current === "RUNNING") {
        if (priceTick >= tp1) { fire("tp1", `+1R reached. Close 50% and move SL to entry.`); markTp1(); }
        if (priceTick <= tr.sl) { fire("sl", `Stop loss hit. Risk contained.`); setTrackerStatus("LOSS"); stoppedRef.current = true; closeJournal("loss", tr.sl); }
        if (priceTick >= tr.tp) { fire("tp", `Take profit hit. Trade closed in profit.`); setTrackerStatus("WIN"); stoppedRef.current = true; closeJournal("win", tr.tp); }
      }
    } else if (dir === "SELL") {
      if (priceTick >= tr.entry - tol && trackerStatusRef.current === "PENDING") {
        fire("filled", `Entry filled at ${priceTick.toFixed(plan.instrument.decimals)}`);
        setTrackerStatus("RUNNING");
        fillJournal();
      }
      if (trackerStatusRef.current === "RUNNING") {
        if (priceTick <= tp1) { fire("tp1", `+1R reached. Close 50% and move SL to entry.`); markTp1(); }
        if (priceTick >= tr.sl) { fire("sl", `Stop loss hit. Risk contained.`); setTrackerStatus("LOSS"); stoppedRef.current = true; closeJournal("loss", tr.sl); }
        if (priceTick <= tr.tp) { fire("tp", `Take profit hit. Trade closed in profit.`); setTrackerStatus("WIN"); stoppedRef.current = true; closeJournal("win", tr.tp); }
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, speech]);


  const livePrice = useLivePriceStream(plan?.instrument.symbol, plan?.currentPrice ?? null, handleStreamTick);



  /* ---------- R-MULTIPLE ---------- */
  const rMultiple = useMemo(() => {
    if (!plan || !livePrice || plan.trade.direction === "WAIT") return 0;
    const { entry, sl } = plan.trade;
    const risk = Math.abs(entry - sl);
    if (!risk) return 0;
    const pnl = plan.trade.direction === "BUY" ? livePrice - entry : entry - livePrice;
    return pnl / risk;
  }, [livePrice, plan]);

  if (!authReady) return <PageLoading label="Opening signal desk" />;

  const t = plan?.trade;
  const isBuy = t?.direction === "BUY";
  const isSell = t?.direction === "SELL";
  const marketClosed = !!plan && !isMarketOpen(plan.instrument.symbol);
  const sym = plan?.instrument.display ?? (symbol || "—");
  const displayPrice = livePrice ?? plan?.currentPrice;
  const priceStr = plan && displayPrice != null ? `${plan.instrument.kind === "crypto" ? "" : "$"}${displayPrice.toFixed(plan.instrument.decimals)}` : "—";


  // Broadcasted alert view (from notification click) — no AI, no credits.
  if (alertId) {
    return (
      <div className="min-h-dvh w-full bg-white text-slate-900 font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif] antialiased">
        <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-[900px] items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              aria-label="Back to dashboard"
              className="h-8 shrink-0 inline-flex items-center gap-1.5 px-2 sm:px-3 rounded-lg border border-zinc-200 bg-white text-[12px] text-zinc-700 hover:bg-zinc-50 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Back</span>
            </button>
            <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <img src="/favicon.png" alt="JENVU AI" className="h-5 w-5 shrink-0 rounded-md object-contain" />
              <span className="truncate font-semibold tracking-tight text-[13px] sm:text-sm">Broadcasted Alert</span>
            </div>
            <button
              onClick={() => navigate({ to: "/signal", search: { symbol: broadcastedAlert?.pair || "XAUUSD" }, replace: true })}
              className="h-8 shrink-0 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-lg bg-zinc-900 text-[11px] sm:text-[12px] font-medium text-white hover:bg-zinc-800 transition whitespace-nowrap"
              title="Run a fresh AI analysis (uses credits)"
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0" /> Fresh analysis
            </button>

          </div>

        </header>

        <main className="mx-auto max-w-[900px] px-5 py-8 sm:px-6">
          {broadcastedLoading && (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading alert…
            </div>
          )}
          {!broadcastedLoading && !broadcastedAlert && (
            <div className="rounded-[24px] border border-zinc-200/70 bg-white p-8 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_-12px_rgba(16,24,40,0.10),0_32px_64px_-24px_rgba(16,24,40,0.08)] ring-1 ring-white/60">
              <AlertTriangle className="mx-auto h-6 w-6 text-amber-500 mb-2" />
              <p className="text-sm text-zinc-700 font-medium">Alert not available</p>
              <p className="mt-1 text-[12px] text-zinc-500">It may have expired or you don't have access.</p>
            </div>
          )}
          {broadcastedAlert && (
            <div className="rounded-[24px] border border-zinc-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_-12px_rgba(16,24,40,0.10),0_32px_64px_-24px_rgba(16,24,40,0.08)] ring-1 ring-white/60 overflow-hidden">
              <div className={cn(
                "px-6 py-5 flex items-center justify-between border-b border-zinc-100",
                broadcastedAlert.direction === "BUY" ? "bg-emerald-50/60" : "bg-red-50/60",
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    broadcastedAlert.direction === "BUY" ? "bg-emerald-500 text-white" : "bg-red-500 text-white",
                  )}>
                    {broadcastedAlert.direction === "BUY" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">{broadcastedAlert.pair}</div>
                    <div className="text-lg font-bold text-zinc-900">
                      {broadcastedAlert.direction} · Grade {broadcastedAlert.grade}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Confidence</div>
                  <div className="text-xl font-bold text-zinc-900">{broadcastedAlert.confidence}%</div>
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-zinc-100 border-b border-zinc-100">
                {[
                  { label: "Entry", value: broadcastedAlert.entry, tone: "text-zinc-900" },
                  { label: "Stop Loss", value: broadcastedAlert.sl, tone: "text-red-600" },
                  { label: "Take Profit", value: broadcastedAlert.tp, tone: "text-emerald-600" },
                ].map((row) => (
                  <div key={row.label} className="px-4 py-4 text-center">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{row.label}</div>
                    <div className={cn(`${MONO} mt-1 text-base font-bold`, row.tone)}>{row.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-zinc-100 border-b border-zinc-100 text-[12px]">
                <div className="px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">R:R</div>
                  <div className={`${MONO} mt-0.5 font-semibold text-zinc-900`}>1:{broadcastedAlert.rr.toFixed(2)}</div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">HTF Bias</div>
                  <div className="mt-0.5 font-semibold text-zinc-900 capitalize">{broadcastedAlert.htf_bias || "—"}</div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Session</div>
                  <div className="mt-0.5 font-semibold text-zinc-900">{broadcastedAlert.session || "—"}</div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Killzone</div>
                  <div className="mt-0.5 font-semibold text-zinc-900">{broadcastedAlert.killzone || "—"}</div>
                </div>
              </div>

              {broadcastedAlert.rationale && (
                <div className="px-6 py-4 border-b border-zinc-100">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">Rationale</div>
                  <p className="text-[13px] leading-relaxed text-zinc-700 whitespace-pre-wrap">{broadcastedAlert.rationale}</p>
                </div>
              )}

              <div className="px-6 py-3 flex items-center justify-between text-[11px] text-zinc-500">
                <span>Broadcasted {new Date(broadcastedAlert.fired_at).toLocaleString()}</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  <Check className="h-3 w-3" /> No credits used
                </span>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="signal-page-root min-h-dvh w-full bg-white text-slate-900 antialiased" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 }}>
      <style>{`.signal-page-root, .signal-page-root * { font-family: "Google Sans", "Product Sans", "Roboto", system-ui, sans-serif !important; text-transform: none !important; letter-spacing: normal !important; }`}</style>
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
        <div className="relative mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-5 py-3 sm:px-6 sm:py-4 min-w-0">
          <button
            onClick={() => { stop(); navigate({ to: "/dashboard" }); }}
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-zinc-200 bg-white text-[12px] text-zinc-700 hover:bg-zinc-50 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:flex items-center gap-2.5">
            <Link to="/" aria-label="Jenvu home" className="pointer-events-auto shrink-0 inline-flex items-center justify-center rounded-md hover:opacity-80 transition">
              <img src="/favicon.png" alt="JENVU AI" className="h-5 w-5 rounded-md object-contain" />
            </Link>
            <span className="truncate text-[22px] tracking-tight leading-none select-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
          </div>
          <div className="flex items-center gap-2 justify-end flex-nowrap overflow-x-auto min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              to="/killzones"
              className="hidden sm:inline-flex h-9 items-center gap-1.5 px-3.5 rounded-lg border border-zinc-200 bg-white font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] text-[14px] font-normal text-zinc-700 hover:bg-zinc-50 transition"
            >
              Killzones
            </Link>
            {voiceBlocked && (
              <button
                onClick={() => {
                  try {
                    const u = new SpeechSynthesisUtterance("'''Do not make any visual modifications. The phrases I write are commands to understand what I want, not to be written down. Understand their content well, then execute what is required.'''\n                                        \n                                            \n                                            check kro manual scan aur auto scan shi work kr rha ha aj signal kew nhi aua koyi acha sa dekho aur agar bug ha usko fix kro");
                    window.speechSynthesis.speak(u);
                  } catch {}
                  setVoiceBlocked(false);
                  if (plan) runNarration(plan);
                }}
                className="shrink-0 h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-amber-200 bg-amber-50 text-[12px] font-medium text-amber-800 hover:bg-amber-100 transition"
                title="Browser blocked autoplay — tap to enable voice"
              >
                🔇 Enable voice
              </button>
            )}
            {playing ? (
              <button onClick={stop} className="shrink-0 h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-red-200 bg-red-50 text-[12px] font-medium text-red-700 hover:bg-red-100 transition">
                <Pause className="h-3.5 w-3.5" /> Stop
              </button>
            ) : (
              <button
                onClick={load}
                disabled={loading || (!credits.isLoading && credits.balance < 0.20)}
                title={!credits.isLoading && credits.balance < 0.20 ? "Balance too low — add funds to run an analysis" : "Run a fresh AI analysis"}
                className="shrink-0 h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-zinc-900 text-[12px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {loading ? (
                  <span className="tabular-nums">
                    Analyzing… {analyzeElapsed}s
                  </span>
                ) : "Re-analyze"}
              </button>
            )}
            {isAdmin && authUser?.email?.toLowerCase() === "haseeb@jenvu.com" && plan && plan.trade.direction !== "WAIT" && (
              <button
                onClick={handleBroadcast}
                disabled={broadcasting}
                className="shrink-0 h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-amber-500 text-[12px] font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition"
                title="Send this signal to all paid subscribers"
              >
                {broadcasting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Alert Everyone
              </button>
            )}
          </div>
        </div>
      </header>


      {/* LOW BALANCE BANNER — blocks scan when wallet < $0.20 per-signal charge */}
      {!credits.isLoading && credits.balance < 0.20 && (
        <div className="border-b border-red-200 bg-red-50">
          <div className="mx-auto max-w-[1600px] px-5 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-[14px] text-red-900" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 }}>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2 py-0.5 rounded-sm bg-red-600 text-white font-normal" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif' }}>Low balance</span>
              <span>
                Your balance is <strong className="tabular-nums">${credits.balance.toFixed(2)}</strong> — you need at least <strong>$0.20</strong> per signal scan. Add funds to continue.
              </span>
            </div>
            <Link to="/dashboard/billing" className="rounded-md bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-black">
              Add funds
            </Link>
          </div>
        </div>
      )}

      {/* PLAN LIMITS BANNER (Free) */}
      {!credits.isLoading && (!credits.features.realtime_alerts || !credits.features.full_ict) && (
        <div className="border-b border-amber-100 bg-amber-50/70">
          <div className="mx-auto max-w-[1600px] px-5 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-[14px] text-amber-900" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 }}>
            <div className="flex items-center gap-2">
              <span className={`${MONO} text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-amber-400 text-zinc-900 font-bold`}>Free plan</span>
              <span>
                {!credits.features.full_ict && "ICT narration walkthrough locked · "}
                {!credits.features.realtime_alerts && "Realtime alerts locked · "}
                Upgrade to unlock the full signal desk.
              </span>
            </div>
            <Link to="/pricing" className="rounded-md bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-black">
              Upgrade
            </Link>
          </div>
        </div>
      )}


      {/* TERMINAL CARD */}
      <main className="mx-auto max-w-[1600px] px-5 py-5 sm:px-6 sm:py-8">

        <h1 className="sr-only">Live institutional signal desk — ICT & SMC analysis for {sym}</h1>
        <div className="rounded-[24px] border border-zinc-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_-12px_rgba(16,24,40,0.10),0_32px_64px_-24px_rgba(16,24,40,0.08)] ring-1 ring-white/60 overflow-hidden">
          {/* terminal header */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 border-b border-zinc-100 bg-white sm:flex sm:justify-between sm:px-6 sm:py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex gap-1.5 shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <span className={`text-[11px] ${MONO} tabular-nums text-zinc-900`}>{priceStr}</span>
              <div className="hidden sm:block h-4 w-px bg-zinc-200" />
              {plan && (
                <span className="hidden sm:inline text-[12px] tracking-wide uppercase px-2.5 py-1 rounded bg-white text-zinc-900 border border-zinc-200" style={{ fontFamily: '"Google Sans", "Product Sans", system-ui, sans-serif', fontWeight: 400 }}>
                  {plan.killzone}
                </span>
              )}
              <div className="flex items-center gap-2">
                {plan && !isMarketOpen(plan.instrument.symbol) ? (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    <span className={`text-[10px] sm:text-[11px] font-medium text-zinc-500 tracking-tight ${MONO} uppercase`}>Market Closed</span>
                  </>
                ) : (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] sm:text-[11px] font-medium text-emerald-600 tracking-tight">LIVE FEED</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* body grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-white">
            {/* LEFT — ICT execution feed */}
            <div className="lg:col-span-3 bg-white p-5 sm:p-6 flex flex-col gap-4 min-h-[280px]">
              {/* Voice AI Agent — orb + chat, can mark on chart */}
              <div className="pb-3 border-b border-zinc-100">
                <SignalVoiceAgent
                  plan={plan}
                  livePrice={livePrice}
                  htfRef={htfRef}
                  ltfRef={ltfRef}
                  analyzing={playing}
                  narrationPulse={speech.wordPulse}
                  credits={credits}
                />
              </div>

              {broadcastStatus && broadcastStatus.kind === "sent" && (
                <div
                  className={`rounded-xl border p-3 text-xs font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] ${
                    broadcastStatus.kind === "sent"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div>
                        <div className="font-semibold">
                          {`Broadcast sent · ${broadcastStatus.pair} · ${broadcastStatus.conf}%`}
                        </div>
                        <div className="mt-0.5 opacity-90">
                          Alert fanned out to paid subscribers, WhatsApp, email, and in-app.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setBroadcastStatus(null)}
                      className="text-[11px] opacity-60 hover:opacity-100"
                      aria-label="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {!plan && (
                analysisError ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="flex items-start gap-2 font-semibold">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{analysisError}</span>
                    </div>
                    <button
                      onClick={load}
                      disabled={loading}
                      className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-[11px] font-medium text-white disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Retry analysis
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading narration…
                  </div>
                )
              )}
              <div ref={feedScrollRef} className="space-y-4 overflow-y-auto pr-1 max-h-[640px]">
                {plan?.narration.map((n, i) => {
                  const { tag, tone } = tagOf(n.say);
                  const active = i === step;
                  const past = i < step;
                  return (
                    <div
                      key={i}
                      data-step={i}
                      className={cn(
                        "px-5 py-4 rounded-2xl border transition-all",
                        toneCardClass[tone],
                        active
                          ? "shadow-[0_6px_24px_-8px_rgba(0,0,0,0.14)] ring-1 ring-zinc-900/10"
                          : past
                            ? "opacity-70"
                            : "opacity-60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <span className="text-[13px] font-bold tracking-tight text-zinc-900">{sym}</span>
                        <span className={`text-[12px] ${MONO} text-zinc-500 tabular-nums`}>{hhmmss()}</span>
                      </div>
                      <div className="mb-2">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wider",
                          toneClass[tone],
                        )}>
                          {tag}
                        </span>
                      </div>
                      <p className="text-[14.5px] text-zinc-800 leading-relaxed">{n.say}</p>
                    </div>
                  );
                })}
              </div>
            </div>



            {/* CENTER — charts + multi-tf strip */}
            <div className="lg:col-span-6 bg-white flex flex-col gap-px">
              {/* Multi-TF alignment strip */}
              {plan && (
                <div className="bg-white px-4 sm:px-5 pt-3.5 pb-2.5 flex items-center justify-between gap-3 border-b border-zinc-100">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`text-[11px] font-bold ${MONO} tracking-widest uppercase text-zinc-500 mr-1`}>
                      MTF
                    </span>
                    {plan.multiTf.map((b) => (
                      <TfPill key={b.tf} tfBias={b} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className={`text-[11px] ${MONO} tracking-widest uppercase text-zinc-500`}>
                      {plan.alignmentLabel}
                    </span>
                    <div className="w-28 h-2 bg-gradient-to-r from-rose-100 via-zinc-100 to-emerald-100 rounded-full relative overflow-hidden">
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-3.5 bg-zinc-900 rounded-sm"
                        style={{ left: `${Math.max(0, Math.min(96, plan.alignmentScore))}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white p-3 sm:p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-normal font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] tracking-normal normal-case text-zinc-900">
                    HTF // 4H · Bias
                  </span>
                  {plan && (
                    <span className={cn(
                      "text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded",
                      plan.htfBias === "bullish" ? "bg-emerald-100 text-emerald-700" :
                      plan.htfBias === "bearish" ? "bg-rose-100 text-rose-700" :
                      "bg-zinc-100 text-zinc-700",
                    )}>
                      {plan.htfBias}
                    </span>
                  )}
                </div>
                <div className={cn("rounded-xl border border-zinc-100 overflow-hidden h-[260px] sm:h-[300px] transition-opacity duration-300", activeTf === "ltf" ? "opacity-55" : "opacity-100")}>
                  {plan ? (
                    <SignalChart
                      ref={htfRef}
                      candles={plan.htfCandles}
                      tf="htf"
                      dark={false}
                      title="4H"
                    />
                  ) : null}
                </div>

              </div>
              <div className="bg-white p-3 sm:p-4 flex flex-col gap-2 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-normal font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] tracking-normal normal-case text-zinc-900">
                    LTF // 15M · Execution
                  </span>
                  {t && (
                    <span className={cn(
                      "text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded",
                      isBuy ? "bg-emerald-100 text-emerald-700" :
                      isSell ? "bg-rose-100 text-rose-700" :
                      "bg-zinc-100 text-zinc-700",
                    )}>
                      {t.direction}
                    </span>
                  )}
                </div>
                <div className={cn("rounded-xl border border-zinc-100 overflow-hidden h-[260px] sm:h-[300px] transition-opacity duration-300", activeTf === "htf" ? "opacity-55" : "opacity-100")}>
                  {plan ? (
                    <SignalChart
                      ref={ltfRef}
                      candles={plan.ltfCandles}
                      tf="ltf"
                      dark={false}
                      title="15M"
                    />
                  ) : null}

                </div>
              </div>
            </div>

            {/* RIGHT — intelligence */}
            <div className="lg:col-span-3 bg-white p-5 sm:p-6 lg:border-l border-zinc-100 flex flex-col gap-4 min-h-[280px]">
              <h3 className="text-[15px] font-normal font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] text-zinc-900 tracking-normal normal-case">
                Intelligence Dashboard
              </h3>

              <div className="space-y-4 overflow-y-auto pr-1 max-h-[640px]">

              {/* Confluence Heatmap removed */}

              {/* A+ Setup Score */}
              {plan && <SetupScoreCard plan={plan} />}

              {/* Trade card — moved up to position 2 */}
              {t && plan && !marketClosed && (
                <div className="space-y-3">
                  <div className="flex items-end justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-['Urbanist',sans-serif] text-[12px] font-semibold tracking-wide uppercase text-zinc-900`}>Trade Plan</span>
                      {(t.confidence ?? 0) >= MIN_CONFIDENCE && (
                        <>
                          <span className={cn(
                            `text-[10px] ${MONO} font-bold tracking-widest uppercase px-1.5 py-0.5 rounded`,
                            isBuy ? "bg-emerald-100 text-emerald-700" :
                            isSell ? "bg-rose-100 text-rose-700" :
                            "bg-zinc-100 text-zinc-600",
                          )}>
                            {isBuy ? "● BUY" : isSell ? "● SELL" : "WAIT"}
                          </span>
                          {(isBuy || isSell) && (
                            <span className={cn(
                              `text-[10px] ${MONO} font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border`,
                              isBuy ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-rose-200 text-rose-700 bg-rose-50",
                            )}>
                              {isBuy ? "LONG" : "SHORT"}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {alertsOn !== null && (
                        <button
                          onClick={toggleAlerts}
                          disabled={alertsSaving}
                          className={cn(
                            "shrink-0 h-7 inline-flex items-center gap-1.5 px-2.5 rounded-md text-[11px] font-medium border transition disabled:opacity-50",
                            alertsOn
                              ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                              : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100",
                          )}
                          title={alertsOn
                            ? "Alerts ON · $0.20 charged per signal. Click to turn off."
                            : "Alerts OFF · no notifications, no charges. Click to turn on."}
                        >
                          {alertsSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : alertsOn ? (
                            <Bell className="h-3 w-3" />
                          ) : (
                            <BellOff className="h-3 w-3" />
                          )}
                          {alertsOn ? "Alerts ON" : "Alerts OFF"}
                        </button>
                      )}
                      <span className="text-[11px] text-zinc-500">
                        Conf <span className="font-bold text-zinc-900">{t.confidence}%</span>
                      </span>
                    </div>
                  </div>

                  {/* Imminent-news countdown chip */}
                  <NewsCountdownChip plan={plan} />

                  {(() => {
                    const LOW_CONF = MIN_CONFIDENCE; // single source of truth
                    const isLowConf = (t.confidence ?? 0) < LOW_CONF;
                    const dec = plan.instrument.decimals;
                    const riskAbs = Math.abs(t.entry - t.sl);
                    const rewardAbs = Math.abs(t.tp - t.entry);
                    const riskPct = t.entry ? (riskAbs / t.entry) * 100 : 0;
                    const rewardPct = t.entry ? (rewardAbs / t.entry) * 100 : 0;
                    const fmtDist = (n: number) => n >= 100 ? n.toFixed(0) : n.toFixed(dec);
                    const seniorFailed = plan.setupChecks.some((c) => c.key === "senior_review_unavailable");
                    const seniorFailReason = plan.setupChecks.find((c) => c.key === "senior_review_unavailable")?.reason;
                    return (
                      <>
                        {seniorFailed && (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 font-['Urbanist',sans-serif] text-[13px] font-medium text-rose-900 leading-relaxed">
                            <div className="font-semibold text-[14px] mb-1">Senior review unavailable — trade plan withheld</div>
                            <div>{seniorFailReason ?? "No model in the senior review chain responded. Entry / Stop / Target are hidden until a senior review completes. Please re-run the scan."}</div>
                          </div>
                        )}
                        {!seniorFailed && isLowConf && (isBuy || isSell) && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 font-['Urbanist',sans-serif] text-[13px] font-medium text-amber-900 leading-relaxed">
                            <div className="font-semibold text-[14px] mb-1">Low-confidence setup — no entry shown</div>
                            <div>Confidence {t.confidence ?? 0}% is below the {LOW_CONF}% minimum. Entry / Stop / Target are hidden until a setup with best grades forms. Wait for the next scan.</div>
                          </div>
                        )}
                        {(isBuy || isSell) && !isLowConf && !seniorFailed && (
                          <div className="grid grid-cols-2 gap-px bg-zinc-100 rounded-lg overflow-hidden border border-zinc-100">
                            <KV label="Entry" value={t.entry.toFixed(dec)} />
                            <KV label="R:R" value={`1:${t.rr.toFixed(2)}`} />
                            <KV
                              label="Stop"
                              value={t.sl.toFixed(dec)}
                              tone="bad"
                              sub={riskAbs > 0 ? `−${fmtDist(riskAbs)} pts · ${riskPct.toFixed(2)}%` : undefined}
                            />
                            <KV
                              label="Target"
                              value={t.tp.toFixed(dec)}
                              tone="good"
                              sub={rewardAbs > 0 ? `+${fmtDist(rewardAbs)} pts · ${rewardPct.toFixed(2)}%` : undefined}
                            />
                          </div>
                        )}

                        {!isBuy && !isSell && !seniorFailed && (
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-[14px] text-zinc-700">
                            <div className="font-semibold mb-1">No directional bias</div>
                            <div className="text-[13px] text-zinc-500">Market is currently ranging — wait for a clear HTF bias before entering.</div>
                          </div>
                        )}

                      </>
                    );
                  })()}
                  {(() => {
                    if (!livePrice || !(isBuy || isSell)) return null;
                    const driftPct = Math.abs(livePrice - t.entry) / livePrice;
                    const kind = plan.instrument.kind;
                    const threshold =
                      kind === "crypto" ? 0.006 :
                      kind === "metal"  ? 0.003 :
                      kind === "forex"  ? 0.0015 :
                                          0.004;
                    if (driftPct < threshold) return null;
                    const away = (driftPct * 100).toFixed(2);
                    const isChase = (isBuy && livePrice > t.entry) || (isSell && livePrice < t.entry);
                    return (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs sm:text-sm text-amber-800 leading-snug">
                        <span className="mt-0.5 shrink-0">⚠</span>
                        <span className="break-words">
                          Live ({plan.instrument.kind === "crypto" ? "" : "$"}{livePrice.toFixed(plan.instrument.decimals)}) drifted <b>{away}%</b> from entry ({plan.instrument.kind === "crypto" ? "" : "$"}{t.entry.toFixed(plan.instrument.decimals)}) — {isChase ? "don't chase," : "wait for pullback,"} re-analyze.
                        </span>
                      </div>
                    );
                  })()}
                  <div className="w-full h-1 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full", isBuy ? "bg-emerald-500" : isSell ? "bg-rose-500" : "bg-zinc-400")}
                      style={{ width: `${Math.max(8, Math.min(100, t.confidence))}%` }}
                    />
                  </div>

                  {/* Position sizing calculator */}
                  {(isBuy || isSell) && (t.confidence ?? 0) >= MIN_CONFIDENCE && (
                    <PositionSizer plan={plan} />
                  )}

                  {/* Trade Management — final recommendation only */}
                  {(isBuy || isSell) && (t.confidence ?? 0) >= MIN_CONFIDENCE && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 font-['Urbanist',sans-serif] text-[13px] font-medium text-emerald-950 leading-relaxed space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 font-['Urbanist',sans-serif] font-semibold text-emerald-800 uppercase tracking-wide text-[10px] sm:text-[11px]">
                          <span>◆</span> Trade Management — Final Recommendation
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ${
                            plan.setupGrade === "A+" ? "bg-emerald-600 text-white" :
                            plan.setupGrade === "A" ? "bg-emerald-500 text-white" :
                            plan.setupGrade === "B" ? "bg-amber-500 text-white" :
                            "bg-zinc-400 text-white"
                          }`}>
                            {plan.setupGrade} Setup
                          </span>
                          <span className="inline-flex items-center rounded-md bg-white border border-emerald-300 px-2 py-0.5 text-[12px] font-bold text-emerald-800 tabular-nums">
                            {t.confidence}%
                          </span>
                        </div>
                      </div>
                      <div className="leading-relaxed">
                        At <b>30% profit</b>, close <b>70%</b> of the position and move SL to <b>breakeven</b>. Let the <b>30% runner</b> ride toward TP2 / 50% profit — exit flat if price returns, lock bonus if it runs.
                      </div>
                    </div>
                  )}


                  {/* 30% threshold nudge */}
                  {(isBuy || isSell) && (t.confidence ?? 0) >= MIN_CONFIDENCE && rMultiple >= 0.6 && rMultiple < 1.0 && trackerStatus === "RUNNING" && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 leading-snug">
                      <span className="mt-0.5 shrink-0">💡</span>
                      <span>
                        Current profit ≈ <b>{rMultiple.toFixed(2)}R</b> — near the <b>30%-of-investment</b> threshold. <b>Close 50% now</b> and move SL to entry. Locking in profit is smarter than chasing TP2.
                      </span>
                    </div>
                  )}

                  {/* Backtest history badge */}
                  {/* backtest badge removed — sparse sample was misleading */}








                  {/* Take Trade / Save Signal — only when valid trade plan (conf ≥ 70, entry/SL/TP present) */}
                  {(isBuy || isSell) && t.confidence >= MIN_CONFIDENCE && Number.isFinite(t.entry) && Number.isFinite(t.sl) && Number.isFinite(t.tp) && t.entry > 0 && t.sl > 0 && t.tp > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={logging || tradeLogged || (!isBuy && !isSell)}
                      onClick={async () => {
                        if (!plan) return;
                        setLogging(true);
                        const { data: u } = await supabase.auth.getUser();
                        if (!u.user) { toast.error("Sign in to log trades"); setLogging(false); return; }
                        // Decide market vs limit. A ticket counts as FILLED (open) when
                        // live price is at the entry band OR has already traded through
                        // entry in the fill direction — otherwise good tickets sat in
                        // "pending" forever while the market ran to target.
                        const px = plan.currentPrice;
                        const tolMarket = Math.max(px * 0.0015, 0.01);
                        const atMarket =
                          (isBuy && px <= t.entry + tolMarket) ||
                          (isSell && px >= t.entry - tolMarket);
                        const initialOutcome = atMarket ? "open" : "pending";
                        const { data, error } = await supabase.from("trade_journal").insert({
                          user_id: u.user.id,
                          pair: plan.instrument.symbol,
                          direction: isBuy ? "long" : "short",
                          entry: t.entry,
                          stop_loss: t.sl,
                          take_profit: t.tp,
                          outcome: initialOutcome,
                          notes: `Auto-logged from AI signal · Conf ${t.confidence}%${plan.confluences.length ? " · " + plan.confluences.slice(0, 3).join(" | ") : ""}`,
                        }).select("id").single();
                        setLogging(false);
                        if (error || !data) {
                          const msg = String(error?.message ?? "");
                          const code = String((error as any)?.code ?? "");
                          const isPerm = code === "42501" || /row-level security|permission denied|policy/i.test(msg);
                          if (isPerm) {
                            toast.error("Trade Journal is a paid feature", {
                              description: "Upgrade to Pro or Elite to log and auto-track trades.",
                              action: { label: "Upgrade", onClick: () => (window.location.href = "/pricing") },
                            });
                          } else {
                            toast.error("Could not log trade", { description: msg || "Please try again." });
                          }
                          return;
                        }
                        journalRowIdRef.current = data.id;
                        setTradeLogged(true);
                        toast.success(
                          initialOutcome === "pending"
                            ? "Limit order placed · waiting for entry"
                            : "Trade logged · auto-tracking win/loss",
                        );
                      }}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-normal tracking-normal normal-case font-['Google_Sans','Product_Sans',system-ui,sans-serif] transition-colors",
                        tradeLogged
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : isBuy
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : isSell
                              ? "bg-rose-600 text-white hover:bg-rose-700"
                              : "bg-zinc-200 text-zinc-500 cursor-not-allowed",
                        (logging || tradeLogged) && "opacity-90",
                      )}
                    >
                      {logging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : tradeLogged ? <Check className="h-3.5 w-3.5" /> : null}
                      {tradeLogged ? "Trade Logged" : "Trade Done"}
                    </button>
                    <button
                      type="button"
                      disabled={saving || signalSaved}
                      onClick={async () => {
                        if (!plan) return;
                        setSaving(true);
                        const { data: u } = await supabase.auth.getUser();
                        if (!u.user) { toast.error("Sign in to save"); setSaving(false); return; }
                        const snapshot = {
                          pair: plan.instrument.symbol,
                          decimals: plan.instrument.decimals,
                          direction: isBuy ? "long" : isSell ? "short" : "wait",
                          entry: t.entry,
                          stop_loss: t.sl,
                          take_profit: t.tp,
                          rr: t.rr,
                          confidence: t.confidence,
                          confluences: plan.confluences,
                          session: plan.session,
                          saved_price: plan.currentPrice,
                          plan, // full plan snapshot for exact re-open
                          saved_at: new Date().toISOString(),
                        };
                        const { error } = await supabase.from("saved_signals").insert({
                          user_id: u.user.id,
                          alert_id: null,
                          snapshot,
                          notes: `${plan.instrument.symbol} · ${(isBuy ? "LONG" : isSell ? "SHORT" : "WAIT")} · Conf ${t.confidence}%`,
                        });
                        setSaving(false);
                        if (error) { toast.error("Could not save signal"); return; }
                        setSignalSaved(true);
                        toast.success("Signal saved to your dashboard");
                      }}
                      className={cn(
                        "inline-flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-normal tracking-normal normal-case font-['Google_Sans','Product_Sans',system-ui,sans-serif] border transition-colors",
                        signalSaved
                          ? "bg-zinc-50 text-zinc-700 border-zinc-200"
                          : "bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-50",
                      )}
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : signalSaved ? <Check className="h-3.5 w-3.5" /> : null}
                      {signalSaved ? "Saved" : "Save Signal"}
                    </button>
                  </div>
                  )}
                </div>
              )}

              {/* Key Levels — moved from left rail */}
              {plan && plan.keyLevels.length > 0 && (
                <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
                  
                  <div className="space-y-1">
                    {plan.keyLevels.map((k, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-zinc-100 last:border-0">
                        <span className="flex items-center gap-1.5">
                          <span className={cn("w-1.5 h-1.5 rounded-full",
                            k.kind === "resistance" ? "bg-rose-500" :
                            k.kind === "support" ? "bg-emerald-500" :
                            k.kind === "equilibrium" ? "bg-amber-500" : "bg-sky-500",
                          )} />
                          <span className="text-zinc-700">{k.label}</span>
                        </span>
                        <span className={`${MONO} font-medium tabular-nums text-zinc-900`}>
                          {plan.instrument.kind === "crypto" ? "" : "$"}{k.price.toFixed(plan.instrument.decimals)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}


              {/* Market closed notice — replaces tracker/trade card */}
              {marketClosed && plan && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5 space-y-2.5">
                  <div className={`flex items-center gap-1.5 text-xs ${MONO} tracking-widest uppercase text-zinc-700`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    Market Closed
                  </div>
                  <p className="text-[13px] text-zinc-700 leading-relaxed">
                    {plan.instrument.symbol} session is closed. The AI has not issued a live entry / SL / TP — only key levels, FVGs and OBs from the last session are shown for reference. The plan will auto-revalidate as soon as the session opens.
                  </p>
                  <p className={`text-[11px] ${MONO} text-zinc-500 uppercase tracking-wider`}>
                    Opens Sun 22:00 UTC
                  </p>

                </div>
              )}

              {/* Setup validity — tells the user if the signal is still valid */}
              {plan && t && t.direction !== "WAIT" && !marketClosed && (t.confidence ?? 0) >= MIN_CONFIDENCE && (() => {
                const invalid = trackerStatus === "LOSS";
                const done = trackerStatus === "WIN";
                const tone = invalid
                  ? "border-rose-200 bg-rose-50/50"
                  : done
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-emerald-200 bg-emerald-50/30";
                const dot = invalid ? "bg-rose-500" : done ? "bg-emerald-500" : "bg-emerald-500 animate-pulse";
                const label = invalid ? "Signal invalidated" : done ? "Target reached" : "Signal still valid";
                const detail = invalid
                  ? `Stop-loss level (${t.sl.toFixed(plan.instrument.decimals)}) was reached — this setup is closed. An invalidation alert has been sent to WhatsApp and email.`
                  : done
                    ? `Take-profit (${t.tp.toFixed(plan.instrument.decimals)}) was reached. Trade closed in profit.`
                    : `Price ${livePrice ? livePrice.toFixed(plan.instrument.decimals) : "—"} is still on the right side of the stop (${t.sl.toFixed(plan.instrument.decimals)}). We re-check every 2 minutes — if the stop is hit or the bias flips, you get an instant WhatsApp / email invalidation alert.`;
                return (
                  <div className={cn("rounded-lg border p-3 space-y-1.5", tone)}>
                    <div className="flex items-center gap-1.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full", dot)} />
                      <span className="font-['Urbanist',sans-serif] text-[13px] font-semibold tracking-wide text-zinc-900">{label}</span>
                    </div>
                    <p className="text-[12px] leading-snug text-zinc-700">{detail}</p>
                  </div>
                );
              })()}

              {/* Live trade tracker */}

              {plan && t && t.direction !== "WAIT" && !marketClosed && (t.confidence ?? 0) >= MIN_CONFIDENCE && (
                <TradeTrackerCard
                  plan={plan}
                  livePrice={livePrice}
                  rMultiple={rMultiple}
                  status={trackerStatus}
                  sparkline={sparkline}
                />
              )}



              {/* News risk */}
              {plan && (
                <div className={cn(
                  "rounded-lg border p-3 flex items-start gap-2.5",
                  plan.newsRisk.severity === "high" ? "border-rose-200 bg-rose-50/40" :
                  plan.newsRisk.severity === "medium" ? "border-amber-200 bg-amber-50/40" :
                  "border-emerald-200 bg-emerald-50/30",
                )}>
                  {plan.newsRisk.severity === "high"
                    ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
                    : <span className="h-1.5 w-1.5 mt-1.5 rounded-full bg-emerald-500 shrink-0" />}
                  <div className="min-w-0">
                    <div className={`flex items-center justify-between gap-2 font-['Urbanist',sans-serif] text-[13px] font-semibold tracking-wide text-zinc-900`}>
                      <span>News · {plan.session}</span>
                      {newsUpdatedAt && (
                        <span className="font-['Urbanist',sans-serif] text-[11px] font-medium tracking-normal text-zinc-600">
                          upd {new Date(newsUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    <p className="font-['Urbanist',sans-serif] text-[13px] font-medium text-zinc-800 leading-relaxed mt-1">{plan.newsRisk.warning}</p>
                  </div>
                </div>
              )}

              {/* Trade card moved to position 2 above */}








              {/* Recent fired alerts (opt-in is now automatic on signup) */}
              <AlertsHistoryPanel alerts={alertHistory} loading={alertsLoading} />


              <Link
                to="/dashboard"
                className="w-full inline-flex items-center justify-center py-3 bg-white text-zinc-900 text-[14px] font-normal font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] tracking-normal rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors normal-case"
              >
                Execute Voice Trade
              </Link>
              </div>
            </div>
          </div>

          {/* status bar */}
          <div className="px-4 sm:px-6 py-2 border-t border-zinc-100 bg-white flex flex-col sm:flex-row justify-center sm:justify-between items-center gap-2 sm:gap-3">
            <div className="flex gap-4 sm:gap-6 items-center">
              <div className="flex items-center gap-1.5">
                <span className={`text-[13px] font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal text-zinc-900`}>STATE</span>
                <span className={`text-[13px] font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal tabular-nums text-zinc-900`}>{playing ? "Narrating" : loading ? `Analyzing ${analyzeElapsed}s` : "Ready"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[13px] font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal text-zinc-900`}>STEP</span>
                <span className={`text-[13px] font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal tabular-nums text-zinc-900`}>
                  {plan ? `${Math.max(0, step + 1)}/${plan.narration.length}` : "0/0"}
                </span>
              </div>
            </div>
            <div className={`text-[9px] ${MONO} tracking-widest uppercase text-zinc-800 font-semibold flex flex-wrap gap-x-3 gap-y-1 items-center justify-center sm:justify-end`}>
              <LegendDot color="bg-emerald-500/70" label="FVG/BOS" />
              <LegendDot color="bg-sky-500/70" label="OB" />
              <LegendDot color="bg-amber-500/70" label="Liquidity" />
              <LegendDot color="bg-violet-500/70" label="EQH/EQL" />
              <LegendDot color="bg-yellow-400/70" label="OTE" />
              <LegendDot color="bg-rose-400/40" label="Premium" />
              <LegendDot color="bg-emerald-400/40" label="Discount" />
            </div>
          </div>
        </div>
      </main>

    </div>
  );

}

/* ---------- bits ---------- */
function KV({ label, value, tone, sub }: { label: string; value: string; tone?: "good" | "bad"; sub?: string }) {
  return (
    <div className="bg-white p-2.5">
      <div className={`text-[10px] ${MONO} tracking-widest uppercase text-zinc-500`}>{label}</div>
      <div className={cn(
        "text-sm font-semibold tabular-nums mt-0.5",
        tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-zinc-900",
      )}>{value}</div>
      {sub && (
        <div className={cn(
          `text-[10px] ${MONO} tabular-nums mt-0.5 opacity-80`,
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-zinc-500",
        )}>{sub}</div>
      )}
    </div>
  );
}


function ChartSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-zinc-50">
      <Loader2 className="h-5 w-5 animate-spin opacity-40" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-normal font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] tracking-normal normal-case">
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      {label}
    </span>
  );
}

function TfPill({ tfBias }: { tfBias: SignalPlan["multiTf"][number] }) {
  const Icon = tfBias.bias === "bullish" ? TrendingUp : tfBias.bias === "bearish" ? TrendingDown : Minus;
  const tone =
    tfBias.bias === "bullish" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    tfBias.bias === "bearish" ? "bg-rose-50 text-rose-700 border-rose-200" :
    "bg-zinc-50 text-zinc-600 border-zinc-200";
  return (
    <motion.span
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-semibold tracking-wider uppercase",
        MONO, tone,
      )}
    >
      <span className="opacity-70">{tfBias.tf}</span>
      <Icon className="h-3.5 w-3.5" />
      <span className="tabular-nums opacity-60">{tfBias.score}</span>
    </motion.span>
  );
}

// -------------------- Confluence Heatmap --------------------
function ConfluenceHeatmap({ plan }: { plan: SignalPlan }) {
  // Dedupe by short label so we don't render two identical tiles (e.g. two "E/SL/TP")
  const seenShort = new Set<string>();
  const checks = plan.setupChecks.filter((c) => {
    const s = shortLabel(c.label);
    if (seenShort.has(s)) return false;
    seenShort.add(s);
    return true;
  }).slice(0, 6);
  const passed = checks.filter((c) => c.pass === true).length;
  const total = checks.length;
  const pct = total ? Math.round((passed / total) * 100) : 0;
  const strength =
    pct >= 84 ? { label: "A+ CONFLUENCE", tone: "emerald", ring: "from-emerald-400 via-emerald-500 to-teal-500" }
    : pct >= 66 ? { label: "STRONG", tone: "emerald", ring: "from-emerald-400 to-emerald-600" }
    : pct >= 50 ? { label: "MIXED", tone: "amber", ring: "from-amber-400 to-amber-600" }
    : { label: "WEAK", tone: "rose", ring: "from-rose-400 to-rose-600" };
  const pillTone =
    strength.tone === "emerald" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : strength.tone === "amber" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-rose-50 text-rose-700 border-rose-200";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_8px_30px_rgba(0,0,0,0.04)]"
    >
      {/* Header — terminal style like the rest of the page */}
      <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-zinc-200" />
            <div className="w-2 h-2 rounded-full bg-zinc-200" />
            <div className="w-2 h-2 rounded-full bg-zinc-200" />
          </div>
          <span className={`ml-2 text-[10px] ${MONO} tracking-[0.2em] uppercase text-zinc-900`}>
            Confluence Heatmap
          </span>
        </div>
        <span className={cn("text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded border border-zinc-200 bg-white text-zinc-700", MONO)}>
          {strength.label}
        </span>
      </div>

      {/* Score row: ring + progress bar */}
      <div className="flex items-center gap-3 mb-3.5">
        {/* Score dial — yellow accent */}
        <div className="relative shrink-0">
          <svg viewBox="0 0 44 44" className="h-14 w-14 -rotate-90">
            <circle cx="22" cy="22" r="18" strokeWidth="3.5" className="stroke-zinc-100" fill="none" />
            <motion.circle
              cx="22" cy="22" r="18" strokeWidth="3.5" fill="none" strokeLinecap="round"
              stroke="#eab308"
              strokeDasharray={2 * Math.PI * 18}
              initial={{ strokeDashoffset: 2 * Math.PI * 18 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 18 * (1 - pct / 100) }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-[13px] font-bold tabular-nums text-zinc-900 leading-none ${MONO}`}>
              {passed}<span className="text-zinc-300"> / {total}</span>
            </span>
            <span className={`text-[8px] ${MONO} tracking-widest text-zinc-500 mt-0.5`}>{pct}%</span>
          </div>
        </div>
        {/* Progress rail */}
        <div className="flex-1 min-w-0">
          <div className={`text-[9px] ${MONO} tracking-widest uppercase text-zinc-500 mb-1.5`}>Setup Strength</div>
          <div className="relative h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="absolute inset-y-0 left-0 rounded-full bg-zinc-900"
            />
          </div>
          <div className="mt-1.5 flex justify-between">
            {Array.from({ length: 11 }).map((_, i) => (
              <span key={i} className={cn("h-1 w-px", i % 5 === 0 ? "bg-zinc-400" : "bg-zinc-200")} />
            ))}
          </div>
        </div>
      </div>

      {/* Confluence tiles — clean, theme-consistent */}
      <div className="grid grid-cols-6 gap-1.5">
        {checks.map((c, i) => {
          const pass = c.pass === true;
          const fail = c.pass === false;
          const tile = pass
            ? "border-emerald-600 bg-emerald-500 text-white"
            : fail
            ? "border-rose-600 bg-rose-500 text-white"
            : "border-zinc-200 bg-zinc-50 text-zinc-400";

          const icon = pass ? "✓" : fail ? "✕" : "–";
          return (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * i, duration: 0.3, ease: "easeOut" }}
              whileHover={{ y: -1 }}
              title={`${c.label} — ${c.reason}`}
              className={cn(
                "relative aspect-square rounded-md border flex items-center justify-center text-[14px] font-bold cursor-help transition-colors",
                tile,
              )}
            >
              <span className="relative">{icon}</span>
            </motion.div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="grid grid-cols-6 gap-1.5 mt-1.5">
        {checks.map((c) => {
          const short = shortLabel(c.label);
          return (
            <div
              key={c.key}
              className={`text-[8px] ${MONO} text-zinc-800 font-semibold text-center leading-tight uppercase tracking-wider truncate`}
              title={c.label}
            >
              {short}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function shortLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("live quote")) return "QUOTE";
  if (l.includes("htf") && l.includes("ltf")) return "CANDLES";
  if (l.includes("entry") || l.includes("sl") || l.includes("tp")) return "E/SL/TP";
  if (l.includes("liquidity")) return "LIQ";
  if (l.includes("unmitigated")) return "UNMIT";
  if (l.includes("premium") || l.includes("discount")) return "PD";
  if (l.includes("dxy")) return "DXY";
  if (l.includes("fvg")) return "FVG";
  if (l.includes("order block") || l.includes("ob")) return "OB";
  if (l.includes("bos")) return "BOS";
  if (l.includes("choch")) return "CHOCH";
  if (l.includes("sweep")) return "SWEEP";
  if (l.includes("session") || l.includes("killzone")) return "KZ";
  if (l.includes("bias")) return "BIAS";
  if (l.includes("news")) return "NEWS";
  return label.split(/\s+/)[0].slice(0, 6).toUpperCase();
}



// -------------------- News Countdown Chip --------------------
// -------------------- Backtest Badge --------------------
function BacktestBadge({ stats }: { stats: BacktestStats }) {
  if (stats.sample === "none") {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
        <span className={`text-[9px] ${MONO} tracking-widest uppercase text-zinc-500`}>Your history</span>
        <div className="mt-0.5">No previous trades on this pair/direction yet — build a sample.</div>
      </div>
    );
  }
  const wr = stats.winRate ?? 0;
  const tone = wr >= 60 ? "emerald" : wr >= 45 ? "amber" : "rose";
  const toneCls = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  }[tone];
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneCls}`}>
      <div className={`text-[9px] ${MONO} tracking-widest uppercase font-bold flex items-center justify-between`}>
        <span>Your history on this setup</span>
        {stats.sample === "sparse" && <span className="opacity-70">(sparse · {stats.total})</span>}
      </div>
      <div className="mt-1 text-[12px] tabular-nums">
        <b className={MONO}>{stats.total}</b> similar trades ·{" "}
        <b className={MONO}>{stats.winRate != null ? `${stats.winRate.toFixed(0)}%` : "—"}</b> win rate ·{" "}
        avg <b className={MONO}>{stats.avgPnl != null ? `$${stats.avgPnl.toFixed(2)}` : "—"}</b>
      </div>
    </div>
  );
}

function NewsCountdownChip({ plan }: { plan: SignalPlan }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const next = useMemo(() => {
    const events = plan.newsRisk.events ?? [];
    const soon = events
      .map((e) => ({ ...e, minsUntil: Math.round((new Date(e.date).getTime() - now) / 60000) }))
      .filter((e) => e.minsUntil >= -5 && e.minsUntil <= 90 && /High/i.test(e.impact))
      .sort((a, b) => a.minsUntil - b.minsUntil)[0];
    return soon ?? null;
  }, [plan.newsRisk.events, now]);
  if (!next) return null;
  const isLive = next.minsUntil <= 5 && next.minsUntil >= -5;
  const label = isLive ? "LIVE NOW" : `in ${next.minsUntil}m`;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 flex items-start gap-2">
      <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className={`text-[10px] ${MONO} tracking-widest uppercase text-rose-700 font-bold flex items-center justify-between gap-2`}>
          <span>Red-News Window</span>
          <span className="tabular-nums">{label}</span>
        </div>
        <div className="text-[11px] text-rose-900 leading-snug mt-0.5">
          <b>{next.title}</b> ({next.country}) — high-impact release {isLive ? "is printing now" : `in ${next.minsUntil} minutes`}. Spreads widen, stops hunt. Prefer to WAIT.
        </div>
      </div>
    </div>
  );
}

// -------------------- Position Sizer --------------------
type PSizeConfig = { balance: number; riskPct: number };
const PSIZE_STORAGE = "jenvu.psize.v1";

function loadPSize(): PSizeConfig {
  if (typeof window === "undefined") return { balance: 1000, riskPct: 1 };
  try {
    const raw = window.localStorage.getItem(PSIZE_STORAGE);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PSizeConfig>;
      return {
        balance: Number.isFinite(p.balance) ? Number(p.balance) : 1000,
        riskPct: Number.isFinite(p.riskPct) ? Number(p.riskPct) : 1,
      };
    }
  } catch { /* noop */ }
  return { balance: 1000, riskPct: 1 };
}

function PositionSizer({ plan }: { plan: SignalPlan }) {
  const [cfg, setCfg] = useState<PSizeConfig>(loadPSize);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { window.localStorage.setItem(PSIZE_STORAGE, JSON.stringify(cfg)); } catch { /* noop */ }
  }, [cfg]);

  const t = plan.trade;
  const slDist = Math.abs(t.entry - t.sl);
  const tpDist = Math.abs(t.tp - t.entry);
  const riskAmount = (cfg.balance * cfg.riskPct) / 100;
  const units = slDist > 0 ? riskAmount / slDist : 0;
  const rewardAmount = units * tpDist;

  const kind = plan.instrument.kind;
  // Metal 1 standard lot = 100 oz; forex 1 lot = 100,000 units; crypto/stock = 1 unit
  const perLot = kind === "metal" ? 100 : kind === "forex" ? 100_000 : 1;
  const lots = units / perLot;
  const lotLabel =
    kind === "metal" ? `${lots.toFixed(2)} lots (100 oz)`
    : kind === "forex" ? `${lots.toFixed(2)} standard lots`
    : `${units.toFixed(4)} units`;

  return (
    <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-3.5 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <span className={`text-[10px] ${MONO} tracking-widest uppercase text-zinc-500`}>
          Position Sizing
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`text-[10px] ${MONO} tracking-widest uppercase text-zinc-500 hover:text-zinc-900 transition-colors`}
        >
          {open ? "Save" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="flex flex-col gap-1">
            <span className={`text-[9px] ${MONO} tracking-widest uppercase text-zinc-500`}>Balance ($)</span>
            <input
              type="number"
              min={1}
              value={cfg.balance}
              onChange={(e) => setCfg((c) => ({ ...c, balance: Math.max(0, Number(e.target.value) || 0) }))}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-[12px] tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={`text-[9px] ${MONO} tracking-widest uppercase text-zinc-500`}>Risk %</span>
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={cfg.riskPct}
              onChange={(e) => setCfg((c) => ({ ...c, riskPct: Math.max(0.1, Math.min(10, Number(e.target.value) || 1)) }))}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-[12px] tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-3 gap-px bg-zinc-100 rounded-lg overflow-hidden border border-zinc-100">
        <div className="bg-white px-2.5 py-2">
          <div className={`text-[9px] ${MONO} tracking-widest uppercase text-zinc-500`}>Risk</div>
          <div className={`text-[13px] font-bold tabular-nums ${MONO} text-rose-600 mt-0.5`}>
            ${riskAmount.toFixed(2)}
          </div>
        </div>
        <div className="bg-white px-2.5 py-2">
          <div className={`text-[9px] ${MONO} tracking-widest uppercase text-zinc-500`}>Reward</div>
          <div className={`text-[13px] font-bold tabular-nums ${MONO} text-emerald-600 mt-0.5`}>
            ${rewardAmount.toFixed(2)}
          </div>
        </div>
        <div className="bg-white px-2.5 py-2">
          <div className={`text-[9px] ${MONO} tracking-widest uppercase text-zinc-500`}>Size</div>
          <div className={`text-[13px] font-bold tabular-nums ${MONO} text-zinc-900 mt-0.5`}>
            {lotLabel}
          </div>
        </div>
      </div>
      <div className="text-[10px] text-zinc-500 mt-2 leading-snug">
        {cfg.riskPct}% risk on ${cfg.balance.toLocaleString()} · SL {slDist.toFixed(plan.instrument.decimals)} pts
      </div>
    </div>
  );
}

function SetupScoreCard({ plan }: { plan: SignalPlan }) {
  const isTop = plan.setupGrade === "A+" || plan.setupGrade === "A";
  const passed = plan.setupChecks.filter((c) => c.pass === true).length;
  const total = plan.setupChecks.length;
  // Use blended trade-plan confidence (rules + AI) so the score card matches
  // what the user sees on the trade plan (e.g. 72) instead of rules-only setupScore (49).
  const displayScore = Math.max(0, Math.min(100, Math.round(Number(plan.trade?.confidence ?? plan.setupScore))));
  // Direction/bias is separate from setup quality — an A+ setup can be short.
  const dir = (plan.trade?.direction ?? "").toString().toLowerCase();
  const bias = (plan.htfBias ?? "").toString().toLowerCase();
  const isBull = dir === "buy" || dir === "long" || (dir !== "sell" && dir !== "short" && bias === "bullish");
  const isBear = dir === "sell" || dir === "short" || (dir !== "buy" && dir !== "long" && bias === "bearish");
  const sentimentLabel = isBull ? "Bullish" : isBear ? "Bearish" : "Neutral";
  const sentimentTone = isBull ? "text-emerald-600" : isBear ? "text-rose-600" : "text-zinc-600";
  const barFill = isBull ? "bg-emerald-500" : isBear ? "bg-rose-500" : "bg-zinc-700";
  void isTop;

  // Deterministic bar heights per check (passed = tall/dark, failed = short/light)
  const bars = plan.setupChecks.map((c, i) => {
    const base = 30 + ((i * 37) % 55); // varied heights
    const h = c.pass === true ? Math.max(55, base + 20) : c.pass === false ? Math.min(40, base - 10) : base;
    return { h, pass: c.pass };
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm"
    >
      <div className="p-4 space-y-4">
        {/* Header row: label + score */}
        <div className="flex items-center justify-between">
          <span className={`text-[12px] font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal normal-case tracking-normal text-zinc-900`}>
            A+ Setup Score
          </span>
          <span className={`text-base font-bold tabular-nums ${MONO} text-zinc-900`}>
            {displayScore}
            <span className="text-zinc-400 text-[11px] font-medium">/100</span>
          </span>
        </div>

        {/* Bar chart visualization */}
        <div className="rounded-xl border border-zinc-200 p-3">
          <div className="flex items-end justify-between gap-1.5 h-16">
            {bars.map((b, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${b.h}%` }}
                transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
                className={cn(
                  "flex-1 rounded-t-sm",
                  b.pass === true ? "bg-zinc-900" :
                  b.pass === false ? "bg-zinc-200" :
                  "bg-zinc-400",
                )}
              />
            ))}
          </div>
        </div>

        {/* Sentiment row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-700">Setup Quality</span>
            <span className={cn("text-sm font-semibold", sentimentTone)}>{sentimentLabel}</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${displayScore}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={cn("h-full", barFill)}
            />
          </div>
        </div>

        {/* Two KV tiles */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-zinc-200 px-3 py-2">
            <div className={`text-[12px] ${MONO} tracking-widest uppercase text-zinc-500`}>Grade</div>
            <div className={`text-base font-bold tabular-nums ${MONO} text-zinc-900 mt-0.5`}>
              {plan.setupGrade}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 px-3 py-2">
            <div className={`text-[12px] ${MONO} tracking-widest uppercase text-zinc-500`}>Passed</div>
            <div className={`text-base font-bold tabular-nums ${MONO} text-zinc-900 mt-0.5`}>
              {passed}<span className="text-zinc-400 text-[11px] font-medium"> / {total}</span>
            </div>
          </div>
        </div>

        {/* Senior Review UI removed — feature disabled. */}

        {/* Market Regime — wisdom layer */}
        {plan.marketRegime && (
          <div className={cn(
            "mt-2 rounded-xl border px-3 py-2",
            plan.marketRegime.favorable
              ? "border-emerald-200 bg-emerald-50/40"
              : plan.marketRegime.regime === "volatile"
                ? "border-rose-200 bg-rose-50/40"
                : "border-amber-200 bg-amber-50/40"
          )}>
            <div className="flex items-center justify-between">
              <div className={`font-['Urbanist',sans-serif] text-[13px] font-semibold tracking-wide text-zinc-900`}>
                Market Regime
              </div>
              <div className={cn(
                `font-['Urbanist',sans-serif] text-[12px] font-semibold uppercase tracking-wide`,
                plan.marketRegime.favorable ? "text-emerald-700"
                  : plan.marketRegime.regime === "volatile" ? "text-rose-700"
                    : "text-amber-700"
              )}>
                {plan.marketRegime.regime}
              </div>
            </div>
            <div className={`font-['Urbanist',sans-serif] text-[13px] font-medium text-zinc-800 leading-relaxed mt-1 whitespace-nowrap overflow-hidden text-ellipsis`}>
              Trend {plan.marketRegime.trendStrength}% · Vol {plan.marketRegime.volatility}%
              {plan.marketRegime.favorable && " · ICT-favorable tape"}
            </div>
            {plan.marketRegime.warning && (
              <div className="font-['Urbanist',sans-serif] text-[13px] font-medium text-zinc-900 leading-relaxed mt-1 whitespace-nowrap overflow-hidden text-ellipsis" title={plan.marketRegime.warning}>
                ⚠ {plan.marketRegime.warning}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}



function TradeTrackerCard({
  plan, livePrice, rMultiple, status, sparkline,
}: {
  plan: SignalPlan;
  livePrice: number | null;
  rMultiple: number;
  status: "PENDING" | "RUNNING" | "WIN" | "LOSS";
  sparkline: number[];
}) {
  const dec = plan.instrument.decimals;
  const t = plan.trade;
  const range = Math.abs(t.tp - t.sl);
  const slLeft = t.direction === "BUY" ? t.sl : t.tp;
  const tpRight = t.direction === "BUY" ? t.tp : t.sl;
  const pct = livePrice != null
    ? Math.max(0, Math.min(100, ((livePrice - slLeft) / (tpRight - slLeft)) * 100))
    : 50;
  const entryPct = Math.max(0, Math.min(100, ((t.entry - slLeft) / (tpRight - slLeft)) * 100));

  const statusTone =
    status === "WIN" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    status === "LOSS" ? "bg-rose-100 text-rose-700 border-rose-200" :
    status === "RUNNING" ? "bg-sky-100 text-sky-700 border-sky-200" :
    "bg-zinc-100 text-zinc-700 border-zinc-200";

  // Mini sparkline path
  const sparkPath = useMemo(() => {
    if (sparkline.length < 2) return "";
    const min = Math.min(...sparkline);
    const max = Math.max(...sparkline);
    const r = max - min || 1;
    return sparkline
      .map((v, i) => {
        const x = (i / (sparkline.length - 1)) * 100;
        const y = 20 - ((v - min) / r) * 18 - 1;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [sparkline]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-zinc-100 bg-white p-3 space-y-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
    >
      <div className="flex items-center justify-between">
        <span className={`font-['Urbanist',sans-serif] text-[12px] font-semibold tracking-wide uppercase text-zinc-900 flex items-center gap-1.5`}>
          <Activity className="h-3.5 w-3.5" /> Live Tracker
        </span>
        <span className={cn("text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded border", MONO, statusTone)}>
          {status}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className={`text-[10px] ${MONO} text-zinc-500 uppercase tracking-widest`}>Live</div>
          <div className={`text-base font-bold tabular-nums ${MONO}`}>
            {livePrice != null ? livePrice.toFixed(dec) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-[10px] ${MONO} text-zinc-500 uppercase tracking-widest`}>R-multiple</div>
          <div className={cn(
            "text-base font-bold tabular-nums",
            rMultiple > 0 ? "text-emerald-600" : rMultiple < 0 ? "text-rose-600" : "text-zinc-700",
          )}>
            {rMultiple > 0 ? "+" : ""}{rMultiple.toFixed(2)}R
          </div>
        </div>
      </div>

      {/* SL — Entry — TP bar */}
      <div className="space-y-1.5">
        <div className="relative h-2 bg-gradient-to-r from-rose-100 via-zinc-100 to-emerald-100 rounded-full">
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-zinc-400"
            style={{ left: `${entryPct}%` }}
          />
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-zinc-900 ring-2 ring-white shadow"
            animate={{ left: `${pct}%` }}
            transition={{ type: "spring", stiffness: 80, damping: 18 }}
          />
        </div>
        <div className={`flex justify-between text-[9px] ${MONO} text-zinc-500 uppercase tracking-wider`}>
          <span>SL {t.sl.toFixed(dec)}</span>
          <span>E {t.entry.toFixed(dec)}</span>
          <span>TP {t.tp.toFixed(dec)}</span>
        </div>
      </div>

      {/* Sparkline */}
      {sparkPath && (
        <svg viewBox="0 0 100 20" className="w-full h-8" preserveAspectRatio="none">
          <path
            d={sparkPath}
            fill="none"
            stroke={rMultiple >= 0 ? "#10b981" : "#ef4444"}
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      {/* Trade Management Ladder — only when a real trade plan is issued (confidence ≥ 70) */}
      {(plan.trade?.confidence ?? 0) >= MIN_CONFIDENCE && plan.trade?.direction !== "WAIT" && (
        <TradeManagementLadder plan={plan} rMultiple={rMultiple} status={status} />
      )}

    </motion.div>
  );
}

/* ---------- TRADE MANAGEMENT LADDER (partial close + trailing SL) ---------- */
function TradeManagementLadder({
  plan,
  rMultiple,
  status,
}: {
  plan: SignalPlan;
  rMultiple: number;
  status: "PENDING" | "RUNNING" | "WIN" | "LOSS";
}) {
  const t = plan.trade;
  const dec = plan.instrument.decimals;
  const isBuy = t.direction === "BUY";
  const risk = Math.abs(t.entry - t.sl);
  // 1R, 2R prices in the trade's direction
  const p1R = isBuy ? t.entry + risk : t.entry - risk;
  const p2R = isBuy ? t.entry + risk * 2 : t.entry - risk * 2;

  const steps = [
    {
      label: "Step 1 · 30% profit hit",
      price: p1R,
      action: "Close 70% · Move SL to Entry",
      why: "Bulk profit booked. Trade is now risk-free (breakeven).",
      hit: rMultiple >= 1,
    },
    {
      label: "Step 2 · Runner to TP2 / 50%",
      price: t.tp,
      action: "Let 30% runner ride",
      why: "Free upside with zero risk — if price returns, exit flat; if it runs, bonus locked.",
      hit: rMultiple >= 3 || status === "WIN",
    },
  ];




  return (
    <div className="rounded-md border border-zinc-100 bg-zinc-50/60 p-2 space-y-1.5">
      <div className={`flex items-center justify-between gap-3 font-['Urbanist',sans-serif] text-[11px] sm:text-[12px] font-semibold tracking-wide text-zinc-900`}>
        <span>Trade Management</span>
        <span className="font-['Urbanist',sans-serif] text-[10px] sm:text-[11px] font-medium text-zinc-600">70/30 + Breakeven Runner</span>
      </div>
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              "flex items-start gap-2 rounded px-2 py-1.5 border transition-colors",
              s.hit
                ? "bg-emerald-50 border-emerald-200"
                : "bg-white border-zinc-100",
            )}
          >
            <span
              className={cn(
                "mt-0.5 h-5 w-5 flex-shrink-0 rounded-full font-['Urbanist',sans-serif] text-[11px] font-bold flex items-center justify-center",
                s.hit ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-700",
              )}
            >
              {s.hit ? "✓" : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`font-['Urbanist',sans-serif] text-[13px] font-semibold ${s.hit ? "text-emerald-800" : "text-zinc-900"}`}>
                  {s.label}
                </span>
                <span className={`font-['Urbanist',sans-serif] text-[12px] font-medium tabular-nums ${s.hit ? "text-emerald-700" : "text-zinc-600"}`}>
                  @ {s.price.toFixed(dec)}
                </span>
              </div>
              <div className={`font-['Urbanist',sans-serif] text-[13px] font-medium leading-relaxed mt-0.5 ${s.hit ? "text-emerald-900" : "text-zinc-900"}`}>
                {s.action}
              </div>
              <div className="font-['Urbanist',sans-serif] text-[12px] font-medium text-zinc-600 leading-relaxed mt-0.5">{s.why}</div>
            </div>
          </li>
        ))}
      </ol>
      {status === "RUNNING" && rMultiple >= 1 && rMultiple < 3 && (
        <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1 leading-snug">
          ⚡ <b>Action now:</b> Close 70%, move SL to entry ({t.entry.toFixed(dec)}) and let the 30% runner ride.
        </div>
      )}


    </div>
  );
}


/* ---------- SIGNAL VOICE AGENT (orb + chat + chart marking) ---------- */
function SignalVoiceAgent({
  plan,
  livePrice,
  htfRef,
  ltfRef,
  analyzing,
  narrationPulse,
  credits,
}: {
  plan: SignalPlan | null;
  livePrice: number | null;
  htfRef: React.RefObject<SignalChartHandle | null>;
  ltfRef: React.RefObject<SignalChartHandle | null>;
  analyzing: boolean;
  narrationPulse: number;
  credits: ReturnType<typeof useCredits>;
}) {
  const ask = useServerFn(askSignalAgent);
  const speech = useSpeech();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "agent"; text: string }[]>([]);

  const bufferRef = useRef("");
  const lastHandled = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Accumulate live transcript chunks while listening
  useEffect(() => {
    const t = speech.transcript;
    const key = `${speech.transcriptId}:${t}`;
    if (!t || key === lastHandled.current) return;
    lastHandled.current = key;
    bufferRef.current = (bufferRef.current ? bufferRef.current + " " : "") + t;
  }, [speech.transcript, speech.transcriptId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Stop any ongoing speech/listening when the agent panel unmounts (e.g. leaving the signal page)
  useEffect(() => {
    return () => {
      try { window.dispatchEvent(new Event("jenvu:speech:stop-all")); } catch { /* noop */ }
      try { speech.stopSpeaking(); } catch { /* noop */ }
      try { speech.stopListening(); } catch { /* noop */ }
      stopAllBrowserSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const highlightFromText = (text: string) => {
    if (!plan) return;
    const lower = text.toLowerCase();
    const matchers: { rx: RegExp; types: Marking["type"][]; kind?: string }[] = [
      { rx: /\b(bull(?:ish)?\s+fvg|bullish\s+gap)\b/, types: ["fvg"], kind: "bullish" },
      { rx: /\b(bear(?:ish)?\s+fvg|bearish\s+gap)\b/, types: ["fvg"], kind: "bearish" },
      { rx: /\b(fvg|fair value gap|imbalance|gap)\b/, types: ["fvg"] },
      { rx: /\b(demand\s+(?:zone|ob)|bullish\s+order\s*block)\b/, types: ["orderBlock"], kind: "demand" },
      { rx: /\b(supply\s+(?:zone|ob)|bearish\s+order\s*block)\b/, types: ["orderBlock"], kind: "supply" },
      { rx: /\b(order\s*block|\bob\b)\b/, types: ["orderBlock"] },
      { rx: /\b(buy[-\s]?side\s+liquidity|bsl)\b/, types: ["liquidity"], kind: "buy" },
      { rx: /\b(sell[-\s]?side\s+liquidity|ssl)\b/, types: ["liquidity"], kind: "sell" },
      { rx: /\b(liquidity|sweep|stop\s*hunt|grab)\b/, types: ["liquidity"] },
      { rx: /\b(eqh|equal\s+highs?)\b/, types: ["eqh"] },
      { rx: /\b(eql|equal\s+lows?)\b/, types: ["eql"] },
      { rx: /\b(ote|optimal\s+trade\s+entry|0\.?618|0\.?705|0\.?79)\b/, types: ["oteZone"] },
      { rx: /\bpremium\b/, types: ["premiumZone"] },
      { rx: /\bdiscount\b/, types: ["discountZone"] },
      { rx: /\bbreaker\b/, types: ["breaker"] },
      { rx: /\b(bos|break\s+of\s+structure)\b/, types: ["bos"] },
      { rx: /\b(choch|change\s+of\s+character)\b/, types: ["choch"] },
      { rx: /\b(entry|trigger)\b/, types: ["entry"] },
      { rx: /\b(stop\s*loss|invalidation|\bsl\b)\b/, types: ["sl"] },
      { rx: /\b(take\s*profit|target|\btp\b)\b/, types: ["tp"] },
    ];
    // Sequential single-active rule: clear last transient before drawing the new one.
    htfRef.current?.clearTransient();
    ltfRef.current?.clearTransient();
    const focused = new Set<string>();
    let drawn = 0;
    for (const { rx, types, kind } of matchers) {
      if (!rx.test(lower)) continue;
      const m = plan.markings.find(
        (x) =>
          types.includes(x.type) &&
          (!kind || (x as any).kind === kind) &&
          !focused.has(`${x.type}:${(x as any).label ?? ""}`),
      );
      if (!m) continue;
      focused.add(`${m.type}:${(m as any).label ?? ""}`);
      const target = m.tf === "htf" ? htfRef.current : ltfRef.current;
      target?.drawMarking(m, { transient: true });
      target?.panToMarking(m);
      setTimeout(() => target?.focusMarking(m), 80);
      drawn += 1;
      // Only ONE active marking per agent reply.
      if (drawn >= 1) break;
    }

  };

  const stripMd = (s: string) =>
    s
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_~`>#]+/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\s+/g, " ")
      .trim();

  const submit = async (text?: string) => {
    const question = (text ?? q).trim();
    if (!question || busy || analyzing) return;
    // FREE plan: voice agent limited to XAU/USD only.
    const sym = (plan?.instrument.symbol || "XAUUSD").toUpperCase().replace(/[^A-Z]/g, "");
    if (!credits.isLoading && credits.plan?.id === "free" && sym !== "XAUUSD") {
      toast.info("Voice agent for cross-pairs is a Pro feature", {
        description: "Free plan voice agent is limited to XAU/USD. Upgrade to unlock all pairs.",
        action: { label: "Upgrade", onClick: () => (window.location.href = "/pricing") },
      });
      return;
    }
    setQ("");
    setInputOpen(false);
    setBusy(true);
    try {
      const paid = await credits.spend("voice_query", { symbol: plan?.instrument.symbol });
      if (!paid) { setBusy(false); return; }
      const ctx = plan
        ? {
            symbol: plan.instrument.symbol,
            bias: plan.htfBias,
            direction: plan.trade.direction,
            entry: plan.trade.entry,
            sl: plan.trade.sl,
            tp: plan.trade.tp,
            rr: plan.trade.rr,
            setupGrade: plan.setupGrade,
            setupScore: plan.setupScore,
            session: plan.session,
            killzone: plan.killzone,
            confluences: plan.confluences,
            keyLevels: plan.keyLevels.map((k) => ({ label: k.label, price: k.price, kind: k.kind })),
            currentPrice: livePrice ?? plan.currentPrice,
          }
        : undefined;
      const res = await ask({ data: { question, context: ctx } });
      // Mark/focus relevant zones based on both the user question and reply
      highlightFromText(`${question} ${res.reply}`);
      appendVoiceTurn({ query: question, reply: res.reply });
      speech.speak(stripMd(res.reply));
    } catch (e: any) {
      toast.error(e?.message || "Agent failed to respond.");
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (!speech.supported) {
      toast.error("Voice not supported in this browser. Use Chrome.");
      return;
    }
    if (speech.listening) {
      speech.stopListening();
      // Allow final results to flush
      setTimeout(() => {
        const captured = bufferRef.current.trim();
        bufferRef.current = "";
        if (captured) submit(captured);
      }, 250);
    } else {
      bufferRef.current = "";
      speech.stopSpeaking();
      speech.startListening();
    }
  };

  const status: "idle" | "listening" | "thinking" | "speaking" = analyzing
    ? "speaking"
    : busy
      ? "thinking"
      : speech.speaking
        ? "speaking"
        : speech.listening
          ? "listening"
          : "idle";

  const suggestions = ["Why this bias?", "Where is invalidation?", "What confirms entry?"];

  const [inputOpen, setInputOpen] = useState(false);
  // Force-close input while analysis is running; user can only interact after it's done.
  useEffect(() => {
    if (analyzing && inputOpen) setInputOpen(false);
  }, [analyzing, inputOpen]);
  const showInput = inputOpen && !analyzing;
  const orbPulse = analyzing ? narrationPulse : speech.wordPulse;

  return (
    <div className="flex flex-col gap-3 min-h-[180px]">
      <div className={cn("flex justify-center", !showInput && "flex-1 items-center")}>
        <button
          type="button"
          onClick={() => { if (!analyzing) setInputOpen((v) => !v); }}
          disabled={analyzing}
          className={cn(
            "rounded-full focus:outline-none transition",
            analyzing ? "cursor-not-allowed" : "cursor-pointer",
          )}
          aria-label={analyzing ? "Agent is analyzing" : "Toggle voice input"}
          title={analyzing ? "Analyzing… please wait" : "Tap to ask the agent"}
        >
          <SignalOrb status={status} pulse={orbPulse} />
        </button>
      </div>




      <div
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white pl-2.5 pr-1 py-1 transition-opacity",
          showInput ? "opacity-100" : "hidden",
        )}
        aria-hidden={!showInput}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={speech.listening ? "Listening…" : "Ask about XAU/USD…"}
          disabled={busy || !showInput}
          tabIndex={showInput ? 0 : -1}
          className="flex-1 bg-transparent text-[12px] text-zinc-900 placeholder:text-zinc-400 outline-none"
        />
        <button
          onClick={() => submit()}
          disabled={busy || !q.trim()}
          tabIndex={showInput ? 0 : -1}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-zinc-900 text-white disabled:opacity-40 hover:bg-zinc-800"
          aria-label="Send"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>

    </div>
  );
}


/* ---------- compact orb (mirrors /app CloudOrb visual) ---------- */
function SignalOrb({
  status,
  pulse = 0,
}: {
  status: "idle" | "listening" | "thinking" | "speaking";
  pulse?: number;
}) {
  const speaking = status === "speaking";
  const [amp, setAmp] = useState(0); // 0..1 simulated voice amplitude
  const envRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Kick the envelope on every word boundary while speaking
  useEffect(() => {
    if (!speaking) return;
    // random target between 0.55 and 1.0 for each word — feels like vocal dynamics
    targetRef.current = 0.55 + Math.random() * 0.45;
  }, [pulse, speaking]);

  // RAF loop: smoothly chase target, decay, add subtle tremor
  useEffect(() => {
    if (!speaking) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      envRef.current = 0;
      targetRef.current = 0;
      setAmp(0);
      return;
    }
    let t0 = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - t0); t0 = now;
      // chase target, then decay it toward 0 so each word feels like a burst
      envRef.current += (targetRef.current - envRef.current) * Math.min(1, dt / 90);
      targetRef.current *= Math.pow(0.5, dt / 260); // half-life ~260ms
      // tremor for "living" feel
      const tremor = (Math.sin(now / 70) * 0.05 + Math.sin(now / 33) * 0.03);
      const v = Math.max(0, Math.min(1, envRef.current + tremor * envRef.current));
      setAmp(v);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [speaking]);

  const baseScale =
    status === "speaking" ? 1.02 :
    status === "listening" ? 1.02 :
    status === "thinking" ? 1.0 : 0.97;
  // Zoom in on loud bursts, softer on quiet — up to +14%
  const scale = baseScale + (speaking ? amp * 0.14 : 0);
  // Color rotates continuously while speaking, sped up by amplitude
  const hueShift = speaking ? ((pulse * 37) + amp * 220) % 360 : 0;
  const sat = speaking ? 1.2 + amp * 0.8 : 1;
  const bright = speaking ? 1 + amp * 0.18 : 1;
  const glow = speaking ? 24 + amp * 70 : 18;

  return (
    <div
      className="relative aspect-square w-24 sm:w-28 flex items-center justify-center"
      style={{
        transform: `scale(${scale})`,
        transition: speaking ? "transform 90ms linear" : "transform 260ms cubic-bezier(0.4,0,0.2,1)",
        filter: speaking
          ? `hue-rotate(${hueShift}deg) saturate(${sat}) brightness(${bright})`
          : "none",
        willChange: "transform, filter",
      }}
    >
      <div
        className="relative h-full w-full rounded-full overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 50% 25%, #f4faff 0%, #b8dcff 28%, #5ea8ee 60%, #1f5fb0 90%, #0b3a7a 100%)",
          boxShadow: `inset -8px -12px 32px rgba(20,60,140,0.55), inset 6px 10px 24px rgba(255,255,255,0.85), 0 0 ${glow}px rgba(140,190,250,${0.4 + amp * 0.5})`,
          transition: "box-shadow 120ms linear",
        }}
      >
        <div
          className="absolute -inset-1/3"
          style={{
            animation: `orb-drift-a ${status === "speaking" ? "5s" : status === "thinking" ? "9s" : "14s"} ease-in-out infinite, orb-hue ${speaking ? 6 : 18}s linear infinite`,
            background:
              "radial-gradient(30% 24% at 28% 30%, rgba(244,114,182,0.95), transparent 70%), radial-gradient(28% 22% at 72% 26%, rgba(251,191,36,0.9), transparent 70%), radial-gradient(32% 26% at 30% 74%, rgba(52,211,153,0.95), transparent 70%), radial-gradient(30% 24% at 74% 72%, rgba(167,139,250,0.95), transparent 70%)",
            mixBlendMode: "screen",
            opacity: 0.75 + amp * 0.25,
          }}
        />
        <div
          className="absolute -inset-1/3"
          style={{
            animation: `orb-drift-b ${status === "speaking" ? "7s" : "18s"} ease-in-out infinite`,
            background:
              "conic-gradient(from 90deg, rgba(255,90,160,0.7) 0%, rgba(56,189,248,0) 18%, rgba(255,200,80,0.7) 35%, rgba(255,255,255,0) 50%, rgba(80,230,180,0.7) 65%, rgba(56,189,248,0) 80%, rgba(170,130,255,0.7) 100%)",
            filter: `blur(${20 - amp * 8}px)`,
            mixBlendMode: "screen",
            transform: `rotate(${(pulse * 23 + amp * 60).toFixed(1)}deg)`,
            transition: "transform 120ms linear, filter 120ms linear",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_18%,rgba(255,255,255,0.95),transparent_48%)]" />
        <div className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 22px rgba(160,210,255,0.6)" }} />
        {speaking && (
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 55%, rgba(140,200,255,${0.25 + amp * 0.55}), transparent ${50 + amp * 20}%)`,
              mixBlendMode: "screen",
              transition: "background 100ms linear",
            }}
          />
        )}
      </div>
    </div>
  );
}

function HistoricalBacktestPanel({ symbol }: { symbol: string }) {
  const run = useServerFn(runHistoricalBacktest);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HistoricalBacktestResult | null>(null);
  const [open, setOpen] = useState(false);

  const onRun = async () => {
    setLoading(true);
    try {
      const r = await run({ data: { symbol, threshold: 70 } });
      setResult(r);
      setOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Backtest failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="w-full mt-2 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-50 px-3 py-2 text-xs font-medium text-zinc-900 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
        {loading ? "Running historical backtest…" : "Run historical backtest (70%+ setups)"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-white border-zinc-200 text-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">Historical Backtest — {result?.symbol}</DialogTitle>
            <DialogDescription className="text-zinc-600">
              Deterministic SMC engine, {result?.bars ?? 0} bars scanned, score threshold {result?.threshold ?? 70}.
            </DialogDescription>
          </DialogHeader>

          {result?.error ? (
            <div className="text-sm text-red-600">{result.error}</div>
          ) : result ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Signals" value={String(result.simulated)} />
                <Stat label="Wins" value={String(result.wins)} tone="win" />
                <Stat label="Losses" value={String(result.losses)} tone="loss" />
                <Stat label="Expired" value={String(result.expired)} />
                <Stat
                  label="Win rate"
                  value={result.winRate == null ? "—" : `${result.winRate.toFixed(1)}%`}
                  tone={result.winRate != null && result.winRate >= 55 ? "win" : "loss"}
                />
                <Stat
                  label="Avg R"
                  value={result.avgR == null ? "—" : `${result.avgR >= 0 ? "+" : ""}${result.avgR.toFixed(2)}R`}
                  tone={result.avgR != null && result.avgR > 0 ? "win" : "loss"}
                />
              </div>

              {result.trades.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-200 divide-y divide-zinc-100">
                  {result.trades.map((t, i) => (
                    <div key={i} className="px-2 py-1.5 text-[11px] flex items-center justify-between">
                      <span className="text-zinc-500">{new Date(t.time).toLocaleDateString()}</span>
                      <span className={t.direction === "BUY" ? "text-emerald-600" : "text-rose-600"}>{t.direction}</span>
                      <span className="text-zinc-700">@ {t.entry}</span>
                      <span className="text-zinc-500">score {t.score}</span>
                      <span
                        className={
                          t.outcome === "win"
                            ? "text-emerald-600"
                            : t.outcome === "loss"
                            ? "text-rose-600"
                            : "text-zinc-400"
                        }
                      >
                        {t.outcome} {t.rMultiple >= 0 ? "+" : ""}
                        {t.rMultiple.toFixed(2)}R
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-zinc-500 leading-relaxed">{result.disclaimer}</p>
            </div>
          ) : (
            <div className="text-sm text-zinc-600">No result yet.</div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white px-3 py-1.5 text-xs"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "win" | "loss" }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div
        className={cn(
          "text-sm font-semibold",
          tone === "win" && "text-emerald-600",
          tone === "loss" && "text-rose-600",
          !tone && "text-zinc-900",
        )}
      >
        {value}
      </div>
    </div>
  );
}



