import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export type BriefListItem = {
  id: string;
  session: "london" | "new_york" | "asia";
  headline: string;
  summary: string | null;
  audio_url: string;
  duration_seconds: number | null;
  published_at: string;
};

export type BriefDetail = BriefListItem & {
  transcript: string;
};

function publicClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export const listBriefs = createServerFn({ method: "GET" })
  .inputValidator((data: { limit?: number } | undefined) => ({
    limit: Math.min(Math.max(data?.limit ?? 24, 1), 50),
  }))
  .handler(async ({ data }): Promise<BriefListItem[]> => {
    const supabase = publicClient();
    const { data: rows, error } = await supabase
      .from("killzone_briefs")
      .select("id, session, headline, summary, audio_duration_seconds, published_at")
      .eq("is_public", true)
      .order("published_at", { ascending: false })
      .limit(data.limit);
    if (error) return [];
    return (rows ?? []).map((r) => ({
      id: r.id,
      session: r.session as BriefListItem["session"],
      headline: r.headline,
      summary: r.summary,
      audio_url: `/api/public/brief-audio/${r.id}.mp3`,
      duration_seconds: r.audio_duration_seconds,
      published_at: r.published_at,
    }));
  });

export const getBrief = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => ({ id: String(data.id) }))
  .handler(async ({ data }): Promise<BriefDetail | null> => {
    const supabase = publicClient();
    const { data: row, error } = await supabase
      .from("killzone_briefs")
      .select("id, session, headline, summary, transcript, audio_duration_seconds, published_at, is_public")
      .eq("id", data.id)
      .eq("is_public", true)
      .maybeSingle();
    if (error || !row) return null;
    return {
      id: row.id,
      session: row.session as BriefDetail["session"],
      headline: row.headline,
      summary: row.summary,
      transcript: row.transcript,
      audio_url: `/api/public/brief-audio/${row.id}.mp3`,
      duration_seconds: row.audio_duration_seconds,
      published_at: row.published_at,
    };
  });

export const getLatestBrief = createServerFn({ method: "GET" }).handler(
  async (): Promise<BriefListItem | null> => {
    const supabase = publicClient();
    const { data, error } = await supabase
      .from("killzone_briefs")
      .select("id, session, headline, summary, audio_duration_seconds, published_at")
      .eq("is_public", true)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      session: data.session as BriefListItem["session"],
      headline: data.headline,
      summary: data.summary,
      audio_url: `/api/public/brief-audio/${data.id}.mp3`,
      duration_seconds: data.audio_duration_seconds,
      published_at: data.published_at,
    };
  },
);
