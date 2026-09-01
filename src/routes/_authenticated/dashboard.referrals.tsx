import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Share2, Gift, Users, Check, Sparkles, ArrowRight, Download } from "lucide-react";
import { getReferralInfo, applyReferralCode, type ReferralInfo } from "@/lib/referrals.functions";

export const Route = createFileRoute("/_authenticated/dashboard/referrals")({
  head: () => ({
    meta: [
      { title: "Referrals — Jenvu" },
      { name: "description", content: "Invite friends, earn bonus scans when they upgrade." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const fetchInfo = useServerFn(getReferralInfo);
  const applyCode = useServerFn(applyReferralCode);
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchInfo();
      setInfo(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load referrals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const copyLink = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.shareUrl);
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  const shareLink = async () => {
    if (!info) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Jenvu — precision gold trade signals",
          text: "Join me on Jenvu. Use my link to get $5 bonus wallet credit when you upgrade.",
          url: info.shareUrl,
        });
      } catch { /* user cancelled */ }
    } else {
      void copyLink();
    }
  };

  const submitCode = async () => {
    const c = codeInput.trim().toUpperCase();
    if (!c) return;
    setSubmitting(true);
    try {
      const res = await applyCode({ data: { code: c } });
      if (res.ok) {
        toast.success("Referral applied. You'll earn $5 bonus wallet credit when you upgrade to a paid plan.");
        setCodeInput("");
        await load();
      } else {
        const msgs: Record<string, string> = {
          invalid_code: "That code isn't valid.",
          self_referral: "You can't refer yourself.",
          already_referred: "A referral is already applied to this account.",
          duplicate_email: "Referrer's email matches yours — not allowed.",
        };
        toast.error(msgs[res.error ?? ""] ?? "Could not apply code");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !info) {
    return <div className="px-6 py-16 text-center text-sm text-zinc-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div>
        <h1 className="pl-1 text-2xl font-semibold text-zinc-900 tracking-tight">Refer & Earn</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Share your link. When a friend upgrades to Pro, Elite, or Ultra, you both get{" "}
          <span className="font-medium text-emerald-600">$5 bonus wallet credit</span> each.
        </p>
      </div>

      {/* Share card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Your referral link
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 min-w-0 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <input
              readOnly
              value={info.shareUrl}
              className="w-full min-w-max bg-transparent px-3 py-2.5 font-mono text-[13px] text-zinc-900 whitespace-nowrap focus:outline-none"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={shareLink}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>
        </div>
        <div className="mt-3 text-xs text-zinc-500">
          Your code: <span className="font-mono font-semibold text-zinc-800">{info.code}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Invites sent" value={info.totals.pending + info.totals.converted} />
        <StatCard icon={Check} label="Converted" value={info.totals.converted} accent="emerald" />
        <StatCard icon={Gift} label="Earned" value={info.totals.credits_earned} accent="emerald" />
      </div>

      {/* Redeem code (if not yet referred) */}
      {!info.incoming && (
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="pl-1 text-sm font-semibold text-zinc-900">&nbsp;Have a friend's code?</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Enter it before upgrading to earn $5 bonus wallet credit.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="ABC12345"
              maxLength={12}
              className="w-full min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm uppercase text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
            <button
              onClick={submitCode}
              disabled={submitting || codeInput.trim().length < 4}
              className="w-full shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
            >
              Apply
            </button>
          </div>

        </div>
      )}

      {info.incoming && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {info.incoming.status === "converted" ? (
            <>Referral bonus of {info.incoming.credits_awarded} scans applied. </>
          ) : (
            <>A referral is attached to your account. Upgrade to Pro, Elite, or Ultra to unlock your $5 bonus wallet credit.{" "}
              <Link to="/pricing" className="font-medium underline">See plans <ArrowRight className="inline h-3 w-3" /></Link>
            </>
          )}
        </div>
      )}

      {/* History table */}
      <ReferralHistory referrals={info.referrals} />
    </div>
  );
}

type FilterKey = "all" | "new" | "converted" | "upgraded";

function ReferralHistory({ referrals }: { referrals: ReferralInfo["referrals"] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = {
    all: referrals.length,
    new: referrals.filter((r) => r.status === "pending").length,
    converted: referrals.filter((r) => r.status === "converted").length,
    upgraded: referrals.filter((r) => r.status === "converted" && r.credits_awarded > 0).length,
  };

  const filtered = referrals.filter((r) => {
    if (filter === "all") return true;
    if (filter === "new") return r.status === "pending";
    if (filter === "converted") return r.status === "converted";
    if (filter === "upgraded") return r.status === "converted" && r.credits_awarded > 0;
    return true;
  });

  const FILTERS: { key: FilterKey; label: string; hint: string }[] = [
    { key: "all", label: "All", hint: "Every referral" },
    { key: "new", label: "New", hint: "Signed up, not upgraded" },
    { key: "converted", label: "Converted", hint: "Completed referral" },
    { key: "upgraded", label: "Upgraded", hint: "Paid plan — scans earned" },
  ];

  const exportCsv = () => {
    const header = ["Date", "Stage", "Upgraded on", "Earned (USD)"];
    const rows = filtered.map((r) => {
      const upgraded = r.status === "converted" && r.credits_awarded > 0;
      const stage = upgraded ? "Upgraded" : r.status === "converted" ? "Converted" : r.status === "void" ? "Void" : "New";
      return [
        new Date(r.created_at).toISOString().slice(0, 10),
        stage,
        r.converted_at ? new Date(r.converted_at).toISOString().slice(0, 10) : "",
        String(r.credits_awarded),
      ];
    });
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referrals-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Referral history</div>
          <div className="text-[11px] text-zinc-500">{FILTERS.find((f) => f.key === filter)?.hint}</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-1">
          <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:items-center">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition sm:gap-1.5 sm:px-2.5 sm:text-[12px] ${
                    active
                      ? "border border-zinc-900 bg-white text-zinc-900"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <span className="truncate">{f.label}</span>
                  <span
                    className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                      active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {counts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed sm:ml-1"
            title="Download current filter as CSV"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>


      {filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-zinc-500">
          {referrals.length === 0
            ? "No referrals yet. Share your link to get started."
            : "No referrals match this filter."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-sm">
            <thead className="bg-zinc-50 text-[11px] uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium whitespace-nowrap">Date</th>
                <th className="px-4 py-2 text-left font-medium whitespace-nowrap">Stage</th>
                <th className="px-4 py-2 text-left font-medium whitespace-nowrap">Upgraded on</th>
                <th className="px-4 py-2 text-right font-medium whitespace-nowrap">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((r) => {
                const upgraded = r.status === "converted" && r.credits_awarded > 0;
                const stageLabel = upgraded ? "Upgraded" : r.status === "converted" ? "Converted" : r.status === "void" ? "Void" : "New";
                const stageClass = upgraded
                  ? "bg-emerald-100 text-emerald-700"
                  : r.status === "converted"
                  ? "bg-sky-100 text-sky-700"
                  : r.status === "void"
                  ? "bg-zinc-100 text-zinc-500"
                  : "bg-amber-100 text-amber-700";
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 text-zinc-600 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stageClass}`}>
                        {stageLabel}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600 whitespace-nowrap">
                      {r.converted_at ? new Date(r.converted_at).toLocaleDateString() : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-zinc-900 whitespace-nowrap tabular-nums">{r.credits_awarded > 0 ? `$${Number(r.credits_awarded).toFixed(2)}` : <span className="text-zinc-300">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

  );
}


function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: number; accent?: "emerald" }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className={`text-2xl font-semibold tracking-tight ${accent === "emerald" ? "text-emerald-600" : "text-zinc-900"}`}>
          {value}
        </div>
      </div>
    </div>

  );
}
