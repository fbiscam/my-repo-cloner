import { AlertTriangle, Clock } from "lucide-react";
import type { NewsEvent } from "@/lib/news.functions";
import { cn } from "@/lib/utils";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtCountdown(mins: number) {
  if (mins < 0) return "live";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function NewsPanel({ events }: { events: NewsEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-950/70 backdrop-blur p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white tracking-wide">
            High-Impact News (USD / Gold)
          </h3>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
          Next 36h
        </span>
      </div>
      <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {events.map((e, i) => {
          const soon = e.minutesUntil >= 0 && e.minutesUntil <= 15;
          const live = e.minutesUntil < 0 && e.minutesUntil > -30;
          return (
            <li
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2 transition",
                soon
                  ? "border-amber-500/40 bg-amber-500/10"
                  : live
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-white/5 bg-white/[0.02]",
              )}
            >
              <div
                className={cn(
                  "mt-1 h-2 w-2 rounded-full shrink-0",
                  e.impact === "High" ? "bg-red-500" : "bg-amber-400",
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-neutral-100 truncate">
                  {e.title}
                </div>
                <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
                  <span className="font-mono">{e.country}</span>
                  <span>·</span>
                  <span>{fmtTime(e.date)}</span>
                  {e.forecast && (
                    <>
                      <span>·</span>
                      <span>F: {e.forecast}</span>
                    </>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  "shrink-0 flex items-center gap-1 text-[11px] font-mono",
                  soon ? "text-amber-300" : live ? "text-red-300" : "text-neutral-500",
                )}
              >
                <Clock className="h-3 w-3" />
                {fmtCountdown(e.minutesUntil)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
