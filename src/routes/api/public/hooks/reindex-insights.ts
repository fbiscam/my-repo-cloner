import { createFileRoute } from "@tanstack/react-router";
import { submitToGoogle, submitToIndexNow } from "./generate-insight";

const BASE_URL = "https://jenvu.com";

async function handle(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("x-cron-secret") ||
    new URL(request.url).searchParams.get("secret") ||
    "";
  if (!cronSecret || provided !== cronSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let q = supabaseAdmin
    .from("insights")
    .select("id, slug, indexed_at")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (!force) q = q.is("indexed_at", null);
  const { data: rows, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const items = rows ?? [];
  if (!items.length) return Response.json({ ok: true, count: 0, note: "nothing-to-index" });

  const urls = items.map((r) => `${BASE_URL}/insights/${r.slug}`);
  const indexnow = await submitToIndexNow([...urls, `${BASE_URL}/sitemap.xml`]);

  const google: Record<string, unknown> = {};
  await Promise.all(
    items.map(async (r) => {
      const u = `${BASE_URL}/insights/${r.slug}`;
      const res = await submitToGoogle(u);
      google[r.slug] = res;
      await supabaseAdmin
        .from("insights")
        .update({
          indexed_at: new Date().toISOString(),
          index_status: { google: res, indexnow },
        })
        .eq("id", r.id);
    }),
  );

  return Response.json({ ok: true, count: items.length, indexnow, google });
}

export const Route = createFileRoute("/api/public/hooks/reindex-insights")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
