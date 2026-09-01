import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPublicRecentSignals, type PublicSignalRow } from "@/lib/public-signals.functions";

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "up" | "down" | "muted" }) {
  const cls =
    tone === "up"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "down"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-zinc-50 text-zinc-700 border-zinc-200";
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

/**
 * Marquee-style ticker of recent broadcasted signals from the last 48h.
 * Read-only, sanitized (no entries/SL/TP), safe to render publicly.
 */
export function SignalTicker() {
  const fetchRecent = useServerFn(getPublicRecentSignals);
  const [rows, setRows] = useState<PublicSignalRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetchRecent();
        if (!alive) return;
        setRows(Array.isArray(res) ? res : []);
      } catch { /* ignore */ }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [fetchRecent]);

  if (loaded && rows.length === 0) return null;

  const displayRows = rows.length > 0 ? rows : Array.from({ length: 6 }).map((_, i) => ({
    pair: "XAUUSD", direction: i % 2 ? "long" : "short", grade: "B",
    confidence: 68, rr: 3.1, session: "London", killzone: "London KZ",
    fired_at: new Date(Date.now() - i * 3600_000).toISOString(),
  } as PublicSignalRow));

  const track = [...displayRows, ...displayRows];

  return (
    <section aria-label="Recent signals" className="relative border-y border-zinc-200 bg-white/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3 sm:px-6">
        <span className={`shrink-0 rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white ${MONO}`}>
          Live · 48h
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white to-transparent" />
          <div className="animate-ticker flex w-max gap-6 whitespace-nowrap">
            {track.map((r, i) => (
              <div key={`${r.pair}-${r.fired_at}-${i}`} className="flex items-center gap-2 text-xs">
                <span className={`${MONO} font-semibold text-zinc-900`}>{r.pair}</span>
                <Chip tone={r.direction === "long" ? "up" : "down"}>
                  {r.direction === "long" ? "BUY" : "SELL"}
                </Chip>
                {r.grade && <Chip tone="muted">{r.grade}</Chip>}
                {typeof r.confidence === "number" && (
                  <span className={`${MONO} text-zinc-600`}>{r.confidence}%</span>
                )}
                {typeof r.rr === "number" && (
                  <span className="text-zinc-500">R:R 1:{r.rr.toFixed(1)}</span>
                )}
                {r.killzone && <span className="text-zinc-400">· {r.killzone}</span>}
                <span className="text-zinc-400">· {timeAgo(r.fired_at)}</span>
                <span className="text-zinc-300">•</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default SignalTicker;
