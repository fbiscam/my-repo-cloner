import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const saveVoiceTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      query: z.string().min(1).max(2000),
      reply: z.string().min(1).max(20000),
      source: z.string().max(40).optional(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("voice_history").insert({
      user_id: userId,
      query: data.query,
      reply: data.reply,
      source: data.source ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVoiceTurns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("voice_history")
      .select("id, query, reply, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id as string,
      query: r.query as string,
      reply: r.reply as string,
      ts: new Date(r.created_at).getTime(),
    }));
  });

export const clearVoiceTurns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("voice_history").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
