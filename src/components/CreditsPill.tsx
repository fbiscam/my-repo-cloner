import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

export default function CreditsPill() {
  const { state, balance, allowance, plan } = useCredits();
  if (!state) return null;

  const pct = allowance > 0 ? Math.min(100, Math.round((balance / allowance) * 100)) : 0;
  const low = balance <= Math.max(2, Math.floor(allowance * 0.1));

  return (
    <Link
      to="/dashboard/billing"
      className={`group inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs hover:border-zinc-400 transition-colors ${MONO}`}
      title={`Plan: ${plan?.name ?? "Free"} · Resets monthly`}
    >
      <Zap className={`h-3.5 w-3.5 ${low ? "text-amber-600" : "text-zinc-900"}`} fill={low ? "#d97706" : "none"} />
      <span className={`font-semibold tabular-nums ${low ? "text-amber-700" : "text-zinc-900"}`}>{balance}</span>
      <span className="text-zinc-400">/ {allowance}</span>
      <span className="hidden sm:inline-flex h-1 w-12 overflow-hidden rounded-full bg-zinc-100">
        <span className={`h-full ${low ? "bg-amber-500" : "bg-zinc-900"}`} style={{ width: `${pct}%` }} />
      </span>
    </Link>
  );
}
