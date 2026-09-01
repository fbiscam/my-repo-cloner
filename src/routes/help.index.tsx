import * as React from "react";
import SiteNavLinks from "@/components/SiteNavLinks";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Compass, Mic, LineChart, CreditCard, Shield, Smartphone,
  Search, ArrowRight, HelpCircle, MessageCircle,
} from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { collections, allArticles, type Collection } from "@/lib/help-content";

export const Route = createFileRoute("/help/")({
  head: () => ({
    meta: [
      { title: "Help Center — Guides, FAQs & Support | Jenvu AI" },
      { name: "description", content: "Jenvu AI Help Center — step-by-step guides, FAQs and troubleshooting for the voice trading agent, ICT/SMC signal engine, credits & billing, account security and the mobile app." },
      { name: "keywords", content: "Jenvu help, Jenvu AI support, voice trading agent help, ICT SMC signals help, gold trading AI FAQ, Jenvu billing, Jenvu mobile app" },
      { property: "og:title", content: "Help Center — Jenvu AI" },
      { property: "og:description", content: "Guides, FAQs and troubleshooting for Jenvu's voice trading agent, signal engine, billing and mobile app." },
      { property: "og:url", content: "https://jenvu.com/help" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Help Center — Jenvu AI" },
      { name: "twitter:description", content: "Guides, FAQs and troubleshooting for the Jenvu voice trading agent." },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/help" }],
  }),
  component: HelpCenterPage,
});

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

const ICONS = { Compass, Mic, LineChart, CreditCard, Shield, Smartphone } as const;

function HelpCenterPage() {
  const [q, setQ] = React.useState("");
  const navigate = useNavigate();

  const results = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return allArticles()
      .filter(({ article }) => {
        const haystack = [
          article.title,
          article.summary,
          ...article.body.map((b) =>
            b.type === "ul" || b.type === "ol" ? b.items.join(" ") : b.content,
          ),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 6);
  }, [q]);

  const popular = allArticles().slice(0, 4);

  return (
    <>
      <div className={`jenvu-zoom min-h-dvh bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased`}>
        {/* NAV */}
        <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
              <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
            </Link>
            <SiteNavLinks />
            <HeaderAuthButtons />
          </div>
        </header>

        {/* HERO + SEARCH */}
        <section className="border-b border-zinc-100 bg-gradient-to-b from-zinc-50 to-white">
          <div className="mx-auto max-w-3xl px-5 sm:px-6 py-16 sm:py-24 text-left sm:text-center">
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-zinc-900">
              How can we help?
            </h1>
            <p className="mt-4 text-zinc-600 text-base sm:text-lg">
              Search articles or browse a collection below.
            </p>

            <div className="relative mt-8">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) {
                    navigate({
                      to: "/help/$collection/$slug",
                      params: { collection: results[0].collection.slug, slug: results[0].article.slug },
                    });
                  }
                }}
                placeholder="Search for articles..."
                className="w-full rounded-full border border-zinc-200 bg-white py-3 pl-11 pr-4 text-sm shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] outline-none focus:border-zinc-400 transition"
                aria-label="Search help articles"
              />
              {q.trim() && (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-[0_24px_60px_-24px_rgba(0,0,0,0.18)]">
                  {results.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-zinc-500">
                      No articles match "{q}".
                    </div>
                  ) : (
                    results.map(({ collection, article }) => (
                      <Link
                        key={`${collection.slug}/${article.slug}`}
                        to="/help/$collection/$slug"
                        params={{ collection: collection.slug, slug: article.slug }}
                        className="flex items-start justify-between gap-4 border-b border-zinc-100 px-4 py-3 last:border-b-0 hover:bg-zinc-50"
                      >
                        <div>
                          <div className="text-sm font-medium text-zinc-900">{article.title}</div>
                          <div className={`${MONO} mt-1 text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
                            {collection.title}
                          </div>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* COLLECTIONS */}
        <section className="mx-auto max-w-6xl px-5 sm:px-6 py-14 sm:py-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
                Browse by topic
              </h2>
            </div>
            <div className={`${MONO} hidden sm:block text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
              {collections.length} collections · {allArticles().length} articles
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((c) => (
              <CollectionCard key={c.slug} c={c} />
            ))}
          </div>
        </section>

        {/* POPULAR */}
        <section className="border-t border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto max-w-6xl px-5 sm:px-6 py-14 sm:py-20">
            <h2 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
              Frequently read
            </h2>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              {popular.map(({ collection, article }) => (
                <Link
                  key={`${collection.slug}/${article.slug}`}
                  to="/help/$collection/$slug"
                  params={{ collection: collection.slug, slug: article.slug }}
                  className="group flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-900 transition"
                >
                  <div>
                    <div className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
                      {collection.title}
                    </div>
                    <div className="mt-2 text-base font-medium text-zinc-900">{article.title}</div>
                    <div className="mt-1 text-sm text-zinc-600 line-clamp-2">{article.summary}</div>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-900 transition" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CONTACT CTA */}
        <section className="mx-auto max-w-6xl px-5 sm:px-6 py-14 sm:py-20">
          <div className="rounded-2xl border border-zinc-200 bg-white text-zinc-900 p-8 sm:p-12 flex flex-col md:flex-row items-start md:items-start justify-between gap-6">
            <div>
              <h3 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight">
                Talk to a human.
              </h3>
              <p className="mt-2 text-zinc-600 max-w-md whitespace-pre-line">
                Our team replies within one business day.&nbsp;&nbsp;
                Send a message and we'll get back to you.
              </p>
            </div>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 text-white px-5 py-3 text-sm font-medium hover:bg-zinc-800 transition"
            >
              <MessageCircle className="h-4 w-4" />
              Contact support
            </Link>
          </div>
        </section>

        <SiteFooter />
      </div>
    </>
  );
}

function CollectionCard({ c }: { c: Collection }) {
  const Icon = ICONS[c.icon];
  return (
    <Link
      to="/help/$collection"
      params={{ collection: c.slug }}
      className="group rounded-2xl border border-zinc-200 bg-white p-6 hover:border-zinc-900 hover:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.2)] transition"
    >
      <div className="flex items-center gap-3">
        <div className="grid place-items-center h-10 w-10 rounded-xl bg-white border border-zinc-200 text-zinc-900">
          <Icon className="h-5 w-5" />
        </div>
        <div className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
          {c.articles.length} articles
        </div>
      </div>
      <div className="mt-5 text-lg font-semibold tracking-tight">{c.title}</div>
      <div className="mt-1 text-sm text-zinc-600">{c.description}</div>
      <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900">
        Explore
        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition" />
      </div>
    </Link>
  );
}
