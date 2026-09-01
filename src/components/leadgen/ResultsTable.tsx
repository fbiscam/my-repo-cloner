import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveLeads, listLists } from "@/lib/leadgen/core.functions";
import type { LeadInput } from "@/lib/leadgen/shared";
import { btnPrimary, inputCls } from "@/components/leadgen/LeadsShell";

export type Column = { key: keyof LeadInput | "socials"; label: string; width?: string };

export function ResultsTable({
  rows,
  columns,
  emptyLabel = "No results yet.",
}: {
  rows: LeadInput[];
  columns: Column[];
  emptyLabel?: string;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveLeads);
  const fetchLists = useServerFn(listLists);
  const { data: lists } = useQuery({ queryKey: ["lg-lists"], queryFn: () => fetchLists() });

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [listId, setListId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  async function onSave() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const picked = [...selected].map((i) => rows[i]);
      const res = await save({ data: { leads: picked, listId: listId || null } });
      toast.success(
        `Saved ${res.saved} lead${res.saved === 1 ? "" : "s"}` +
          (res.duplicates ? ` · ${res.duplicates} duplicate skipped` : "") +
          ` · ${res.remaining.toFixed(2)} credits left`,
      );
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["lg-me"] });
      qc.invalidateQueries({ queryKey: ["lg-overview"] });
      qc.invalidateQueries({ queryKey: ["lg-leads"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save leads.");
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return <div className="p-8 text-center text-[13px] text-[#5F6368]">{emptyLabel}</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E8EAED] px-4 py-3">
        <span className="text-[13px] text-[#5F6368]">
          {rows.length} result{rows.length === 1 ? "" : "s"}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className={`${inputCls} w-auto min-w-[10rem]`}
          >
            <option value="">No list</option>
            {(lists ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button onClick={onSave} disabled={busy || selected.size === 0} className={btnPrimary}>
            {busy ? "Saving…" : `Save ${selected.size || ""}`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#E8EAED] text-[12px] text-[#5F6368]">
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(rows.map((_, i) => i)))
                  }
                />
              </th>
              {columns.map((c) => (
                <th key={String(c.key)} className="px-3 py-2.5 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F3F4]">
            {rows.map((r, i) => (
              <tr key={i} className={selected.has(i) ? "bg-[#E8F0FE]/50" : "hover:bg-[#F8F9FA]"}>
                <td className="px-4 py-2.5">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                </td>
                {columns.map((c) => (
                  <td key={String(c.key)} className="px-3 py-2.5 text-[#202124]">
                    <Cell row={r} field={c.key} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ row, field }: { row: LeadInput; field: Column["key"] }) {
  if (field === "socials") {
    const entries = Object.entries(row.socials ?? {});
    if (entries.length === 0) return <span className="text-[#9AA0A6]">—</span>;
    return (
      <span className="flex flex-wrap gap-2">
        {entries.map(([k, v]) => (
          <a
            key={k}
            href={v}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[#1A73E8] hover:underline"
          >
            {k}
          </a>
        ))}
      </span>
    );
  }
  const value = row[field as keyof LeadInput];
  if (value === null || value === undefined || value === "")
    return <span className="text-[#9AA0A6]">—</span>;
  if (field === "website") {
    const href = String(value).startsWith("http") ? String(value) : `https://${value}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="whitespace-nowrap text-[#1A73E8] hover:underline"
      >
        {String(value).replace(/^https?:\/\//, "")}
      </a>
    );
  }
  return <span className="whitespace-nowrap">{String(value)}</span>;
}
