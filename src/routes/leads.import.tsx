import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { LeadInput } from "@/lib/leadgen/shared";
import { Card, PageHeader, btnGhost, inputCls, labelCls } from "@/components/leadgen/LeadsShell";
import { ResultsTable } from "@/components/leadgen/ResultsTable";

export const Route = createFileRoute("/leads/import")({
  head: () => ({
    meta: [
      { title: "Import CSV — Jenvu Leads" },
      { name: "description", content: "Upload a CSV, map the columns and dedupe against saved leads." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ImportCsv,
});

const FIELDS = [
  "name",
  "title",
  "company",
  "category",
  "address",
  "city",
  "country",
  "phone",
  "email",
  "website",
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function ImportCsv() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [body, setBody] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, string>>({});

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (rows.length < 2) {
      toast.error("That CSV has no data rows.");
      return;
    }
    const head = rows[0].map((h) => h.trim());
    setHeaders(head);
    setBody(rows.slice(1, 501));
    const auto: Record<string, string> = {};
    for (const f of FIELDS) {
      const hit = head.find((h) => h.toLowerCase().replace(/[^a-z]/g, "").includes(f));
      if (hit) auto[f] = hit;
    }
    setMap(auto);
  }

  const rows: LeadInput[] = useMemo(() => {
    if (!headers.length) return [];
    const idx = (field: string) => headers.indexOf(map[field] ?? "");
    return body
      .map((r) => {
        const get = (field: string) => {
          const i = idx(field);
          return i >= 0 ? (r[i] ?? "").trim() || null : null;
        };
        return {
          source: "csv",
          name: get("name") ?? get("company") ?? get("email") ?? "Unknown",
          title: get("title"),
          company: get("company"),
          category: get("category"),
          address: get("address"),
          city: get("city"),
          country: get("country"),
          phone: get("phone"),
          email: get("email"),
          website: get("website"),
        } as LeadInput;
      })
      .filter((l) => l.name !== "Unknown" || l.email || l.phone);
  }, [headers, body, map]);

  return (
    <>
      <PageHeader
        title="Import"
        description="Upload a CSV, map the columns, then save. Duplicates are skipped automatically and never charged."
      />

      <Card className="mb-5 p-5">
        <label className={labelCls}>CSV file</label>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-[13px]" />

        {headers.length > 0 && (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => (
                <div key={f}>
                  <label className={labelCls}>{f}</label>
                  <select
                    className={inputCls}
                    value={map[f] ?? ""}
                    onChange={(e) => setMap((p) => ({ ...p, [f]: e.target.value }))}
                  >
                    <option value="">— ignore —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              className={`${btnGhost} mt-4`}
              onClick={() => {
                setHeaders([]);
                setBody([]);
                setMap({});
              }}
            >
              Clear file
            </button>
          </>
        )}
      </Card>

      <Card>
        <ResultsTable
          rows={rows}
          emptyLabel="Upload a CSV to preview rows."
          columns={[
            { key: "name", label: "Name" },
            { key: "company", label: "Company" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone" },
            { key: "city", label: "City" },
            { key: "website", label: "Website" },
          ]}
        />
      </Card>
    </>
  );
}
