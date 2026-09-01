import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getLiveTick } from "@/lib/gold-analysis.functions";

// XAU-only build: no Binance streams. All XAU pairs are polled via the
// server tick fetcher so the header stays in sync with the analysis feed.
function binanceStreamFor(_symbol: string): string | null {
  return null;
}



export type LiveTickHandler = (price: number, tMs: number) => void;

/**
 * Streaming live price hook.
 *  - Crypto: Binance trade WebSocket (sub-second ticks).
 *  - Forex / Metals / Indices / Stocks: fast polling (1s) of server `getLiveTick` as fallback.
 *  - Displays a smoothed price via requestAnimationFrame interpolation so the
 *    header updates look continuous rather than jumping every poll/tick.
 *
 * `onTick` fires with the raw (un-smoothed) market price — use it for TP/SL
 * checks, sparkline updates, and chart bar updates.
 */
export function useLivePriceStream(
  symbol: string | undefined,
  seedPrice: number | null,
  onTick?: LiveTickHandler,
  opts?: { intervalMs?: number },
) {
  const [price, setPrice] = useState<number | null>(seedPrice ?? null);
  const fetchTick = useServerFn(getLiveTick);
  const intervalMs = opts?.intervalMs ?? 1500;

  const targetRef = useRef<number | null>(seedPrice ?? null);
  const displayRef = useRef<number | null>(seedPrice ?? null);
  const onTickRef = useRef<LiveTickHandler | undefined>(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!symbol) return;
    let stopped = false;
    let ws: WebSocket | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let raf: number | null = null;

    // Reset refs on symbol change so first tick from the new market renders
    // immediately rather than being lerped from the previous symbol's price.
    targetRef.current = null;
    displayRef.current = null;

    const isHidden = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden";

    const pushTick = (p: number, tMs: number) => {
      if (!Number.isFinite(p)) return;
      const prev = displayRef.current;
      targetRef.current = p;
      if (prev == null || Math.abs(p - prev) / p > 0.0025) {
        displayRef.current = p;
        setPrice(p);
      }
      onTickRef.current?.(p, tMs);
    };

    const startPolling = (ms: number) => {
      if (pollId) return;
      const tick = async () => {
        if (isHidden()) return; // skip work when tab is backgrounded
        try {
          const t = await fetchTick({ data: { symbol } });
          if (stopped || !t) return;
          pushTick(t.price, typeof t.t === "number" ? t.t : Date.now());
        } catch { /* keep last */ }
      };
      void tick();
      pollId = setInterval(tick, ms);
    };

    const stream = binanceStreamFor(symbol);
    let firstTickTimer: ReturnType<typeof setTimeout> | null = null;
    if (stream && typeof WebSocket !== "undefined") {
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}@trade`);
        ws.onmessage = (ev) => {
          try {
            const d = JSON.parse(ev.data);
            const p = parseFloat(d.p);
            pushTick(p, typeof d.T === "number" ? d.T : Date.now());
            if (firstTickTimer) { clearTimeout(firstTickTimer); firstTickTimer = null; }
          } catch { /* ignore */ }
        };
        ws.onerror = () => { /* fall through to onclose */ };
        ws.onclose = () => { if (!stopped) startPolling(intervalMs); };
        firstTickTimer = setTimeout(() => { if (!stopped) startPolling(intervalMs); }, 4000);
      } catch {
        startPolling(intervalMs);
      }
    } else {
      startPolling(intervalMs);
    }

    // Re-fetch immediately when the tab becomes visible again so the price
    // isn't stale after a long backgrounding.
    const onVis = () => {
      if (stopped || isHidden()) return;
      void (async () => {
        try {
          const t = await fetchTick({ data: { symbol } });
          if (!stopped && t) pushTick(t.price, typeof t.t === "number" ? t.t : Date.now());
        } catch { /* ignore */ }
      })();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
    }

    // RAF smoother — pauses automatically when tab is hidden (browsers throttle
    // rAF to ~0), and we early-out when nothing changed.
    const loop = () => {
      if (stopped) return;
      const target = targetRef.current;
      const cur = displayRef.current;
      if (target != null && cur != null) {
        const diff = target - cur;
        if (Math.abs(diff) > Math.abs(target) * 1e-7) {
          const next = cur + diff * 0.5;
          const settled = Math.abs(target - next) < Math.abs(target) * 1e-6;
          displayRef.current = settled ? target : next;
          setPrice(displayRef.current);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      if (firstTickTimer) clearTimeout(firstTickTimer);
      if (ws) { try { ws.close(); } catch { /* ignore */ } }
      if (pollId) clearInterval(pollId);
      if (raf != null) cancelAnimationFrame(raf);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, intervalMs]);


  return price;
}

