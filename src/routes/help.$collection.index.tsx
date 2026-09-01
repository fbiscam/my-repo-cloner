import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { findCollection, type Article } from "@/lib/help-content";

export const Route = createFileRoute("/help/$collection/")({
  loader: ({ params }) => {
    const c = findCollection(params.collection);
    if (!c) throw notFound();
    return { collection: c };
  },
  head: ({ params, loaderData }) => {
    const title = loaderData?.collection?.title ?? "Help";
    const desc = loaderData?.collection?.description ?? "Jenvu AI Help Center";
    const count = loaderData?.collection?.articles?.length ?? 0;
    const url = `https://jenvu.com/help/${params.collection}`;
    const metaDesc = `${desc} Browse ${count} guides and FAQs in the Jenvu AI Help Center.`;
    return {
      meta: [
        { title: `${title} — Help Center | Jenvu AI` },
        { name: "description", content: metaDesc },
        { property: "og:title", content: `${title} — Jenvu AI Help` },
        { property: "og:description", content: metaDesc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${title} — Jenvu AI Help` },
        { name: "twitter:description", content: metaDesc },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: () => <NotFoundCollection />,
  errorComponent: () => <NotFoundCollection />,
  component: CollectionPage,
});

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

function CollectionPage() {
  const { collection } = Route.useLoaderData();

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

        <section className="border-b border-zinc-100 bg-gradient-to-b from-zinc-50 to-white">
          <div className="mx-auto max-w-3xl px-5 sm:px-6 py-12 sm:py-16">
            <nav className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500 flex items-center gap-1.5`}>
              <Link to="/help" className="hover:text-zinc-900">Help</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-zinc-900">{collection.title}</span>
            </nav>
            <h1 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight">
              {collection.title}
            </h1>
            <p className="mt-3 text-zinc-600 text-base sm:text-lg">{collection.description}</p>
            <div className={`${MONO} mt-4 text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
              {collection.articles.length} articles
            </div>
          </div>
        </section>

        <main className="mx-auto max-w-3xl px-5 sm:px-6 py-12 sm:py-16">
          <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
            {collection.articles.map((a: Article) => (
              <li key={a.slug}>
                <Link
                  to="/help/$collection/$slug"
                  params={{ collection: collection.slug, slug: a.slug }}
                  className="group flex items-start justify-between gap-4 px-5 sm:px-6 py-5 hover:bg-zinc-50 transition"
                >
                  <div>
                    <div className="text-base font-medium text-zinc-900">{a.title}</div>
                    <div className="mt-1 text-sm text-zinc-600">{a.summary}</div>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-900 transition" />
                </Link>
              </li>
            ))}
          </ul>

          <Link
            to="/help"
            className={`${MONO} mt-8 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-zinc-500 hover:text-zinc-900`}
          >
            <ArrowLeft className="h-3 w-3" /> Back to Help Center
          </Link>
        </main>

        <SiteFooter />
      </div>
    </>
  );
}

function NotFoundCollection() {
  return (
    <div className="min-h-dvh grid place-items-center bg-[#FAFAFA]">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Collection not found</h1>
        <Link to="/help" className="mt-4 inline-block text-sm underline">Back to Help Center</Link>
      </div>
    </div>
  );
}
