import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCredits } from "@/hooks/useCredits";
import { useCurrentPlan } from "@/hooks/useCurrentPlan";
import { useUpgradeLock } from "@/hooks/useUpgradeLock";
import { useTrial } from "@/hooks/useTrial";
import InvoiceHistory from "@/components/billing/InvoiceHistory";
import { Download } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import xaiLogo from "@/assets/xai-logo.png";

export const Route = createFileRoute("/_authenticated/dashboard/billing")({
  component: Billing,
});

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

function modelLogoUrl(rawModel: string | null | undefined): string | null {
  if (!rawModel) return null;
  const m = String(rawModel).toLowerCase();
  let domain: string | null = null;
  if (m.startsWith("rules-engine/ict-smc")) return null;
  if (m.includes("grok") || m.includes("xai")) return xaiLogo;
  if (m.includes("gpt") || m.includes("openai")) domain = "openai.com";
  else if (m.includes("gemini") || m.startsWith("google/")) domain = "gemini.google.com";
  else if (m.includes("deepseek")) domain = "deepseek.com";
  else if (m.includes("nvapi") || m.includes("nvidia")) domain = "nvidia.com";
  else if (m.includes("claude") || m.includes("anthropic")) domain = "anthropic.com";
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

function ModelWithLogo({ raw, label }: { raw: string | null; label: string }) {
  const parts = label.split(" + ");
  const raws = raw ? [raw, ...parts.slice(1).map((p) => p.toLowerCase())] : parts.map((p) => p.toLowerCase());
  return (
    <span className="inline-flex items-center gap-1.5">
      {parts.map((p, i) => {
        const url = modelLogoUrl(raws[i] ?? p);
        return (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-zinc-400">+</span>}
            {url ? (
              <img src={url} alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-sm object-contain" loading="lazy" />
            ) : null}
            <span>{p}</span>
          </span>
        );
      })}
    </span>
  );
}

function formatModelLabel(rawModel: string | null | undefined): string {
  if (!rawModel) return "—";
  const raw = String(rawModel);
  if (raw.includes(",")) {
    return raw.split(",").map((s) => formatModelLabel(s.trim())).filter(Boolean).join(" + ");
  }
  const m = raw.toLowerCase();
  if (m.startsWith("rules-engine/ict-smc")) return "ICT/SMC Rules Engine";
  const bare = m.replace(/^(dsofficial|bmind|openai|nvapi|google|anthropic)\//g, "").replace(/^orion\//, "").replace(/^deepseek-ai\//, "");
  if (bare.startsWith("claude-sonnet-4.5") || bare.startsWith("claude-4.5-sonnet")) return "Claude Sonnet 4.5";
  if (bare.startsWith("claude")) return "Claude";
  if (bare.startsWith("gpt-5.5-pro")) return "ChatGPT 5.5 Pro";
  if (bare.startsWith("gpt-5.5")) return "ChatGPT 5.5";
  if (bare.startsWith("gpt-5.4-pro")) return "ChatGPT 5.4 Pro";
  if (bare.startsWith("gpt-5.4-mini")) return "ChatGPT 5.4 Mini";
  if (bare.startsWith("gpt-5.4-nano")) return "ChatGPT 5.4 Nano";
  if (bare.startsWith("gpt-5.4")) return "ChatGPT 5.4";
  if (bare.startsWith("gpt-5.2")) return "ChatGPT 5.2";
  if (bare.startsWith("gpt-5-mini")) return "ChatGPT 5 Mini";
  if (bare.startsWith("gpt-5-nano")) return "ChatGPT 5 Nano";
  if (bare.startsWith("gpt-5")) return "ChatGPT 5";
  if (bare.startsWith("gpt-4o-mini")) return "ChatGPT 4o Mini";
  if (bare.startsWith("gpt-4o")) return "ChatGPT 4o";
  if (bare.startsWith("gpt-oss-120b")) return "GPT-OSS 120B";
  if (bare.startsWith("deepseek-v4-flash")) return "DeepSeek V4 Flash";
  if (bare.startsWith("deepseek-v4-pro") || bare.startsWith("deepseek-reasoner")) return "DeepSeek V4 Pro";
  if (bare.startsWith("deepseek-chat")) return "DeepSeek V3";

  if (bare.startsWith("gemini-3.1-pro")) return "Gemini 3.1 Pro";
  if (bare.startsWith("gemini-3.5-flash")) return "Gemini 3.5 Flash";
  if (bare.startsWith("gemini-3-flash")) return "Gemini 3 Flash";
  if (bare.startsWith("gemini-2.5-pro")) return "Gemini 2.5 Pro";
  if (bare.startsWith("gemini-2.5-flash-lite")) return "Gemini 2.5 Flash Lite";
  if (bare.startsWith("gemini-2.5-flash")) return "Gemini 2.5 Flash";
  return bare.replace(/^gpt-/, "GPT ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type BillingRow = {
  id: string;
  created_at: string;
  model: string | null;
  stage: string | null;
  reason: string;
  delta: number;
  promptTokens: number | null;
  completionTokens: number | null;
  scanId: string | null;
  metadata: Record<string, unknown> | null;
};

function Billing() {
  const currentPlan = useCurrentPlan();
  const upgradeLock = useUpgradeLock();
  const credits = useCredits();
  const trial = useTrial();

  const [showAllActivity, setShowAllActivity] = useState(false);

  // Always define hooks in the same order
  const allRows: BillingRow[] = useMemo(() => (credits.state?.recent ?? [])
    .filter((r) => r.delta < 0)
    .map((r) => ({
      id: r.id,
      created_at: r.created_at,
      model: r.model ?? null,
      stage: r.stage ?? null,
      reason: r.reason,
      delta: Number(r.delta),
      promptTokens: r.prompt_tokens ?? null,
      completionTokens: r.completion_tokens ?? null,
      scanId: (r.metadata?.scanId as string | undefined) ?? null,
      metadata: (r.metadata as Record<string, unknown> | undefined) ?? null,
    })), [credits.state?.recent]);

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  const last30DaysRows = useMemo(() => 
    allRows.filter(r => new Date(r.created_at) >= thirtyDaysAgo),
    [allRows, thirtyDaysAgo]
  );
  
  const olderRows = useMemo(() => 
    allRows.filter(r => new Date(r.created_at) < thirtyDaysAgo),
    [allRows, thirtyDaysAgo]
  );


  const handleDownloadOlder = () => {
    const doc = new jsPDF();
    doc.text("Billing History (Older than 30 days)", 14, 15);
    
    const tableData = olderRows.map(r => {
      const d = new Date(r.created_at);
      const meta = (r.metadata as any) ?? {};
      const rawModel = meta.actual_senior_model ?? meta.actual_model ?? r.model ?? meta.model ?? null;
      const modelLabel = rawModel ? formatModelLabel(rawModel) : "—";
      const side = (meta.signal ?? meta.side ?? "").toString().toUpperCase() || "—";
      const cost = Math.abs(r.delta).toFixed(4);
      
      return [
        d.toLocaleDateString(),
        modelLabel,
        side,
        r.scanId ? r.scanId.slice(0, 8) : "—",
        `$${cost}`
      ];
    });

    autoTable(doc, {
      startY: 20,
      head: [['Date', 'Model', 'Signal', 'Scan ID', 'Cost']],
      body: tableData,
    });

    doc.save(`billing_history_older_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Only show skeleton on the very first load
  const isLoading = currentPlan === null || (credits.isLoading && !credits.state);

  if (isLoading) {
    return (
      <div className="space-y-10">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
          <div className="h-10 w-32 animate-pulse rounded bg-zinc-100" />
          <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-zinc-100" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  const plan = currentPlan;
  const planLabel = trial.active ? "Pro plan $15" : plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "No plan";
  const remaining = credits.balance;
  const pctBase = Math.max(credits.balance, credits.allowance);
  const pct = pctBase > 0 ? Math.min(100, Math.round((remaining / pctBase) * 100)) : 0;
  const resetsAt = credits.state?.periodResetsAt ? new Date(credits.state.periodResetsAt) : null;

  const shown = showAllActivity ? last30DaysRows : last30DaysRows.slice(0, 12);

  return (
    <div className="space-y-10">
      {/* CURRENT PLAN */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mt-2 flex items-center gap-3">
              <h2 className="pl-1 mt-2 text-2xl font-semibold">&nbsp; {planLabel}</h2>
              {trial.active ? (
                <span className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-600">
                  Trial · {trial.daysLeft > 1 ? `${trial.daysLeft}d left` : trial.hoursLeft > 1 ? `${trial.hoursLeft}h left` : "ends today"}
                </span>
              ) : plan ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800">
                  Active
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800">
                  No plan
                </span>
              )}
            </div>

            <p className="mt-2 max-w-xl text-[12px] leading-snug sm:max-w-none sm:text-sm sm:leading-normal sm:whitespace-nowrap text-zinc-500">
              {trial.active
                ? `Your free Pro trial ends on ${trial.endsAtLabel}. Upgrade any time to keep Pro features after that date.`
                : plan
                  ? "Your plan renews automatically. Manage billing via the customer portal."
                  : "Choose a plan to activate your wallet and unlock signals."}
            </p>

          </div>
          {trial.active ? (
            <Link to="/dashboard/pay" className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">
              Upgrade to Pro
            </Link>
          ) : plan ? (
            <Link to="/dashboard/pay" className="rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
              Manage plan
            </Link>
          ) : (
            <Link to="/dashboard/pay" className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800">
              Choose plan
            </Link>
          )}
        </div>
      </section>

      {/* WALLET BALANCE */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8" style={{ fontFamily: '"Google Sans", "Product Sans", "Roboto", system-ui, sans-serif', fontWeight: 400, textTransform: "none", letterSpacing: "normal" }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mt-2 flex items-baseline gap-2 flex-nowrap whitespace-nowrap">
              <span className="text-3xl sm:text-4xl tabular-nums" style={{ fontWeight: 400 }}>${Number(remaining).toFixed(2)}</span>
              <span className="text-[11px] sm:text-sm text-zinc-500">/ ${Number(credits.allowance).toFixed(2)} · {plan.toUpperCase()}&nbsp;</span>
            </div>
            {resetsAt && (
              <p className="mt-1 text-xs text-zinc-500">Next billing date: {resetsAt.toLocaleDateString()}</p>
            )}
            <p className="mt-2 text-[12.5px] text-zinc-500">Flat $0.20 per real BUY/SELL signal, or $0.25 for premium confirmation scans. WAIT / no-trade scans are free.</p>
          </div>
          <Link to="/dashboard/pay" className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-normal text-zinc-900 hover:bg-zinc-50">
            Add funds
          </Link>
        </div>
        <div className="relative mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full bg-zinc-900 transition-all" style={{ width: `${pct}%` }} />
        </div>
        
        {last30DaysRows.length > 0 || olderRows.length > 0 ? (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-zinc-900">  Recent scans (last 30 days)</h4>
              {olderRows.length > 0 && (
                <button
                  onClick={handleDownloadOlder}
                  className="flex items-center gap-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download older history (PDF)
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full min-w-[640px] text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/60 text-left">
                    <th className={`${MONO} px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-medium`}>Model</th>
                    <th className={`${MONO} px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-medium`}>Grade</th>
                    <th className={`${MONO} px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-medium`}>Date</th>
                    <th className={`${MONO} px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-medium`}>Signal</th>
                    <th className={`${MONO} px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-medium`}>Scan</th>
                    <th className={`${MONO} px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500 font-medium text-right`}>Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {shown.map((r) => {
                    const d = new Date(r.created_at);
                    const userTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
                    const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: userTz });
                    const timeStr = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: userTz });
                    const amt = Math.abs(r.delta);
                    const meta = (r.metadata as any) ?? {};
                    const actualModel = (meta.actual_model as string | undefined) ?? null;
                    const actualSeniorModel = (meta.actual_senior_model as string | undefined) ?? null;
                    const rawModel = actualModel ?? r.model ?? (meta.model as string | undefined) ?? null;
                    
                    const seniorRaw = actualSeniorModel ?? (meta.senior_model as string | undefined) ?? null;
                    const seniorPrettyFromMeta = meta.senior_model_label as string | undefined;
                    const seniorPretty = actualSeniorModel
                      ? formatModelLabel(actualSeniorModel)
                      : (seniorPrettyFromMeta ?? (seniorRaw ? formatModelLabel(seniorRaw) : undefined));
                    const modelLabel = actualModel
                      ? formatModelLabel(actualModel)
                      : (meta.model_label ?? (rawModel ? formatModelLabel(rawModel) : (r.reason === "signal" ? "legacy (pre-USD billing)" : "—")));
                    
                    const displayRaw = actualSeniorModel ?? rawModel;
                    const displayLabel = actualSeniorModel ? (seniorPretty ?? formatModelLabel(actualSeniorModel)) : modelLabel;

                    const sideRaw = (meta.signal ?? meta.side ?? meta.direction ?? meta.action ?? "").toString().toUpperCase();
                    const sideLabel = sideRaw === "BUY" || sideRaw === "SELL" || sideRaw === "WAIT" ? sideRaw : "—";
                    const sideClass = sideLabel === "BUY"
                      ? "bg-emerald-100 text-emerald-700"
                      : sideLabel === "SELL"
                        ? "bg-rose-100 text-rose-700"
                        : sideLabel === "WAIT"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-zinc-100 text-zinc-500";
                    const gradeRaw = (meta.grade ?? meta.letter_grade ?? meta.rating ?? "").toString().toUpperCase();
                    const confRaw = meta.confidence ?? meta.confidence_score ?? meta.score;
                    const confNum = typeof confRaw === "number" ? confRaw : (confRaw ? Number(confRaw) : NaN);
                    const confPct = Number.isFinite(confNum) ? (confNum <= 1 ? Math.round(confNum * 100) : Math.round(confNum)) : null;
                    const gradeLabel = gradeRaw || (confPct !== null ? `${confPct}%` : "—");
                    const gradeClass = gradeRaw.startsWith("A")
                      ? "bg-emerald-100 text-emerald-700"
                      : gradeRaw.startsWith("B")
                        ? "bg-sky-100 text-sky-700"
                        : gradeRaw.startsWith("C")
                          ? "bg-amber-100 text-amber-700"
                          : gradeRaw
                            ? "bg-rose-100 text-rose-700"
                            : "bg-zinc-100 text-zinc-500";

                    return (
                      <tr key={r.id} className="hover:bg-zinc-50/60">
                        <td className={`${MONO} whitespace-nowrap px-3 py-2 text-[11px] font-medium text-zinc-900`}><ModelWithLogo raw={displayRaw} label={displayLabel} /></td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${gradeClass}`}>
                            {gradeLabel}
                          </span>
                        </td>
                        <td className={`${MONO} whitespace-nowrap px-3 py-2 text-[10px] tabular-nums text-zinc-500`}>{dateStr} · {timeStr}</td>
                        <td className={`${MONO} whitespace-nowrap px-3 py-2 text-[10px] tabular-nums`}><span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${sideClass}`}>{sideLabel}</span></td>
                        <td className={`${MONO} whitespace-nowrap px-3 py-2 text-[10px] text-zinc-500`}>{r.scanId ? r.scanId.slice(0, 8) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums font-semibold text-rose-600">−${amt.toFixed(4)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {last30DaysRows.length > 12 && (
              <div className="mt-3 flex justify-center">
                <button type="button" onClick={() => setShowAllActivity((v) => !v)}
                  className="text-xs font-medium text-zinc-700 hover:text-zinc-900">
                  {showAllActivity ? "Show less" : `Show more (${last30DaysRows.length - 12})`}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <InvoiceHistory />
    </div>
  );
}
