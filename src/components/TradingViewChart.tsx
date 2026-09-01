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
  studies = ["STD;EMA", "STD;RSI", "STD;Volume"],
}: Props) {
  const params = new URLSearchParams({
    symbol: toTvSymbol(symbol),
    interval: TF_MAP[timeframe] ?? "15",
    timezone: "Etc/UTC",
    theme,
    style: "1",
    locale: "en",
    hide_top_toolbar: "1",
    hide_legend: "1",
    hide_side_toolbar: "1",
    hide_volume: "1",
    allow_symbol_change: "0",
    save_image: "0",
    withdateranges: "0",
    details: "0",
    calendar: "0",
    studies: JSON.stringify(studies),
  });

  return (
    <iframe
      className="h-full w-full border-0"
      src={`https://s.tradingview.com/widgetembed/?${params.toString()}`}
      title="Live XAU/USD price chart"
      loading="lazy"
      allowFullScreen
    />
  );
}
