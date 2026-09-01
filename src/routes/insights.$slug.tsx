import SiteNavLinks from "@/components/SiteNavLinks";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Tables } from "@/integrations/supabase/types";
import SiteFooter from "@/components/SiteFooter";

type Insight = Tables<"insights">;

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function fmtUTCLong(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · ${hh}:${mm} UTC`;
}

const insightDetailQueryOptions = (slug: string) => queryOptions({
  queryKey: ["insight", slug],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("insights")
      .select("id, title, slug, excerpt, content, category, image_url, is_breaking, published_at, created_at, updated_at, indexed_at")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound();
    return data as Insight;
  },
});

export const Route = createFileRoute("/insights/$slug")({
  head: ({ params, loaderData }) => {
    const data = loaderData as Insight | undefined;
    const url = `https://jenvu.com/insights/${params.slug}`;
    const title = data ? `${data.title} — Jenvu` : "Market Insight — Jenvu";
    const desc = data?.excerpt || "Institutional market analysis from Jenvu.";
    const img = data?.image_url || "https://jenvu.com/favicon.png";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: data?.title || title },
        { property: "og:description", content: desc },
        { property: "og:image", content: img },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: data?.title || title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: img },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: data
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Article",
                headline: data.title,
                description: data.excerpt,
                image: [img],
                datePublished: data.published_at,
                dateModified: data.updated_at || data.published_at,
                author: { "@type": "Organization", name: "Jenvu" },
                publisher: {
                  "@type": "Organization",
                  name: "Jenvu",
                  logo: { "@type": "ImageObject", url: "https://jenvu.com/favicon.png" },
                },
                mainEntityOfPage: { "@type": "WebPage", "@id": url },
                articleSection: data.category,
              }),
            },
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: "https://jenvu.com/" },
                  { "@type": "ListItem", position: 2, name: "Insights", item: "https://jenvu.com/insights" },
                  { "@type": "ListItem", position: 3, name: data.title, item: url },
                ],
              }),
            },
          ]
        : [],
    };
  },
  loader: ({ params, context }) => context.queryClient.ensureQueryData(insightDetailQueryOptions(params.slug)),
  component: InsightDetailPage,
  errorComponent: ({ error, reset }) => (
    <div className="min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-xs font-mono uppercase tracking-widest text-red-600 mb-3">Report unavailable</div>
      <h1 className="text-2xl font-semibold mb-3">We couldn't load this briefing.</h1>
      <p className="text-sm text-zinc-500 max-w-md mb-6">{error?.message || "The article may have moved or the connection failed."}</p>
      <div className="flex gap-3">
        <button onClick={() => reset()} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Retry</button>
        <Link to="/insights" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium">Back to insights</Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold mb-3">Briefing not found</h1>
      <Link to="/insights" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Back to insights</Link>
    </div>
  ),
});


const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

function InsightDetailPage() {
  const { slug } = useParams({ from: "/insights/$slug" });
  const { data: insight } = useSuspenseQuery(insightDetailQueryOptions(slug));
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(100, Math.max(0, (scrolled / max) * 100)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [slug]);

  return (
    <>
      <div className={`jenvu-zoom min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased selection:bg-zinc-900 selection:text-white`}>
        {/* NAV */}
        <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
          <div
            className="absolute left-0 top-0 h-[3px] bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%` }}
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
              <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
            </Link>
            <SiteNavLinks active="/insights" />
            <HeaderAuthButtons />
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-5 sm:px-6 py-12 sm:py-20">
          <Link
            to="/insights"
            className={`${MONO} text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-900 mb-8 inline-flex items-center gap-2`}
          >
            ← Back to insights
          </Link>

          <header className="mb-10 sm:mb-16">
            <div className={`${MONO} text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-4`}>
              {insight.category} // REPORT_{insight.id.slice(0, 8).toUpperCase()}
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-tight text-zinc-900">
              {insight.title}
            </h1>
            <div className="mt-8 flex items-center gap-4 text-xs text-zinc-400">
              <span>{fmtUTCLong(insight.published_at)}</span>
              <span className="h-1 w-1 rounded-full bg-zinc-200" />
              <span>Institutional Grade</span>
            </div>
          </header>

          <div className="aspect-[21/9] rounded-2xl overflow-hidden mb-12 border border-zinc-100 shadow-xl bg-zinc-100">
            <img
              src={insight.image_url || `https://source.unsplash.com/1600x900/?gold,trading,${encodeURIComponent(insight.category)}`}
              alt={insight.title}
              onError={(e) => {
                const t = e.currentTarget;
                t.onerror = null;
                t.src = `https://source.unsplash.com/1600x900/?gold,finance,${encodeURIComponent(insight.category)}`;
              }}
              className="w-full h-full object-cover"
            />
          </div>

          {insight.excerpt && (
            <p className="text-xl sm:text-2xl leading-relaxed text-zinc-700 font-light mb-12 pb-12 border-b border-zinc-100">
              {insight.excerpt}
            </p>
          )}

          <article className="article-body text-[17px] leading-[1.85] text-zinc-800">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h2 className="mt-16 mb-6 text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900 leading-tight">{children}</h2>
                ),
                h2: ({ children }) => (
                  <h2 className="mt-16 mb-6 text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 leading-tight">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mt-12 mb-4 text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">{children}</h3>
                ),
                h4: ({ children }) => (
                  <h4 className={`${MONO} mt-10 mb-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500`}>{children}</h4>
                ),
                p: ({ children }) => (
                  <p className="mb-7 text-zinc-700">{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-zinc-900 bg-yellow-50 px-1 rounded-sm">{children}</strong>
                ),
                em: ({ children }) => (
                  <em className="italic text-zinc-900">{children}</em>
                ),
                a: ({ href, children }) => (
                  <a href={href} className="text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900 transition-colors">{children}</a>
                ),
                ul: ({ children }) => (
                  <ul className="my-7 space-y-3 pl-0 list-none">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-7 space-y-3 pl-0 list-none counter-reset-[item]">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="relative pl-7 text-zinc-700 before:content-[''] before:absolute before:left-0 before:top-[0.7em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-zinc-900">
                    {children}
                  </li>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="my-10 border-l-4 border-zinc-900 bg-zinc-50 pl-6 pr-5 py-5 rounded-r-lg italic text-zinc-800 text-lg">
                    {children}
                  </blockquote>
                ),
                hr: () => <hr className="my-12 border-zinc-200" />,
                code: ({ children, className }) => {
                  const isBlock = className?.includes("language-");
                  if (isBlock) {
                    return (
                      <code className={`${MONO} block bg-zinc-950 text-zinc-100 p-5 rounded-xl text-sm overflow-x-auto my-7`}>
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className={`${MONO} bg-zinc-100 text-zinc-900 px-1.5 py-0.5 rounded text-[0.9em]`}>
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => <pre className="my-7">{children}</pre>,
                table: ({ children }) => (
                  <div className="my-10 overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="w-full text-sm">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="bg-zinc-50">{children}</thead>,
                th: ({ children }) => (
                  <th className={`${MONO} px-4 py-3 text-left text-[11px] uppercase tracking-widest text-zinc-600 border-b border-zinc-200`}>{children}</th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-3 border-b border-zinc-100 text-zinc-700">{children}</td>
                ),
                img: ({ src, alt }) => (
                  <img src={src} alt={alt} className="my-10 rounded-2xl w-full border border-zinc-100" />
                ),
              }}
            >
              {insight.content}
            </ReactMarkdown>
          </article>

          <div className="mt-20 pt-10 border-t border-zinc-100 flex flex-col sm:flex-row items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center overflow-hidden">
                <img src="/favicon.png" alt="JENVU AI" className="h-7 w-7 object-contain" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900">Jenvu Terminal Engine</div>
                <div className={`${MONO} text-[10px] uppercase text-zinc-400`}>Automated Insight Synthesis</div>
              </div>
            </div>
            <div className="flex gap-4">
              <button type="button" aria-label="Share this insight" title="Share this insight" className="p-2 rounded-full border border-zinc-200 hover:bg-zinc-50 transition-colors">
                <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              </button>
              <button type="button" aria-label="Follow Jenvu on Instagram" title="Follow Jenvu on Instagram" className="p-2 rounded-full border border-zinc-200 hover:bg-zinc-50 transition-colors">
                <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              </button>

            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
    </>
  );
}
