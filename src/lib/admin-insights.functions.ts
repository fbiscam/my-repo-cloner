import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callChatCompletion } from "@/lib/ai-gateway";

// Bluesminds-only writing assistant for the Insights desk.
const WRITER_CHAIN = ["bmind/gpt-4o", "bmind/gpt-5.2-chat"];

async function assertAdmin(supabase: any, userId: string) {
  const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
  const ok = await isAdminOrOpsUnlocked(supabase, userId);
  if (!ok) throw new Error("Forbidden: admin access required");
}

export type InsightDraft = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
};

const SYSTEM = `You are the senior editorial writer for Jenvu, an AI gold (XAU/USD) trading terminal. Write precise, factually careful, SEO-aware markdown for European retail and prop-firm traders. Use ICT/SMC concepts correctly. No hype, no emojis, no filler. British English. Use ## / ### headings, tight bullet lists, and end long articles with a "## FAQ" section of 3 Q&A pairs.`;

function stripFences(raw: string) {
  return raw.trim().replace(/^```(?:json|markdown)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function parseJson<T>(raw: string): T {
  const cleaned = stripFences(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("The assistant did not return valid JSON. Try again.");
    return JSON.parse(m[0]) as T;
  }
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

/** Full article draft from a topic/keyword. */
export const draftInsight = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        topic: z.string().min(3).max(300),
        category: z.string().min(2).max(60).default("Market Structure"),
        angle: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<InsightDraft> => {
    await assertAdmin(context.supabase, context.userId);

    const { content: text } = await callChatCompletion({
      models: WRITER_CHAIN,
      stage: "insight-draft",
      timeoutMs: 90_000,
      maxTokens: 4000,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Write a complete 900-1300 word article on: "${data.topic}"
Angle: ${data.angle || "comprehensive guide"}
Category: ${data.category}

Return STRICT JSON only:
{"title":"<=60 char SEO title","slug":"url-safe-slug","excerpt":"150-160 char meta description","content":"full markdown article with ## sections and a final ## FAQ"}`,
        },
      ],
    });

    const parsed = parseJson<Partial<InsightDraft>>(text);
    const title = (parsed.title || data.topic).slice(0, 120);
    return {
      title,
      slug: slugify(parsed.slug || title),
      excerpt: (parsed.excerpt || "").slice(0, 250),
      content: parsed.content || "",
      category: data.category,
    };
  });

/** Assist on existing text: rewrite, expand, shorten, proofread, SEO meta, headline ideas. */
export const assistInsightWriting = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.enum(["improve", "expand", "shorten", "proofread", "seo", "headlines", "continue"]),
        text: z.string().min(10).max(40_000),
        instruction: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ result: string }> => {
    await assertAdmin(context.supabase, context.userId);

    const task: Record<string, string> = {
      improve: "Rewrite the text below for clarity, rhythm and authority. Keep the meaning, structure and markdown. Return only the rewritten markdown.",
      expand: "Expand the text below with concrete detail, examples and correct ICT/SMC reasoning. Keep the existing voice. Return only markdown.",
      shorten: "Tighten the text below by roughly 30% without losing substance. Return only markdown.",
      proofread: "Correct grammar, spelling (British English), punctuation and factual sloppiness in the text below. Return only the corrected markdown.",
      seo: "Return STRICT JSON only: {\"title\":\"<=60 chars\",\"excerpt\":\"150-160 chars\",\"keywords\":[\"...\"]} optimised for European gold-trading search intent, based on the text below.",
      headlines: "Return 6 alternative SEO headlines (<=60 chars each) as a markdown numbered list, based on the text below.",
      continue: "Continue writing the article from where the text below stops, matching voice and structure. Return only the new markdown to append.",
    };

    const { content: text } = await callChatCompletion({
      models: WRITER_CHAIN,
      stage: `insight-assist-${data.action}`,
      timeoutMs: 75_000,
      maxTokens: 3000,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${task[data.action]}${data.instruction ? `\nExtra instruction: ${data.instruction}` : ""}\n\n---\n${data.text}`,
        },
      ],
    });

    return { result: stripFences(text) };
  });

/** Generate (or regenerate) the AI cover image for a draft/article. */
export const generateInsightImage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(3).max(200),
        category: z.string().min(2).max(60),
        slug: z.string().min(1).max(120),
        insightId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ image_url: string }> => {
    await assertAdmin(context.supabase, context.userId);

    const { generateInsightCover } = await import("@/lib/insight-image.server");
    const image_url = await generateInsightCover({
      title: data.title,
      category: data.category,
      slug: slugify(data.slug),
    });
    if (!image_url) throw new Error("Image generation failed. Try again.");

    if (data.insightId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("insights").update({ image_url }).eq("id", data.insightId);
    }
    return { image_url };
  });

export type InsightRow = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  image_url: string | null;
  published_at: string;
};

export const listInsightsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InsightRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("insights")
      .select("id,title,slug,category,excerpt,image_url,published_at")
      .order("published_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as InsightRow[];
  });

export const publishInsight = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().min(3).max(200),
        slug: z.string().min(3).max(120),
        excerpt: z.string().min(10).max(300),
        content: z.string().min(200),
        category: z.string().min(2).max(60),
        image_url: z.string().min(1).optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ slug: string }> => {
    await assertAdmin(context.supabase, context.userId);

    const slug = slugify(data.slug);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let image_url = data.image_url;
    if (!image_url) {
      const { generateInsightCover } = await import("@/lib/insight-image.server");
      image_url = (await generateInsightCover({ title: data.title, category: data.category, slug })) ?? undefined;
    }

    const { error } = await supabaseAdmin.from("insights").upsert(
      {
        title: data.title,
        slug,
        excerpt: data.excerpt,
        content: data.content,
        category: data.category,
        image_url: image_url ?? null,
        published_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(error.message);
    return { slug };
  });
