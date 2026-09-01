import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { findArticle, findCollection, type Article, type Block } from "@/lib/help-content";

export const Route = createFileRoute("/help/$collection/$slug")({
  loader: ({ params }) => {
    const result = findArticle(params.collection, params.slug);
    if (!result) throw notFound();
    return result;
  },
  head: ({ params, loaderData }) => {
    const title = loaderData?.article?.title ?? "Help";
    const desc = loaderData?.article?.summary ?? "Jenvu AI Help Center article";
    const collectionTitle = loaderData?.collection?.title ?? "Help Center";
    const url = `https://jenvu.com/help/${params.collection}/${params.slug}`;
    return {
      meta: [
        { title: `${title} | Jenvu AI Help` },
        { name: "description", content: desc },
        { property: "og:title", content: `${title} — ${collectionTitle}` },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { property: "article:section", content: collectionTitle },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: loaderData
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Article",
                headline: title,
                description: desc,
                datePublished: loaderData.article.updatedAt,
                dateModified: loaderData.article.updatedAt,
                author: { "@type": "Organization", name: "Jenvu AI" },
                publisher: { "@type": "Organization", name: "Jenvu AI", url: "https://jenvu.com" },
                mainEntityOfPage: url,
                articleSection: collectionTitle,
              }),
            },
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Help Center", item: "https://jenvu.com/help" },
                  { "@type": "ListItem", position: 2, name: collectionTitle, item: `https://jenvu.com/help/${params.collection}` },
                  { "@type": "ListItem", position: 3, name: title, item: url },
                ],
              }),
            },
          ]
        : [],
    };
  },
  notFoundComponent: () => <NotFoundArticle />,
  errorComponent: () => <NotFoundArticle />,
  component: ArticlePage,
});

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

function ArticlePage() {
  const { collection, article } = Route.useLoaderData();
  const related = (findCollection(collection.slug)?.articles ?? [])
    .filter((a: Article) => a.slug !== article.slug)
    .slice(0, 3);

  return (
    <>
      <div className={`jenvu-zoom min-h-dvh bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased`}>
        <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
              <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
            </Link>
            <HeaderAuthButtons />
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-5 sm:px-6 py-12 sm:py-16">
          <nav className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500 flex items-center gap-1.5 flex-wrap`}>
            <Link to="/help" className="hover:text-zinc-900">Help</Link>
            <ChevronRight className="h-3 w-3" />
            <Link to="/help/$collection" params={{ collection: collection.slug }} className="hover:text-zinc-900">
              {collection.title}
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-zinc-900 truncate">{article.title}</span>
          </nav>

          <h1 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight">{article.title}</h1>
          <p className="mt-3 text-zinc-600 text-base sm:text-lg">{article.summary}</p>
          <div className={`${MONO} mt-4 text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
            Updated {new Date(article.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </div>

          <article className="mt-10 space-y-6 text-zinc-800 leading-relaxed">
            {article.body.map((b: Block, i: number) => {
              if (b.type === "h2") return <h2 key={i} className="text-xl sm:text-2xl font-semibold tracking-tight pt-2 text-zinc-900">{b.content}</h2>;
              if (b.type === "h3") return <h3 key={i} className="text-base sm:text-lg font-semibold tracking-tight text-zinc-900">{b.content}</h3>;
              if (b.type === "p") return <p key={i}>{b.content}</p>;
              if (b.type === "ul") return (
                <ul key={i} className="list-disc pl-5 space-y-2 marker:text-zinc-400">
                  {b.items.map((it: string, j: number) => <li key={j}>{it}</li>)}
                </ul>
              );
              if (b.type === "ol") return (
                <ol key={i} className="list-decimal pl-5 space-y-2 marker:text-zinc-400">
                  {b.items.map((it: string, j: number) => <li key={j}>{it}</li>)}
                </ol>
              );
              if (b.type === "code") return (
                <pre key={i} className={`${MONO} rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[12px] sm:text-[13px] text-zinc-800 whitespace-pre-wrap`}>{b.content}</pre>
              );
              // note
              const tone = b.tone ?? "info";
              const styles =
                tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" :
                tone === "tip"  ? "border-emerald-200 bg-emerald-50 text-emerald-900" :
                                  "border-zinc-200 bg-zinc-50 text-zinc-800";
              const label = tone === "warn" ? "Heads up" : tone === "tip" ? "Tip" : "Note";
              return (
                <div key={i} className={`rounded-xl border ${styles} p-4`}>
                  <div className={`${MONO} text-[10px] uppercase tracking-[0.22em] opacity-70 mb-1`}>{label}</div>
                  <div className="text-sm">{b.content}</div>
                </div>
              );
            })}
          </article>

          {/* Feedback */}
          <div className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-medium text-zinc-900">Was this article helpful?</div>
              <div className="text-xs text-zinc-600">Your feedback helps us improve.</div>
            </div>
            <div className="flex items-center gap-2">
              <FeedbackButton label="Yes" />
              <FeedbackButton label="No" />
            </div>
          </div>

          {/* Related */}
          {related.length > 0 && (
            <section className="mt-12">
              <div className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
                Related articles
              </div>
              <ul className="mt-4 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
                {related.map((a) => (
                  <li key={a.slug}>
                    <Link
                      to="/help/$collection/$slug"
                      params={{ collection: collection.slug, slug: a.slug }}
                      className="group flex items-start justify-between gap-4 px-5 py-4 hover:bg-zinc-50 transition"
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-900">{a.title}</div>
                        <div className="mt-0.5 text-xs text-zinc-600">{a.summary}</div>
                      </div>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-900 transition" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Link
            to="/help/$collection"
            params={{ collection: collection.slug }}
            className={`${MONO} mt-10 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-zinc-500 hover:text-zinc-900`}
          >
            <ArrowLeft className="h-3 w-3" /> Back to {collection.title}
          </Link>
        </main>

        <SiteFooter />
      </div>
    </>
  );
}

function FeedbackButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        const btn = e.currentTarget;
        btn.textContent = "Thanks!";
        btn.setAttribute("disabled", "true");
      }}
      className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium hover:border-zinc-900 transition disabled:opacity-60"
    >
      {label}
    </button>
  );
}

function NotFoundArticle() {
  return (
    <div className="min-h-dvh grid place-items-center bg-[#FAFAFA]">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Article not found</h1>
        <Link to="/help" className="mt-4 inline-block text-sm underline">Back to Help Center</Link>
      </div>
    </div>
  );
}
