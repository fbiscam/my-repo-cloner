import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { enrichWebsite } from "@/lib/leadgen/search.functions";
import type { LeadInput } from "@/lib/leadgen/shared";
import { Card, PageHeader, btnPrimary, inputCls, labelCls } from "@/components/leadgen/LeadsShell";
import { ResultsTable } from "@/components/leadgen/ResultsTable";

export const Route = createFileRoute("/leads/enrich")({
  head: () => ({
    meta: [
      { title: "Enrich — Jenvu Leads" },
      { name: "description", content: "Crawl a website for emails and social profiles." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Enrich,
});

function Enrich() {
  const qc = useQueryClient();
  const run = useServerFn(enrichWebsite);
  const [domain, setDomain] = useState("");
  const [rows, setRows] = useState<LeadInput[]>([]);
  const [pages, setPages] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function onRun(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await run({ data: { domain } });
      setRows(res.results);
      setPages(res.pages);
      if (res.results.length === 0) toast.info("No contact details found on that site.");
      else {
      qc.invalidateQueries({ queryKey: ["lg-me"] });
      qc.invalidateQueries({ queryKey: ["lg-overview"] });
      toast.success(`${res.results.length} leads extracted · ${res.remaining.toFixed(2)} credits left`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enrichment failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Enrich"
        description="Crawl contact and about pages of a website to pull emails and social profiles."
      />

      <Card className="mb-5 p-5">
        <form onSubmit={onRun} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label className={labelCls}>Website or domain</label>
            <input
              className={inputCls}
              placeholder="acme.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>
          <button className={btnPrimary} disabled={busy}>
            {busy ? "Crawling…" : "Crawl site"}
          </button>
        </form>
        {pages !== null && (
          <p className="mt-3 text-[12px] text-[#5F6368]">Crawled {pages} page(s).</p>
        )}
      </Card>

      <Card>
        <ResultsTable
          rows={rows}
          emptyLabel="Enter a website to crawl."
          columns={[
            { key: "email", label: "Email" },
            { key: "name", label: "Guessed name" },
            { key: "company", label: "Domain" },
            { key: "socials", label: "Profiles" },
          ]}
        />
      </Card>
    </>
  );
}
