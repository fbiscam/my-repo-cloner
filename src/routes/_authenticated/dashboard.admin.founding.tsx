import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Search,
  Crown,
  Check,
  X,
  Clock,
  Users,
  CheckCircle2,
  Hourglass,
  XCircle,
  ListChecks,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  StickyNote,
  Copy,
  ExternalLink,
  Download,
} from "lucide-react";

const PLAN_AMOUNT: Record<string, string> = { pro: "$15", elite: "$50", ultra: "$100", free: "$1" };

import { isAdmin } from "@/lib/admin-messages.functions";
import {
  listFoundingApplications,
  updateFoundingApplication,
  type FoundingApplication,
} from "@/lib/founding.functions";

export const Route = createFileRoute("/_authenticated/dashboard/admin/founding")({
  head: () => ({
    meta: [
      { title: "Founding Applications — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFoundingPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  active: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  rejected: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  waitlisted: "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200",
  graduated: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
};

type SortKey = "newest" | "oldest" | "name";

function AdminFoundingPage() {
  const checkAdmin = useServerFn(isAdmin);
  const fetchList = useServerFn(listFoundingApplications);
  const update = useServerFn(updateFoundingApplication);

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<FoundingApplication[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { admin } = await checkAdmin();
        setAllowed(admin);
        if (admin) {
          const list = await fetchList();
          setRows(list);
          const initNotes: Record<string, string> = {};
          list.forEach((r: any) => (initNotes[r.id] = r.admin_notes || ""));
          setNotes(initNotes);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        r.email.toLowerCase().includes(needle) ||
        r.full_name.toLowerCase().includes(needle) ||
        String((r as any).whatsapp_number || "").toLowerCase().includes(needle) ||
        (r.country || "").toLowerCase().includes(needle) ||
        (r.broker || "").toLowerCase().includes(needle)
      );
    });
    out.sort((a, b) => {
      if (sort === "name") return a.full_name.localeCompare(b.full_name);
      const at = new Date(a.created_at).getTime();
      const bt = new Date(b.created_at).getTime();
      return sort === "newest" ? bt - at : at - bt;
    });
    return out;
  }, [rows, q, statusFilter, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return c;
  }, [rows]);

  async function changeStatus(id: string, status: string) {
    setBusy(id + status);
    try {
      await update({ data: { id, status: status as any } });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      toast.success(`Marked ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function markProfit(id: string) {
    setBusy(id + "profit");
    try {
      await update({ data: { id, status: "active", first_profit_reached: true } });
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "active", first_profit_at: new Date().toISOString() } : r)),
      );
      toast.success("Account funded → plan activated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveNote(id: string) {
    setSavingNote(id);
    try {
      await update({ data: { id, admin_notes: notes[id] || "" } });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, admin_notes: notes[id] || "" } : r)));
      toast.success("Note saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingNote(null);
    }
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email).then(() => toast.success("Email copied"));
  }

  function exportCsv() {
    const cols = [
      "created_at",
      "status",
      "full_name",
      "email",
      "whatsapp_number",
      "country",
      "broker",
      "experience_years",
      "monthly_volume_usd",
      "requested_plan",
      "myfxbook_url",
      "approved_at",
      "first_profit_at",
      "admin_notes",
    ];
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(",")]
      .concat(filtered.map((r: any) => cols.map((c) => esc(r[c])).join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `founding-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  if (!allowed) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Forbidden</h1>
        <p className="mt-2 text-sm text-zinc-500">Admin access required.</p>
      </div>
    );
  }

  const stat = (label: string, value: number, Icon: any, tone: string) => (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-zinc-500">{label}</span>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">{value}</div>
    </div>
  );

  return (
    <div className="-m-6 min-h-[calc(100vh-4rem)] bg-[#FAFAFA] p-6 text-zinc-900">
      {/* Header */}
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] uppercase tracking-widest text-amber-700">
              <Crown className="h-3.5 w-3.5" /> Founding program · Admin
            </div>
            <h1 className="pl-1 mt-3 text-2xl font-semibold text-zinc-900">Founding applications</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Review, approve, waitlist, or reject candidates. Approving activates their plan and sends an invite.
            </p>
          </div>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stat("Total", rows.length, Users, "text-zinc-500")}
          {stat("Pending", counts.pending || 0, Hourglass, "text-amber-500")}
          {stat("Approved", counts.approved || 0, CheckCircle2, "text-emerald-500")}
          {stat("Active", counts.active || 0, TrendingUp, "text-sky-500")}
          {stat("Waitlist", counts.waitlisted || 0, ListChecks, "text-zinc-500")}
          {stat("Rejected", counts.rejected || 0, XCircle, "text-rose-500")}
        </div>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, WhatsApp, country, broker…"
              className="w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="active">Active</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="rejected">Rejected</option>
            <option value="graduated">Graduated</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </div>

        {/* Quick status tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["all", "pending", "waitlisted", "approved", "active", "rejected", "graduated"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-wide transition ${
                statusFilter === s
                  ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {s} {s !== "all" && counts[s] ? `· ${counts[s]}` : ""}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="mt-5 space-y-3">
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
              No applications match your filters.
            </div>
          )}
          {filtered.map((r) => {
            const isOpen = !!expanded[r.id];
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-zinc-900">{r.full_name}</span>
                      {r.requested_plan && (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                          Wants: {r.requested_plan}
                        </span>
                      )}
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          STATUS_STYLES[r.status] || "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[13px] text-zinc-600">
                      <a href={`mailto:${r.email}`} className="text-zinc-700 hover:text-amber-700 hover:underline">
                        {r.email}
                      </a>
                      <button
                        onClick={() => copyEmail(r.email)}
                        className="rounded p-0.5 text-zinc-400 hover:text-zinc-700"
                        title="Copy email"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      {(r as any).whatsapp_number && (
                        <>
                          <span>·</span>
                          <a
                            href={`https://wa.me/${String((r as any).whatsapp_number).replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:underline"
                            title="Open WhatsApp chat"
                          >
                            {(r as any).whatsapp_number}
                          </a>
                          <button
                            onClick={() =>
                              navigator.clipboard
                                .writeText(String((r as any).whatsapp_number))
                                .then(() => toast.success("WhatsApp number copied"))
                            }
                            className="rounded p-0.5 text-zinc-400 hover:text-zinc-700"
                            title="Copy WhatsApp number"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      {r.country && <span>· {r.country}</span>}
                      {r.broker && <span>· {r.broker}</span>}
                      {r.experience_years !== null && <span>· {r.experience_years}y exp</span>}
                      {r.monthly_volume_usd !== null && <span>· ${r.monthly_volume_usd}/mo</span>}
                    </div>
                    <div className="mt-2 text-[11px] text-zinc-500 flex items-center gap-1 flex-wrap">
                      <Clock className="h-3 w-3" /> {new Date(r.created_at).toLocaleString()}
                      {r.approved_at && <span>· approved {new Date(r.approved_at).toLocaleDateString()}</span>}
                      {r.first_profit_at && <span>· profit {new Date(r.first_profit_at).toLocaleDateString()}</span>}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {(r.status === "pending" || r.status === "waitlisted") && (
                      <>
                        <button
                          disabled={busy === r.id + "approved"}
                          onClick={() => changeStatus(r.id, "approved")}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        {r.status === "pending" ? (
                          <button
                            disabled={busy === r.id + "waitlisted"}
                            onClick={() => changeStatus(r.id, "waitlisted")}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                          >
                            Waitlist
                          </button>
                        ) : (
                          <button
                            disabled={busy === r.id + "pending"}
                            onClick={() => changeStatus(r.id, "pending")}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                          >
                            Back to pending
                          </button>
                        )}
                        <button
                          disabled={busy === r.id + "rejected"}
                          onClick={() => changeStatus(r.id, "rejected")}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px] font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {r.status === "approved" && (
                      <button
                        disabled={busy === r.id + "profit"}
                        onClick={() => markProfit(r.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        Fund {PLAN_AMOUNT[(r.requested_plan || "elite").toLowerCase()] || "$50"} ({(r.requested_plan || "elite").toUpperCase()}) → Active
                      </button>
                    )}
                    {r.status === "rejected" && (
                      <button
                        disabled={busy === r.id + "pending"}
                        onClick={() => changeStatus(r.id, "pending")}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    )}
                    {(r.status === "approved" || r.status === "active") && (
                      <button
                        disabled={busy === r.id + "graduated"}
                        onClick={() => changeStatus(r.id, "graduated")}
                        className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[12px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                      >
                        Graduate
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {isOpen ? "Hide" : "Details"}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 grid gap-4 border-t border-zinc-100 pt-4 md:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-widest text-zinc-500">Why joining</div>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] text-zinc-800">
                        {r.why_joining || <span className="text-zinc-400">—</span>}
                      </p>
                      {r.myfxbook_url && (
                        <a
                          href={r.myfxbook_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1 text-[12px] text-amber-700 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Track record
                        </a>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-500">
                        <StickyNote className="h-3 w-3" /> Admin notes
                      </div>
                      <textarea
                        value={notes[r.id] || ""}
                        onChange={(e) => setNotes((s) => ({ ...s, [r.id]: e.target.value }))}
                        rows={4}
                        placeholder="Private notes about this applicant…"
                        className="mt-1 w-full resize-y rounded-lg border border-zinc-200 bg-white p-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => saveNote(r.id)}
                          disabled={savingNote === r.id}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {savingNote === r.id ? "Saving…" : "Save note"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
