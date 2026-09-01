import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getRiskSettings, saveRiskSettings } from "@/lib/risk-settings.functions";

export const Route = createFileRoute("/_authenticated/dashboard/risk")({
  component: RiskPage,
});

function RiskPage() {
  const load = useServerFn(getRiskSettings);
  const save = useServerFn(saveRiskSettings);
  const [balance, setBalance] = useState(1000);
  const [riskPct, setRiskPct] = useState(1);
  const [dailyLimit, setDailyLimit] = useState<string>("");
  const [killSwitch, setKillSwitch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await load();
        setBalance(s.account_balance_usd);
        setRiskPct(s.risk_pct);
        setDailyLimit(s.daily_loss_limit_usd ? String(s.daily_loss_limit_usd) : "");
        setKillSwitch(s.kill_switch_enabled);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await save({
        data: {
          account_balance_usd: Number(balance),
          risk_pct: Number(riskPct),
          daily_loss_limit_usd: dailyLimit ? Number(dailyLimit) : null,
          kill_switch_enabled: killSwitch,
        },
      });
      toast.success("Risk settings saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const stopDistExample = 5; // $5 stop on XAU
  const suggested = Math.max(0.01, Math.round(((Number(balance) * Number(riskPct)) / 100 / (stopDistExample * 100)) * 100) / 100);

  return (
    <div className="max-w-5xl mx-auto px-4 py-2 flex flex-col overflow-hidden h-[calc(100dvh-7rem)] max-h-[calc(100dvh-7rem)]" style={{ fontFamily: "Urbanist, system-ui, sans-serif" }}>
      <div className="mb-2">
        <h1 className="pl-1 text-lg font-semibold text-black">Risk Management</h1>
        <p className="text-xs text-gray-700 mt-0.5">
          Position size and daily loss guard. Applies to signal cards and WhatsApp alerts.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-black mb-0.5">Account balance (USD)</label>
              <input
                type="number"
                min={0}
                step={50}
                value={balance}
                onChange={(e) => setBalance(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-black bg-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-black mb-0.5">Risk per trade (%)</label>
              <input
                type="number"
                min={0.1}
                max={10}
                step={0.1}
                value={riskPct}
                onChange={(e) => setRiskPct(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-black bg-white text-sm"
              />
              <p className="text-xs text-gray-700 mt-0.5">
                Example: $5 stop on XAU/USD → ~{suggested} lot
              </p>
            </div>

            <div className="md:col-span-2 border-t border-gray-100 pt-2">
              <label className="flex items-center gap-2 text-sm font-medium text-black">
                <input
                  type="checkbox"
                  checked={killSwitch}
                  onChange={(e) => setKillSwitch(e.target.checked)}
                />
                Enable daily loss kill-switch
              </label>
              <p className="text-xs text-gray-700 mt-0.5">
                When today's realized losses hit the limit, new signal alerts and charges are paused until 00:00 UTC.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-black mb-0.5">Daily loss limit (USD)</label>
              <input
                type="number"
                min={0}
                step={10}
                placeholder="e.g. 50"
                disabled={!killSwitch}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-black bg-white text-sm disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <button
              onClick={onSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-black text-white text-sm disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
