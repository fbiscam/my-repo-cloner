import { getAlertCutoff } from "@/lib/alert-cutoff";
import { getIpGeo } from "@/lib/ip-geo";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useVerification, isVerificationAllowedPath } from "@/hooks/useVerification";
import { VerificationBanner, VerificationLocked } from "@/components/VerificationGate";
import xaiLogo from "@/assets/xai-logo.png";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SiteFooter from "@/components/SiteFooter";
import DashboardFooter from "@/components/DashboardFooter";
import NotificationBell from "@/components/NotificationBell";
import { useCredits } from "@/hooks/useCredits";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useLivePriceStream } from "@/hooks/useLivePriceStream";
import { useLivePrices } from "@/hooks/useLivePrices";
import { getMarketSnapshot } from "@/lib/gold-analysis.functions";
import { useCurrentPlan } from "@/hooks/useCurrentPlan";
import { getVoiceHistory, formatRelative, formatDateTime, clearVoiceHistory, type VoiceTurn } from "@/lib/voice-history";
import { getDefaultAvatar } from "@/lib/default-avatar";
import { readCachedAvatar, writeCachedAvatar, AVATAR_TTL_SECONDS } from "@/lib/avatar-cache";


import {
  Bookmark, Bell, BellRing, CreditCard, BookOpen, User, LogOut, Power, Mic, Plus,
  Wallet, TrendingUp, LineChart, Activity, ShieldCheck, Gauge, BarChart3,
  MoreHorizontal, Tag, ArrowUpRight, ArrowRight, CheckCircle2, Calendar, RefreshCw, Gift, PieChart,
  ChevronsLeft, ChevronsRight, Menu, X, Sparkles, LayoutGrid, LifeBuoy, Lightbulb,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

type RangeKey = "24h" | "7d" | "30d" | "90d" | "all";
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

const RANGE_LABELS: Record<RangeKey, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "all": "All time",
};
const RANGE_DAYS: Record<RangeKey, number | null> = {
  "24h": 1, "7d": 7, "30d": 30, "90d": 90, "all": null,
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard — Jenvu" },
      { name: "description", content: "Your saved A+ setups, alert preferences, trade journal, and billing." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardLayout,
});

type OpenTrade = { pair: string; direction: "long" | "short"; entry: number | null; stop_loss: number | null; take_profit: number | null };
type Counts = { saved: number; alerts7d: number; journalWinRate: number | null; journalTotal: number; closedWins: number; closedDecided: number; openTrades: OpenTrade[] };

type TabItem = { to: string; label: string; icon: string; exact?: boolean; countKey?: keyof Counts };

const NAV_GROUPS: Array<{ label: string; items: TabItem[] }> = [
  {
    label: "",
    items: [
      { to: "/dashboard", label: "Account Overview", icon: "space_dashboard", exact: true, countKey: "saved" },
      { to: "/dashboard/workspace", label: "Saved Signals", icon: "bookmarks" },
      { to: "/dashboard/alerts", label: "Signal Alerts", icon: "notifications_active", countKey: "alerts7d" },
      { to: "/ai-engine", label: "AI Engineering", icon: "neurology" },
      { to: "/dashboard/notifications", label: "Notifications", icon: "notifications" },
    ],
  },
  {
    label: "Trades & Insights",
    items: [
      { to: "/dashboard/journal", label: "Trades", icon: "candlestick_chart", countKey: "journalTotal" },
      { to: "/signal", label: "Signal Desk", icon: "radar" },
      { to: "/dashboard/analytics", label: "Analytics", icon: "query_stats" },
      { to: "/dashboard/risk", label: "Risk Manager", icon: "balance" },
    ],
  },
  {
    label: "Tools & Market",
    items: [
      { to: "/killzones", label: "Killzones", icon: "schedule" },
      { to: "/insights", label: "Insights", icon: "menu_book" },
      { to: "/dashboard/referrals", label: "Referrals", icon: "diversity_3" },
      { to: "/pricing", label: "Pricing", icon: "local_offer" },
    ],
  },
  {
    label: "Account & Billing",
    items: [
      { to: "/dashboard/billing", label: "Billing", icon: "account_balance_wallet" },
      { to: "/dashboard/pay", label: "Payments", icon: "payments" },
      { to: "/dashboard/documents", label: "Documents", icon: "verified_user" },
      { to: "/dashboard/profile", label: "Profile", icon: "person_pin" },
      { to: "/dashboard/security", label: "Security", icon: "encrypted" },
      { to: "/help", label: "Help Center", icon: "lightbulb" },
    ],
  },
];



const TABS: TabItem[] = NAV_GROUPS.flatMap((g) => g.items);

/* ---------- helpers ---------- */

function Sparkline({ seed = 1, tone = "blue", empty = false, trend = "flat", magnitude = 0 }: { seed?: number; tone?: "blue" | "rose" | "zinc" | "emerald"; empty?: boolean; trend?: "up" | "down" | "flat"; magnitude?: number }) {
  const w = 120, h = 36;

  // deterministic pseudo-random points with optional trend bias
  const pts = useMemo(() => {
    const n = 24;
    const arr: number[] = [];
    // magnitude (0..100) scales how strong the slope is
    const m = Math.max(10, Math.min(60, magnitude || 30));
    const slope = trend === "up" ? m : trend === "down" ? -m : 0;
    const start = trend === "flat" ? 50 : trend === "up" ? 50 - slope / 2 : 50 + Math.abs(slope) / 2;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const base = start + slope * t;
      const noise = Math.sin((i + seed) * 1.7) * 6 + Math.cos((i + seed) * 0.9) * 4;
      arr.push(Math.max(8, Math.min(92, base + noise)));
    }
    return arr;
  }, [seed, trend, magnitude]);

  const stroke = tone === "rose" ? "#f43f5e" : tone === "zinc" ? "#71717a" : tone === "emerald" ? "#10b981" : "#3b82f6";

  if (empty) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
        <line
          x1="0" y1={h - 4} x2={w} y2={h - 4}
          stroke="#e4e4e7" strokeWidth="1.25" strokeDasharray="3 3" strokeLinecap="round"
        />
      </svg>
    );
  }

  const step = w / (pts.length - 1);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / 100) * h).toFixed(1)}`).join(" ");
  const area = `${d} L${w},${h} L0,${h} Z`;
  const fillId = `spark-${tone}-${seed}-${trend}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fillId})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Metric({
  label, value, delta, tone, seed = 1, trend, magnitude,
}: {
  label: string; value: React.ReactNode; delta?: string | null; tone?: "blue" | "rose" | "zinc" | "emerald"; seed?: number; trend?: "up" | "down" | "flat"; magnitude?: number;
}) {
  const negative = trend ? trend === "down" : delta?.startsWith("-");
  const positive = trend ? trend === "up" : (delta ? !delta.startsWith("-") : false);
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const numeric = parseFloat(raw.replace(/[^0-9.\-]/g, ""));
  const isEmpty = raw === "" || raw === "—" || raw === "…" || (!Number.isNaN(numeric) && numeric === 0);

  // derive trend from delta if not explicitly provided
  const derivedTrend: "up" | "down" | "flat" = trend
    ?? (delta ? (negative ? "down" : "up") : "flat");
  const derivedMag = magnitude ?? (delta ? Math.min(60, Math.abs(parseFloat(delta.replace(/[^0-9.\-]/g, ""))) || 30) : 0);

  const chipColor = negative ? "text-rose-600" : positive ? "text-emerald-600" : "text-zinc-500";

  return (
    <div className="flex flex-1 min-w-0 flex-col px-3 pt-2 pb-4 sm:px-4">
      <div className="truncate text-[12px] text-zinc-700" title={label}>
        {label}
      </div>
      <div className="mt-1 flex min-h-[26px] items-baseline gap-2 sm:min-h-[28px]">
        <span className={`text-[20px] font-semibold leading-none tracking-tight sm:text-[22px] ${isEmpty ? "text-zinc-400" : "text-zinc-900"}`}>{value}</span>
        {delta && !isEmpty && (
          <span className={`ml-auto inline-flex shrink-0 items-center whitespace-nowrap text-[10px] font-medium leading-none ${chipColor}`}>
            <ArrowUpRight className={`h-2.5 w-2.5 ${negative ? "rotate-90" : ""}`} />
            {delta.replace("-", "")}
          </span>
        )}
      </div>
      <div className="mt-auto pt-2 -mb-1 opacity-90">
        <Sparkline seed={seed} tone={tone ?? (derivedTrend === "down" ? "rose" : derivedTrend === "up" ? "emerald" : "blue")} empty={isEmpty} trend={derivedTrend} magnitude={derivedMag} />
      </div>
    </div>
  );
}

function CardHeader({ icon: Icon, title, right, className = "" }: { icon: typeof ShieldCheck; title: string; right?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between rounded-t-xl border-b border-zinc-200 bg-white/80 px-4 py-2.5 ${className}`}>
      <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-700">
        <Icon className="h-4 w-4 text-zinc-500" />
        {title}
      </div>
      {right}
    </div>
  );
}


function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-zinc-200 bg-white/80 ${className}`}>
      {children}
    </div>
  );
}

/* ---------- signal desk history ---------- */

type DeskAlert = {
  id: string; pair: string; grade: string; direction: string;
  entry: number; sl: number; tp: number; rr: number;
  confidence: number; session: string | null; fired_at: string;
};

function SignalDeskHistory() {
  const [alerts, setAlerts] = useState<DeskAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cutoff = await getAlertCutoff();
      let q = supabase
        .from("signal_alerts")
        .select("id, pair, grade, direction, entry, sl, tp, rr, confidence, session, fired_at")
        .gte("confidence", 50)
        .order("fired_at", { ascending: false })
        .limit(100);
      if (cutoff) q = q.gte("fired_at", cutoff);
      const { data } = await q;
      if (!cancelled) { setAlerts((data as DeskAlert[]) ?? []); setLoading(false); }
    })();
    const channel = supabase
      .channel(`dashboard_signal_desk:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "signal_alerts" }, (payload) => {
        const a = payload.new as DeskAlert;
        if ((a.confidence ?? 0) < 50) return;
        setAlerts((prev) => [a, ...prev].slice(0, 100));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  if (loading) {
    return <div className="flex flex-1 items-center justify-center px-6 py-10 text-[12px] text-zinc-400">Loading scans…</div>;
  }
  if (alerts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-100">
          <Activity className="h-5 w-5 text-zinc-700" />
        </div>
        <h3 className="mt-3 text-[14px] font-semibold text-zinc-900">No A+ scans yet</h3>
        <p className="mt-1 max-w-[260px] text-[12px] text-zinc-500">The engine runs every 5 minutes. New A+ setups will land here automatically.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 divide-y divide-zinc-100 overflow-y-auto scrollbar-auto-hide max-h-[260px]">
      {alerts.map((a) => {
        const isBuy = a.direction?.toLowerCase().includes("long") || a.direction?.toLowerCase().includes("buy");
        const when = new Date(a.fired_at);
        const ago = relTime(when);
        return (
          <Link
            key={a.id}
            to="/signal"
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50"
          >
            

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-zinc-900">
                <span className="truncate">{a.pair}</span>
                <span className={`text-[10px] font-semibold ${isBuy ? "text-emerald-600" : "text-rose-600"}`}>
                  {isBuy ? "BUY" : "SELL"}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                Entry {fmt(a.entry)} · SL {fmt(a.sl)} · TP {fmt(a.tp)} · RR {a.rr?.toFixed?.(2) ?? a.rr}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[11px] font-medium text-zinc-700">{a.confidence}%</div>
              <div className="text-[10px] text-zinc-400">{ago}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function fmt(n: number) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const d = abs >= 1000 ? 2 : abs >= 10 ? 3 : 5;
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}
function relTime(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24); return `${days}d`;
}

/* ---------- live ticker row ---------- */

function TickerRow({ label, symbol, decimals = 2 }: { label: string; symbol: string; decimals?: number }) {
  const livePrice = useLivePriceStream(symbol, null, undefined, { intervalMs: 5000 });
  const fetchSnapshot = useServerFn(getMarketSnapshot);
  const [snap, setSnap] = useState<{ price: number; prevClose: number | null; changePct: number | null } | null>(null);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const s = await fetchSnapshot({ data: { symbol } });
        if (!stopped && s) setSnap({ price: s.price, prevClose: s.prevClose, changePct: s.changePct ?? null });
      } catch { /* keep last */ }
    };
    void tick();
    const id = setInterval(tick, 15_000);
    return () => { stopped = true; clearInterval(id); };
  }, [symbol, fetchSnapshot]);

  // Use live WS price only when it's in the same ballpark as the snapshot price
  // (guards against symbol/scale mismatches from the WS stream).
  const sameScale =
    livePrice != null && snap?.price
      ? Math.abs(livePrice - snap.price) / snap.price < 0.2
      : false;
  const price = sameScale ? livePrice : snap?.price ?? null;
  // Prefer the snapshot's own changePct (price + prevClose from one source).
  const change =
    snap?.changePct != null
      ? snap.changePct
      : price != null && snap?.prevClose
        ? ((price - snap.prevClose) / snap.prevClose) * 100
        : null;
  const up = (change ?? 0) >= 0;

  return (
    <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 last:border-b-0">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <span className="text-[13px] font-medium text-zinc-800">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[12px] text-zinc-600">{price != null ? price.toFixed(decimals) : "—"}</span>
        {change != null ? (
          <span className={`font-mono text-[11px] ${up ? "text-emerald-600" : "text-rose-600"}`}>
            {up ? "+" : ""}{change.toFixed(2)}%
          </span>
        ) : (
          <span className="font-mono text-[11px] text-zinc-400">—</span>
        )}
      </div>
    </div>
  );
}

/* ---------- layout ---------- */

const GREETINGS = {
  lateNight: ["Burning the midnight oil", "Still charting the tape", "Late-night desk"],
  earlyMorning: ["Rise and grind", "Pre-market focus", "Early bird"],
  morning: ["Good morning", "Morning, markets are live", "Fresh session"],
  afternoon: ["Good afternoon", "Midday check-in", "Session in motion"],
  evening: ["Good evening", "Closing bell energy", "Evening wrap"],
  night: ["Good night", "Quiet hours", "Overnight watch"],
} as const;

function pickGreeting(hour: number): string {
  let bucket: keyof typeof GREETINGS;
  if (hour < 4) bucket = "lateNight";
  else if (hour < 7) bucket = "earlyMorning";
  else if (hour < 12) bucket = "morning";
  else if (hour < 17) bucket = "afternoon";
  else if (hour < 21) bucket = "evening";
  else bucket = "night";
  const list = GREETINGS[bucket];
  return list[Math.floor(Date.now() / 3_600_000) % list.length];
}

function useLocalHour(): number {
  const [hour, setHour] = useState<number>(() => new Date().getHours());
  useEffect(() => {
    let cancelled = false;
    const update = (tz?: string) => {
      try {
        const h = Number(
          new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date())
        );
        if (!cancelled && !Number.isNaN(h)) setHour(h % 24);
      } catch { /* ignore invalid tz */ }
    };
    update();
    getIpGeo()
      .then((d) => { if (!cancelled && d?.timezone) update(d.timezone); })
      .catch(() => { /* offline / blocked — fall back to device time */ });
    const id = setInterval(() => update(), 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return hour;
}


function DashboardLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const verification = useVerification();
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("jenvu:profile:fullName") ?? "";
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => readCachedAvatar());


  const [counts, setCounts] = useState<Counts>({ saved: 0, alerts7d: 0, journalWinRate: null, journalTotal: 0, closedWins: 0, closedDecided: 0, openTrades: [] });
  const [newCounts, setNewCounts] = useState<{ saved: number; alerts7d: number; journalTotal: number }>({ saved: 0, alerts7d: 0, journalTotal: 0 });

  const [range, setRange] = useState<RangeKey>("7d");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Embed mode: hide sidebar/chrome when rendered inside the Ops Hub iframe.
  const embedMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(window.location.search).get("embed") === "1";
    } catch {
      return false;
    }
  }, []);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [isAdminUser, setIsAdminUser] = useState(false);
  // Unverified accounts may only use Dashboard, Profile, Security and Documents.
  const verificationLocked =
    !isAdminUser &&
    !verification.loading &&
    !!verification.status &&
    !verification.verified &&
    !isVerificationAllowedPath(pathname);
  const credits = useCredits();
  const { user: authUser, loading: authLoading } = useAuthUser();
  const localHour = useLocalHour();
  const greetingText = pickGreeting(localHour);
  const currentPlan = useCurrentPlan();
  const showDeepSeek = true;
  const showGrok = true;


  // Persist sidebar collapsed state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("jenvu:dash:sidebar-collapsed");
    if (stored === "1") setSidebarCollapsed(true);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("jenvu:dash:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);
  // (removed emails auto-collapse — page no longer exists)
  // Close mobile drawer on route change
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  // Detect admin role to conditionally show admin nav items
  useEffect(() => {
    if (authLoading || !authUser) { setIsAdminUser(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: authUser.id, _role: "admin" });
      if (!cancelled) setIsAdminUser(Boolean(data));
    })();
    return () => { cancelled = true; };
  }, [authLoading, authUser]);

  // Unread notifications count — only counts notifications newer than the last
  // time the user opened the notifications page (localStorage timestamp).
  // This prevents old already-seen notifications from re-appearing after sign-in.
  useEffect(() => {
    if (authLoading || !authUser) { setUnreadNotifs(0); return; }
    let cancelled = false;
    const lastSeenKey = `jenvu:notifs:last-seen:${authUser.id}`;
    const load = async () => {
      const lastSeen = (typeof window !== "undefined" && window.localStorage.getItem(lastSeenKey)) || new Date(0).toISOString();
      const { count } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", authUser.id)
        .is("read_at", null)
        .gt("created_at", lastSeen);
      if (!cancelled) setUnreadNotifs(count ?? 0);
    };
    load();
    const ch = supabase
      .channel(`notif-nav:${authUser.id}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${authUser.id}` }, load)
      .subscribe();
    // Polling fallback (20s) in case realtime drops, plus refresh on tab focus.
    const iv = window.setInterval(load, 20000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", load);
    };
  }, [authUser?.id, authLoading]);

  // Clear red indicator when user visits the notifications page and persist
  // the "last seen" timestamp so old notifications never count again.
  useEffect(() => {
    if (!pathname.startsWith("/dashboard/notifications")) return;
    setUnreadNotifs(0);
    if (typeof window !== "undefined" && authUser?.id) {
      window.localStorage.setItem(`jenvu:notifs:last-seen:${authUser.id}`, new Date().toISOString());
    }
  }, [pathname, authUser?.id]);


  useEffect(() => {
    // Wait until Supabase has restored the session; otherwise RLS-gated
    // queries return empty because auth.uid() is null on a hard refresh.
    if (authLoading) return;
    if (!authUser) { setRefreshing(false); return; }

    let cancelled = false;
    (async () => {
      setRefreshing(true);
      const u = authUser;
      if (!cancelled) {
        setEmail(u.email ?? "");
        // Only seed from user_metadata when we have no cached name yet.
        // user_metadata.full_name can be stale after a rename, so profiles
        // (fetched below) is the source of truth and must win — writing the
        // stale metadata value here caused the "old name" flash on refresh.
        setFullName((prev) => {
          if (prev && prev.trim()) return prev;
          return (u.user_metadata?.full_name as string) ?? (u.email?.split("@")[0] ?? "");
        });
      }
      // Prefer name from profiles table (source of truth updated from Profile page)
      supabase.from("profiles").select("full_name").eq("id", u.id).maybeSingle().then(({ data }) => {
        const n = (data as { full_name?: string | null } | null)?.full_name;
        if (!cancelled && n && n.trim()) {
          setFullName(n.trim());
          try { localStorage.setItem("jenvu:profile:fullName", n.trim()); } catch {}
        }
      });
      // Load avatar (best-effort, non-blocking)
      supabase.from("profiles").select("avatar_url").eq("id", u.id).maybeSingle().then(async ({ data }) => {
        if (cancelled) return;
        const path = (data as { avatar_url?: string | null } | null)?.avatar_url;
        if (!path) {
          setAvatarUrl(null);
          writeCachedAvatar(null);
          return;
        }
        const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, AVATAR_TTL_SECONDS);
        if (!cancelled && signed?.signedUrl) {
          setAvatarUrl(signed.signedUrl);
          writeCachedAvatar(signed.signedUrl);
        }
      });


      const days = RANGE_DAYS[range];
      const since = days != null ? new Date(Date.now() - days * 24 * 3600 * 1000).toISOString() : null;

      const savedQ = supabase.from("saved_signals").select("id", { count: "exact", head: true });
      const alertsQ = supabase.from("signal_alerts").select("id", { count: "exact", head: true });
      const alertCutoff = await getAlertCutoff();
      if (alertCutoff) alertsQ.gte("created_at", alertCutoff);
      const journalQ = supabase.from("trade_journal").select("outcome, created_at, pair, direction, entry, stop_loss, take_profit").eq("user_id", u.id);
      if (since) {
        alertsQ.gte("created_at", since);
        journalQ.gte("created_at", since);
      }
      const [saved, alerts, journal] = await Promise.all([savedQ, alertsQ, journalQ]);
      if (cancelled) return;
      const rows = (journal.data ?? []) as Array<{ outcome: string; pair: string; direction: "long" | "short"; entry: number | null; stop_loss: number | null; take_profit: number | null }>;
      const decided = rows.filter(r => r.outcome === "win" || r.outcome === "loss");
      const wins = decided.filter(r => r.outcome === "win").length;
      const openTrades: OpenTrade[] = rows
        .filter(r => r.outcome === "open" && r.entry != null)
        .map(r => ({ pair: r.pair, direction: r.direction, entry: r.entry, stop_loss: r.stop_loss, take_profit: r.take_profit }));
      setCounts({
        saved: saved.count ?? 0,
        alerts7d: alerts.count ?? 0,
        journalTotal: rows.length,
        journalWinRate: decided.length ? Math.round((wins / decided.length) * 100) : null,
        closedWins: wins,
        closedDecided: decided.length,
        openTrades,
      });
      setRefreshing(false);
    })();
    return () => { cancelled = true; };
  }, [range, refreshTick, authUser?.id, authLoading]);

  // Realtime: refresh name/avatar as soon as Profile page saves changes
  useEffect(() => {
    if (!authUser?.id) return;
    const uid = authUser.id;
    const ch = supabase
      .channel(`profile-nav:${uid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        async (payload) => {
          const row = payload.new as { full_name?: string | null; avatar_url?: string | null };
          const n = (row.full_name ?? "").trim();
          if (n) {
            setFullName(n);
            try { localStorage.setItem("jenvu:profile:fullName", n); } catch {}
          }
          const path = row.avatar_url;
          if (!path) {
            setAvatarUrl(null);
            writeCachedAvatar(null);
          } else {
            const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, AVATAR_TTL_SECONDS);
            if (signed?.signedUrl) {
              setAvatarUrl(signed.signedUrl);
              writeCachedAvatar(signed.signedUrl);
            }
          }

        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [authUser?.id]);


  // ---------- Unread badge counts (per tab, cleared when user opens tab) ----------
  // Persist lastSeen to profiles (DB) so badges stay cleared across
  // sign-ins, browsers, and devices — not just this browser.
  const lsKey = useCallback(
    (tab: "saved" | "alerts" | "journal") => `dash:lastSeen:${authUser?.id ?? "anon"}:${tab}`,
    [authUser?.id],
  );
  const dbCol = (tab: "saved" | "alerts" | "journal") =>
    tab === "saved" ? "saved_last_seen_at" : tab === "alerts" ? "alerts_last_seen_at" : "journal_last_seen_at";

  // Hydrate localStorage from DB on sign-in, keeping the max of the two.
  useEffect(() => {
    if (authLoading || !authUser || typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("saved_last_seen_at, alerts_last_seen_at, journal_last_seen_at")
        .eq("id", authUser.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const merge = (tab: "saved" | "alerts" | "journal", dbVal: string | null) => {
        if (!dbVal) return;
        const local = window.localStorage.getItem(lsKey(tab));
        if (!local || new Date(dbVal).getTime() > new Date(local).getTime()) {
          window.localStorage.setItem(lsKey(tab), dbVal);
        }
      };
      const d = data as Record<string, string | null>;
      merge("saved", d.saved_last_seen_at);
      merge("alerts", d.alerts_last_seen_at);
      merge("journal", d.journal_last_seen_at);
      setRefreshTick((t) => t + 1);
    })();
    return () => { cancelled = true; };
  }, [authUser?.id, authLoading, lsKey]);

  const getLastSeen = useCallback((tab: "saved" | "alerts" | "journal") => {
    if (typeof window === "undefined") return new Date(0).toISOString();
    return window.localStorage.getItem(lsKey(tab)) ?? new Date(0).toISOString();
  }, [lsKey]);

  const markTabSeen = useCallback((countKey?: string) => {
    if (!countKey || typeof window === "undefined") return;
    const map: Record<string, "saved" | "alerts" | "journal"> = {
      saved: "saved",
      alerts7d: "alerts",
      journalTotal: "journal",
    };
    const tab = map[countKey];
    if (!tab) return;
    const nowIso = new Date().toISOString();
    window.localStorage.setItem(lsKey(tab), nowIso);
    setNewCounts((prev) => ({ ...prev, [countKey]: 0 } as typeof prev));
    if (authUser?.id) {
      const patch: Record<string, string> = { [dbCol(tab)]: nowIso };
      void supabase.from("profiles").update(patch as never).eq("id", authUser.id);
    }
  }, [lsKey, authUser?.id]);

  // Auto-mark tabs as seen when the user actually visits that tab's page,
  // so the badge clears on open (like Notifications) but persists otherwise.
  useEffect(() => {
    if (authLoading || !authUser || typeof window === "undefined") return;
    const now = new Date().toISOString();
    if (pathname === "/dashboard" || pathname.startsWith("/dashboard/workspace")) {
      window.localStorage.setItem(lsKey("saved"), now);
      setNewCounts((prev) => ({ ...prev, saved: 0 }));
    }
    if (pathname.startsWith("/dashboard/alerts")) {
      window.localStorage.setItem(lsKey("alerts"), now);
      setNewCounts((prev) => ({ ...prev, alerts7d: 0 }));
    }
    if (pathname.startsWith("/dashboard/journal")) {
      window.localStorage.setItem(lsKey("journal"), now);
      setNewCounts((prev) => ({ ...prev, journalTotal: 0 }));
    }
  }, [pathname, authUser?.id, authLoading, lsKey]);

  useEffect(() => {
    if (authLoading || !authUser) return;
    let cancelled = false;
    const load = async () => {
      const savedSince = getLastSeen("saved");
      const signupCutoff = await getAlertCutoff();
      const lastSeenAlerts = getLastSeen("alerts");
      const alertsSince =
        signupCutoff && new Date(signupCutoff) > new Date(lastSeenAlerts) ? signupCutoff : lastSeenAlerts;
      const journalSince = getLastSeen("journal");
      const [s, a, j] = await Promise.all([
        supabase.from("saved_signals").select("id", { count: "exact", head: true }).gt("created_at", savedSince),
        supabase.from("signal_alerts").select("id", { count: "exact", head: true }).gt("created_at", alertsSince),
        supabase.from("trade_journal").select("id", { count: "exact", head: true }).eq("user_id", authUser.id).gt("created_at", journalSince),
      ]);
      if (cancelled) return;
      setNewCounts({ saved: s.count ?? 0, alerts7d: a.count ?? 0, journalTotal: j.count ?? 0 });
    };
    load();
    // Realtime: new signal alerts, saved signals, and trade journal entries
    // should light up the sidebar badges instantly (no refresh needed).
    const ch = supabase
      .channel(`sidebar-nav:${authUser.id}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "signal_alerts" }, () => {
        if (pathname.startsWith("/dashboard/alerts")) return;
        load();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "saved_signals", filter: `user_id=eq.${authUser.id}` },
        () => {
          if (pathname === "/dashboard" || pathname.startsWith("/dashboard/workspace")) return;
          load();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trade_journal", filter: `user_id=eq.${authUser.id}` },
        () => {
          if (pathname.startsWith("/dashboard/journal")) return;
          load();
        },
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [authUser?.id, authLoading, getLastSeen, pathname]);




  const openSymbols = useMemo(
    () => Array.from(new Set(counts.openTrades.map(t => t.pair.toUpperCase()))),
    [counts.openTrades],
  );
  const livePrices = useLivePrices(openSymbols);
  const liveWinRate = useMemo(() => {
    // Only count trades that have actually closed as win/loss.
    // Open trades and deleted trades do not affect this metric.
    if (!counts.closedDecided) return null;
    return Math.round((counts.closedWins / counts.closedDecided) * 100);
  }, [counts.closedWins, counts.closedDecided]);


  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshTick((t) => t + 1);
    
  };


  const signOut = async () => {
    // NOTE: Do NOT revoke the trusted-device row here — a normal sign-out
    // must keep this browser trusted so the user isn't prompted for MFA on
    // every subsequent login. Trusted devices are only cleared when the user
    // explicitly uses "Forget this device" / "Revoke" in Security settings.
    clearStoredAuthSession();
    void supabase.auth.signOut({ scope: "global" }).catch(() => { /* ignore network errors */ });
    window.location.replace("/");
  };


  const planTier = ((credits.plan as { tier?: string; name?: string } | null)?.tier
    ?? (credits.plan as { name?: string } | null)?.name ?? "free").toString().toUpperCase();
  const planTierStyle = (() => {
    const t = planTier.toLowerCase();
    if (t.includes("ultra")) return { pill: "bg-emerald-50 border-emerald-300 text-emerald-700", dot: "bg-emerald-500" };
    if (t.includes("elite")) return { pill: "bg-emerald-50 border-emerald-300 text-emerald-700", dot: "bg-emerald-500" };
    if (t.includes("pro"))   return { pill: "bg-blue-50 border-blue-300 text-blue-700",       dot: "bg-blue-500" };
    if (t.includes("plus") || t.includes("starter")) return { pill: "bg-violet-50 border-violet-300 text-violet-700", dot: "bg-violet-500" };
    if (t.includes("custom")) return { pill: "bg-amber-50 border-amber-300 text-amber-700",   dot: "bg-amber-500" };
    return { pill: "bg-zinc-100 border-zinc-300 text-zinc-700", dot: "bg-zinc-400" };
  })();
  const displayRemaining = Math.min(credits.balance || 0, credits.allowance || 0);
  const remainingPct = credits.allowance ? Math.min(100, Math.round((displayRemaining / credits.allowance) * 100)) : 0;
  const usedPct = credits.allowance ? Math.max(0, 100 - remainingPct) : 0;

  // Track scan changes to show up/down trend.
  // Default: if any scans have been consumed (remaining < allowance) => downtrend (red).
  // If balance increases (recharge/top-up/upgrade) => uptrend (green) until it decreases again.
  const prevRemainingRef = useRef<number | null>(null);
  const [scansTrend, setScansTrend] = useState<"up" | "down" | "flat">("flat");
  useEffect(() => {
    if (credits.isLoading) return;
    const prev = prevRemainingRef.current;
    const allowance = credits.allowance || 0;
    if (prev !== null && prev !== displayRemaining) {
      setScansTrend(displayRemaining > prev ? "up" : "down");
    } else if (prev === null) {
      // Full balance = uptrend (green). Partially used = downtrend (red).
      setScansTrend(allowance > 0 && displayRemaining < allowance ? "down" : "up");
    }
    prevRemainingRef.current = displayRemaining;
  }, [displayRemaining, credits.isLoading, credits.allowance]);

  const balanceTone: "emerald" | "rose" | "zinc" = scansTrend === "down" ? "rose" : scansTrend === "up" ? "emerald" : "zinc";

  return (
    <div className={`flex min-h-screen bg-[#FAFAFA] text-zinc-900 font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif] antialiased jenvu-zoom-dashboard`}>

      {/* Mobile overlay */}
      {mobileNavOpen && !embedMode && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] lg:hidden"
        />
      )}

      {!embedMode && (
      /* Sidebar (Firebase-style) */
      <aside
        className={`dashboard-sidebar-root max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 lg:fixed lg:inset-y-0 lg:left-0 flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white transition-[width,transform] duration-200 ease-out
          ${sidebarCollapsed ? "w-[60px]" : "w-[200px]"}
          ${mobileNavOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"}`}
        style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 }}
      >
        <style>{`.dashboard-sidebar-root, .dashboard-sidebar-root *:not(img):not(svg):not(.material-symbols-rounded) { font-family: "Google Sans", "Product Sans", "Roboto", system-ui, sans-serif !important; text-transform: none !important; letter-spacing: normal !important; } .dashboard-sidebar-root .material-symbols-rounded { font-family: "Material Symbols Rounded" !important; font-weight: normal !important; font-style: normal !important; text-transform: none !important; letter-spacing: normal !important; white-space: nowrap; word-wrap: normal; direction: ltr; -webkit-font-feature-settings: "liga"; -webkit-font-smoothing: antialiased; }`}</style>
        {/* Brand */}
        <div className={`flex h-11 shrink-0 items-center gap-2.5 bg-white ${sidebarCollapsed ? "justify-center px-2" : "px-4"}`}>
          <Link to="/" className="flex items-center gap-2.5 min-w-0">
            <img src="/favicon.png" alt="JENVU" className="h-7 w-7 shrink-0 rounded-md object-contain" />
            {!sidebarCollapsed && (
              <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: '"Google Sans", "Product Sans", "DM Sans", system-ui, sans-serif', fontWeight: 500 }}>Jenvu</span>
            )}
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}

        <nav className="sidebar-hover-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-white px-2 py-2">

          {[...NAV_GROUPS].map((group, gi) => (
            <div key={group.label} className={gi > 0 ? "mt-2 pt-3 border-t border-zinc-200" : ""}>
              {!sidebarCollapsed && group.label && (
                <div className="mb-1.5 px-2.5 text-[10px] font-normal tracking-wider text-[#9B9C9B]">
                  {group.label}
                </div>
              )}
              {sidebarCollapsed && gi > 0 && <div className="mx-3 mb-1 h-px bg-zinc-100" />}
              <div className="flex flex-col gap-1.5">
                {group.items.map((t) => {
                  const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
                  const iconName = t.icon;
                  const count = t.countKey ? (newCounts as Record<string, number>)[t.countKey] : undefined;
                  const isNotifs = t.to === "/dashboard/notifications";
                  const hasUnread = isNotifs && unreadNotifs > 0 && !active;
                  return (
                    <Link
                      key={t.to}
                      to={t.to as "/dashboard"}
                      resetScroll={false}
                      onClick={() => { markTabSeen(t.countKey); setMobileNavOpen(false); }}
                      title={sidebarCollapsed ? t.label : undefined}
                      className={`group relative flex items-center rounded-full text-[12.5px] font-medium transition
                        ${sidebarCollapsed ? "justify-center px-2 py-1.5" : "gap-3 px-2.5 py-1.5"}
                        ${active
                          ? "bg-[#EBEBEB] text-zinc-900 font-semibold"
                          : "text-[#5E5E5E] hover:bg-zinc-50 hover:text-zinc-900"}`}
                    >
                      <span
                        className="material-symbols-rounded shrink-0"
                        aria-hidden
                        style={{
                          fontSize: 21,
                          lineHeight: 1,
                          color: active ? "#18181b" : "#5E5E5E",
                          fontVariationSettings: `'FILL' 0, 'wght' 350, 'GRAD' 0, 'opsz' 24`,
                        }}
                      >
                        {iconName}
                      </span>
                      {!sidebarCollapsed && <span className="truncate">{t.label}</span>}
                      {!sidebarCollapsed && typeof count === "number" && count > 0 && !active && (
                        <span className="ml-auto inline-flex shrink-0 items-center justify-center rounded-full bg-rose-600 text-white ring-2 ring-white" style={{ height: 16, paddingLeft: 6, paddingRight: 6, fontSize: 9, fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, letterSpacing: 0.3 }}>
                          New
                        </span>
                      )}
                      {!sidebarCollapsed && hasUnread && (
                        <span className="ml-auto inline-flex shrink-0 items-center justify-center rounded-full bg-rose-600 text-white ring-2 ring-white" style={{ height: 16, paddingLeft: 6, paddingRight: 6, fontSize: 9, fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, letterSpacing: 0.3 }}>
                          New
                        </span>
                      )}
                      {sidebarCollapsed && ((typeof count === "number" && count > 0 && !active) || hasUnread) && (
                        <span className="absolute -right-1 -top-1 inline-flex items-center justify-center rounded-full bg-rose-600 text-white" style={{ height: 14, paddingLeft: 5, paddingRight: 5, fontSize: 8, fontWeight: 700, letterSpacing: 0.3 }}>
                          New
                        </span>
                      )}


                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>



        {/* Quick actions: Sign out (left, icon) + Collapse (right) */}
        <div className={`mt-auto shrink-0 flex items-center border-t border-zinc-200 bg-white py-2 ${sidebarCollapsed ? "justify-center px-2" : "justify-between pl-3 pr-2"}`}>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-900 hover:bg-red-50 hover:text-red-600"
            >
              <Power className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? "Expand" : "Collapse"}
              aria-label={sidebarCollapsed ? "Expand" : "Collapse"}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {sidebarCollapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>




      </aside>
      )}


      {/* Right column */}
      <div className={`dashboard-right-col flex min-w-0 flex-1 flex-col bg-[#FAFAFA] ${embedMode ? "" : sidebarCollapsed ? "collapsed lg:pl-[60px]" : "lg:pl-[200px]"}`}>

      {/* Mobile menu toggle (floating) */}
      {!embedMode && (
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setMobileNavOpen(true)}
        className="fixed top-3 right-3 z-30 inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-700 shadow-sm hover:bg-zinc-50 md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>
      )}



      <main className="mx-auto w-full max-w-7xl flex-1 bg-[#FAFAFA] px-5 pt-14 pb-7 sm:px-8 sm:pt-7">

        <VerificationBanner isAdmin={isAdminUser} />

        {pathname === "/dashboard" ? (
        <>
        {/* Identity row */}
        <div className="space-y-1" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 }}>
          <div className="text-[12px] text-zinc-500" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 }}>Account home</div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="pl-1 truncate text-[16px] tracking-tight text-zinc-900 sm:text-[30px]" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 }}>
              <span>{email || fullName}</span><span>'s Account</span>
            </h1>
            <div className="flex items-center gap-2">
              <div
                className="mr-4 hidden sm:flex items-center justify-center overflow-hidden rounded-full"
                title={fullName || email || "Profile"}
              >
                <img
                  src={avatarUrl || getDefaultAvatar(email || fullName || "anon")}
                  alt={fullName || email || "Account avatar"}
                  width={144}
                  height={144}
                  className="h-[48px] w-[48px] rounded-full object-cover [image-rendering:auto]"
                  loading="eager"
                  decoding="async"
                  onError={() => { writeCachedAvatar(null); setAvatarUrl(null); }}
                />
              </div>
          </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-zinc-500" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 }}>
              <span className="inline-flex items-center gap-2">
                <span>{greetingText}, {fullName || "Trader"}</span>
                <span className="hidden sm:inline text-zinc-300">·</span>
              </span>
              <Link
                to="/dashboard/billing"
                className="-ml-1.5 sm:ml-0 hidden sm:inline-flex flex-wrap items-center gap-1"

                title="AI models powering your signals"
              >
                <span className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-1.5 py-1 leading-none">
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-label="OpenAI" className="shrink-0" fill="#000"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>
                  <span className="text-[11px] font-medium leading-none text-zinc-800">OpenAI</span>
                  {showDeepSeek && (
                    <>
                      <span className="leading-none text-zinc-300">·</span>
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-label="DeepSeek" className="shrink-0" fill="#4D6BFE"><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 0 1-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 0 0-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 0 1-.465.137 9.597 9.597 0 0 0-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 0 0 1.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.322.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 0 1 1.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 0 1 .415-.287.302.302 0 0 1 .2.288.306.306 0 0 1-.31.307.303.303 0 0 1-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 0 1-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 0 1 .016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 0 1-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"/></svg>
                      <span className="text-[11px] font-medium leading-none text-zinc-800">DeepSeek</span>
                      <span className="leading-none text-zinc-300">·</span>
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-label="Google" className="shrink-0"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                      <span className="text-[11px] font-medium leading-none text-zinc-800">Google</span>
                    </>
                  )}
                </span>


              </Link>
            </div>
        </div>

        {/* Analytics header */}
        <div className="-mt-2 flex items-center justify-end">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh analytics"
              title="Refresh analytics"
              className="group grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md border border-zinc-200 bg-white p-0 leading-none text-zinc-600 transition-all duration-150 hover:bg-zinc-50 active:scale-90 active:bg-zinc-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-zinc-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 transition-transform ${refreshing ? "animate-spin" : "group-hover:rotate-45"}`} />
            </button>
            <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300">
              <Calendar className="h-3.5 w-3.5" /> {RANGE_LABELS[range]}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
                <DropdownMenuCheckboxItem
                  key={k}
                  checked={range === k}
                  onCheckedChange={() => setRange(k)}
                  className="text-[12px] md:text-[14px]"
                >
                  {RANGE_LABELS[k]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 1 — three analytics cards each with 2 metrics + sparkline */}
        <section className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader icon={ShieldCheck} title="Wallet & Plan" />
            <div className="flex divide-x divide-zinc-200">
              <Metric
                label={`Balance · ${planTier}`}
                value={credits.isLoading ? "…" : `$${Number(credits.balance || 0).toFixed(2)}`}
                delta={credits.allowance ? `${remainingPct}%` : null}
                tone={balanceTone}
                trend={scansTrend}
                seed={3}
              />
              <Metric
                label="Monthly wallet"
                value={credits.isLoading ? "…" : `$${Number(credits.allowance || 0).toFixed(2)}`}
                delta={null}
                tone="zinc"
                seed={5}
              />
            </div>
          </Card>

          <Card>
            <CardHeader icon={Gauge} title="Performance" />
            <div className="flex divide-x divide-zinc-200">
              <Metric
                label="Win rate"
                value={liveWinRate != null ? `${liveWinRate}%` : "0.0%"}
                delta={null}
                trend={liveWinRate == null ? "flat" : liveWinRate >= 50 ? "up" : "down"}
                magnitude={liveWinRate != null ? Math.min(60, Math.abs(liveWinRate - 50) + 20) : 0}
                seed={7}
              />
              <Metric
                label="Journal entries"
                value={counts.journalTotal}
                delta={null}
                tone="zinc"
                seed={11}
              />
            </div>
          </Card>

          <Card>
            <CardHeader icon={Activity} title="Activity" />
            <div className="flex divide-x divide-zinc-200">
              <Metric
                label="Saved A+ setups"
                value={counts.saved}
                delta={null}
                tone="blue"
                seed={13}
              />
              <Metric
                label={`Alerts · ${range}`}
                value={counts.alerts7d}
                delta={null}
                tone="blue"
                seed={17}
              />
            </div>
          </Card>
        </section>

        {/* Row 2 — Market Pulse + two CTA cards */}
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="flex flex-col">
            <CardHeader
              icon={LineChart}
              title="Market Pulse"
              right={
                <Link to="/signal" className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-900">
                  <span>12</span> <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="flex-1 overflow-y-auto scrollbar-auto-hide">
              <TickerRow label="XAU / USD" symbol="XAUUSD" decimals={2} />
              <TickerRow label="DXY" symbol="DXY" decimals={3} />
              <TickerRow label="US10Y" symbol="US10Y" decimals={3} />
              <TickerRow label="XAG / USD" symbol="XAGUSD" decimals={3} />
              <TickerRow label="EUR / USD" symbol="EURUSD" decimals={4} />
              <TickerRow label="USD / JPY" symbol="USDJPY" decimals={3} />
              <TickerRow label="S&P 500" symbol="SPX" decimals={2} />
              
            </div>
          </Card>



          <Card className="flex flex-col">
            <CardHeader
              icon={Gauge}
              title="Best Time to Trade"
              right={
                <Link to="/signal" className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900">
                  Open desk <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <BestTimeWidget />
          </Card>


          <Card className="flex flex-col">
            <CardHeader
              icon={Activity}
              title="Signal Desk"
              right={
                <Link to="/signal" className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900">
                  Open desk <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <SignalDeskHistory />
          </Card>
        </section>

        {/* Row 3 — Quick Actions + Pro Tip + Referral */}
        <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="hover-lift flex flex-col">
            <CardHeader icon={LayoutGrid} title="Quick Actions" />
            <QuickActions />
          </Card>

          <Card className="hover-lift flex flex-col">
            <CardHeader icon={Lightbulb} title="Pro Tip" />
            <DailyTip />
          </Card>

          <Card className="hover-lift flex flex-col">
            <CardHeader
              icon={Gift}
              title="Invite & Earn"
              right={
                <Link to="/dashboard/referrals" className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900">
                  Manage <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <ReferralSnapshot />
          </Card>
        </section>


        <div className="h-12" />
        </>

        ) : verificationLocked ? (
          <VerificationLocked />
        ) : (
          <Outlet />
        )}

        </main>
        
       </div>

      
    </div>
  );
}



// Real ICT/SMC Killzones — times in UTC (converted from NY EST reference).
// Standard institutional trading windows used by prop firms & smart-money traders.
type Killzone = { name: string; tag: string; startUtc: number; endUtc: number; quality: "best" | "good" | "ok" | "avoid" };
const KILLZONES: Killzone[] = [
  { name: "Asian Range",      tag: "Accumulation",     startUtc: 0,     endUtc: 5,     quality: "avoid" }, // 19:00-00:00 EST
  { name: "London Killzone",  tag: "London Open sweep", startUtc: 7,    endUtc: 10,    quality: "good"  }, // 02:00-05:00 EST
  { name: "NY AM Killzone",   tag: "A+ ICT setups",    startUtc: 12,    endUtc: 15,    quality: "best"  }, // 07:00-10:00 EST
  { name: "London Close",     tag: "Reversal window",  startUtc: 15,    endUtc: 17,    quality: "ok"    }, // 10:00-12:00 EST
  
];


function fmtCountdown(ms: number) {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtLocal(utcHour: number) {
  const d = new Date();
  d.setUTCHours(Math.floor(utcHour), Math.round((utcHour % 1) * 60), 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function BestTimeWidget() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const nowUtcHours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;

  const withState = KILLZONES.map((k) => {
    const active = nowUtcHours >= k.startUtc && nowUtcHours < k.endUtc;
    const progress = active ? ((nowUtcHours - k.startUtc) / (k.endUtc - k.startUtc)) * 100 : 0;
    // ms until this session starts (next 24h)
    let startMs = (k.startUtc - nowUtcHours) * 3600 * 1000;
    if (startMs < 0) startMs += 24 * 3600 * 1000;
    return { ...k, active, progress, startMs };
  });

  const activeZone = withState.find((z) => z.active);
  const nextZone = withState.filter((z) => !z.active).sort((a, b) => a.startMs - b.startMs)[0];

  const toneMap: Record<Killzone["quality"], { dot: string; text: string; bar: string; pill: string }> = {
    best:  { dot: "bg-emerald-500", text: "text-emerald-700", bar: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    good:  { dot: "bg-sky-500",     text: "text-sky-700",     bar: "bg-sky-500",     pill: "bg-sky-50 text-sky-700 border-sky-200" },
    ok:    { dot: "bg-amber-500",   text: "text-amber-700",   bar: "bg-amber-500",   pill: "bg-amber-50 text-amber-700 border-amber-200" },
    avoid: { dot: "bg-zinc-400",    text: "text-zinc-600",    bar: "bg-zinc-400",    pill: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  };

  return (
    <div className="flex flex-1 flex-col gap-3 px-5 py-5">


      {/* Sessions list */}
      <div className="flex flex-col gap-1.5">

        {withState.map((z) => (
          <div
            key={z.name}
            className={`flex items-center justify-between rounded-md border px-3 py-2 ${z.active ? "border-zinc-300 bg-zinc-50" : "border-zinc-200 bg-white"}`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneMap[z.quality].dot}`} />
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-zinc-900">{z.name}</div>
                <div className="text-[10.5px] text-zinc-500">{fmtLocal(z.startUtc)} – {fmtLocal(z.endUtc)}</div>
              </div>
            </div>
            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${toneMap[z.quality].pill}`}>
              {z.active ? "Live" : fmtCountdown(z.startMs)}
            </span>
          </div>
        ))}
      </div>

    </div>

  );
}

function VoiceAgentHistory() {
  const [items, setItems] = useState<VoiceTurn[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    const refresh = async () => {
      const local = getVoiceHistory();
      try {
        const { listVoiceTurns } = await import("@/lib/voice-history.functions");
        const remote = await listVoiceTurns();
        if (cancelled) return;
        const seen = new Set<string>();
        const merged: VoiceTurn[] = [];
        for (const t of [...remote, ...local]) {
          const key = `${t.ts}|${t.query}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({ query: t.query, reply: t.reply, ts: t.ts });
        }
        merged.sort((a, b) => b.ts - a.ts);
        setItems(merged);
      } catch {
        if (!cancelled) setItems(local);
      }
    };
    refresh();
    const onEvt = () => refresh();
    const onStorage = (e: StorageEvent) => { if (e.key === "jenvu:voice:history") refresh(); };
    window.addEventListener("jenvu:voice:history:updated", onEvt as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("jenvu:voice:history:updated", onEvt as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!mounted) {
    return <div className="flex-1 px-5 py-6 text-[12px] text-zinc-400">Loading…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-100">
          <Mic className="h-5 w-5 text-zinc-700" />
        </div>
        <h3 className="mt-3 text-[14px] font-semibold text-zinc-900">No conversations yet</h3>
        <p className="mt-1 max-w-[260px] text-[12px] text-zinc-500">
          Your voice chats with Jenvu will appear here with timestamps.
        </p>
        <Link to="/app" className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-800 hover:bg-zinc-50">
          Start talking
        </Link>
      </div>
    );
  }

  const visible = items.slice(0, 6);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
          {items.length} {items.length === 1 ? "chat" : "chats"}
        </span>
        <button
          onClick={async () => {
            if (!confirm("Clear all voice history?")) return;
            clearVoiceHistory();
            try {
              const { clearVoiceTurns } = await import("@/lib/voice-history.functions");
              await clearVoiceTurns();
            } catch { /* ignore */ }
            window.dispatchEvent(new CustomEvent("jenvu:voice:history:updated"));
          }}
          className="text-[11px] text-zinc-500 hover:text-zinc-900"
        >
          Clear
        </button>
      </div>
      <ul className="flex-1 divide-y divide-zinc-100 overflow-y-auto scrollbar-auto-hide max-h-[360px]">
        {visible.map((t, i) => (
          <li key={t.ts + ":" + i} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-1 text-[13px] font-medium text-zinc-900">{t.query}</p>
              <span className="shrink-0 text-[10px] text-zinc-400" title={formatDateTime(t.ts)}>
                {formatRelative(t.ts)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] text-zinc-500">{t.reply}</p>
            <p className="mt-1 text-[10px] text-zinc-400">{formatDateTime(t.ts)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickActions() {
  const actions: { label: string; to: string; icon: typeof Activity; tone: string }[] = [
    { label: "New Scan",   to: "/signal",                 icon: Activity,    tone: "bg-blue-50 text-blue-700 border-blue-100" },
    { label: "Journal",    to: "/dashboard/journal",       icon: BookOpen,    tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    { label: "Killzones",  to: "/killzones",              icon: Calendar,    tone: "bg-amber-50 text-amber-700 border-amber-100" },
    { label: "Insights",   to: "/insights",               icon: LineChart,   tone: "bg-violet-50 text-violet-700 border-violet-100" },
    { label: "Saved",      to: "/dashboard/workspace",    icon: Bookmark,    tone: "bg-rose-50 text-rose-700 border-rose-100" },
    { label: "Billing",    to: "/dashboard/billing",      icon: CreditCard,  tone: "bg-zinc-50 text-zinc-700 border-zinc-200" },
  ];
  return (
    <div className="grid flex-1 grid-cols-3 gap-2 px-5 py-5">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.to}
            to={a.to as "/signal"}
            className="group flex flex-col items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-3 text-center transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${a.tone}`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-[11.5px] font-medium text-zinc-800">{a.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

const PRO_TIPS: { title: string; body: string }[] = [
  { title: "Trade the killzone, not the clock", body: "London and New York opens carry the deepest liquidity — most A+ setups print inside those windows." },
  { title: "Confirm with structure", body: "A signal without a break of structure or clear liquidity sweep is just a guess. Wait for the tell." },
  { title: "Risk fixed, not felt", body: "Size every trade off a fixed % of equity. Emotion-scaled positions blow accounts faster than bad setups do." },
  { title: "One pair, one plan", body: "Master XAUUSD's rhythm before spreading focus. Depth beats breadth for consistent execution." },
  { title: "Journal every scan", body: "The scans you skipped teach as much as the ones you took. Write both — patterns emerge fast." },
  { title: "Respect the DXY", body: "Gold's cleanest moves start when the dollar shows its hand. Check DXY before pulling the trigger." },
  { title: "Skip low-conviction days", body: "No setup is a setup. Cash is a position when the tape is choppy." },
];

function DailyTip() {
  const tip = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    return PRO_TIPS[day % PRO_TIPS.length];
  }, []);
  return (
    <div className="flex flex-1 flex-col gap-2 px-5 py-5">



      <h4 className="pl-1 mt-1 text-[14px] font-semibold text-zinc-900">{tip.title}</h4>
      <p className="text-[12px] leading-relaxed text-zinc-600">{tip.body}</p>
      <div className="mt-auto pt-3">
        <Link to="/insights" className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-700 hover:text-zinc-900">
          Read more insights <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function ReferralSnapshot() {
  const [code, setCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [count, setCount] = useState<number>(0);
  const [earned, setEarned] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const { getReferralInfo } = await import("@/lib/referrals.functions");
        const info = await getReferralInfo();
        if (cancelled) return;
        setCode(info.code);
        setShareUrl(info.shareUrl);
        setCount(info.totals.converted + info.totals.pending);
        setEarned(info.totals.credits_earned);
      } catch { /* ignore */ }
    };
    refresh();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      channel = supabase
        .channel(`referrals-snapshot-${uid}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "referrals", filter: `referrer_id=eq.${uid}` }, () => { refresh(); })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);


  const link = shareUrl || (code && typeof window !== "undefined" ? `${window.location.origin}/auth?ref=${code}` : "");


  return (
    <div className="flex flex-1 flex-col gap-3 px-5 py-5" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400 }}>

      <div className="flex divide-x divide-zinc-200 rounded-md border border-zinc-200 bg-white">
        <div className="flex-1 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Referrals</div>
          <div className="text-[16px] font-semibold text-zinc-900">{count}</div>
        </div>
        <div className="flex-1 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-500">Earned</div>
          <div className="text-[16px] font-semibold text-emerald-700">${earned.toFixed(2)}</div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Your link</div>
        <div className="mt-1 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
          <span className="flex-1 truncate text-[11.5px] text-zinc-700">{link || "Generating…"}</span>
          <button
            type="button"
            disabled={!link}
            onClick={() => {
              if (!link) return;
              navigator.clipboard.writeText(link).then(() => {
                setCopied(true);
                toast.success("Referral link copied");
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <p className="mt-auto whitespace-nowrap text-[10.5px] text-zinc-500">
        Earn <span className="font-medium text-zinc-700">$5.00</span> for you and your friend on their first paid scan.
      </p>

    </div>
  );
}


