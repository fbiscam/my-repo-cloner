import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const SITE = "https://jenvu.com";
const FEED_TITLE = "Jenvu Killzone Briefs";
const FEED_DESCRIPTION =
  "Institutional-grade audio briefs on gold for the London, New York, and Asia killzones. Delivered every session by Jenvu AI.";
const FEED_AUTHOR = "Jenvu AI";
const FEED_EMAIL = "briefs@jenvu.com";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(iso: string) {
  return new Date(iso).toUTCString();
}

function toItunesDuration(sec: number | null) {
  const s = Math.max(0, Math.round(sec ?? 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const SESSION_LABEL: Record<string, string> = {
  london: "London Killzone",
  new_york: "New York Killzone",
  asia: "Asia Killzone",
};

export const Route = createFileRoute("/api/public/podcast.xml")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        const { data: rows } = await supabase
          .from("killzone_briefs")
          .select("id, session, headline, summary, transcript, audio_duration_seconds, audio_path, published_at")
          .eq("is_public", true)
          .not("audio_path", "is", null)
          .order("published_at", { ascending: false })
          .limit(50);

        const items = (rows ?? [])
          .map((r) => {
            const link = `${SITE}/brief/${r.id}`;
            const audio = `${SITE}/api/public/brief-audio/${r.id}.mp3`;
            const label = SESSION_LABEL[r.session] || r.session;
            const title = `${label} — ${r.headline}`;
            const desc = r.summary || r.transcript.slice(0, 240);
            return `
    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">jenvu-brief-${r.id}</guid>
      <pubDate>${toRfc822(r.published_at)}</pubDate>
      <description>${esc(desc)}</description>
      <content:encoded><![CDATA[<p>${esc(desc)}</p><p><a href="${link}">Open on Jenvu</a></p>]]></content:encoded>
      <enclosure url="${esc(audio)}" length="0" type="audio/mpeg" />
      <itunes:author>${esc(FEED_AUTHOR)}</itunes:author>
      <itunes:duration>${toItunesDuration(r.audio_duration_seconds)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
      <itunes:episodeType>full</itunes:episodeType>
    </item>`;
          })
          .join("");

        const lastBuild = rows && rows[0] ? toRfc822(rows[0].published_at) : new Date().toUTCString();

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(FEED_TITLE)}</title>
    <link>${SITE}/briefs</link>
    <atom:link href="${SITE}/api/public/podcast.xml" rel="self" type="application/rss+xml" />
    <language>en-us</language>
    <description>${esc(FEED_DESCRIPTION)}</description>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <itunes:author>${esc(FEED_AUTHOR)}</itunes:author>
    <itunes:summary>${esc(FEED_DESCRIPTION)}</itunes:summary>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:owner>
      <itunes:name>${esc(FEED_AUTHOR)}</itunes:name>
      <itunes:email>${esc(FEED_EMAIL)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${SITE}/favicon.png" />
    <itunes:category text="Business">
      <itunes:category text="Investing" />
    </itunes:category>
    ${items}
  </channel>
</rss>`;

        return new Response(xml, {
          headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=600",
          },
        });
      },
    },
  },
});
