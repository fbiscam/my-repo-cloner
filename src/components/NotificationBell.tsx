import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Crown,
  Coins,
  Mail,
  ShieldCheck,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/lib/notifications.functions";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    const tones = [880, 1175, 1568];
    tones.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.18);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0 + i * 0.12);
      o.stop(t0 + i * 0.12 + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}

type Visual = {
  Icon: React.ComponentType<{ className?: string }>;
  wrap: string;
  href: string;
  search?: Record<string, string>;
};

function visualFor(n: NotificationRow): Visual {
  const t = n.type;
  if (t === "signal_alert") {
    const isBuy = (n.data?.direction as string) === "BUY";
    const alertId = (n.data?.alert_id as string) || undefined;
    return {
      Icon: isBuy ? TrendingUp : TrendingDown,
      wrap: isBuy ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600",
      href: "/signal",
      search: alertId ? { alertId } : undefined,
    };
  }
  if (t === "welcome")
    return { Icon: Sparkles, wrap: "bg-violet-50 text-violet-600", href: "/dashboard" };
  if (t === "plan_upgrade" || t === "plan-upgrade")
    return { Icon: Crown, wrap: "bg-amber-50 text-amber-600", href: "/dashboard" };
  if (t === "credits_low" || t === "credits")
    return { Icon: Coins, wrap: "bg-orange-50 text-orange-600", href: "/dashboard" };
  if (t === "email" || t === "message")
    return { Icon: Mail, wrap: "bg-sky-50 text-sky-600", href: "/dashboard" };
  if (t === "security")
    return { Icon: ShieldCheck, wrap: "bg-emerald-50 text-emerald-600", href: "/dashboard/security" };
  return { Icon: Info, wrap: "bg-zinc-100 text-zinc-600", href: "/dashboard" };
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const listFn = useServerFn(listNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listFn();
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      /* silent */
    }
  }, [listFn]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Realtime: refresh on insert/update/delete of this user's notifications
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      channel = supabase
        .channel(`user_notifications:${uid}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_notifications",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              beep();
            }
            load();
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const onOpen = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      await load();
      if (unread > 0) {
        setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
        setUnread(0);
        try {
          await markAllFn();
        } catch {
          /* keep optimistic */
        }
      }
    }
  };

  const markOne = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await markFn({ data: { id } });
    } catch {
      /* keep optimistic */
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={onOpen}
        aria-label="Notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-zinc-700 transition-colors hover:bg-zinc-100/60"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-2 right-2 top-14 z-50 w-auto overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-[0_8px_28px_-8px_rgba(0,0,0,0.15)] sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-[320px]">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-zinc-900">Notifications</span>
              {unread > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-zinc-900 px-1 text-[10px] font-semibold text-white">
                  {unread}
                </span>
              )}
            </div>
            {items.length > 0 && (
              <Link
                to="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
              >
                View all
              </Link>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                  <Bell className="h-4 w-4" />
                </div>
                <p className="text-[12px] font-medium text-zinc-700">You're all caught up</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Signals, plan updates & alerts land here.
                </p>
              </div>
            ) : (
              items.slice(0, 4).map((n) => {
                const v = visualFor(n);
                const Icon = v.Icon;
                return (
                  <Link
                    key={n.id}
                    to={v.href}
                    search={v.search as never}
                    onClick={() => {
                      if (!n.read_at) markOne(n.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "group flex items-start gap-2.5 border-b border-zinc-50 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-zinc-50/70",
                      !n.read_at && "bg-blue-50/30",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        v.wrap,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[12.5px] font-semibold leading-tight text-zinc-900">
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[10px] leading-tight text-zinc-400">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {!n.read_at && (
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
                      />
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
