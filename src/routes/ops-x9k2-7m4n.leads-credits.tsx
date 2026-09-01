import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  opsListLeadsAccounts,
  opsAdjustLeadsCredits,
  opsSetLeadsAccountDisabled,
} from "@/lib/ops-leads-credits.functions";

export const Route = createFileRoute("/ops-x9k2-7m4n/leads-credits")({
  head: () => ({
    meta: [
      { title: "Ops Console · Leads Credits" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LeadsCredits,
});

type Row = Awaited<ReturnType<typeof opsListLeadsAccounts>>[number];

const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";
const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

function opsToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const fromUrl = new URLSearchParams(window.location.search).get("t");
  if (fromUrl) {
    try { window.sessionStorage.setItem("jenvu_ops_token", fromUrl); } catch { /* ignore */ }
    return fromUrl;
  }
  try { return window.sessionStorage.getItem("jenvu_ops_token") ?? undefined; } catch { return undefined; }
}

function LeadsCredits() {
  const list = useServerFn(opsListLeadsAccounts);
  const adjust = useServerFn(opsAdjustLeadsCredits);
  const setDisabled = useServerFn(opsSetLeadsAccountDisabled);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  async function load() {
    try {
      const data = await list({ data: { token: opsToken() } });
      setRows(data);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? "Could not load accounts."));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(userId: string, mode: "add" | "set") {
    const raw = amounts[userId];
    const amount = Number(raw);
    if (!raw || !Number.isFinite(amount)) {
      toast.error("Enter a credit amount first.");
      return;
    }
    setBusy(userId);
    try {
      const res = await adjust({ data: { userId, mode, amount, token: opsToken() } });
      toast.success(mode === "add" ? `Added ${amount} credits` : `Limit set to ${res.limit}`);
      setAmounts((p) => ({ ...p, [userId]: "" }));
      await load();
    } catch (e: any) {
      toast.error(String(e?.message ?? "Update failed."));
    } finally {
      setBusy(null);
    }
  }

  async function toggleDisabled(row: Row) {
    setBusy(row.user_id);
    try {
      await setDisabled({ data: { userId: row.user_id, disabled: !row.is_disabled, token: opsToken() } });
      await load();
    } catch (e: any) {
      toast.error(String(e?.message ?? "Update failed."));
    } finally {
      setBusy(null);
    }
  }

  const filtered = (rows ?? []).filter((r) =>
    q.trim() ? `${r.email} ${r.full_name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()) : true,
  );

  return (
    <div className={`min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased`}>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="rounded-[22px] border border-zinc-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_-12px_rgba(16,24,40,0.10)]">
          <span className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
            leads · credits
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Jenvu Leads Accounts</h1>
          <p className="mt-1.5 text-sm text-zinc-600">
            Add credits to any leads account. Credits are the monthly limit — a saved/revealed lead costs 0.5.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email or name"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400"
            />
            <button
              onClick={() => void load()}
              className="shrink-0 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {rows === null && !error && <div className="text-sm text-zinc-500">Loading…</div>}
          {rows !== null && filtered.length === 0 && (
            <div className="text-sm text-zinc-500">No leads accounts found.</div>
          )}
          {filtered.map((r) => (
            <div
              key={r.user_id}
              className="rounded-[20px] border border-zinc-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_-14px_rgba(16,24,40,0.10)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-zinc-900">{r.email}</div>
                  <div className={`${MONO} mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500`}>
                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5">{r.role}</span>
                    {r.is_disabled && (
                      <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-red-700">disabled</span>
                    )}
                    {r.full_name && <span className="normal-case tracking-normal">{r.full_name}</span>}
                  </div>
                </div>
                <div className={`${MONO} text-right text-[11px] text-zinc-600`}>
                  <div>
                    limit <span className="font-semibold text-zinc-900">{r.limit}</span>
                  </div>
                  <div>used {r.used}</div>
                  <div>remaining {r.remaining}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  inputMode="decimal"
                  value={amounts[r.user_id] ?? ""}
                  onChange={(e) => setAmounts((p) => ({ ...p, [r.user_id]: e.target.value }))}
                  placeholder="Credits"
                  className="w-32 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
                <button
                  disabled={busy === r.user_id}
                  onClick={() => void run(r.user_id, "add")}
                  className="rounded-lg bg-zinc-900 px-3.5 py-2 text-sm text-white transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  Add credits
                </button>
                <button
                  disabled={busy === r.user_id}
                  onClick={() => void run(r.user_id, "set")}
                  className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Set limit
                </button>
                <button
                  disabled={busy === r.user_id}
                  onClick={() => void toggleDisabled(r)}
                  className="ml-auto rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {r.is_disabled ? "Enable account" : "Disable account"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
