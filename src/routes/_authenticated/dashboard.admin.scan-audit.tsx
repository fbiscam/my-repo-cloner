import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { isAdmin } from "@/lib/admin-messages.functions";
import {
  listChargeAudit,
  listChargeMismatches,
  type ChargeAuditRow,
  type MismatchRow,
} from "@/lib/admin-charge-audit.functions";

export const Route = createFileRoute("/_authenticated/dashboard/admin/scan-audit")({
  head: () => ({
    meta: [
      { title: "Scan Charge Audit — Jenvu Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScanAuditPage,
});

function ScanAuditPage() {
  const checkAdmin = useServerFn(isAdmin);
  const fetchAudit = useServerFn(listChargeAudit);
  const fetchMismatches = useServerFn(listChargeMismatches);

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<ChargeAuditRow[]>([]);
  const [mismatches, setMismatches] = useState<MismatchRow[]>([]);
  const [reasonFilter, setReasonFilter] = useState<string>("");
  const [scanFilter, setScanFilter] = useState<string>("");

  const load = async () => {
    try {
      const [audit, mm] = await Promise.all([
        fetchAudit({ data: { limit: 300, reason: reasonFilter || undefined, scanId: scanFilter || undefined } }),
        fetchMismatches(),
      ]);
      setRows(audit);
      setMismatches(mm);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { admin } = await checkAdmin();
        setAllowed(admin);
        if (admin) await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <div className="p-6 text-sm">Not authorized.</div>;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="pl-1 text-xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Scan Charge Audit
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Every credit deduction with source, caller, and scan correlation. Mismatches are flagged automatically.
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs inline-flex items-center gap-1.5 border rounded-md px-3 py-1.5 hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      {/* Mismatches */}
      <section className="border rounded-lg p-4 bg-card">
        <h2 className="pl-1 text-sm font-semibold flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Mismatched scans ({mismatches.length})
          <span className="text-[10px] font-normal text-muted-foreground">— any scan_id with more than 1 deduction</span>
        </h2>
        {mismatches.length === 0 ? (
          <p className="text-xs text-muted-foreground">✅ No mismatches. Every scan deducted exactly once.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Scan ID</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Reasons</th>
                  <th className="py-2 pr-3">Sources</th>
                  <th className="py-2 pr-3">Callers</th>
                  <th className="py-2 pr-3">Last</th>
                </tr>
              </thead>
              <tbody>
                {mismatches.map((m) => (
                  <tr key={m.scan_id} className="border-t">
                    <td className="py-1.5 pr-3 font-mono text-[10px]">
                      <button
                        className="underline hover:text-primary"
                        onClick={() => setScanFilter(m.scan_id)}
                      >
                        {m.scan_id.slice(0, 8)}…
                      </button>
                    </td>
                    <td className="py-1.5 pr-3">{m.user_email ?? m.user_id.slice(0, 8)}</td>
                    <td className="py-1.5 pr-3 font-semibold text-red-600">{m.charge_count}</td>
                    <td className="py-1.5 pr-3">-{m.total_amount}</td>
                    <td className="py-1.5 pr-3">{m.reasons.join(", ")}</td>
                    <td className="py-1.5 pr-3">{m.sources.join(", ")}</td>
                    <td className="py-1.5 pr-3">{(m.callers ?? []).filter(Boolean).join(", ")}</td>
                    <td className="py-1.5 pr-3">{new Date(m.last_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-2">
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="text-xs border rounded-md px-2 py-1.5 bg-background"
        >
          <option value="">All reasons</option>
          <option value="signal">signal</option>
          <option value="ict_narration">ict_narration</option>
          <option value="voice_query">voice_query</option>
          <option value="alert">alert</option>
        </select>
        <input
          value={scanFilter}
          onChange={(e) => setScanFilter(e.target.value)}
          placeholder="Filter by scan_id"
          className="text-xs border rounded-md px-2 py-1.5 bg-background font-mono w-64"
        />
        <button
          onClick={load}
          className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted"
        >
          Apply
        </button>
        {(reasonFilter || scanFilter) && (
          <button
            onClick={() => { setReasonFilter(""); setScanFilter(""); setTimeout(load, 0); }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </section>

      {/* Full audit log */}
      <section className="border rounded-lg bg-card">
        <div className="p-3 text-sm font-semibold border-b">
          Charge log ({rows.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground bg-muted/40">
              <tr>
                <th className="py-2 px-3">When</th>
                <th className="py-2 px-3">User</th>
                <th className="py-2 px-3">Reason</th>
                <th className="py-2 px-3">Δ</th>
                <th className="py-2 px-3">Bal</th>
                <th className="py-2 px-3">Source</th>
                <th className="py-2 px-3">Caller</th>
                <th className="py-2 px-3">Scan ID</th>
                <th className="py-2 px-3">Symbol</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="py-1.5 px-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-1.5 px-3">{r.user_email ?? r.user_id.slice(0, 8)}</td>
                  <td className="py-1.5 px-3 font-medium">{r.reason}</td>
                  <td className="py-1.5 px-3">-{r.amount}</td>
                  <td className="py-1.5 px-3">{r.balance_after ?? "—"}</td>
                  <td className="py-1.5 px-3">
                    <span className={
                      r.source.includes("failed") ? "text-red-600" :
                      r.source === "server_spend" ? "text-emerald-600" :
                      "text-amber-600"
                    }>{r.source}</span>
                  </td>
                  <td className="py-1.5 px-3 font-mono text-[10px]">{r.caller ?? "—"}</td>
                  <td className="py-1.5 px-3 font-mono text-[10px]">
                    {r.scan_id ? (
                      <button className="underline" onClick={() => setScanFilter(r.scan_id!)}>
                        {r.scan_id.slice(0, 8)}…
                      </button>
                    ) : "—"}
                  </td>
                  <td className="py-1.5 px-3">{r.symbol ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">No entries.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
