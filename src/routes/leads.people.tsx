import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { searchPeople } from "@/lib/leadgen/search.functions";
import type { LeadInput } from "@/lib/leadgen/shared";
import { Card, PageHeader, btnPrimary, inputCls, labelCls } from "@/components/leadgen/LeadsShell";
import { ResultsTable } from "@/components/leadgen/ResultsTable";

export const Route = createFileRoute("/leads/people")({
  head: () => ({
    meta: [
      { title: "People search — Jenvu Leads" },
      { name: "description", content: "Find decision makers by name, title, company or domain." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PeopleSearch,
});

function PeopleSearch() {
  const qc = useQueryClient();
  const run = useServerFn(searchPeople);
  const [f, setF] = useState({ name: "", title: "", company: "", domain: "" });
  const [rows, setRows] = useState<LeadInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await run({ data: { ...f, page: 1 } });
      setRows(res.results);
      setSearched(true);
      if (res.results.length > 0) {
      qc.invalidateQueries({ queryKey: ["lg-me"] });
      qc.invalidateQueries({ queryKey: ["lg-overview"] });
      toast.success(`${res.results.length} leads extracted · ${res.remaining.toFixed(2)} credits left`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="People search"
        description="0.50 credits per contact extracted. Saving them to a list is free."
      />

      <Card className="mb-5 p-5">
        <form onSubmit={onSearch} className="grid gap-4 md:grid-cols-4">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} placeholder="Jane Doe" value={f.name} onChange={set("name")} />
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} placeholder="Head of Growth" value={f.title} onChange={set("title")} />
          </div>
          <div>
            <label className={labelCls}>Company</label>
            <input className={inputCls} placeholder="Acme Inc" value={f.company} onChange={set("company")} />
          </div>
          <div>
            <label className={labelCls}>Domain</label>
            <input className={inputCls} placeholder="acme.com" value={f.domain} onChange={set("domain")} />
          </div>
          <div className="md:col-span-4">
            <button className={btnPrimary} disabled={busy}>
              {busy ? "Searching…" : "Search"}
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <ResultsTable
          rows={rows}
          emptyLabel={searched ? "No people matched those filters." : "Add a filter and search."}
          columns={[
            { key: "name", label: "Name" },
            { key: "title", label: "Role" },
            { key: "company", label: "Company" },
            { key: "city", label: "City" },
            { key: "country", label: "Country" },
            { key: "email", label: "Email" },
            { key: "socials", label: "Profiles" },
          ]}
        />
      </Card>
    </>
  );
}
