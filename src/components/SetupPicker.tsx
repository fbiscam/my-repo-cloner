import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listSetups, createSetup, type SetupRow } from "@/lib/journal-stats.functions";
import { Plus, X, Tag } from "lucide-react";
import { toast } from "sonner";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
};

export default function SetupPicker({ value, onChange, compact }: Props) {
  const list = useServerFn(listSetups);
  const create = useServerFn(createSetup);
  const [setups, setSetups] = useState<SetupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");

  useEffect(() => {
    let alive = true;
    list()
      .then((r) => alive && setSetups(r))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [list]);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const add = async () => {
    if (!newName.trim()) return;
    try {
      const row = await create({
        data: { name: newName.trim(), category: "custom", color: newColor },
      });
      setSetups((s) => [...s, row]);
      onChange([...value, row.id]);
      setNewName("");
      toast.success(`Added "${row.name}"`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not add setup");
    }
  };

  const selected = setups.filter((s) => value.includes(s.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: `${s.color}20`, color: s.color }}
          >
            {s.name}
            <button
              type="button"
              onClick={() => toggle(s.id)}
              className="rounded-full hover:bg-black/10"
              aria-label={`Remove ${s.name}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2 py-0.5 text-[10px] font-medium text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
        >
          <Tag className="h-2.5 w-2.5" />
          {selected.length ? "Edit tags" : "Tag setup"}
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-zinc-200 bg-white p-2">
          {loading ? (
            <div className="p-2 text-[11px] text-zinc-500">Loading setups…</div>
          ) : (
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {setups.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(s.id)}
                    onChange={() => toggle(s.id)}
                    className="h-3 w-3"
                  />
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-[9px] uppercase text-zinc-400">{s.category}</span>
                </label>
              ))}
            </div>
          )}
          {!compact && (
            <div className="mt-2 flex items-center gap-1.5 border-t border-zinc-100 pt-2">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-zinc-200"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New setup name"
                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-[11px] outline-none focus:border-zinc-900"
              />
              <button
                type="button"
                onClick={add}
                disabled={!newName.trim()}
                className="inline-flex items-center gap-1 rounded bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
