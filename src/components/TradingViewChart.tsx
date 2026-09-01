import { useEffect, useRef } from "react";

const TF_MAP: Record<string, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "D",
};

type Props = {
  /** XAU pair symbol — XAUUSD only. */
  symbol?: string;
  /** Chart timeframe key (e.g. "15m"). */
  timeframe?: string;
  /** Light or dark theme. Default light to match the signal desk. */
  theme?: "light" | "dark";
  /** Studies to load on the chart. */
  studies?: string[];
};

const XAU_TV_MAP: Record<string, string> = {
  XAUUSD: "OANDA:XAUUSD",
};

/** Map an XAU pair → TradingView symbol. Falls back to XAU/USD. */
function toTvSymbol(raw?: string): string {
  if (!raw) return "OANDA:XAUUSD";
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return XAU_TV_MAP[s] ?? "OANDA:XAUUSD";
}


export function TradingViewChart({
  symbol,
  timeframe = "15m",
  theme = "light",
  studies = ["STD;Smart%1Money%1Concepts", "STD;EMA", "STD;RSI", "STD;Volume"],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    containerRef.current.appendChild(widget);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: toTvSymbol(symbol),
      interval: TF_MAP[timeframe] ?? "15",
      timezone: "Etc/UTC",
      theme,
      style: "1",
      locale: "en",
      backgroundColor: theme === "dark" ? "rgba(8, 10, 20, 1)" : "rgba(255,255,255,1)",
      gridColor: theme === "dark" ? "rgba(212, 175, 55, 0.06)" : "rgba(15,23,42,0.06)",
      hide_top_toolbar: true,
      hide_legend: true,
      hide_side_toolbar: true,
      hide_volume: true,
      allow_symbol_change: false,
      save_image: false,
      withdateranges: false,
      details: false,
      calendar: false,
      studies,
      support_host: "https://www.tradingview.com",
    });
    containerRef.current.appendChild(script);
  }, [symbol, timeframe, theme, studies.join("|")]);

  return (
    <div className="tradingview-widget-container h-full w-full" ref={containerRef} />
  );
}
