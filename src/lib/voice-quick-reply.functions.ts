import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callChatCompletion, AiGatewayError } from "@/lib/ai-gateway";

// Fast conversational voice reply. Uses Bluesmind chat models (with fast
// fallbacks) and plain text — no candles, no JSON schema — so replies land
// in ~1–3s instead of the heavy analyze pipeline (~15–25s).
const FAST_MODELS = [
  "bmind/gpt-5.6-luna",
  "bmind/gpt-5-mini",
  "bmind/gpt-5.2-chat",
  "bmind/gpt-4o",
];

const SYSTEM = `You are Jenvu — a friendly voice trading assistant.
Reply in 1–2 short sentences suitable for speaking aloud.
Never invent prices, entries, stops or targets. If the user asks for a real
trade / signal / setup / entry / SL / TP, tell them to say "analyze XAU/USD"
(or any XAU pair) so the desk can run a full scan.
Keep it natural, warm, and concise.`;

export const voiceQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query: string }) => ({
    query: String(d?.query || "").slice(0, 500),
  }))
  .handler(async ({ data }) => {
    if (!data.query.trim()) return { ok: true as const, reply: "I'm listening." };
    try {
      const { content } = await callChatCompletion({
        models: FAST_MODELS,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: data.query },
        ],
        jsonMode: false,
        timeoutMs: 8000,
        priority: true,
        retriesPerModel: 1,
        stage: "voice-quick-reply",
        maxTokens: 120,
      });
      const reply = String(content || "").trim() || "Okay.";
      return { ok: true as const, reply };
    } catch (err) {
      const msg = err instanceof AiGatewayError ? err.message : String((err as any)?.message ?? err);
      return { ok: false as const, error: msg, reply: "Sorry, I couldn't reach the desk. Please try again." };
    }
  });
