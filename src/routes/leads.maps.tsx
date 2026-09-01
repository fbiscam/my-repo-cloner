import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { searchMaps } from "@/lib/leadgen/search.functions";
import type { LeadInput } from "@/lib/leadgen/shared";
import { Card, PageHeader, btnPrimary, inputCls, labelCls } from "@/components/leadgen/LeadsShell";
import { ResultsTable } from "@/components/leadgen/ResultsTable";

export const Route = createFileRoute("/leads/maps")({
  head: () => ({
    meta: [
      { title: "Maps search — Jenvu Leads" },
      { name: "description", content: "Find local businesses by keyword, city and radius." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MapsSearch,
});

function MapsSearch() {
  const qc = useQueryClient();
  const run = useServerFn(searchMaps);
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState(10);
  const [max, setMax] = useState(20);
  const [rows, setRows] = useState<LeadInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await run({ data: { keyword, location, radius, max } });
      setRows(res.results);
      setSearched(true);
      if (res.results.length === 0) toast.info("No businesses matched that search.");
      else {
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
        title="Maps search"
        description="0.50 credits per lead extracted. Saving them again is free."
      />

      <Card className="mb-5 p-5">
        <form onSubmit={onSearch} className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className={labelCls}>Keyword</label>
            <input
              className={inputCls}
              placeholder="dental clinic"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Location</label>
            <input
              className={inputCls}
              placeholder="Dubai, UAE"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Radius (km)</label>
              <input
                type="number"
                min={1}
                max={100}
                className={inputCls}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls}>Leads</label>
              <select
                className={`${inputCls} appearance-none bg-[url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")] bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-8`}
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
              >
                {[10, 20, 40, 60].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
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
          emptyLabel={searched ? "No businesses matched that search." : "Run a search to see results."}
          columns={[
            { key: "name", label: "Business" },
            { key: "category", label: "Category" },
            { key: "address", label: "Address" },
            { key: "phone", label: "Phone" },
            { key: "website", label: "Website" },
            { key: "rating", label: "Rating" },
            { key: "reviews", label: "Reviews" },
          ]}
        />
      </Card>
    </>
  );
}
