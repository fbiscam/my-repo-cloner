import { Copy, TrendingUp, TrendingDown, Pause } from "lucide-react";
import { useState } from "react";
import type { GoldSignal } from "@/lib/gold-analysis.functions";
import { cn } from "@/lib/utils";

export function SignalCard({ signal }: { signal: GoldSignal }) {
  const [copied, setCopied] = useState(false);
  const isBuy = signal.direction === "BUY";
  const isSell = signal.direction === "SELL";

  const text = `GOLD XAU/USD ${signal.direction} | ${signal.timeframe.toUpperCase()}
Entry: ${signal.entry}
SL: ${signal.stopLoss}
TP: ${signal.takeProfits.join(" / ")}
R:R ${signal.riskReward} | Confidence ${signal.confidence}%
Bias: ${signal.bias} | Killzone: ${signal.killzone}`;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border border-[color:var(--gold)]/25 bg-[#0a0d1f]/80 backdrop-blur p-4 shadow-[0_0_30px_-10px_rgba(212,175,55,0.4)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-bold tracking-wider",
              isBuy && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
              isSell && "bg-red-500/20 text-red-400 border border-red-500/40",
              !isBuy && !isSell && "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
            )}
          >
            {isBuy ? <TrendingUp className="h-3 w-3" /> : isSell ? <TrendingDown className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {signal.direction}
          </span>
          <span className="text-xs font-mono text-[color:var(--gold)]/70">
            XAU/USD · {signal.timeframe.toUpperCase()} · ${signal.currentPrice.toFixed(2)}
          </span>
        </div>
        <button
          onClick={copy}
          className="text-xs flex items-center gap-1 text-[color:var(--cyan)] hover:text-[color:var(--gold)]"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
        <div className="rounded border border-[color:var(--gold)]/15 bg-black/30 p-2">
          <div className="text-[10px] uppercase text-[color:var(--gold)]/60 tracking-wider">Entry</div>
          <div className="font-mono text-[color:var(--gold)] font-semibold">{signal.entry}</div>
        </div>
        <div className="rounded border border-red-500/20 bg-black/30 p-2">
          <div className="text-[10px] uppercase text-red-400/70 tracking-wider">Stop Loss</div>
          <div className="font-mono text-red-300 font-semibold">{signal.stopLoss}</div>
        </div>
        <div className="rounded border border-emerald-500/20 bg-black/30 p-2">
          <div className="text-[10px] uppercase text-emerald-400/70 tracking-wider">R:R</div>
          <div className="font-mono text-emerald-300 font-semibold">{signal.riskReward}</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-[10px] uppercase text-[color:var(--gold)]/60 tracking-wider mb-1">Take Profits</div>
        <div className="flex gap-2 flex-wrap">
          {signal.takeProfits.map((tp, i) => (
            <span key={i} className="font-mono text-xs rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2 py-1">
              TP{i + 1} {tp}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <div className="text-xs text-[color:var(--gold)]/70">Confidence</div>
        <div className="flex-1 h-2 rounded bg-black/40 overflow-hidden border border-[color:var(--gold)]/20">
          <div
            className="h-full bg-gradient-to-r from-[color:var(--cyan)] to-[color:var(--gold)]"
            style={{ width: `${Math.min(100, signal.confidence)}%` }}
          />
        </div>
        <div className="text-xs font-mono text-[color:var(--gold)]">{signal.confidence}%</div>
      </div>

      <div className="space-y-2 text-sm">
        <Row label="Bias" value={signal.bias} />
        <Row label="Killzone" value={signal.killzone} />
        <Row label="Structure" value={signal.marketStructure} />
      </div>

      <div className="mt-3 space-y-2 text-xs leading-relaxed text-[color:var(--gold)]/85">
        <p><span className="text-[color:var(--cyan)] font-semibold">ICT:</span> {signal.ictAnalysis}</p>
        <p><span className="text-[color:var(--cyan)] font-semibold">SMC:</span> {signal.smcAnalysis}</p>
        <p className="text-[color:var(--gold)]/70 italic">{signal.fullAnalysis}</p>
      </div>

      {signal.confluences.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase text-[color:var(--gold)]/60 tracking-wider mb-1">Confluences</div>
          <div className="flex flex-wrap gap-1">
            {signal.confluences.map((c, i) => (
              <span key={i} className="text-[10px] rounded-full border border-[color:var(--cyan)]/30 bg-[color:var(--cyan)]/5 text-[color:var(--cyan)] px-2 py-0.5">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[color:var(--gold)]/60 uppercase tracking-wider">{label}</span>
      <span className="text-[color:var(--gold)] font-mono">{value}</span>
    </div>
  );
}
