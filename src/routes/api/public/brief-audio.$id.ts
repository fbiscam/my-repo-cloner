import { createFileRoute } from "@tanstack/react-router";

// Public audio proxy for a brief. Streams the private storage object back so
// podcast clients and share pages can play the MP3 without signed URLs.
// If audio_path is null (older briefs or a TTS-failed run), synthesize on
// demand via Lovable AI TTS, cache to storage, and stream the result.
export const Route = createFileRoute("/api/public/brief-audio/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const rawId = params.id;
        // Support `<uuid>.mp3` for prettier URLs and podcast client compat.
        const id = rawId.replace(/\.mp3$/i, "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("bad id", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: brief, error } = await supabaseAdmin
          .from("killzone_briefs")
          .select("id, session, audio_path, is_public, script, transcript")
          .eq("id", id)
          .maybeSingle();

        if (error || !brief || !brief.is_public) {
          return new Response("not found", { status: 404 });
        }

        let audioPath = brief.audio_path as string | null;

        // Lazy TTS: synthesize + cache if missing.
        if (!audioPath) {
          const script = (brief.script || brief.transcript || "").trim();
          if (!script || script.length < 40) {
            return new Response("no script", { status: 404 });
          }
          const lovableKey = process.env.LOVABLE_API_KEY;
          if (!lovableKey) {
            return new Response("tts unavailable", { status: 503 });
          }
          try {
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
                instructions:
                  "Speak as a measured, senior institutional gold desk analyst. Confident, precise, unhurried. No hype.",
              }),
            });
            if (!ttsRes.ok) {
              const errBody = await ttsRes.text().catch(() => "");
              console.error("[brief-audio] TTS failed", ttsRes.status, errBody.slice(0, 200));
              // Surface billing/rate-limit failures so callers (podcast clients,
              // browsers) back off instead of hammering. 402/429 → 503 + Retry-After.
              if (ttsRes.status === 402 || ttsRes.status === 429) {
                return new Response("tts unavailable", {
                  status: 503,
                  headers: { "Retry-After": "3600", "Cache-Control": "no-store" },
                });
              }
              return new Response("tts failed", { status: 502 });
            }
            const mp3 = new Uint8Array(await ttsRes.arrayBuffer());
            const path = `${brief.session ?? "misc"}/${brief.id}.mp3`;
            const up = await supabaseAdmin.storage
              .from("briefs")
              .upload(path, mp3, { contentType: "audio/mpeg", upsert: true });
            if (up.error) {
              console.error("[brief-audio] upload failed", up.error.message);
              return new Response("storage error", { status: 500 });
            }
            await supabaseAdmin
              .from("killzone_briefs")
              .update({ audio_path: path })
              .eq("id", brief.id);
            audioPath = path;

            // Stream the freshly synthesized bytes directly.
            return new Response(mp3, {
              headers: {
                "Content-Type": "audio/mpeg",
                "Cache-Control": "public, max-age=3600, s-maxage=86400",
                "Content-Length": String(mp3.byteLength),
                "Accept-Ranges": "bytes",
              },
            });
          } catch (err: any) {
            console.error("[brief-audio] lazy TTS error", err?.message ?? err);
            return new Response("tts error", { status: 500 });
          }
        }

        const dl = await supabaseAdmin.storage.from("briefs").download(audioPath);
        if (dl.error || !dl.data) {
          return new Response("audio missing", { status: 404 });
        }

        const buf = await dl.data.arrayBuffer();
        return new Response(buf, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
            "Content-Length": String(buf.byteLength),
            "Accept-Ranges": "bytes",
          },
        });
      },
    },
  },
});
