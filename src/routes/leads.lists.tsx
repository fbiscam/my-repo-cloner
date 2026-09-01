import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Download } from "lucide-react";
import {
  listLists,
  createList,
  deleteList,
  listLeads,
  updateLead,
  deleteLeads,
} from "@/lib/leadgen/core.functions";
import { LEAD_STATUSES, toCsv, type LeadStatus } from "@/lib/leadgen/shared";
import {
  Card,
  PageHeader,
  btnGhost,
  btnPrimary,
  inputCls,
} from "@/components/leadgen/LeadsShell";

export const Route = createFileRoute("/leads/lists")({
  head: () => ({
    meta: [
      { title: "Lists — Jenvu Leads" },
      { name: "description", content: "Saved campaign lists, lead status, notes and CSV export." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Lists,
});

const COLUMNS = [
  "name",
  "title",
  "company",
  "email",
  "phone",
  "website",
  "city",
  "country",
  "status",
  "notes",
];

function Lists() {
  const qc = useQueryClient();
  const fetchLists = useServerFn(listLists);
  const fetchLeads = useServerFn(listLeads);
  const addList = useServerFn(createList);
  const removeList = useServerFn(deleteList);
  const patchLead = useServerFn(updateLead);
  const removeLeads = useServerFn(deleteLeads);

  const [active, setActive] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const { data: lists } = useQuery({ queryKey: ["lg-lists"], queryFn: () => fetchLists() });
  const { data: leads } = useQuery({
    queryKey: ["lg-leads", active],
    queryFn: () => fetchLeads({ data: { listId: active } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["lg-lists"] });
    qc.invalidateQueries({ queryKey: ["lg-leads"] });
  };

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await addList({ data: { name: newName } });
      setNewName("");
      refresh();
      toast.success("List created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create list.");
    }
  }

  function exportCsv() {
    const rows = (leads ?? []).map((l) => Object.fromEntries(COLUMNS.map((c) => [c, (l as never)[c]])));
    const blob = new Blob([toCsv(rows, COLUMNS)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jenvu-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Lists"
        description="Your saved leads, grouped into campaigns."
        actions={
          <button onClick={exportCsv} className={btnGhost} disabled={(leads ?? []).length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-4">
            <form onSubmit={onCreate} className="flex gap-2">
              <input
                className={inputCls}
                placeholder="New list name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button className={btnPrimary}>Add</button>
            </form>
          </Card>

          <Card>
            <button
              onClick={() => setActive(null)}
              className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] ${
                active === null ? "bg-[#E8F0FE] font-medium text-[#1967D2]" : "hover:bg-[#F8F9FA]"
              }`}
            >
              All leads
            </button>
            {(lists ?? []).map((l) => (
              <div
                key={l.id}
                className={`flex items-center justify-between border-t border-[#F1F3F4] px-4 py-2.5 text-[13px] ${
                  active === l.id ? "bg-[#E8F0FE] text-[#1967D2]" : "hover:bg-[#F8F9FA]"
                }`}
              >
                <button onClick={() => setActive(l.id)} className="min-w-0 flex-1 truncate text-left">
                  {l.name}
                  <span className="ml-2 text-[11px] text-[#80868B]">{l.lead_count}</span>
                </button>
                <button
                  onClick={async () => {
                    await removeList({ data: { id: l.id } });
                    if (active === l.id) setActive(null);
                    refresh();
                  }}
                  className="text-[#9AA0A6] hover:text-[#D93025]"
                  aria-label={`Delete ${l.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </Card>
        </div>

        <Card>
          {(leads ?? []).length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#5F6368]">
              No leads here yet. Save some from Maps, People, Enrich or Import.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#E8EAED] text-[12px] text-[#5F6368]">
                    {["Name", "Company", "Email", "Phone", "Status", "Notes", ""].map((h) => (
                      <th key={h} className="px-3 py-2.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F3F4]">
                  {(leads ?? []).map((l) => (
                    <tr key={l.id} className="hover:bg-[#F8F9FA]">
                      <td className="px-3 py-2.5">{l.name}</td>
                      <td className="px-3 py-2.5 text-[#5F6368]">{l.company ?? "—"}</td>
                      <td className="px-3 py-2.5">{l.email ?? "—"}</td>
                      <td className="px-3 py-2.5">{l.phone ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <select
                          className="rounded border border-[#DADCE0] bg-white px-2 py-1 text-[12px]"
                          value={l.status}
                          onChange={async (e) => {
                            await patchLead({
                              data: { id: l.id, status: e.target.value as LeadStatus },
                            });
                            refresh();
                          }}
                        >
                          {LEAD_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          defaultValue={l.notes ?? ""}
                          placeholder="Add a note"
                          className="w-44 rounded border border-transparent px-2 py-1 text-[12px] hover:border-[#DADCE0] focus:border-[#1A73E8] focus:outline-none"
                          onBlur={async (e) => {
                            if (e.target.value !== (l.notes ?? "")) {
                              await patchLead({ data: { id: l.id, notes: e.target.value } });
                              refresh();
                            }
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={async () => {
                            await removeLeads({ data: { ids: [l.id] } });
                            refresh();
                          }}
                          className="text-[#9AA0A6] hover:text-[#D93025]"
                          aria-label="Delete lead"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
