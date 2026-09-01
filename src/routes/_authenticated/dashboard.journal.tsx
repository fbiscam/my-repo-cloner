import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, BookOpen, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useCredits } from "@/hooks/useCredits";
import UpgradeOverlay from "@/components/UpgradeOverlay";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useAuthUser } from "@/hooks/useAuthUser";
import PageLoading from "@/components/PageLoading";
import SetupPicker from "@/components/SetupPicker";
import {
  listSetups,
  setTradeSetups,
  getTradeSetupLinks,
  type SetupRow,
} from "@/lib/journal-stats.functions";



export const Route = createFileRoute("/_authenticated/dashboard/journal")({
  component: Journal,
});

type Trade = {
  id: string;
  pair: string;
  direction: "long" | "short";
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  outcome: "pending" | "open" | "win" | "loss" | "breakeven";
  pnl: number | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  source: "system" | "outside";
  tp1_hit_at?: string | null;
  tp2_hit_at?: string | null;
};



function Journal() {
  const { features, isLoading } = useCredits();
  const locked = !isLoading && !features.journal;
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const { user: authUser, loading: authLoading } = useAuthUser();


  const [setups, setSetups] = useState<SetupRow[]>([]);
  const [tradeTags, setTradeTags] = useState<Record<string, string[]>>({});
  const fetchSetups = useServerFn(listSetups);
  const fetchLinks = useServerFn(getTradeSetupLinks);

  const load = async (userId: string) => {
    setTradesLoading(true);
    const { data, error } = await supabase.from("trade_journal").select("*").eq("user_id", userId).order("opened_at", { ascending: false });
    if (error) {
      toast.error("Journal data didn't load", { description: "Please refresh once." });
      setTradesLoading(false);
      return;
    }
    const rows = (data as unknown as Trade[]) ?? [];
    setTrades(rows);
    setTradesLoading(false);
    // load setups + links in parallel
    try {
      const [s, links] = await Promise.all([
        fetchSetups(),
        rows.length ? fetchLinks({ data: { tradeIds: rows.map((r) => r.id) } }) : Promise.resolve({} as Record<string, string[]>),
      ]);
      setSetups(s);
      setTradeTags(links);
    } catch {
      /* non-fatal */
    }
  };
  useEffect(() => {
    if (authLoading || !authUser) return;
    load(authUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authUser?.id]);



  // Live prices for open + pending trades
  const trackedSymbols = useMemo(
    () => Array.from(new Set(trades.filter((t) => (t.outcome === "open" || t.outcome === "pending") && t.entry != null).map((t) => t.pair))),
    [trades],
  );
  const livePrices = useLivePrices(trackedSymbols);

  // Auto-fill pending limit orders when live price reaches entry
  useEffect(() => {
    const filling = trades.filter((t) => {
      if (t.outcome !== "pending" || t.entry == null) return false;
      const px = livePrices[t.pair.toUpperCase()];
      if (px == null) return false;
      // Real limit-order semantics: a BUY fills as soon as price trades at or
      // below entry, a SELL at or above. A tolerance band alone missed fast
      // pullbacks and left filled trades stuck in "pending".
      const tol = Math.max(t.entry * 0.0005, 0.01);
      return t.direction === "long" ? px <= t.entry + tol : px >= t.entry - tol;
    });
    if (filling.length === 0) return;
    (async () => {
      for (const t of filling) {
        const opened_at = new Date().toISOString();
        const { error } = await supabase
          .from("trade_journal")
          .update({ outcome: "open", opened_at })
          .eq("id", t.id)
          .eq("outcome", "pending");
        if (!error) {
          setTrades((prev) => prev.map((x) => x.id === t.id ? { ...x, outcome: "open", opened_at } : x));
          toast.success(`Entry filled · ${t.pair} @ ${t.entry}`);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrices]);

  // Auto-close open trades when live price touches TP or SL
  useEffect(() => {
    const closing = trades.filter((t) => {
      if (t.outcome !== "open" || t.entry == null) return false;
      const px = livePrices[t.pair.toUpperCase()];
      if (px == null) return false;
      if (t.direction === "long") {
        if (t.take_profit != null && px >= t.take_profit) return true;
        if (t.stop_loss != null && px <= t.stop_loss) return true;
      } else {
        if (t.take_profit != null && px <= t.take_profit) return true;
        if (t.stop_loss != null && px >= t.stop_loss) return true;
      }
      return false;
    });
    if (closing.length === 0) return;
    (async () => {
      for (const t of closing) {
        const px = livePrices[t.pair.toUpperCase()];
        const hitTp =
          t.take_profit != null &&
          (t.direction === "long" ? px >= t.take_profit : px <= t.take_profit);
        const outcome: Trade["outcome"] = hitTp ? "win" : "loss";
        const exit = hitTp ? t.take_profit! : t.stop_loss!;
        const pnl = t.direction === "long" ? exit - t.entry! : t.entry! - exit;
        const { error } = await supabase
          .from("trade_journal")
          .update({ outcome, pnl, closed_at: new Date().toISOString() })
          .eq("id", t.id)
          .eq("outcome", "open");
        if (!error) {
          setTrades((prev) =>
            prev.map((x) =>
              x.id === t.id ? { ...x, outcome, pnl, closed_at: new Date().toISOString() } : x,
            ),
          );
          toast.success(`Trade ${outcome === "win" ? "won" : "lost"} · ${t.pair} ${outcome === "win" ? "TP" : "SL"} hit`);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePrices]);

  const liveOf = (t: Trade): number | null => {
    if (t.outcome !== "open" || t.entry == null) return null;
    const px = livePrices[t.pair.toUpperCase()];
    if (px == null) return null;
    return t.direction === "long" ? px - t.entry : t.entry - px;
  };

  const stats = useMemo(() => {
    const closed = trades.filter((t) => t.outcome === "win" || t.outcome === "loss" || t.outcome === "breakeven");
    const openTrades = trades.filter((t) => t.outcome === "open");
    const pendingTrades = trades.filter((t) => t.outcome === "pending");
    const wins = closed.filter((t) => t.outcome === "win").length;
    const losses = closed.filter((t) => t.outcome === "loss").length;
    const closedPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const livePnl = openTrades.reduce((s, t) => s + (liveOf(t) ?? 0), 0);

    const decided = wins + losses;
    return {
      total: trades.length,
      open: openTrades.length,
      pending: pendingTrades.length,
      winRate: decided ? Math.round((wins / decided) * 100) : 0,
      wins,
      losses,
      pnl: closedPnl + livePnl,
      livePnl,
      liveCounted: 0,
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, livePrices]);






  const remove = async (id: string) => {
    await supabase.from("trade_journal").delete().eq("id", id);
    setTrades((t) => t.filter((x) => x.id !== id));
  };

  const closeNow = async (t: Trade) => {
    if (t.outcome !== "open" || t.entry == null) return;
    const px = livePrices[t.pair.toUpperCase()];
    if (px == null) { toast.error("No live price yet — try again"); return; }
    const pnl = t.direction === "long" ? px - t.entry : t.entry - px;
    const outcome: Trade["outcome"] = pnl > 0 ? "win" : pnl < 0 ? "loss" : "breakeven";
    const closed_at = new Date().toISOString();
    const { error } = await supabase
      .from("trade_journal")
      .update({ outcome, pnl, closed_at })
      .eq("id", t.id)
      .eq("outcome", "open");
    if (error) { toast.error("Could not close trade"); return; }
    setTrades((prev) => prev.map((x) => (x.id === t.id ? { ...x, outcome, pnl, closed_at } : x)));
    toast.success(`Trade closed · ${outcome.toUpperCase()} · ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`);
  };

  if (authLoading || isLoading || tradesLoading) return <PageLoading label="Opening journal" />;

  return (
    <UpgradeOverlay
      show={locked}
      title="Trade Journal is Pro"
      description="Track every setup, win-rate and P&L. Upgrade to Pro to unlock the journal."
    >
    <div className="space-y-6">

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight pl-3">&nbsp;Trades</h2>
          <p className="text-[10px] sm:text-xs text-zinc-500">System = executed via Jenvu signal.<br className="sm:hidden" /> Outside = manually logged.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLog(true)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 transition"
          >
            <Plus className="h-3.5 w-3.5" /> Log Trade
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: "Trades", v: stats.total, live: false },
          { k: "Open", v: stats.open, live: false },
          { k: "Win rate", v: `${stats.winRate}%`, live: stats.liveCounted > 0 },
          {
            k: "P&L",
            v: `${stats.pnl >= 0 ? "+" : ""}${stats.pnl.toFixed(2)}`,
            live: stats.open > 0,
            tone: stats.pnl > 0 ? "text-emerald-600" : stats.pnl < 0 ? "text-rose-600" : "text-zinc-900",
          },
        ].map((c) => (
          <div key={c.k} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">{c.k}</div>
              {c.live && (
                <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
                </span>
              )}
            </div>
            <div className={`mt-1 text-xl font-semibold ${(c as any).tone ?? "text-zinc-900"}`}>{c.v}</div>
          </div>
        ))}
      </div>



      {!trades.length ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-zinc-400" />
          <h3 className="mt-3 text-base font-semibold">No trades logged yet</h3>
          <p className="mt-1 text-sm text-zinc-500">Track entries, exits and outcomes to surface your real win rate.</p>
          <button
            onClick={() => setShowLog(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 transition"
          >
            <Plus className="h-3.5 w-3.5" /> Log Trade
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[780px] text-sm">

            <thead className="bg-zinc-50 text-center font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                {["Date", "Pair", "Dir", "Source", "Entry", "Price", "SL", "TP", "Result", "P&L", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium text-center">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {trades.map((t) => {
                const live = livePrices[t.pair.toUpperCase()] ?? null;
                const livePnl = liveOf(t);
                const isOpen = t.outcome === "open";
                const fmt = (n: number | null | undefined) =>
                  n == null ? "—" : n.toFixed(Math.abs(n) >= 100 ? 2 : 4);
                const dist = (target: number | null) => {
                  if (!isOpen || live == null || target == null) return null;
                  const d = target - live;
                  return d;
                };
                const slDist = dist(t.stop_loss);
                const tpDist = dist(t.take_profit);
                const displayPnl = isOpen ? livePnl : t.pnl;
                return (
                  <tr key={t.id} className="hover:bg-zinc-50/50 text-center">
                    <td className="px-3 py-2.5 text-xs text-zinc-500 text-center">{new Date(t.opened_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-center">
                      <div>{t.pair}</div>
                      {(tradeTags[t.id]?.length ?? 0) > 0 && (
                        <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                          {tradeTags[t.id].map((sid) => {
                            const s = setups.find((x) => x.id === sid);
                            if (!s) return null;
                            return (
                              <span
                                key={sid}
                                title={s.name}
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: s.color }}
                              />
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${t.direction === "long" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {t.direction === "long" ? "BUY" : "SELL"}
                        <span className="opacity-60">·</span>
                        {t.direction === "long" ? "LONG" : "SHORT"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${t.source === "outside" ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"}`}>
                        {t.source === "outside" ? "Outside" : "System"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-center">{t.entry ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-center">
                      {isOpen ? (
                        live != null ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                            {fmt(live)}
                          </span>
                        ) : (
                          <span className="text-zinc-400">…</span>
                        )
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-center">
                      <div>{t.stop_loss ?? "—"}</div>
                      {slDist != null && (
                        <div className="text-[10px] text-zinc-400">{slDist >= 0 ? "+" : ""}{slDist.toFixed(2)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-center">
                      <div>{t.take_profit ?? "—"}</div>
                      {tpDist != null && (
                        <div className="text-[10px] text-zinc-400">{tpDist >= 0 ? "+" : ""}{tpDist.toFixed(2)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                          t.outcome === "win" ? "bg-emerald-50 text-emerald-700"
                          : t.outcome === "loss" ? "bg-rose-50 text-rose-700"
                          : t.outcome === "breakeven" ? "bg-zinc-100 text-zinc-700"
                          : t.outcome === "pending" ? "bg-sky-50 text-sky-700"
                          : "bg-amber-50 text-amber-700"
                        }`}>{t.outcome}</span>
                      </div>
                    </td>
                    <td className={`px-3 py-2.5 font-mono text-xs text-center ${(displayPnl ?? 0) > 0 ? "text-emerald-600" : (displayPnl ?? 0) < 0 ? "text-rose-600" : "text-zinc-500"}`}>
                      {displayPnl != null ? (
                        <span className="inline-flex items-center gap-1">
                          {isOpen && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
                          {displayPnl > 0 ? "+" : ""}{displayPnl.toFixed(2)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        {isOpen && (
                          <button
                            onClick={() => closeNow(t)}
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                            title="Close at live price"
                          >
                            Close
                          </button>
                        )}
                        <button onClick={() => remove(t.id)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>
      )}

      {showLog && (
        <LogTradeModal
          onClose={() => setShowLog(false)}
          onSaved={(t, tagIds) => {
            setTrades((prev) => [t, ...prev]);
            if (tagIds.length) setTradeTags((m) => ({ ...m, [t.id]: tagIds }));
            setShowLog(false);
          }}
        />
      )}

    </div>
    </UpgradeOverlay>
  );
}

function LogTradeModal({ onClose, onSaved }: { onClose: () => void; onSaved: (t: Trade, tagIds: string[]) => void }) {
  const [pair, setPair] = useState("XAUUSD");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [outcome, setOutcome] = useState<Trade["outcome"]>("open");
  const [pnl, setPnl] = useState("");
  const [notes, setNotes] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const applyTags = useServerFn(setTradeSetups);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { toast.error("Not signed in"); setSaving(false); return; }

    const parseNum = (v: string) => v.trim() === "" ? null : Number(v);
    const now = new Date().toISOString();
    const closed = outcome === "win" || outcome === "loss" || outcome === "breakeven";

    const payload = {
      user_id: uid,
      pair: pair.toUpperCase().trim(),
      direction,
      entry: parseNum(entry),
      stop_loss: parseNum(sl),
      take_profit: parseNum(tp),
      outcome,
      pnl: parseNum(pnl),
      notes: notes.trim() || null,
      opened_at: now,
      closed_at: closed ? now : null,
      source: "outside" as const,
    };

    const { data, error } = await supabase.from("trade_journal").insert(payload as never).select("*").single();
    if (error) { setSaving(false); toast.error(error.message); return; }
    const trade = data as unknown as Trade;
    if (tagIds.length > 0) {
      try {
        await applyTags({ data: { tradeId: trade.id, setupIds: tagIds } });
      } catch { /* non-fatal */ }
    }
    setSaving(false);
    toast.success("Trade logged");
    onSaved(trade, tagIds);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
          <div>
            <div className="text-sm font-semibold">Log Trade</div>
            <div className="text-[11px] text-zinc-500">Manually record a trade taken outside Jenvu.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5">
          <label className="col-span-1 text-xs">
            <span className="mb-1 block font-medium text-zinc-700">Pair</span>
            <input value={pair} onChange={(e) => setPair(e.target.value)} required className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900" />
          </label>
          <label className="col-span-1 text-xs">
            <span className="mb-1 block font-medium text-zinc-700">Direction</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value as "long" | "short")} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>

          <label className="col-span-2 text-xs sm:col-span-1">
            <span className="mb-1 block font-medium text-zinc-700">Entry</span>
            <input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900" />
          </label>
          <label className="col-span-2 text-xs sm:col-span-1">
            <span className="mb-1 block font-medium text-zinc-700">Outcome</span>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as Trade["outcome"])} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
              <option value="pending">Pending</option>
              <option value="open">Open</option>
              <option value="win">Win</option>
              <option value="loss">Loss</option>
              <option value="breakeven">Breakeven</option>
            </select>
          </label>

          <label className="col-span-1 text-xs">
            <span className="mb-1 block font-medium text-zinc-700">Stop Loss</span>
            <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900" />
          </label>
          <label className="col-span-1 text-xs">
            <span className="mb-1 block font-medium text-zinc-700">Take Profit</span>
            <input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900" />
          </label>

          {(outcome === "win" || outcome === "loss" || outcome === "breakeven") && (
            <label className="col-span-2 text-xs">
              <span className="mb-1 block font-medium text-zinc-700">P&L (points)</span>
              <input value={pnl} onChange={(e) => setPnl(e.target.value)} inputMode="decimal" placeholder="e.g. 12.50 or -8.00" className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900" />
            </label>
          )}

          <div className="col-span-2 text-xs">
            <span className="mb-1 block font-medium text-zinc-700">Setup tags</span>
            <SetupPicker value={tagIds} onChange={setTagIds} />
          </div>

          <label className="col-span-2 text-xs">
            <span className="mb-1 block font-medium text-zinc-700">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60">
            {saving ? "Saving…" : "Save trade"}
          </button>
        </div>
      </form>
    </div>
  );
}
