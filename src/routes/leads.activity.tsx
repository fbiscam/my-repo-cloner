import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getActivity, getMe } from "@/lib/leadgen/core.functions";
import { Card, PageHeader, inputCls, labelCls } from "@/components/leadgen/LeadsShell";

export const Route = createFileRoute("/leads/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Jenvu Leads" },
      { name: "description", content: "Searches run, leads pulled and credits spent." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Activity,
});

const LABELS: Record<string, string> = {
  lead_save: "Leads saved",
  maps_search: "Maps search",
  people_search: "People search",
  enrich: "Website enrichment",
  dashboard_view: "Dashboard opened",
};

function Activity() {
  const fetchActivity = useServerFn(getActivity);
  const fetchMe = useServerFn(getMe);
  const { data: me } = useQuery({ queryKey: ["lg-me"], queryFn: () => fetchMe() });

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scope, setScope] = useState<"me" | "all">("me");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["lg-activity", from, to, scope],
    queryFn: () =>
      fetchActivity({
        data: {
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
          scope,
        },
      }),
  });

  return (
    <>
      <PageHeader title="Activity" description="Everything that consumed credits or hit a provider." />

      <Card className="mb-5 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className={labelCls}>From</label>
            <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {me?.is_admin && (
            <div>
              <label className={labelCls}>Scope</label>
              <select
                className={inputCls}
                value={scope}
                onChange={(e) => setScope(e.target.value as "me" | "all")}
              >
                <option value="me">My activity</option>
                <option value="all">All users</option>
              </select>
            </div>
          )}
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-[13px] text-[#5F6368]">Loading…</div>
        ) : (rows ?? []).length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[#5F6368]">No activity in this range.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#E8EAED] text-[12px] text-[#5F6368]">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  {scope === "all" && <th className="px-3 py-2.5 font-medium">User</th>}
                  <th className="px-3 py-2.5 font-medium">Event</th>
                  <th className="px-3 py-2.5 font-medium">Detail</th>
                  <th className="px-3 py-2.5 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F3F4]">
                {(rows ?? []).map((r) => (
                  <tr key={r.id} className="hover:bg-[#F8F9FA]">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[#5F6368]">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    {scope === "all" && <td className="px-3 py-2.5">{r.email}</td>}
                    <td className="px-3 py-2.5">{LABELS[r.kind] ?? r.kind}</td>
                    <td className="max-w-xs truncate px-3 py-2.5 text-[#5F6368]">
                      {summarize(r.meta)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {Number(r.credits) > 0 ? `−${Number(r.credits).toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function summarize(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "—";
  const entries = Object.entries(meta as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}
