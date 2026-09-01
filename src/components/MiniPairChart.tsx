import { useEffect, useRef } from "react";

const XAU_TV_MAP: Record<string, string> = {
  XAUUSD: "OANDA:XAUUSD",
};

function toTv(raw?: string): string {
  if (!raw) return "OANDA:XAUUSD";
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return XAU_TV_MAP[s] ?? "OANDA:XAUUSD";
}

/**
 * Lightweight TradingView mini-symbol-overview. Used inline inside alert
 * rows as a compact price sparkline preview.
 */
export function MiniPairChart({
  symbol,
  height = 120,
}: {
  symbol?: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    const holder = document.createElement("div");
    holder.className = "tradingview-widget-container__widget";
    holder.style.height = "100%";
    holder.style.width = "100%";
    ref.current.appendChild(holder);

    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    s.async = true;
    s.type = "text/javascript";
    s.innerHTML = JSON.stringify({
      symbol: toTv(symbol),
      width: "100%",
      height: "100%",
      locale: "en",
      dateRange: "1D",
      colorTheme: "light",
      isTransparent: true,
      autosize: true,
      largeChartUrl: "",
      trendLineColor: "rgba(24,24,27,1)",
      underLineColor: "rgba(24,24,27,0.06)",
      underLineBottomColor: "rgba(24,24,27,0)",
      noTimeScale: true,
      chartOnly: true,
    });
    ref.current.appendChild(s);
  }, [symbol]);

  return (
    <div
      className="tradingview-widget-container w-full overflow-hidden rounded-md border border-zinc-100 bg-white"
      style={{ height }}
      ref={ref}
    />
  );
}
