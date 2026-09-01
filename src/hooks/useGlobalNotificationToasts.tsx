import { useEffect } from "react";
import { toast } from "sonner";
import { Bell, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { playAlertSound } from "@/lib/alert-sound";

function beep() {
  playAlertSound();
}

/**
 * Subscribes to the current user's `user_notifications` table via realtime and
 * fires an in-app toast + sound the moment a new notification is inserted —
 * anywhere inside the authenticated app.
 *
 * Uses `toast.custom` (not the default `action` prop) so the "View alert"
 * button renders INSIDE the notification card in a stacked layout. The
 * default Sonner action button sits in a horizontal row and can visually
 * spill outside the card on narrow widths — this custom card keeps
 * everything contained.
 */
export function useGlobalNotificationToasts() {
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let mountedAt = Date.now();

    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;

      channel = supabase
        .channel(`global-notifs:${uid}:${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "user_notifications",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            const n = payload.new as {
              title?: string | null;
              body?: string | null;
              type?: string | null;
              created_at?: string | null;
            };
            // Skip notifications that pre-date the tab (e.g. backfills).
            if (n.created_at) {
              const ts = new Date(n.created_at).getTime();
              if (ts < mountedAt - 5_000) return;
            }
            beep();
            const title = n.title || "New notification";
            const body = n.body || "";
            const isSignal = n.type === "signal_alert";
            const href = isSignal ? "/dashboard/alerts" : "/dashboard/notifications";
            const Icon = isSignal ? TrendingUp : Bell;
            const accent = isSignal ? "text-emerald-600" : "text-zinc-900";
            const dot = isSignal ? "bg-emerald-500" : "bg-zinc-900";

            toast.custom(
              (t) => (
                <div className="w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]">
                  <div className="flex items-start gap-3 p-4">
                    <div className="relative shrink-0">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100">
                        <Icon className={`h-5 w-5 ${accent}`} />
                      </div>
                      <span
                        className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${dot}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-zinc-900">
                        {title}
                      </div>
                      {body && (
                        <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-zinc-600">
                          {body}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 border-t border-zinc-100 bg-zinc-50/60 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => toast.dismiss(t)}
                      className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        toast.dismiss(t);
                        window.location.href = href;
                      }}
                      className="rounded-lg bg-zinc-900 px-3 py-1 text-[12px] font-medium text-white transition hover:bg-zinc-800"
                    >
                      {isSignal ? "View alert" : "View"}
                    </button>
                  </div>
                </div>
              ),
              { duration: 6000 },
            );
          },
        )
        .subscribe();
      // Reset mountedAt after first subscription confirmation so we don't
      // miss the very first live insert.
      mountedAt = Date.now();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}
