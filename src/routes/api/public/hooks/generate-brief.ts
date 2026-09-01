import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint. Generates a ~150-word killzone brief via Bluesminds/Lovable AI
// and synthesizes MP3 audio via Lovable AI TTS (openai/gpt-4o-mini-tts).
// Auth: shared `x-cron-secret` header matching CRON_SECRET.

type KillzoneSession = "london" | "new_york" | "asia";

function inferSessionFromNow(): KillzoneSession {
  // Rough UTC windows: Asia 00-07, London 07-13, New York 13-21.
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return "asia";
  if (h >= 7 && h < 13) return "london";
  return "new_york";
}

const SESSION_META: Record<KillzoneSession, { label: string; window: string; focus: string }> = {
  london: {
    label: "London Killzone",
    window: "07:00–10:00 UTC",
    focus: "London open volatility, initial daily range, sweep of Asian highs/lows, first draw-on-liquidity.",
  },
  new_york: {
    label: "New York Killzone",
    window: "12:00–15:00 UTC",
    focus: "NY AM session, macro data reactions, judas swings, silver bullet window, PM continuation setups.",
  },
  asia: {
    label: "Asia Killzone",
    window: "00:00–04:00 UTC",
    focus: "Tokyo range formation, seed liquidity for London, low-volume drift and range highs/lows.",
  },
};




export const Route = createFileRoute("/api/public/hooks/generate-brief")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
          return new Response(JSON.stringify({ error: "CRON_SECRET missing" }), { status: 500 });
        }
        const provided = request.headers.get("x-cron-secret") || "";
        if (provided !== cronSecret) {
          return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
        }

        const bmindKey = process.env.BLUESMINDS_API_KEY;
        if (!bmindKey) {
          return new Response(JSON.stringify({ error: "BLUESMINDS_API_KEY missing" }), { status: 500 });
        }


        let body: { session?: KillzoneSession } = {};
        try {
          body = (await request.json()) as { session?: KillzoneSession };
        } catch {
          body = {};
        }
        const session: KillzoneSession = body.session ?? inferSessionFromNow();
        const meta = SESSION_META[session];

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Dedupe: skip if we already published this session in the last 6h.
        const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
        const { count: recent } = await supabaseAdmin
          .from("killzone_briefs")
          .select("id", { count: "exact", head: true })
          .eq("session", session)
          .gte("published_at", since);
        if ((recent ?? 0) > 0) {
          return Response.json({ skipped: "recent-brief-exists", session });
        }

        // Pull latest signal for market context (best-effort).
        const { data: latestSignal } = await supabaseAdmin
          .from("signal_alerts")
          .select("pair, direction, entry, sl, tp, grade, rationale, created_at")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const contextLine = latestSignal
          ? `Latest Jenvu signal (${latestSignal.pair ?? "XAUUSD"}): ${latestSignal.direction ?? ""} @ ${latestSignal.entry ?? "?"}, SL ${latestSignal.sl ?? "?"}, TP ${latestSignal.tp ?? "?"} — grade ${latestSignal.grade ?? "?"}. Rationale: ${(latestSignal.rationale ?? "").slice(0, 240)}`
          : "No fresh Jenvu signal in the last hour; base the brief on structural context only.";

        const sys = `You are the senior desk analyst at Jenvu, an institutional gold trading terminal. You are recording a ${meta.label} audio brief for traders. Style: measured, precise, spoken-word English. Use ICT/SMC vocabulary correctly (liquidity sweep, order block, FVG, MSS, PD array, killzone). No emojis. No hype. No filler like "In this brief" or "Today we will discuss". Speak directly to the trader.`;

        const userPrompt = `Write a ${meta.label} audio brief for the killzone window ${meta.window}.
Focus areas for this session: ${meta.focus}
Market context: ${contextLine}

Return STRICT JSON only, no prose, with this exact shape:
{
  "headline": "<max 70 char headline, no ending punctuation>",
  "summary": "<one sentence, max 140 char, plain text used as podcast description>",
  "script": "<the exact words to be read aloud. 150-180 words. Structured spoken paragraphs. No stage directions. No lists. No markdown. It must read like a professional trader speaking. Open with the session name naturally; do NOT start with 'Welcome' or 'In this brief'.>"
}`;

        // Route via Lovable AI Gateway (primary GPT-5.5, Bluesminds fallback).
        const { callChatCompletion, MODEL_CHAIN } = await import("@/lib/ai-gateway");
        let aiContent = "";
        try {
          const { content } = await callChatCompletion({
            models: [...MODEL_CHAIN.narration],
            messages: [
              { role: "system", content: sys },
              { role: "user", content: userPrompt },
            ],
            jsonMode: true,
            maxTokens: 900,
            stage: "killzone-brief",
          });
          aiContent = content;
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: "ai-failed", body: String(err?.message ?? err).slice(0, 400) }),
            { status: 502 },
          );
        }
        const aiRes = { ok: true, json: async () => ({ choices: [{ message: { content: aiContent } }] }) } as any;


        if (!aiRes.ok) {
          const txt = await aiRes.text().catch(() => "");
          return new Response(
            JSON.stringify({ error: "ai-failed", status: aiRes.status, body: txt.slice(0, 400) }),
            { status: 502 },
          );
        }

        const ai = (await aiRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = ai?.choices?.[0]?.message?.content ?? "{}";
        let parsed: { headline?: string; summary?: string; script?: string };
        try {
          parsed = JSON.parse(raw);
        } catch {
          return new Response(JSON.stringify({ error: "ai-bad-json", raw: raw.slice(0, 400) }), {
            status: 502,
          });
        }

        const headline = (parsed.headline || `${meta.label} — Market brief`).slice(0, 90);
        const summary = (parsed.summary || `${meta.label} brief from Jenvu.`).slice(0, 200);
        const script = (parsed.script || "").trim();
        if (script.length < 200) {
          return new Response(JSON.stringify({ error: "script-too-short", len: script.length }), {
            status: 502,
          });
        }

        const briefId = crypto.randomUUID();

        // Estimate read-time (~150 wpm) as a fallback if audio fails.
        const wordCount = script.split(/\s+/).filter(Boolean).length;
        const estimatedSeconds = Math.max(30, Math.round((wordCount / 150) * 60));

        // Synthesize audio via Lovable AI TTS.
        let audioPath: string | null = null;
        let audioDuration = estimatedSeconds;
        try {
          const lovableKey = process.env.LOVABLE_API_KEY;
          if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");
          const ttsRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: script,
              voice: "onyx",
              response_format: "mp3",
              instructions: "Speak as a measured, senior institutional gold desk analyst. Confident, precise, unhurried. No hype.",
            }),
          });
          if (!ttsRes.ok) {
            const errBody = await ttsRes.text().catch(() => "");
            throw new Error(`TTS ${ttsRes.status}: ${errBody.slice(0, 200)}`);
          }
          const mp3 = new Uint8Array(await ttsRes.arrayBuffer());
          const path = `${session}/${briefId}.mp3`;
          const up = await supabaseAdmin.storage
            .from("briefs")
            .upload(path, mp3, { contentType: "audio/mpeg", upsert: true });
          if (up.error) throw new Error(`upload: ${up.error.message}`);
          audioPath = path;
        } catch (err) {
          console.error("[generate-brief] TTS failed", err);
          // Keep going with text-only brief.
        }

        const { data: inserted, error: insErr } = await supabaseAdmin
          .from("killzone_briefs")
          .insert({
            id: briefId,
            session,
            headline,
            summary,
            script,
            transcript: script,
            audio_path: audioPath,
            audio_duration_seconds: audioDuration,
            is_public: true,
            metadata: {
              session_label: meta.label,
              session_window: meta.window,
              signal_ref: latestSignal ? `${latestSignal.pair} ${latestSignal.direction} @ ${latestSignal.entry}` : null,
            },
          })
          .select("id")
          .single();

        if (insErr) {
          return new Response(JSON.stringify({ error: "insert-failed", message: insErr.message }), {
            status: 500,
          });
        }

        return Response.json({
          ok: true,
          id: inserted.id,
          session,
          audio_path: audioPath,
          duration: audioDuration,
        });
      },
    },
  },
});
