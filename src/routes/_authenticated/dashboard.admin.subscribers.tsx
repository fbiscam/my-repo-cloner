import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Users, Download } from "lucide-react";
import { isAdmin } from "@/lib/admin-messages.functions";
import {
  listNewsletterSubscribers,
  type NewsletterSubscriber,
} from "@/lib/admin-subscribers.functions";

export const Route = createFileRoute("/_authenticated/dashboard/admin/subscribers")({
  head: () => ({
    meta: [
      { title: "Newsletter Subscribers — Jenvu Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSubscribersPage,
});

function AdminSubscribersPage() {
  const checkAdmin = useServerFn(isAdmin);
  const fetchList = useServerFn(listNewsletterSubscribers);

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [rows, setRows] = useState<NewsletterSubscriber[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { admin } = await checkAdmin();
        setAllowed(admin);
        if (admin) {
          const list = await fetchList();
          setRows(list);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.email.toLowerCase().includes(needle));
  }, [rows, q]);

  const active = rows.filter((r) => r.status === "active").length;

  const exportCsv = () => {
    const header = "email,status,subscribed_at\n";
    const body = filtered
      .map((r) => `${r.email},${r.status},${r.subscribed_at}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  }
  if (!allowed) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Forbidden</h1>
        <p className="text-sm text-zinc-500 mt-2">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="pl-1 text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" /> Newsletter subscribers
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {active} active · {rows.length} total
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="mt-5 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email…"
          className="w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="min-w-[540px] w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">Email</th>
              <th className="whitespace-nowrap px-4 py-3">Status</th>
              <th className="whitespace-nowrap px-4 py-3">Subscribed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                  No subscribers yet.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-zinc-100">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900">
                  {r.email}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      r.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                  {new Date(r.subscribed_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
