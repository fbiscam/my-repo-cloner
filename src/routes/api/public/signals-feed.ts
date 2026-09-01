import { createFileRoute } from "@tanstack/react-router";
import {
  summarizeAccuracy,
  RESOLUTION_METHOD,
  LEGACY_RESOLUTION_METHOD,
} from "@/lib/signals/outcome-resolver";


// Public read-only feed of recent auto-scan signals with paper-trade outcomes.
// No auth required. Uses supabaseAdmin because signal_alerts is gated to paid users.
export const Route = createFileRoute("/api/public/signals-feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const daysRaw = Number(url.searchParams.get("days") ?? "30");
        const days = Math.min(90, Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 30));
        const limitRaw = Number(url.searchParams.get("limit") ?? "200");
        const limit = Math.min(500, Math.max(10, Number.isFinite(limitRaw) ? limitRaw : 200));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const [alertsRes, tradesRes] = await Promise.all([
          supabaseAdmin
            .from("signal_alerts")
            .select("id, pair, direction, grade, confidence, entry, sl, tp, rr, session, killzone, htf_bias, fired_at")
            .gte("fired_at", since)
            .order("fired_at", { ascending: false })
            .limit(limit),
          supabaseAdmin
            .from("signal_paper_trades")
            .select("broadcast_alert_id, outcome, realized_r, resolved_at, resolution_method")
            .gte("fired_at", since),
        ]);

        if (alertsRes.error) {
          return new Response(JSON.stringify({ error: "feed_unavailable" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const tradeMap = new Map<string, { outcome: string | null; realized_r: number | null; resolved_at: string | null; resolution_method: string | null }>();
        for (const t of tradesRes.data ?? []) {
          if (t.broadcast_alert_id) tradeMap.set(t.broadcast_alert_id, {
            outcome: t.outcome, realized_r: t.realized_r, resolved_at: t.resolved_at,
            resolution_method: (t as { resolution_method?: string | null }).resolution_method ?? null,
          });
        }


        const signals = (alertsRes.data ?? []).map((a) => {
          const t = tradeMap.get(a.id);
          return {
            id: a.id,
            pair: a.pair,
            direction: a.direction,
            grade: a.grade,
            confidence: a.confidence,
            entry: a.entry,
            sl: a.sl,
            tp: a.tp,
            rr: a.rr,
            session: a.session,
            killzone: a.killzone,
            htf_bias: a.htf_bias,
            fired_at: a.fired_at,
            outcome: t?.outcome ?? "pending",
            realized_r: t?.realized_r ?? null,
            resolved_at: t?.resolved_at ?? null,
            resolution_method: t?.resolution_method ?? null,
          };
        });

        // Stats — win rate uses TRUE TP/SL outcomes only. Expired and
        // never-triggered tickets are reported separately, never as wins.
        const summary = summarizeAccuracy(signals);
        const legacy = summarizeAccuracy(
          signals.filter((s) => s.resolution_method === LEGACY_RESOLUTION_METHOD),
        );
        const fullTarget = summarizeAccuracy(
          signals.filter((s) => s.resolution_method === RESOLUTION_METHOD),
        );
        const resolved = signals.filter((s) => s.outcome === "win" || s.outcome === "loss");
        const wins = summary.wins;
        const losses = summary.losses;
        const winRate = summary.win_rate;
        const rSum = summary.total_r;
        const avgR = summary.avg_r;


        // Streak (most recent resolved run)
        let streak = 0; let streakKind: "win" | "loss" | null = null;
        for (const s of [...resolved].sort((a, b) => new Date(b.resolved_at ?? b.fired_at).getTime() - new Date(a.resolved_at ?? a.fired_at).getTime())) {
          const k = s.outcome as "win" | "loss";
          if (streakKind === null) { streakKind = k; streak = 1; continue; }
          if (k === streakKind) streak++; else break;
        }

        // By pair
        const pairAgg = new Map<string, { total: number; wins: number; losses: number; r: number }>();
        for (const s of signals) {
          const p = pairAgg.get(s.pair) ?? { total: 0, wins: 0, losses: 0, r: 0 };
          p.total++;
          if (s.outcome === "win") p.wins++;
          else if (s.outcome === "loss") p.losses++;
          p.r += Number(s.realized_r) || 0;
          pairAgg.set(s.pair, p);
        }
        const byPair = Array.from(pairAgg.entries()).map(([pair, v]) => ({
          pair, ...v,
          win_rate: v.wins + v.losses > 0 ? (v.wins / (v.wins + v.losses)) * 100 : 0,
        })).sort((a, b) => b.total - a.total);

        // By session
        const sessAgg = new Map<string, { total: number; wins: number; losses: number }>();
        for (const s of signals) {
          const key = s.session ?? "—";
          const v = sessAgg.get(key) ?? { total: 0, wins: 0, losses: 0 };
          v.total++;
          if (s.outcome === "win") v.wins++;
          else if (s.outcome === "loss") v.losses++;
          sessAgg.set(key, v);
        }
        const bySession = Array.from(sessAgg.entries()).map(([session, v]) => ({
          session, ...v,
          win_rate: v.wins + v.losses > 0 ? (v.wins / (v.wins + v.losses)) * 100 : 0,
        })).sort((a, b) => b.total - a.total);

        return new Response(JSON.stringify({
          days,
          generated_at: new Date().toISOString(),
          signals,
          stats: {
            total: signals.length,
            resolved: resolved.length,
            pending: summary.pending,
            expired: summary.expired,
            not_triggered: summary.not_triggered,
            wins, losses,
            win_rate: Number(winRate.toFixed(2)),
            avg_r: Number(avgR.toFixed(2)),
            total_r: Number(rSum.toFixed(2)),
            streak, streak_kind: streakKind,
          },
          // Old +0.20R partial-target results are reported separately from
          // results resolved against the real TP/SL.
          methodology: {
            current: RESOLUTION_METHOD,
            legacy_method: LEGACY_RESOLUTION_METHOD,
            legacy: legacy,
            full_target: fullTarget,
          },

          by_pair: byPair,
          by_session: bySession,
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60, s-maxage=60",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
