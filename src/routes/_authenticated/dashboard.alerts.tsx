import { getIpGeo } from "@/lib/ip-geo";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCredits } from "@/hooks/useCredits";
import UpgradeOverlay from "@/components/UpgradeOverlay";
import { useServerFn } from "@tanstack/react-start";
import { getAlertsEnabled, setAlertsEnabled } from "@/lib/alert-toggle.functions";
import { getRiskSettings } from "@/lib/risk-settings.functions";
import { computePositionSize } from "@/lib/risk-manager";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { connectWhatsappAlertLink, disconnectWhatsappAlertLink, getWhatsappAlertLink, setWhatsappAlertEnabled, verifyWhatsappAlertCode } from "@/lib/whatsapp-alert.functions";
import { cn } from "@/lib/utils";
import { getAlertCutoff } from "@/lib/alert-cutoff";
import xauLogo from "@/assets/xau-gold.png.asset.json";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";



export const Route = createFileRoute("/_authenticated/dashboard/alerts")({
  component: AlertPrefs,
});

type Grade = "A+" | "A" | "B";
type Direction = "BUY" | "SELL";
const ALL_PAIRS = ["XAUUSD"] as const;
const ALL_GRADES: Grade[] = ["A+", "A", "B"];
const ALL_DIRECTIONS: Direction[] = ["BUY", "SELL"];

type Prefs = {
  email_enabled: boolean;
  browser_enabled: boolean;
  min_grade: "A+" | "A";
  quiet_start: string | null;
  quiet_end: string | null;
  email_grades: Grade[];
  email_pairs: string[];
  email_directions: Direction[];
};

const DEFAULTS: Prefs = {
  email_enabled: true,
  browser_enabled: true,
  min_grade: "A+",
  quiet_start: null,
  quiet_end: null,
  email_grades: [...ALL_GRADES],
  email_pairs: [...ALL_PAIRS],
  email_directions: [...ALL_DIRECTIONS],
};


type FiredAlert = {
  id: string;
  pair: string;
  grade: string;
  direction: string;
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  confidence: number;
  session: string | null;
  fired_at: string;
  models_used: string[] | null;
};

function AlertPrefs() {
  const { features, isLoading } = useCredits();
  const locked = !isLoading && !features.realtime_alerts;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alerts, setAlerts] = useState<FiredAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [pairFilter, setPairFilter] = useState<string>("ALL");
  const [visibleCount, setVisibleCount] = useState<number>(10);
  const LOGGED_KEY = "jenvu:alerts:logged_ids";
  const [loggedIds, setLoggedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(LOGGED_KEY);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch { return new Set(); }
  });
  const persistLogged = useCallback((next: Set<string>) => {
    try { window.localStorage.setItem(LOGGED_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
  }, []);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const getAlertsEnabledFn = useServerFn(getAlertsEnabled);
  const setAlertsEnabledFn = useServerFn(setAlertsEnabled);
  const getRisk = useServerFn(getRiskSettings);
  const getWhatsappLinkFn = useServerFn(getWhatsappAlertLink);
  const connectWhatsappFn = useServerFn(connectWhatsappAlertLink);
  const verifyWhatsappFn = useServerFn(verifyWhatsappAlertCode);
  const setWhatsappEnabledFn = useServerFn(setWhatsappAlertEnabled);
  const disconnectWhatsappFn = useServerFn(disconnectWhatsappAlertLink);

  const [alertsOn, setAlertsOn] = useState<boolean | null>(null);
  const [alertsSaving, setAlertsSaving] = useState(false);

  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappLinked, setWhatsappLinked] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [whatsappVerifiedAt, setWhatsappVerifiedAt] = useState<string | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappDisconnectConfirmOpen, setWhatsappDisconnectConfirmOpen] = useState(false);
  const [whatsappCode, setWhatsappCode] = useState("");
  const [whatsappPending, setWhatsappPending] = useState(false);
  const [whatsappSender, setWhatsappSender] = useState<string | null>(null);

  const phoneValid = /^\+?\d{10,18}$/.test(whatsappPhone.trim());
  const canConnectWhatsapp = phoneValid && !whatsappSaving;

  const [risk, setRisk] = useState<{ balance: number; pct: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getRisk()
      .then((r) => {
        if (cancelled) return;
        setRisk({ balance: r.account_balance_usd, pct: r.risk_pct });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [getRisk]);


  const [ipTimezone, setIpTimezone] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem("jenvu:ipTimezone");
  });
  useEffect(() => {
    let cancelled = false;
    getIpGeo().then((d) => {
      if (cancelled || !d?.timezone) return;
      setIpTimezone(d.timezone);
    });
    return () => { cancelled = true; };
  }, []);
  const formatVerifiedAt = useCallback((iso: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: ipTimezone || undefined,
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleString();
    }
  }, [ipTimezone]);


  useEffect(() => {
    (async () => {
      try {
        const r = await getAlertsEnabledFn({});
        setAlertsOn(!!r.enabled);
      } catch { setAlertsOn(true); }
    })();
  }, [getAlertsEnabledFn]);

  useEffect(() => {
    (async () => {
      try {
        const r = await getWhatsappLinkFn({});
        setWhatsappLinked(!!r.linked);
        setWhatsappPhone(r.phoneNumber ?? "");
        setWhatsappEnabled(r.enabled !== false);
        setWhatsappVerifiedAt(r.verifiedAt ?? null);
        setWhatsappError(r.lastError ?? null);
        setWhatsappPending(!!r.pendingVerification);
        setWhatsappSender(r.senderNumber ?? null);
      } catch {
        setWhatsappError("Could not load WhatsApp settings");
      }
    })();
  }, [getWhatsappLinkFn]);

  const toggleAlerts = useCallback(async () => {
    if (alertsOn === null || alertsSaving) return;
    const next = !alertsOn;
    setAlertsSaving(true);
    try {
      await setAlertsEnabledFn({ data: { enabled: next } });
      setAlertsOn(next);
      try { window.localStorage.setItem('jenvu_alerts_enabled', next ? '1' : '0'); } catch { /* ignore */ }
      toast.success(next ? "Alerts enabled · $0.20 will be charged per signal" : "Alerts disabled · no charges, no notifications");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update alerts");
    } finally {
      setAlertsSaving(false);
    }
  }, [alertsOn, alertsSaving, setAlertsEnabledFn]);

  const connectWhatsapp = useCallback(async () => {
    if (!canConnectWhatsapp) return;
    setWhatsappSaving(true);
    setWhatsappError(null);
    try {
      const r = await connectWhatsappFn({ data: { phoneNumber: whatsappPhone.trim() } });
      setWhatsappPhone(r.phoneNumber);
      setWhatsappPending(true);
      setWhatsappCode("");
      toast.success("Code sent on WhatsApp", { description: "Enter the 6-digit code to activate alerts." });
    } catch (e: any) {
      const message = e?.message ?? "Could not connect WhatsApp";
      setWhatsappError(message);
      toast.error("WhatsApp connect failed", { description: message });
    } finally {
      setWhatsappSaving(false);
    }
  }, [canConnectWhatsapp, connectWhatsappFn, whatsappPhone]);

  const verifyWhatsapp = useCallback(async () => {
    const code = whatsappCode.replace(/\D/g, "");
    if (code.length < 4) return;
    setWhatsappSaving(true);
    setWhatsappError(null);
    try {
      await verifyWhatsappFn({ data: { code } });
      setWhatsappPending(false);
      setWhatsappLinked(true);
      setWhatsappEnabled(true);
      setWhatsappVerifiedAt(new Date().toISOString());
      setWhatsappCode("");
      toast.success("WhatsApp verified", { description: "Signal alerts will now arrive on WhatsApp." });
    } catch (e: any) {
      const message = e?.message ?? "Could not verify code";
      setWhatsappError(message);
      toast.error("Verification failed", { description: message });
    } finally {
      setWhatsappSaving(false);
    }
  }, [verifyWhatsappFn, whatsappCode]);

  const toggleWhatsapp = useCallback(async (enabled: boolean) => {
    setWhatsappEnabled(enabled);
    try {
      await setWhatsappEnabledFn({ data: { enabled } });
      toast.success(enabled ? "WhatsApp alerts enabled" : "WhatsApp alerts disabled");
    } catch (e: any) {
      setWhatsappEnabled(!enabled);
      toast.error(e?.message ?? "Could not update WhatsApp");
    }
  }, [setWhatsappEnabledFn]);

  const disconnectWhatsapp = useCallback(async () => {
    setWhatsappSaving(true);
    setWhatsappError(null);
    try {
      await disconnectWhatsappFn({});
      setWhatsappLinked(false);
      setWhatsappEnabled(true);
      setWhatsappVerifiedAt(null);
      setWhatsappPhone("");
      setWhatsappPending(false);
      setWhatsappCode("");
      toast.success("WhatsApp disconnected", { description: "You will no longer receive alerts on WhatsApp." });
    } catch (e: any) {
      const message = e?.message ?? "Could not disconnect WhatsApp";
      setWhatsappError(message);
      toast.error("WhatsApp disconnect failed", { description: message });
    } finally {
      setWhatsappSaving(false);
    }
  }, [disconnectWhatsappFn]);


  const takeTrade = async (a: FiredAlert) => {
    if (loggedIds.has(a.id) || loggingId) return;
    setLoggingId(a.id);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      toast.error("Sign in to log trades");
      setLoggingId(null);
      return;
    }
    const { error } = await supabase.from("trade_journal").insert({
      user_id: u.user.id,
      pair: a.pair,
      direction: a.direction === "BUY" ? "long" : "short",
      entry: a.entry,
      stop_loss: a.sl,
      take_profit: a.tp,
      outcome: "pending",
      opened_at: new Date().toISOString(),
      notes: `Auto-logged from ${a.grade} alert · Conf ${a.confidence}%${a.session ? " · " + a.session : ""}`,
    } as never);
    setLoggingId(null);
    if (error) {
      const msg = String(error.message ?? "");
      const code = String((error as { code?: string }).code ?? "");
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
    setLoggedIds((prev) => {
      const next = new Set(prev).add(a.id);
      persistLogged(next);
      return next;
    });
    toast.success("Trade logged · auto-tracking win/loss");
  };

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase
        .from("alert_preferences")
        .select("email_enabled, browser_enabled, min_grade, quiet_start, quiet_end, email_grades, email_pairs, email_directions")
        .eq("user_id", user.user.id)
        .maybeSingle();
      if (data) {
        const d = data as Partial<Prefs>;
        setPrefs({
          ...DEFAULTS,
          ...d,
          email_grades: (d.email_grades && d.email_grades.length ? d.email_grades : DEFAULTS.email_grades) as Grade[],
          email_pairs: d.email_pairs && d.email_pairs.length ? d.email_pairs : DEFAULTS.email_pairs,
          email_directions: (d.email_directions && d.email_directions.length ? d.email_directions : DEFAULTS.email_directions) as Direction[],
        });
      }
      setLoading(false);
    })();
  }, []);


  useEffect(() => {
    let cancelled = false;
    const fetchAlerts = async () => {
      const cutoff = await getAlertCutoff();
      let q = supabase
        .from("signal_alerts")
        .select("id, pair, grade, direction, entry, sl, tp, rr, confidence, session, fired_at, models_used")
        .order("fired_at", { ascending: false })
        .limit(50);
      if (cutoff) q = q.gte("fired_at", cutoff);
      const { data } = await q;
      if (!cancelled && data) setAlerts(data as FiredAlert[]);
      if (!cancelled) setAlertsLoading(false);
    };
    fetchAlerts();
    const channel = supabase
      .channel(`signal_alerts_feed:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "signal_alerts" }, (payload) => {
        setAlerts((prev) => [payload.new as FiredAlert, ...prev].slice(0, 50));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  // Persist "Trade Done" state by cross-checking existing trade_journal rows
  useEffect(() => {
    if (alerts.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("trade_journal")
        .select("pair, entry, stop_loss, take_profit")
        .eq("user_id", u.user.id)
        .limit(500);
      if (cancelled || !data) return;
      const key = (p: string, e: number, s: number, t: number) =>
        `${p}|${Number(e).toFixed(5)}|${Number(s).toFixed(5)}|${Number(t).toFixed(5)}`;
      const set = new Set<string>(
        (data as Array<{ pair: string; entry: number; stop_loss: number; take_profit: number }>).map((r) =>
          key(r.pair, r.entry, r.stop_loss, r.take_profit),
        ),
      );
      setLoggedIds((prev) => {
        const next = new Set(prev);
        for (const a of alerts) {
          if (set.has(key(a.pair, a.entry, a.sl, a.tp))) next.add(a.id);
        }
        persistLogged(next);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [alerts]);



  const save = async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    let timezone: string | null = null;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { timezone = null; }
    setSaving(true);
    const { error } = await supabase.from("alert_preferences").upsert({
      user_id: user.user.id,
      ...prefs,
      timezone,
    });
    setSaving(false);
    if (error) toast.error("Could not save preferences");
  };

  // Auto-save preferences whenever they change (debounced)
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => { save(); }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, loading]);


  const requestBrowser = async () => {
    if (typeof Notification === "undefined") return toast.error("Notifications not supported in this browser");
    // Iframes (like the Lovable preview) block Notification.requestPermission by default.
    const inIframe = typeof window !== "undefined" && window.self !== window.top;
    if (inIframe) {
      return toast.error("Open the site in a new tab to enable notifications (blocked inside preview).");
    }
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        setPrefs((p) => ({ ...p, browser_enabled: true }));
        toast.success("Browser alerts enabled");
      } else if (result === "denied") {
        toast.error("Notifications blocked. Click the 🔒 in the address bar → Notifications → Allow.");
      } else {
        toast.message("Permission dismissed. Try again to enable alerts.");
      }
    } catch {
      toast.error("Could not request permission in this context.");
    }
  };

  if (loading || isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;

  return (
    <UpgradeOverlay
      show={locked}
      title="Realtime Alerts are Pro"
      description="Get A+ setups delivered the moment they form. Upgrade to Pro or Elite to enable realtime alerts."
    >
    <div className="max-w-6xl space-y-6">

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-black normal-case pl-3">&nbsp;Recent alerts</h2>
            <p className="mt-1 text-sm text-zinc-500">Live A+ setups across all pairs & coins. Updates in realtime.</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {alertsOn !== null && (
              <button
                onClick={toggleAlerts}
                disabled={alertsSaving}
                className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg border-0 bg-transparent hover:bg-zinc-50 transition disabled:opacity-50"
                title={alertsOn
                  ? "Alerts ON · $0.20 charged per signal. Click to turn off."
                  : "Alerts OFF · no notifications, no charges. Click to turn on."}
              >
                {alertsSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : alertsOn ? (
                  <Bell className="h-4 w-4 text-emerald-600" />
                ) : (
                  <BellOff className="h-4 w-4 text-rose-600" />
                )}
              </button>

            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> LIVE
            </span>


            <select
              value={pairFilter}
              onChange={(e) => setPairFilter(e.target.value)}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700"
            >
              <option value="ALL">All pairs</option>
              {Array.from(new Set(alerts.map((a) => a.pair))).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-zinc-100 overflow-hidden">
          {alertsLoading ? (
            <div className="px-2 py-8 text-center text-xs text-zinc-500">Loading alerts…</div>
          ) : alerts.length === 0 ? (
            <div className="px-2 py-8 text-center text-xs text-zinc-500">No alerts have fired yet. Sit tight — the scanner runs every 5 minutes.</div>
          ) : (
            <>
            {/* Mobile card list */}
            <ul className="divide-y divide-zinc-100 sm:hidden">
              {alerts.filter((a) => pairFilter === "ALL" || a.pair === pairFilter).slice(0, visibleCount).map((a) => {
                const isBuy = a.direction === "BUY";
                const firedAt = new Date(a.fired_at);
                const ago = relativeTime(firedAt);
                const logged = loggedIds.has(a.id);
                const busy = loggingId === a.id;
                const withinHour = Date.now() - firedAt.getTime() < 60 * 60 * 1000;
                const entryN = Number(a.entry);
                const slN = Number(a.sl);
                const sz = risk && Number.isFinite(entryN) && Number.isFinite(slN)
                  ? computePositionSize({ balanceUsd: risk.balance, riskPct: risk.pct, entry: entryN, sl: slN })
                  : null;
                return (
                  <li key={a.id} className="p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                        <span className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${isBuy ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          {isBuy ? "BUY" : "SELL"}
                        </span>
                        <span className="shrink-0 font-mono text-xs font-semibold text-zinc-900">{a.pair}</span>
                        <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-900">{a.grade}</span>
                        <span className="shrink-0 text-[10px] text-zinc-500">{a.confidence}%</span>
                        {a.session && <span className="shrink-0 text-[10px] text-zinc-400">· {a.session}</span>}
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-400 whitespace-nowrap">{ago}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                      {([
                        ["Entry", a.entry, "text-zinc-800"],
                        ["SL", a.sl, "text-rose-600"],
                        ["TP", a.tp, "text-emerald-600"],
                        ["RR", a.rr, "text-zinc-800"],
                      ] as const).map(([k, v, c]) => (
                        <div key={k} className="rounded-md bg-zinc-50 px-1 py-1 ring-1 ring-inset ring-zinc-200/70 min-w-0">
                          <dt className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{k}</dt>
                          <dd className={`mt-0.5 font-mono text-[11px] truncate ${c}`}>{v ?? "—"}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 text-[10px] text-zinc-500 truncate">
                        {sz ? <span title={`Balance $${risk!.balance.toFixed(2)} · Risk ${risk!.pct}%`}>Size: <span className="font-mono text-zinc-800">{sz.lots.toFixed(2)} lot</span></span> : (
                          a.models_used && a.models_used.length > 0 ? <span className="truncate">{a.models_used.map((m) => m.split("/").pop()).join(" · ")}</span> : <span className="text-zinc-300">—</span>
                        )}
                      </div>
                      {withinHour ? (
                        <button
                          type="button"
                          disabled={logged || busy}
                          onClick={() => takeTrade(a)}
                          className={`shrink-0 inline-flex items-center justify-center rounded-md px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition ${
                            logged
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                              : isBuy
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : "bg-rose-600 text-white hover:bg-rose-700"
                          } ${busy ? "opacity-70" : ""}`}
                        >
                          {logged ? "Logged" : busy ? "…" : "Trade Done"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-center font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  {["Dir", "Pair", "Grade", "Session", "Entry", "SL", "TP", "RR", "Conf", "Your Size", "Time", ""].map((h, i) => (
                    <th key={i} className="px-3 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {alerts.filter((a) => pairFilter === "ALL" || a.pair === pairFilter).slice(0, visibleCount).map((a) => {
                  const isBuy = a.direction === "BUY";
                  const firedAt = new Date(a.fired_at);
                  const ago = relativeTime(firedAt);
                  const logged = loggedIds.has(a.id);
                  const busy = loggingId === a.id;
                  const withinHour = Date.now() - firedAt.getTime() < 60 * 60 * 1000;
                  return (
                    <tr key={a.id} className="text-center hover:bg-zinc-50/60">
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${isBuy ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          {isBuy ? "BUY" : "SELL"}
                          <span className="opacity-60">·</span>
                          {isBuy ? "LONG" : "SHORT"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-900">{a.pair}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-md bg-transparent px-1.5 py-0.5 text-sm font-bold text-zinc-900">{a.grade}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-500">{a.session ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-700">{a.entry}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-rose-600">{a.sl}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-emerald-600">{a.tp}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-700">{a.rr}</td>
                      <td className="px-3 py-2.5 text-[11px] font-medium text-zinc-700">{a.confidence}%</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-800 whitespace-nowrap">
                        {(() => {
                          if (!risk) return <span className="text-zinc-300">—</span>;
                          const entryN = Number(a.entry);
                          const slN = Number(a.sl);
                          if (!Number.isFinite(entryN) || !Number.isFinite(slN)) return <span className="text-zinc-300">—</span>;
                          const sz = computePositionSize({ balanceUsd: risk.balance, riskPct: risk.pct, entry: entryN, sl: slN });
                          if (!sz) return <span className="text-zinc-300">—</span>;
                          return (
                            <span title={`Balance $${risk.balance.toFixed(2)} · Risk ${risk.pct}% ($${sz.riskUsd.toFixed(2)})`}>
                              {sz.lots.toFixed(2)} lot
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-[10px] text-zinc-400 whitespace-nowrap">{ago}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {withinHour ? (
                          <button
                            type="button"
                            disabled={logged || busy}
                            onClick={() => takeTrade(a)}
                            className={`inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition ${
                              logged
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                                : isBuy
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : "bg-rose-600 text-white hover:bg-rose-700"
                            } ${busy ? "opacity-70" : ""}`}
                          >
                            {logged ? "Logged" : busy ? "…" : "Trade Done"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            </>
          )}
        </div>

        {(() => {
          const filtered = alerts.filter((a) => pairFilter === "ALL" || a.pair === pairFilter);
          if (filtered.length <= visibleCount) return null;
          return (
            <div className="mt-3 flex justify-center">
              <button
                onClick={() => setVisibleCount((c) => c + 10)}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Show more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          );
        })()}

      </section>




      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="pl-3 text-base font-semibold text-black normal-case">&nbsp;Delivery channels</h2>
        <p className="mt-1 text-sm text-zinc-500">Choose how new A+ setups reach you.</p>
        <div className="mt-5 space-y-3">
          <Toggle
            label="Email alerts"
            description="Sent to your account email when a setup fires."
            checked={prefs.email_enabled}
            onChange={(v) => setPrefs((p) => ({ ...p, email_enabled: v }))}
          />
          <Toggle
            label="Browser push"
            description="Realtime native notifications when this site is open."
            checked={prefs.browser_enabled}
            onChange={(v) => setPrefs((p) => ({ ...p, browser_enabled: v }))}
          />
          <div className="rounded-xl border border-zinc-100 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-900">WhatsApp alerts</div>
                <div className="text-xs text-zinc-500">
                  {whatsappLinked
                    ? `Connected to ${whatsappPhone || "—"}`
                    : "Enter your phone number with country code (e.g. +923001234567). We'll send a verification code on WhatsApp."}
                </div>
                {whatsappVerifiedAt && <div className="mt-1 text-[11px] text-emerald-600">Active {formatVerifiedAt(whatsappVerifiedAt)}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-900">
                  <svg className="h-4 w-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.702A7.944 7.944 0 0 0 12 4.5a7.944 7.944 0 0 0-6.65 3.605 7.95 7.95 0 0 0 1.09 9.937l.11.11-.443 1.617 1.66-.436.107.063A7.947 7.947 0 0 0 20 12a7.944 7.944 0 0 0-3.95-5.32M12 2.5a9.5 9.5 0 0 1 9.5 9.5 9.5 9.5 0 0 1-5.59 8.655l.09-.036-2.24.588.597-2.18-.075-.047A9.5 9.5 0 0 1 12 2.5z" />
                  </svg>
                  WhatsApp API
                </div>
                {whatsappLinked && (
                  <button
                    type="button"
                    onClick={() => toggleWhatsapp(!whatsappEnabled)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      whatsappEnabled ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                    )}
                  >
                    {whatsappEnabled ? "ON" : "OFF"}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="+923001234567"
                className={cn(
                  "min-w-0 flex-1 sm:flex-none sm:w-56 rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-200",
                  whatsappPhone && !phoneValid ? "border-rose-200 bg-rose-50" : "border-zinc-200 bg-white",
                )}
              />
              {whatsappLinked && (
                <button
                  type="button"
                  onClick={() => setWhatsappDisconnectConfirmOpen(true)}
                  disabled={whatsappSaving}
                  className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
              <button
                type="button"
                onClick={connectWhatsapp}
                disabled={!canConnectWhatsapp}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                  canConnectWhatsapp
                    ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                    : "cursor-not-allowed border-zinc-200 bg-white text-zinc-400",
                )}
              >
                {whatsappSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {whatsappLinked ? "Update" : whatsappPending ? "Resend code" : "Connect"}
              </button>
            </div>

            {whatsappPending && !whatsappLinked && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="w-full text-[12px] text-emerald-800">
                  We sent a 6-digit code to your WhatsApp{whatsappSender ? ` from ${whatsappSender}` : ""}. Enter it below to activate alerts.
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={whatsappCode}
                  onChange={(e) => setWhatsappCode(e.target.value)}
                  placeholder="123456"
                  className="w-32 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm tracking-widest outline-none focus:ring-2 focus:ring-emerald-200"
                />
                <button
                  type="button"
                  onClick={verifyWhatsapp}
                  disabled={whatsappSaving || whatsappCode.replace(/\D/g, "").length < 4}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {whatsappSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Verify
                </button>
              </div>
            )}
            {whatsappError && <div className="mt-2 text-[11px] text-rose-600">{whatsappError}</div>}
          </div>

          <button onClick={requestBrowser} className="text-xs font-medium text-zinc-700 underline-offset-2 hover:underline">
            {"\u00a0 \u00a0 \u00a0"}Request browser permission →
          </button>
          
          <AlertDialog open={whatsappDisconnectConfirmOpen} onOpenChange={setWhatsappDisconnectConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect WhatsApp?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will no longer receive signal alerts on your phone. You can reconnect at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={disconnectWhatsapp} className="bg-rose-600 hover:bg-rose-700">
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="pl-3 text-base font-semibold text-black normal-case">&nbsp;Conviction filter</h2>
        <p className="mt-1 text-sm text-zinc-500">Only fire when confidence meets this threshold.</p>
        <div className="mt-4 inline-flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-1">
          {([
            { key: 0, label: "All" },
            { key: 70, label: "70%" },
            { key: 80, label: "80%" },
            { key: 85, label: "85%" },
          ] as const).map((opt) => {
            const currentThreshold = (() => {
              if (typeof window !== "undefined") {
                const v = Number(window.localStorage.getItem("jenvu:minConfidence"));
                if (!Number.isNaN(v)) return v;
              }
              return 0;
            })();
            const isActive = currentThreshold === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => {
                  try { window.localStorage.setItem("jenvu:minConfidence", String(opt.key)); } catch { /* ignore */ }
                  setPrefs((p) => ({ ...p, min_grade: opt.key >= 75 ? "A+" : "A" }));
                }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                  isActive ? "bg-emerald-600 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">Higher threshold = fewer, higher-conviction alerts.</p>
      </section>





      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="pl-3 text-base font-semibold text-black normal-case">&nbsp;Quiet hours</h2>
        <p className="mt-1 text-sm text-zinc-500">No alerts will be sent during this window (your local time).</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-zinc-600">
            From
            <input
              type="time"
              value={prefs.quiet_start ?? ""}
              onChange={(e) => setPrefs((p) => ({ ...p, quiet_start: e.target.value || null }))}
              className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            To
            <input
              type="time"
              value={prefs.quiet_end ?? ""}
              onChange={(e) => setPrefs((p) => ({ ...p, quiet_end: e.target.value || null }))}
              className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      <div className="flex justify-end text-xs text-zinc-400">
        {saving ? "Saving…" : "Changes are saved automatically"}
      </div>
    </div>
    </UpgradeOverlay>
  );
}


function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-zinc-100 p-3 hover:bg-zinc-50">
      <div>
        <div className="text-sm font-medium text-zinc-900">{label}</div>
        <div className="text-xs text-zinc-500">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${checked ? "bg-emerald-600" : "bg-zinc-300"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function relativeTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
