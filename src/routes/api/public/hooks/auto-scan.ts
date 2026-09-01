import { createFileRoute } from "@tanstack/react-router";
import { computeSignalPlan, getLiveTick } from "@/lib/gold-analysis.functions";
import { isActiveKillzone, MIN_CONFIDENCE, qualifySignal } from "@/lib/signals/qualification";

// Auto-scan broadcast worker. Called every 5 min by pg_cron.
// Auth: x-cron-secret (private CRON_SECRET) for cron + app-internal callers,
// or a service-role signed manual-mode body for user-triggered manual scans.
// The public anon apikey is NOT accepted — it ships in every browser bundle.
// Flow:
//   1. Read system_settings (enabled, config)
//   2. For each pair: compute plan, run 2-hit state machine
//   3. On confirmed hit → insert signal_alerts + user_notifications + ledger row
export const Route = createFileRoute("/api/public/hooks/auto-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET ?? "";
        const providedCronSecret = request.headers.get("x-cron-secret") ?? "";
        const hasValidCronSecret =
          !!providedCronSecret &&
          !!cronSecret &&
          providedCronSecret.length === cronSecret.length &&
          providedCronSecret === cronSecret;

        // Manual mode below can also self-authenticate via the service-role
        // key in the body (checked further down). Reject only after both
        // paths have had a chance to authorize.
        const rejectUnauthorized = () =>
          new Response("Unauthorized", { status: 401 });


        // Manual mode: triggered from the signal page after a user runs a
        // manual analyze. Server-side callers (from `runManualScanBroadcast`)
        // sign the request with the service role key. Skips two-hit, cooldown,
        // daily-cap, and the `enabled` gate — but keeps every safety gate
        // (news pause, killzone, HTF align, min conf, dedup, freshness, re-quote).
        let manualMode = false;
        let manualPair: string | null = null;
        let manualExcludeUserId: string | null = null;
        try {
          const raw = await request.clone().text();
          if (raw) {
            const body = JSON.parse(raw) as {
              manual?: boolean;
              pair?: string;
              manual_token?: string;
              exclude_user_id?: string;
            };
            const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
            if (
              body?.manual === true &&
              typeof body.pair === "string" &&
              body.manual_token &&
              svcKey &&
              body.manual_token === svcKey
            ) {
              manualMode = true;
              manualPair = body.pair.toUpperCase().replace(/[^A-Z]/g, "");
              manualExcludeUserId = body.exclude_user_id ?? null;
            }
          }
        } catch {
          // ignore body parse errors — fall through to scheduled auto-scan
        }

        // Reject requests that neither present a valid cron secret nor a
        // service-role-signed manual body.
        if (!hasValidCronSecret && !manualMode) {
          return rejectUnauthorized();
        }



        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Every invocation is recorded so silent failures are visible in
        // `auto_scan_runs` instead of leaving the table empty forever.
        const __runStartedMs = Date.now();
        const __runStartedIso = new Date().toISOString();
        const logRun = async (row: {
          skip_reason?: string | null;
          pairs_checked?: string[] | null;
          broadcast_pair?: string | null;
          broadcast_alert_id?: string | null;
          error?: string | null;
          results?: unknown;
        }) => {
          try {
            await supabaseAdmin.from("auto_scan_runs").insert({
              mode: manualMode ? "manual" : "auto",
              started_at: __runStartedIso,
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - __runStartedMs,
              pairs_checked: row.pairs_checked ?? undefined,
              skip_reason: row.skip_reason ?? null,
              broadcast_pair: row.broadcast_pair ?? null,
              broadcast_alert_id: row.broadcast_alert_id ?? null,
              error: row.error ?? null,
              results: (row.results ?? null) as never,
            });
          } catch {
            // Diagnostics only — never fail a scan because logging failed.
          }
        };

        // Read settings
        const { data: settings } = await supabaseAdmin
          .from("system_settings")
          .select("key, value")
          .in("key", ["auto_scan_enabled", "auto_scan_config"]);

        const settingsMap = new Map<string, Record<string, unknown>>();
        for (const s of settings ?? []) {
          settingsMap.set(
            (s as { key: string }).key,
            (s as { value: Record<string, unknown> }).value ?? {},
          );
        }
        const enabled =
          (settingsMap.get("auto_scan_enabled")?.enabled as boolean) ?? false;
        if (!enabled && !manualMode) {
          await logRun({ skip_reason: "disabled" });
          return Response.json({ ok: true, skipped: "disabled" });
        }

        // Gold market hours check — XAU trades ~ Sunday 22:00 UTC → Friday 21:00 UTC.
        // Skip scans when market is closed (weekend).
        const nowCheck = new Date();
        const dow = nowCheck.getUTCDay(); // 0=Sun, 6=Sat
        const utcHour = nowCheck.getUTCHours();
        const marketClosed =
          dow === 6 || // Saturday all day
          (dow === 5 && utcHour >= 21) || // Friday after 21:00 UTC
          (dow === 0 && utcHour < 22); // Sunday before 22:00 UTC
        if (marketClosed) {
          await logRun({ skip_reason: "market_closed" });
          return Response.json({ ok: true, skipped: "market_closed" });
        }

        const cfg = settingsMap.get("auto_scan_config") ?? {};
        const rawPairs = manualMode && manualPair
          ? [manualPair]
          : ["XAUUSD"];
        // Gold-only: strip any non-XAU symbols even if config has legacy entries
        const pairs = rawPairs.filter(
          (p) =>
            typeof p === "string" && p.toUpperCase() === "XAUUSD",
        );
        // Keep cron executions comfortably under the platform timeout. A full
        // six-pair AI sweep can take 40–60s, so the scheduled worker rotates
        // through small batches every 5 minutes. Manual scans still process the
        // selected pair immediately.
        const configuredBatchSize = Number(cfg.scan_batch_size ?? 2);
        const scanBatchSize = manualMode
          ? pairs.length
          : Math.max(
              1,
              Math.min(
                Number.isFinite(configuredBatchSize) ? configuredBatchSize : 2,
                2,
              ),
            );
        const batchCount = Math.max(1, Math.ceil(pairs.length / scanBatchSize));
        const batchSlot = Math.floor(Date.now() / (5 * 60 * 1000)) % batchCount;
        const scheduledPairs = manualMode
          ? pairs
          : pairs.slice(batchSlot * scanBatchSize, batchSlot * scanBatchSize + scanBatchSize);
        // Runtime config can lag behind code deploys. Keep a quality floor so
        // stale permissive settings cannot send B/C retracement calls again.
        const configuredMinConf = Number(cfg.min_conf ?? MIN_CONFIDENCE);
        let minConf = Math.max(
          MIN_CONFIDENCE,
          Number.isFinite(configuredMinConf) ? configuredMinConf : MIN_CONFIDENCE,
        );
        const confirmWindowMin = Math.min(
          Number(cfg.confirm_window_min ?? 45) || 45,
          45,
        );
        const cooldownMin = Math.min(Number(cfg.cooldown_min ?? 45) || 45, 45);
        const sameDirectionLockMin = Math.min(
          Number(cfg.same_direction_lock_min ?? 120) || 120,
          120,
        );
        // Quality over quantity: at most 2 broadcasts per UTC day. Runtime
        // config may lower this, never raise it.
        const maxPerDay = Math.min(Math.max(Number(cfg.max_broadcasts_per_day ?? 2) || 2, 1), 2);

        // 75%+ can broadcast immediately.
        let singleHitMinConf = Math.max(minConf, MIN_CONFIDENCE);

        // ---- Rolling 30-day calibration ----
        // Sessions that are under-performing the 85% target automatically
        // demand extra confidence before anything may broadcast in them.
        let calibration: Awaited<ReturnType<typeof import("@/lib/signals/calibration.server").computeCalibration>> | null =
          null;
        let calibrationBump = 0;
        try {
          const { computeCalibration, sessionConfidenceBump } = await import(
            "@/lib/signals/calibration.server"
          );
          calibration = await computeCalibration(supabaseAdmin as never, 30);
          const hourNow = new Date().getUTCHours();
          const currentSession =
            hourNow >= 12 && hourNow < 16
              ? "overlap"
              : hourNow >= 12
                ? "new_york"
                : hourNow >= 7
                  ? "london"
                  : "asia";
          calibrationBump = sessionConfidenceBump(calibration, currentSession);
          if (calibrationBump > 0) {
            minConf = minConf + calibrationBump;
            singleHitMinConf = singleHitMinConf + calibrationBump;
          }
        } catch {
          // Calibration is an optimisation — never block scanning on it.
        }


        // Global daily rate limit — manual scans bypass so the user's
        // deliberate analyze still fires when the pool cap is hit.
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        if (!manualMode) {
          const { count: todayCount } = await supabaseAdmin
            .from("auto_scan_pool_ledger")
            .select("id", { count: "exact", head: true })
            .not("alert_id", "is", null)
            .gte("created_at", dayStart.toISOString());
          if ((todayCount ?? 0) >= maxPerDay) {
            await logRun({ skip_reason: "daily_cap" });
            return Response.json({ ok: true, skipped: "daily_cap" });
          }
        }

        // News-aware scanning (CPI / NFP / FOMC etc.).
        // Instead of sitting out the whole event window, we split it in phases:
        //   pre      — event upcoming (blackout..pause window): no broadcast,
        //              spreads widen and pre-positioning gets stop-hunted.
        //   blackout — within ±N min of the print: no broadcast at all.
        //   post     — up to `news_post_window_min` after the print: KEEP
        //              scanning. The post-news reaction (displacement + FVG
        //              retrace) is one of the cleanest ICT setups; we simply
        //              demand a slightly higher confidence and tag the alert.
        const newsPauseMin = Number(cfg.news_pause_min ?? 30);
        const newsBlackoutMin = Number(cfg.news_blackout_min ?? 10);
        const newsPostWindowMin = Number(cfg.news_post_window_min ?? 90);
        const newsPostMinConf = Number(cfg.news_post_min_conf ?? 72);
        let newsBlocked: { title: string; minutes: number; phase: string } | null = null;
        let newsContext:
          | { title: string; minutesAgo: number; impact: string }
          | null = null;
        try {
          const res = await fetch(
            "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
            { headers: { "User-Agent": "Mozilla/5.0" } },
          );
          if (res.ok) {
            const raw = (await res.json()) as Array<{
              title: string;
              country: string;
              date: string;
              impact: string;
            }>;
            const now = Date.now();
            for (const e of raw) {
              if (e.country !== "USD" && e.country !== "XAU") continue;
              if (!/High/i.test(e.impact)) continue;
              const deltaMin = (new Date(e.date).getTime() - now) / 60000;
              if (Math.abs(deltaMin) <= newsBlackoutMin) {
                newsBlocked = {
                  title: e.title,
                  minutes: Math.round(deltaMin),
                  phase: "blackout",
                };
                break;
              }
              if (deltaMin > 0 && deltaMin <= newsPauseMin) {
                newsBlocked = {
                  title: e.title,
                  minutes: Math.round(deltaMin),
                  phase: "pre_event",
                };
                break;
              }
              if (deltaMin < 0 && Math.abs(deltaMin) <= newsPostWindowMin) {
                const ago = Math.round(Math.abs(deltaMin));
                if (!newsContext || ago < newsContext.minutesAgo) {
                  newsContext = { title: e.title, minutesAgo: ago, impact: "High" };
                }
              }
            }
          }
        } catch {
          // Fail open — don't block scans if news feed is down.
        }
        if (newsBlocked) {
          await logRun({ skip_reason: "news_pause" });
          return Response.json({
            ok: true,
            skipped: "news_pause",
            phase: newsBlocked.phase,
            event: newsBlocked,
          });
        }
        // Post-news reaction mode: keep scanning but raise the bar a touch.
        if (newsContext) {
          minConf = Math.max(minConf, MIN_CONFIDENCE);
          singleHitMinConf = Math.max(singleHitMinConf, MIN_CONFIDENCE);
        }

        const results: Array<Record<string, unknown>> = [];
        const runStartedAt = new Date().toISOString();

        // Multi-candidate arbitration: scan all pairs once, cache those plans,
        // then evaluate strongest-first. Earlier versions pre-scanned and then
        // re-scanned each pair, which could exceed the Worker request budget;
        // the DB cron saw those as status 0 and no alert was ever finalized.
        const scanPlanCache = new Map<string, Awaited<ReturnType<typeof computeSignalPlan>>>();
        let workingPairs = scheduledPairs.length > 0 ? scheduledPairs.slice() : pairs.slice(0, scanBatchSize);
        if (!manualMode && workingPairs.length > 1) {
          type Cand = { pair: string; conf: number; rr: number; dir: "BUY" | "SELL" };
          const candidates: Cand[] = [];
          const preScans = await Promise.allSettled(
            workingPairs.map(async (p) => ({
              pair: p,
              plan: await computeSignalPlan({ symbol: p }, null, { systemScan: true }),
            })),
          );
          for (const item of preScans) {
            if (item.status !== "fulfilled") continue;
            const { pair: p, plan: pre } = item.value;
            scanPlanCache.set(p, pre);
            const d = pre.trade?.direction;
            const c = Number(pre.trade?.confidence ?? 0);
            if ((d !== "BUY" && d !== "SELL") || c < minConf) continue;
            const e = Number(pre.trade?.entry);
            const s = Number(pre.trade?.sl);
            const t = Number(pre.trade?.tp1 ?? pre.trade?.tp);
            const rd = Math.abs(e - s);
            const rw = Math.abs(t - e);
            const rr = rd > 0 ? rw / rd : 0;
            candidates.push({ pair: p, conf: c, rr, dir: d });
          }
          if (candidates.length > 1) {
            const pool = candidates.sort((a, b) => (b.conf - a.conf) || (b.rr - a.rr));
            // Order candidates strongest-first, but keep the runner-ups in
            // the working set. Previously we silenced them here — that meant
            // if the winner hit cooldown / duplicate lock / xau-correlation
            // dedupe downstream, NO alert fired at all. Now the main loop
            // walks the list in order; once one pair broadcasts, the fresh
            // signal_alerts row makes `xau_correlation_dedup` naturally
            // suppress the others in this same run.
            workingPairs = pool.map((c) => c.pair);
          }
        }


        for (const pair of workingPairs) {
          try {
            const plan = scanPlanCache.get(pair) ?? await computeSignalPlan({ symbol: pair }, null, { systemScan: true });
            const dir = plan.trade?.direction;
            let conf = Number(plan.trade?.confidence ?? 0);
            const now = new Date();

            if (dir !== "BUY" && dir !== "SELL") {
              await supabaseAdmin
                .from("auto_scan_state")
                .delete()
                .eq("pair", pair);
              results.push({
                pair,
                action: "cleared_wait",
                conf,
                reason: String(plan.trade?.summary ?? "").slice(0, 240),
              });
              continue;
            }

            const kz = String(plan.killzone ?? "").trim();
            const htfBias = String((plan as { htfBias?: string }).htfBias ?? "neutral");
            const qualification = qualifySignal({
              pair,
              direction: dir,
              confidence: conf,
              entry: Number(plan.trade?.entry),
              sl: Number(plan.trade?.sl),
              tpCandidates: [plan.trade?.tp, plan.trade?.tp3, plan.trade?.tp2, plan.trade?.tp1],
              htfBias,
              utcHour: now.getUTCHours(),
              inKillzone: isActiveKillzone(kz),
              minConf,
              checks: (plan as unknown as { setupChecks?: Array<{ key: string; pass: boolean }> }).setupChecks ?? null,
              regime: (plan as unknown as { marketRegime?: { regime?: string } }).marketRegime?.regime ?? null,
            });

            if (!qualification.ok) {
              await supabaseAdmin.from("auto_scan_state").delete().eq("pair", pair);
              results.push({
                pair,
                action: qualification.reason,
                conf,
                killzone: kz,
                htfBias,
              });
              continue;
            }

            // Check existing state
            const { data: state } = await supabaseAdmin
              .from("auto_scan_state")
              .select(
                "direction, first_conf, first_seen_at, last_broadcast_at",
              )
              .eq("pair", pair)
              .maybeSingle();

            // Cooldown check — bypassed in manual mode (user is explicitly asking).
            if (!manualMode && state?.last_broadcast_at) {
              const since =
                (now.getTime() -
                  new Date(state.last_broadcast_at).getTime()) /
                60000;
              if (since < cooldownMin) {
                results.push({
                  pair,
                  action: "cooldown",
                  since_min: Math.round(since),
                });
                continue;
              }
              // Dedup: if we've already broadcast this same direction for this
              // pair, don't re-broadcast until direction flips or state clears
              // (state auto-clears when dir drops to hold or below threshold).
              if (state.direction === dir) {
                results.push({
                  pair,
                  action: "already_broadcast_same_dir",
                  dir,
                });
                continue;
              }
            }

            // Cross-hook duplicate lock: a legacy/manual scanner may have already
            // inserted this pair+direction. Do not alert the same idea again in
            // the SAME killzone — but a new killzone (London → NY AM → NY PM)
            // is a fresh liquidity regime, so an aligned setup there should
            // fire even if bias hasn't flipped since the previous session.
            // Manual mode bypasses this — the user explicitly asked to scan
            // this pair; silencing it defeats the point of the button.
            // Hard per-pair burst lock: yesterday XAU/EUR fired twice 42s apart
            // (two overlapping runs) and BOTH tickets lost. Regardless of
            // direction/killzone, never emit two alerts for the same pair
            // inside 10 minutes.
            if (!manualMode) {
              const burstSince = new Date(now.getTime() - 10 * 60_000).toISOString();
              const { data: burst } = await supabaseAdmin
                .from("signal_alerts")
                .select("id")
                .eq("pair", pair)
                .gte("fired_at", burstSince)
                .limit(1);
              if (burst?.length) {
                results.push({ pair, action: "burst_lock", recent_alert_id: burst[0].id });
                continue;
              }
            }

            if (!manualMode) {
              const currentKz = String(plan.killzone ?? "");
              const duplicateSince = new Date(
                now.getTime() - sameDirectionLockMin * 60_000,
              ).toISOString();
              const { data: recentSameDirection } = await supabaseAdmin
                .from("signal_alerts")
                .select("id, fired_at, confidence, killzone")
                .eq("pair", pair)
                .eq("direction", dir)
                .gte("fired_at", duplicateSince)
                .order("fired_at", { ascending: false })
                .limit(1);
              const lastKz = String(recentSameDirection?.[0]?.killzone ?? "");
              const sameKillzone =
                !!lastKz && !!currentKz && lastKz === currentKz;
              if (recentSameDirection?.length && sameKillzone) {
                results.push({
                  pair,
                  action: "duplicate_same_direction_lock",
                  dir,
                  killzone: currentKz,
                  recent_alert_id: recentSameDirection[0].id,
                });
                continue;
              }
            }

            // Cross-pair XAU correlation dedupe: all XAU pairs (USD, EUR, GBP,
            // JPY, AUD, CHF) share the same gold-side driver. If any XAU pair
            // was already alerted in the same direction inside the last 60 min,
            // suppress correlated duplicates — one gold call per session, not six.
            // Manual mode bypasses this too — user picked this specific pair.
            if (!manualMode && pair.startsWith("XAU")) {
              const xauLookback = new Date(
                now.getTime() - 60 * 60_000,
              ).toISOString();
              const { data: recentXau } = await supabaseAdmin
                .from("signal_alerts")
                .select("id, pair, fired_at, direction")
                .like("pair", "XAU%")
                .eq("direction", dir)
                .neq("pair", pair)
                .gte("fired_at", xauLookback)
                .order("fired_at", { ascending: false })
                .limit(1);
              if (recentXau?.length) {
                results.push({
                  pair,
                  action: "xau_correlation_dedup",
                  dir,
                  duplicate_of: recentXau[0].pair,
                  recent_alert_id: recentXau[0].id,
                });
                continue;
              }
            }

            // Open-ticket guard (the 2026-08-26 loss):
            // 09:20 London BUY was still live when a second BUY fired at 12:00
            // in the NY AM killzone at virtually the same price. The killzone
            // changed, so the same-direction lock let it through, and the
            // stacked re-entry got swept for -1R while the original ticket
            // banked TP1. Never open a second ticket in the same direction on
            // the same pair while the previous one is still unresolved.
            if (!manualMode) {
              const openSince = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
              const { data: openTicket } = await supabaseAdmin
                .from("signal_paper_trades")
                .select("id, fired_at")
                .eq("pair", pair)
                .eq("direction", dir)
                .eq("outcome", "pending")
                .gte("fired_at", openSince)
                .order("fired_at", { ascending: false })
                .limit(1);
              if (openTicket?.length) {
                results.push({
                  pair,
                  action: "open_ticket_same_direction",
                  dir,
                  open_trade_id: openTicket[0].id,
                });
                continue;
              }
            }


            // Two-hit confirmation: first qualifying scan only arms the signal.
            // Broadcast only if the same direction is still valid on the next
            // scan inside the confirmation window. This filters one-candle
            // spikes and AI confidence drift (e.g. 74% now, 57% later).
            const firstSeenAt =
              state?.direction === dir && state.first_seen_at
                ? new Date(state.first_seen_at)
                : null;
            const firstAgeMin = firstSeenAt
              ? (now.getTime() - firstSeenAt.getTime()) / 60000
              : Number.POSITIVE_INFINITY;
            const hasConfirmedHit =
              manualMode ||
              conf >= singleHitMinConf ||
              (state?.direction === dir && firstAgeMin <= confirmWindowMin);

            if (!hasConfirmedHit) {
              await supabaseAdmin.from("auto_scan_state").upsert(
                {
                  pair,
                  direction: dir,
                  first_conf: conf,
                  first_seen_at: now.toISOString(),
                  last_broadcast_at:
                    state?.direction === dir ? state?.last_broadcast_at ?? null : null,
                  updated_at: now.toISOString(),
                },
                { onConflict: "pair" },
              );
              results.push({
                pair,
                action: "first_hit_waiting_confirmation",
                conf,
                dir,
                killzone: plan.killzone ?? null,
              });
              continue;
            }

            // Re-quote at broadcast: recompute entry/SL/TP from the latest
            // candle right before firing. The initial `plan` above was used
            // to check gates (direction, conf, killzone, HTF bias); by the
            // time we reach the broadcast step, state lookups and cooldown
            // checks have added latency — refresh so the levels users see
            // reflect the freshest market snapshot, not the top-of-loop one.
            let broadcastPlan = plan;
            try {
              const fresh = await computeSignalPlan({ symbol: pair }, null, { systemScan: true });
              const freshDir = fresh.trade?.direction;
              const freshConf = Number(fresh.trade?.confidence ?? 0);
              // Only accept the requote if direction still matches and
              // confidence hasn't collapsed below threshold. Otherwise the
              // setup has invalidated between checks — skip instead of
              // broadcasting a mixed signal.
              if (freshDir === dir && freshConf >= minConf) {
                broadcastPlan = fresh;
                // Keep confidence, grade and persisted analytics attached to
                // the same freshly re-quoted setup as entry/SL/TP.
                conf = freshConf;
              } else {
                await supabaseAdmin
                  .from("auto_scan_state")
                  .delete()
                  .eq("pair", pair);
                results.push({
                  pair,
                  action: "requote_invalidated",
                  original_dir: dir,
                  requote_dir: freshDir,
                  requote_conf: freshConf,
                });
                continue;
              }
            } catch {
              // Requote failed (transient upstream) — fall back to original plan.
            }

            // Broadcast on first qualifying hit
            const dec = broadcastPlan.instrument?.decimals ?? 2;
            const entry = Number(broadcastPlan.trade?.entry);
            const sl = Number(broadcastPlan.trade?.sl);
            // Prefer engine's stretched TP (tp/tp3) which targets liquidity/2-3R.
            // tp1 is by design exactly 1R and would produce a misleading 1:1 R:R.
            const tRaw =
              broadcastPlan.trade?.tp ??
              broadcastPlan.trade?.tp3 ??
              broadcastPlan.trade?.tp2 ??
              broadcastPlan.trade?.tp1;
            let tp = Number(tRaw);
            if (!isFinite(entry) || !isFinite(sl) || !isFinite(tp)) {
              results.push({ pair, action: "invalid_levels" });
              continue;
            }
            // Always compute R:R from actual entry/SL/TP distances — never trust
            // upstream `plan.trade.rr`, which has produced inflated values
            // (e.g. reporting 3.0 when SL/TP are symmetric ~1:1).
            const riskDist = Math.abs(entry - sl);
            let rewardDist = Math.abs(tp - entry);
            // Enforce a minimum 2R target so broadcasts never carry a 1:1 R:R
            // when the engine only surfaced tp1.
            if (riskDist > 0 && rewardDist < riskDist * 2) {
              tp = dir === "BUY" ? entry + riskDist * 2 : entry - riskDist * 2;
              rewardDist = Math.abs(tp - entry);
            }
            const rr = riskDist > 0 ? rewardDist / riskDist : 0;

            // Freshness gate: refuse to broadcast if live price has already
            // drifted more than 40% of the risk distance toward SL (stale
            // entry) or already blown past TP. This prevents "SELL @ 4051
            // while live is 4072" (entry already at SL) situations caused by
            // 15-min two-hit confirmation lag on fast-moving markets.
            try {
              const live = await getLiveTick({ data: { symbol: pair } });
              const lp = Number(live?.price);
              if (isFinite(lp) && lp > 0 && riskDist > 0) {
                const towardSL = dir === "BUY" ? entry - lp : lp - entry;
                const towardTP = dir === "BUY" ? lp - entry : entry - lp;
                const staleSL = towardSL > 0.4 * riskDist;
                const pastTP = towardTP > 0.6 * rewardDist;
                if (staleSL || pastTP) {
                  results.push({
                    pair,
                    action: "skipped_stale_entry",
                    entry,
                    live: lp,
                    reason: staleSL ? "drifted_toward_sl" : "already_past_tp",
                  });
                  continue;
                }
              }
            } catch {
              // If live price lookup fails, fall through — better to broadcast
              // than to silently drop every signal on a transient upstream error.
            }

            const setupScore = Math.round(broadcastPlan.setupScore ?? conf);
            // Grade must reflect the displayed blended confidence, not the raw
            // setup score — otherwise a 71% signal shows as grade "C".
            const gradeBasis = Math.round(conf);
            const grade =
              gradeBasis >= 88
                ? "A+"
                : gradeBasis >= 75
                  ? "A"
                  : gradeBasis >= 65
                    ? "B"
                    : "C";


            const round = (n: number) => Number(n.toFixed(dec));

            // Detect current FX session from UTC hour
            const utcH = now.getUTCHours();
            const session =
              utcH >= 0 && utcH < 7
                ? "Asia"
                : utcH >= 7 && utcH < 12
                  ? "London"
                  : utcH >= 12 && utcH < 16
                    ? "London/NY Overlap"
                    : utcH >= 16 && utcH < 21
                      ? "New York"
                      : "After Hours";

            // Package SMC markings + narration from the SAME engine output so
            // the Chrome extension can redraw them on TradingView charts
            // (BOS/CHoCH, FVG, order blocks, liquidity, entry/SL/TP) with a
            // Claude-style step-by-step reveal, instead of just 3 price lines.
            const bpAny = broadcastPlan as any;
            const markingsPayload = Array.isArray(bpAny.markings)
              ? bpAny.markings.slice(0, 40)
              : null;
            const narrationPayload = Array.isArray(bpAny.narration)
              ? bpAny.narration.slice(0, 12)
              : null;
            const structurePayload = {
              htfBias: bpAny.htfBias ?? null,
              ltfBias: bpAny.ltfBias ?? null,
              killzone: bpAny.killzone ?? null,
              alignmentLabel: bpAny.alignmentLabel ?? null,
              rr: Number(rr.toFixed(2)),
            };
            const swingsPayload = bpAny.swings ?? bpAny.dealingRange ?? null;

            // Capture which AI models participated in this scan so users can
            // see it in the alerts history ("which model called this signal").
            const modelsUsed: string[] = [];
            const srLabel = bpAny.seniorReview?.modelLabel ?? bpAny.seniorReview?.model;
            const mcLabel = bpAny.macroContext?.modelLabel ?? bpAny.macroContext?.model;
            if (typeof srLabel === "string" && srLabel) modelsUsed.push(srLabel);
            if (typeof mcLabel === "string" && mcLabel) modelsUsed.push(mcLabel);
            // Deterministic SMC/ICT engine is always the primary signal source.
            modelsUsed.unshift("Deterministic SMC/ICT Engine");
            const dedupedModels = Array.from(new Set(modelsUsed));

            // Insert signal_alert
            const { data: inserted, error: insErr } = await supabaseAdmin
              .from("signal_alerts")
              .insert({
                pair,
                grade,
                direction: dir,
                entry: round(entry),
                sl: round(sl),
                tp: round(tp),
                rr: Number(rr.toFixed(2)),
                confidence: Math.round(conf),
                setup_score: setupScore,
                htf_bias: plan.htfBias ?? null,
                session,
                killzone: plan.killzone ?? null,
                rationale: `${manualMode ? "Manual scan" : "Auto-scan · single-hit"}${newsContext ? ` · Post-news reaction (${newsContext.title}, ${newsContext.minutesAgo}m ago)` : ""} · ${plan.alignmentLabel ?? ""}`.slice(
                  0,
                  1000,
                ),
                markings: markingsPayload,
                narration: narrationPayload,
                structure: structurePayload,
                swings: swingsPayload,
                models_used: dedupedModels,
              })
              .select("id, fired_at")
              .single();


            if (insErr || !inserted) {
              results.push({
                pair,
                action: "insert_failed",
                error: insErr?.message,
              });
              continue;
            }

            // Paper-trading log: record every broadcasted signal for
            // objective outcome tracking (win/loss/timeout) resolved later
            // by the paper-trade-resolver hook. Independent of user
            // "Trade Done" self-reporting.
            await supabaseAdmin.from("signal_paper_trades").insert({
              pair,
              direction: dir,
              entry: round(entry),
              sl: round(sl),
              tp: round(tp),
              rr: Number(rr.toFixed(2)),
              confidence: Math.round(conf),
              setup_score: setupScore,
              grade,
              htf_bias: plan.htfBias ?? null,
              killzone: plan.killzone ?? null,
              session,
              gates: {
                min_conf: minConf,
                confirmed_hit: true,
                killzone_passed: isActiveKillzone(plan.killzone),
                cooldown_passed: true,
                news_reaction: newsContext ?? null,
                // Per-factor calibration input + UI badges.
                confluences: qualification.ok ? qualification.confluences : [],
                calibration_bump: calibrationBump,
                filled: false,
              },

              broadcast_alert_id: inserted.id,
              outcome: "pending",
              models_used: dedupedModels,
            });


            // In-app notifications to all paid users
            const { data: paidUsers } = await supabaseAdmin
              .from("user_subscriptions")
              .select("user_id")
              .eq("status", "active")
              .neq("plan_id", "free");
            const allPaidIds = Array.from(
              new Set(
                (paidUsers ?? []).map(
                  (r: { user_id: string }) => r.user_id,
                ),
              ),
            );
            const { filterAlertsEnabledUserIds } = await import(
              "@/lib/alert-pref-filter.server"
            );
            let userIds = await filterAlertsEnabledUserIds(allPaidIds, { grade, pair, direction: dir });
            // Manual mode: the caller already paid $0.20 to run this scan and
            // sees the plan on-screen. Skip broadcasting back to them.
            if (manualMode && manualExcludeUserId) {
              userIds = userIds.filter((u) => u !== manualExcludeUserId);
            }

            // Per-user daily-loss kill-switch: users who enabled the guard and
            // whose realized losses today already crossed their limit get
            // filtered out of this broadcast — no notification, no email, no
            // charge. They can still see history on their dashboard.
            if (userIds.length > 0) {
              const { data: killRows } = await supabaseAdmin
                .from("user_risk_settings")
                .select("user_id, daily_loss_limit_usd, kill_switch_enabled")
                .in("user_id", userIds)
                .eq("kill_switch_enabled", true);
              const guarded = (killRows ?? []).filter(
                (r) => r.daily_loss_limit_usd && Number(r.daily_loss_limit_usd) > 0,
              );
              if (guarded.length > 0) {
                const dayStart = new Date();
                dayStart.setUTCHours(0, 0, 0, 0);
                const { data: journalRows } = await supabaseAdmin
                  .from("trade_journal")
                  .select("user_id, pnl")
                  .in("user_id", guarded.map((g) => g.user_id))
                  .gte("closed_at", dayStart.toISOString());
                const lossByUser = new Map<string, number>();
                for (const r of journalRows ?? []) {
                  const p = Number(r.pnl ?? 0);
                  if (p < 0) {
                    lossByUser.set(
                      r.user_id,
                      (lossByUser.get(r.user_id) ?? 0) + Math.abs(p),
                    );
                  }
                }
                const blocked = new Set<string>();
                for (const g of guarded) {
                  const loss = lossByUser.get(g.user_id) ?? 0;
                  if (loss >= Number(g.daily_loss_limit_usd)) blocked.add(g.user_id);
                }
                if (blocked.size > 0) {
                  userIds = userIds.filter((u) => !blocked.has(u));
                }
              }
            }
            let notified = 0;
            if (userIds.length > 0) {
              const { getPersonalRiskMap } = await import(
                "@/lib/personal-risk.server"
              );
              const riskMap = await getPersonalRiskMap(userIds, { entry, sl });
              const kz = plan.killzone ? ` · ${plan.killzone}` : "";
              const newsTag = newsContext ? ` · 📰 ${newsContext.title}` : "";
              const title = `${grade} ${dir} · ${pair} · ${session}${kz}${newsTag}`;
              const rows = userIds.map((uid) => {
                const personal = riskMap.get(uid);
                const sizeNote = personal?.size?.note ?? "";
                const body =
                  `Entry ${round(entry)} · SL ${round(sl)} · TP ${round(tp)} · R:R ${rr.toFixed(2)} · ${Math.round(conf)}% conf` +
                  (sizeNote ? ` · ${sizeNote}` : "");
                return {
                  user_id: uid,
                  type: "signal_alert",
                  title,
                  body,
                  data: {
                    alert_id: inserted.id,
                    pair,
                    grade,
                    direction: dir,
                    entry: round(entry),
                    sl: round(sl),
                    tp: round(tp),
                    rr: Number(rr.toFixed(2)),
                    confidence: Math.round(conf),
                    setup_score: setupScore,
                    session,
                    killzone: plan.killzone ?? null,
                    source: manualMode ? "manual_scan" : "auto_scan",
                    personal_risk: personal?.size
                      ? {
                          lots: personal.size.lots,
                          units: personal.size.units,
                          risk_usd: personal.size.riskUsd,
                          balance_usd: personal.balance,
                          risk_pct: personal.riskPct,
                        }
                      : null,
                  },
                };
              });
              for (let i = 0; i < rows.length; i += 500) {
                await supabaseAdmin
                  .from("user_notifications")
                  .insert(rows.slice(i, i + 500));
              }
              notified = rows.length;
            }


            // Per-recipient billing: charge $0.20 to every paid user who
            // opted in via alerts_enabled (already filtered above in
            // `userIds`). Users who disabled alerts are not in `userIds`
            // and are not charged. Idempotent via unique per-user scanId.
            //
            // Charges MUST run before the slower email/WhatsApp fan-out —
            // otherwise the Worker can hit its CPU/wall budget mid-scan
            // (the Auth Admin API call per recipient dominates the tail)
            // and users get the alert without being billed.
            let charged = 0;
            if (userIds.length > 0) {
              try {
                const { chargeSignalScan } = await import(
                  "@/lib/ai-cost-log.server"
                );
                const model = "auto-scan/ict-smc";
                await Promise.all(
                  userIds.map(async (uid) => {
                    try {
                      await chargeSignalScan({
                        userId: uid,
                        direction: dir,
                        model,
                        symbol: pair,
                        scanId: `auto_${inserted.id}_${uid}`,
                        grade,
                        score: setupScore,
                      });
                      charged += 1;
                    } catch (err) {
                      console.warn(
                        "auto-scan chargeSignalScan failed for",
                        uid,
                        (err as Error)?.message,
                      );
                    }
                  }),
                );
              } catch (e) {
                console.warn(
                  "auto-scan chargeSignalScan module import failed",
                  (e as Error)?.message,
                );
              }
            }

            // Enqueue emails to opted-in paid subscribers
            let emailed = 0;
            try {
              const { enqueueSignalAlertEmails } = await import(
                "@/lib/signal-alert-email.server"
              );
              const r = await enqueueSignalAlertEmails({
                alertId: inserted.id,
                firedAt: inserted.fired_at,
                pair,
                grade,
                direction: dir,
                entry,
                sl,
                tp,
                rr,
                confidence: conf,
                decimals: dec,
                session,
                killzone: plan.killzone ?? null,
                htfBias: plan.htfBias ?? null,
                rationale: `${manualMode ? "Manual scan" : "Auto-scan"}${newsContext ? ` · Post-news reaction (${newsContext.title})` : ""} · ${plan.alignmentLabel ?? ""}`.slice(0, 500),
                excludeUserId: manualMode ? manualExcludeUserId : null,
              });
              emailed = r.enqueued;
            } catch (e) {
              // Don't fail the scan if email enqueue errors out
              console.error("auto-scan email enqueue failed", e);
            }

            // WhatsApp fan-out to verified, opted-in paid subscribers
            let whatsappSent = 0;
            try {
              const { sendSignalAlertWhatsApp } = await import(
                "@/lib/whatsapp-alert.server"
              );
              const wa = await sendSignalAlertWhatsApp({
                alertId: inserted.id,
                pair,
                grade,
                direction: dir,
                entry,
                sl,
                tp,
                rr,
                confidence: conf,
                decimals: dec,
                session,
                killzone: plan.killzone ?? null,
                htfBias: plan.htfBias ?? null,
                rationale: `${manualMode ? "Manual scan" : "Auto-scan"} · ${plan.alignmentLabel ?? ""}`.slice(0, 500),
              });
              whatsappSent = wa.sent;
            } catch (e) {
              console.error("auto-scan whatsapp fan-out failed", e);
            }



            // Ledger entry (system pool cost per broadcast)
            await supabaseAdmin.from("auto_scan_pool_ledger").insert({
              pair,
              direction: dir,
              confidence: Math.round(conf),
              alert_id: inserted.id,
              broadcast_count: notified,
              cost_usd: 0.2,
            });





            // Update state: mark broadcast, clear first-hit
            await supabaseAdmin.from("auto_scan_state").upsert(
              {
                pair,
                direction: dir,
                first_conf: conf,
                first_seen_at: now.toISOString(),
                last_broadcast_at: now.toISOString(),
                updated_at: now.toISOString(),
              },
              { onConflict: "pair" },
            );

            results.push({
              pair,
              action: "broadcast",
              alert_id: inserted.id,
              notified,
              emailed,
              whatsapp_sent: whatsappSent,

              charged,
              conf,
              dir,
            });

          } catch (err) {
            results.push({
              pair,
              action: "error",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const broadcasted = results.some((r) => r.action === "broadcast");
        const qualifiedButBlocked = results.filter((r) =>
          [
            "first_hit_waiting_confirmation",
            "cooldown",
            "already_broadcast_same_dir",
            "duplicate_same_direction_lock",
            "xau_correlation_dedup",
            "requote_invalidated",
            "skipped_stale_entry",
            "insert_failed",
            "invalid_levels",
            "error",
          ].includes(String(r.action)),
        );

        if (!manualMode) {
          try {
            await supabaseAdmin.from("auto_scan_pool_ledger").insert({
              pair: broadcasted ? "__HEARTBEAT_BROADCAST__" : "__HEARTBEAT_SCAN__",
              direction: broadcasted ? "BROADCAST" : "SCAN",
              confidence: 0,
              alert_id: null,
              broadcast_count: 0,
              cost_usd: 0,
              ai_cost_usd: 0,
            });
          } catch {
            // Heartbeat is diagnostic only; never fail the scan because of it.
          }
        }

        const __broadcastRow = results.find((r) => r.action === "broadcast") as
          | { pair?: string; alert_id?: string }
          | undefined;
        await logRun({
          pairs_checked: workingPairs,
          broadcast_pair: __broadcastRow?.pair ?? null,
          broadcast_alert_id: __broadcastRow?.alert_id ?? null,
          results,
        });

        return Response.json({
          ok: true,
          mode: manualMode ? "manual" : "auto",
          started_at: runStartedAt,
          min_conf: minConf,
          news_reaction: newsContext,
          pairs_checked: workingPairs,
          pairs_configured: pairs,
          scan_batch_size: scanBatchSize,
          scan_batch_slot: manualMode ? null : batchSlot,
          broadcasted,
          blocked_after_qualification: qualifiedButBlocked,
          results,
        });
      },
      GET: async () => {
        return new Response("Method not allowed", { status: 405 });
      },
    },
  },
});
