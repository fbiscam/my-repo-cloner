import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type NotificationRow,
} from "@/lib/notifications.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Bell,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Crown,
  Coins,
  ShieldCheck,
  Info,
  Mail,
  Trash2,
  CheckCheck,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_authenticated/dashboard/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Jenvu" },
      { name: "description", content: "All your Jenvu notifications in one place." },
    ],
  }),
  component: NotificationsPage,
});

type FilterKey =
  | "all"
  | "unread"
  | "signals"
  | "plan"
  | "credits"
  | "security"
  | "other";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "signals", label: "Signals" },
  { key: "plan", label: "Plan" },
  { key: "credits", label: "Credits" },
  { key: "security", label: "Security" },
  { key: "other", label: "Other" },
];

function categoryOf(n: NotificationRow): Exclude<FilterKey, "all" | "unread"> {
  const t = n.type || "";
  if (t.startsWith("signal")) return "signals";
  if (t.includes("plan") || t === "founding_approved") return "plan";
  if (t === "credit" || t === "topup" || t.includes("referral")) return "credits";
  if (t === "security" || t === "device") return "security";
  return "other";
}

function iconFor(n: NotificationRow) {
  const cat = categoryOf(n);
  if (cat === "signals") {
    const dir = String(n.data?.direction ?? "").toUpperCase();
    if (dir === "BUY") return { Icon: TrendingUp, tone: "bg-emerald-50 text-emerald-600" };
    if (dir === "SELL") return { Icon: TrendingDown, tone: "bg-rose-50 text-rose-600" };
    return { Icon: Sparkles, tone: "bg-blue-50 text-blue-600" };
  }
  if (cat === "plan") return { Icon: Crown, tone: "bg-amber-50 text-amber-600" };
  if (cat === "credits") return { Icon: Coins, tone: "bg-emerald-50 text-emerald-600" };
  if (cat === "security") return { Icon: ShieldCheck, tone: "bg-zinc-100 text-zinc-700" };
  if (n.type === "message" || n.type === "email") return { Icon: Mail, tone: "bg-blue-50 text-blue-600" };
  return { Icon: Info, tone: "bg-zinc-100 text-zinc-600" };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function bucket(iso: string): "today" | "yesterday" | "earlier" {
  const now = new Date();
  const d = new Date(iso);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86400000;
  const t = d.getTime();
  if (t >= startToday) return "today";
  if (t >= startYesterday) return "yesterday";
  return "earlier";
}

function NotificationsPage() {
  const load = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const remove = useServerFn(deleteNotification);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  const refresh = async () => {
    const r = await load();
    setItems(r.items);
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const r = await load();
      if (cancel) return;
      setItems(r.items);
      setLoading(false);
      if (r.unread > 0) {
        markAll().catch(() => {});
        setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      }
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    let uid: string | null = null;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
      if (!uid) return;
      ch = supabase
        .channel(`notifs:${uid}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${uid}` },
          () => { refresh(); },
        )
        .subscribe();
    })();
    // Polling fallback (15s) + refresh on tab focus so new notifications
    // appear even if the realtime socket drops.
    const iv = window.setInterval(() => { refresh(); }, 15000);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    return () => {
      if (ch) supabase.removeChannel(ch);
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((n) => !n.read_at);
    return items.filter((n) => categoryOf(n) === filter);
  }, [items, filter]);

  const groups = useMemo(() => {
    const g: Record<"today" | "yesterday" | "earlier", NotificationRow[]> = {
      today: [], yesterday: [], earlier: [],
    };
    for (const n of filtered) g[bucket(n.created_at)].push(n);
    return g;
  }, [filtered]);

  const renderItem = (n: NotificationRow) => {
    const { Icon, tone } = iconFor(n);
    const unread = !n.read_at;
    const explicit = typeof n.data?.url === "string" ? n.data.url : undefined;
    const url = explicit ?? (n.type === "signal_alert" || categoryOf(n) === "signals" ? "/dashboard/alerts" : undefined);
    const inner = (
      <div className={cn(
        "group relative flex gap-3 rounded-2xl bg-white px-4 py-3.5 transition",
        unread
          ? "hover:bg-zinc-50"
          : "hover:bg-zinc-50",
      )}>
        {unread && <span className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-blue-500" aria-hidden />}
        <div className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tone)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={cn("truncate text-sm", unread ? "font-semibold text-zinc-900" : "font-medium text-zinc-800")}>
                {n.title}
              </div>
              {n.body && (
                <div className="mt-0.5 line-clamp-2 text-[13px] text-zinc-600">{n.body}</div>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-zinc-400">{timeAgo(n.created_at)}</span>
          </div>
        </div>
        <div className="-mt-1 flex items-start gap-1 self-start opacity-0 transition group-hover:opacity-100">
          {unread && (
            <button
              onClick={async (e) => {
                e.preventDefault(); e.stopPropagation();
                await markRead({ data: { id: n.id } });
                setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
              }}
              className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-emerald-600"
              title="Mark read"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={async (e) => {
              e.preventDefault(); e.stopPropagation();
              await remove({ data: { id: n.id } });
              setItems((prev) => prev.filter((x) => x.id !== n.id));
            }}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
    return url ? (
      <Link
        key={n.id}
        to={url as "/dashboard"}
        className="block"
        onClick={async () => {
          if (unread) {
            await markRead({ data: { id: n.id } });
            setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
          }
        }}
      >
        {inner}
      </Link>
    ) : (
      <div key={n.id}>{inner}</div>
    );
  };

  return (
    <div className="min-h-screen bg-white px-4 pb-8 sm:px-6">
      <div className="mx-auto max-w-3xl pt-6 sm:pt-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="pl-1 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {unreadCount > 0
                ? `You have ${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}.`
                : "You're all caught up."}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={async () => {
                await markAll();
                setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
                try {
                  const { data } = await supabase.auth.getUser();
                  if (data.user?.id) {
                    window.localStorage.setItem(`jenvu:notifs:last-seen:${data.user.id}`, new Date().toISOString());
                  }
                } catch {}
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
            </button>
          )}
        </header>

        {/* Filter pills */}
        <div className="mb-6 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === "all"
                ? items.length
                : f.key === "unread"
                  ? unreadCount
                  : items.filter((n) => categoryOf(n) === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm transition",
                  active
                    ? "bg-zinc-50 text-zinc-900"
                    : "bg-white text-zinc-600 hover:bg-zinc-50",
                )}
              >
                {f.label}
                {count > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 text-[10px]",
                    active ? "bg-white text-zinc-900" : "bg-zinc-100 text-zinc-500",
                  )}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl p-14 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
              <Bell className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium text-zinc-800">Nothing here</div>
            <div className="mt-1 text-xs text-zinc-500">
              {filter === "unread"
                ? "No unread notifications."
                : "New notifications will appear here."}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {(["today", "yesterday", "earlier"] as const).map((key) => {
              const list = groups[key];
              if (list.length === 0) return null;
              const label = key === "today" ? "Today" : key === "yesterday" ? "Yesterday" : "Earlier";
              return (
                <section key={key}>
                  <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                    {label}
                  </div>
                  <div className="space-y-2">{list.map(renderItem)}</div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
