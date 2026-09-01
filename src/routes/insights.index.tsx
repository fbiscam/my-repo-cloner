import SiteNavLinks from "@/components/SiteNavLinks";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import SiteFooter from "@/components/SiteFooter";

type Insight = Tables<"insights">;

// Format date deterministically in UTC so SSR and client match exactly.
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtUTC(iso: string, kind: "full" | "compact") {
  const d = new Date(iso);
  const mo = MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const yr = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return kind === "full"
    ? `${mo} ${day}, ${yr} · ${hh}:${mm} UTC`
    : `${hh}:${mm} UTC · ${mo} ${day}`;
}

export const insightsQueryOptions = queryOptions({
  queryKey: ["insights"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("insights")
      .select("id, title, slug, excerpt, content, category, image_url, is_breaking, published_at, created_at, updated_at, indexed_at")
      .order("published_at", { ascending: false });

    if (error) throw error;
    return data as Insight[];
  },
});

export const Route = createFileRoute("/insights/")({
  head: () => ({
    meta: [
      { title: "Market Insights — Jenvu" },
      {
        name: "description",
        content:
          "Our insights — daily gold analysis, ICT and SMC briefings, and institutional market updates narrated by the Jenvu terminal engine.",
      },
      { property: "og:title", content: "Our Insights — Jenvu" },
      {
        property: "og:description",
        content: "Daily gold analysis, ICT and SMC briefings, and institutional market updates from the Jenvu desk.",
      },
      { property: "og:url", content: "https://jenvu.com/insights" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Our Insights — Jenvu" },
      { name: "twitter:description", content: "Daily gold analysis, ICT and SMC briefings from the Jenvu desk." },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/insights" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Market Insights",
          description:
            "Daily gold analysis, ICT and SMC briefings, and institutional market updates from the Jenvu desk.",
          url: "https://jenvu.com/insights",
          isPartOf: { "@type": "WebSite", name: "Jenvu", url: "https://jenvu.com/" },
        }),
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(insightsQueryOptions),
  component: InsightsPage,
  errorComponent: ({ error }) => (
    <div className="min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-xs font-mono uppercase tracking-widest text-red-600 mb-3">Insights unavailable</div>
      <h1 className="text-2xl font-semibold mb-3">We couldn't load the insights feed.</h1>
      <p className="text-sm text-zinc-500 max-w-md">{error?.message || "Please refresh and try again."}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold mb-3">Insights not found</h1>
    </div>
  ),
});

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

const PAGE_SIZE = 9;

function InsightsPage() {
  const { data: insights } = useSuspenseQuery(insightsQueryOptions);

  // Ticker: any breaking + most recent items (outsourced top-bar feed)
  const tickerItems = (() => {
    const breaking = insights.filter((i) => i.is_breaking);
    const recent = insights.slice(0, 8);
    const seen = new Set<string>();
    return [...breaking, ...recent].filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    }).slice(0, 10);
  })();

  const [filter, setFilter] = useState<"latest" | "gold" | "macro">("latest");
  const [page, setPage] = useState(1);
  const filters: { id: typeof filter; label: string }[] = [
    { id: "latest", label: "Latest" },
    { id: "gold", label: "Gold" },
    { id: "macro", label: "Macro" },
  ];

  const filtered = useMemo(() => {
    if (filter === "latest") return insights;
    const goldCats = ["gold", "analysis", "ict", "smc", "strategy", "institutional"];
    const macroCats = ["market news", "education", "ai"];
    const match = filter === "gold" ? goldCats : macroCats;
    return insights.filter((i) => match.includes((i.category || "").toLowerCase()));
  }, [insights, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  // On page 1 use the first item as the featured hero; grid shows the rest of the page.
  const featured = currentPage === 1 ? pageItems[0] : undefined;
  const remaining = currentPage === 1 ? pageItems.slice(1) : pageItems;

  const goToPage = (n: number) => {
    setPage(Math.min(Math.max(1, n), totalPages));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const onFilterChange = (id: typeof filter) => {
    setFilter(id);
    setPage(1);
  };

  return (
    <>
      <div className={`jenvu-zoom min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased selection:bg-zinc-900 selection:text-white`}>
        {/* NAV */}
        <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
              <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
            </Link>
            <SiteNavLinks active="/insights" />
            <HeaderAuthButtons />
          </div>
          
          {/* CNN-STYLE BREAKING TICKER — clickable, links to articles */}
          {tickerItems.length > 0 && (
            <div className="bg-red-600 text-white overflow-hidden py-1.5 px-4 sm:px-6">
              <div className="mx-auto max-w-6xl flex items-center gap-4">
                <span className={`${MONO} text-[10px] font-bold uppercase bg-white text-red-600 px-1.5 py-0.5 rounded shrink-0 animate-pulse`}>
                  Live
                </span>
                <div className="flex-1 overflow-hidden">
                  <div className="flex gap-10 whitespace-nowrap animate-ticker-fast">
                    {[...tickerItems, ...tickerItems].map((news, i) => (
                      <Link
                        key={news.id + "-" + i}
                        to="/insights/$slug"
                        params={{ slug: news.slug }}
                        className="text-xs font-medium tracking-tight hover:underline shrink-0"
                      >
                        {news.is_breaking ? "● BREAKING — " : "› "}{news.title}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* HERO SECTION - FEATURED ARTICLE */}
        {featured ? (
          <section className="border-b border-zinc-100 bg-zinc-50/50">
            <div className="mx-auto max-w-6xl px-5 sm:px-6 py-12 sm:py-16">
              <div className="grid lg:grid-cols-12 gap-8 lg:items-center">
                <div className="lg:col-span-7">
                  <div className={`${MONO} text-[10px] uppercase tracking-[0.28em] text-red-600 font-bold mb-4`}>
                    FEATURED REPORT // {featured.category}
                  </div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight">
                    {featured.title}
                  </h1>
                  <p className="mt-5 text-base sm:text-lg text-zinc-600 leading-relaxed max-w-2xl">
                    {featured.excerpt}
                  </p>
                  <div className="mt-8 flex items-center gap-4">
                    <span className={`${MONO} text-[11px] text-zinc-400`}>
                      {fmtUTC(featured.published_at, "full")}
                    </span>
                    <Link
                      to="/insights/$slug"
                      params={{ slug: featured.slug }}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 hover:gap-3 transition-all"
                    >
                      Read full briefing <span>→</span>
                    </Link>
                  </div>
                </div>
                <div className="lg:col-span-5">
                  <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-zinc-200 border border-zinc-200 shadow-2xl relative group">
                    <img
                      src={featured.image_url || "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1600&q=80"}
                      alt={featured.title}
                      onError={(e) => {
                        const t = e.currentTarget;
                        t.onerror = null;
                        t.src = "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1600&q=80";
                      }}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/40 to-transparent" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="border-b border-zinc-100 bg-zinc-50/50">
            <div className="mx-auto max-w-6xl px-5 sm:px-6 py-10 sm:py-14">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight">
                Market Insights
              </h1>
              <p className="mt-4 text-base sm:text-lg text-zinc-600 leading-relaxed max-w-2xl">
                Daily gold analysis, ICT and SMC briefings, and institutional market updates from the Jenvu desk.
              </p>
            </div>
          </section>
        )}

        {/* MAIN FEED */}
        <main className="mx-auto max-w-6xl px-5 sm:px-6 py-12 sm:py-20">
          <div className="flex flex-col gap-4 border-b border-zinc-100 pb-6 mb-10 sm:flex-row sm:items-start sm:justify-between">
            <h2 className={`text-xl font-bold ${MONO} uppercase tracking-[0.2em]`}>Terminal Briefings</h2>
            <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 p-1 text-xs font-medium">
              {filters.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => onFilterChange(f.id)}
                    className={`px-4 py-1.5 rounded-full transition-colors ${
                      active
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10">
            {remaining.map((item) => (
              <article key={item.id} className="group cursor-pointer">
                <Link to="/insights/$slug" params={{ slug: item.slug }} className="block">
                  <div className="aspect-video rounded-xl overflow-hidden bg-zinc-100 border border-zinc-100 mb-5">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.title}
                        loading="lazy"
                        onError={(e) => {
                          const t = e.currentTarget;
                          t.onerror = null;
                          t.src = "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1600&q=80";
                        }}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <img
                        src={"https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1600&q=80"}
                        alt={item.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <div className={`${MONO} text-[10px] uppercase tracking-widest text-zinc-500 mb-2`}>
                    {item.category}
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-zinc-900 group-hover:text-zinc-700 transition-colors line-clamp-2 min-h-[3.5rem]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm text-zinc-600 line-clamp-2 leading-relaxed">
                    {item.excerpt}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className={`${MONO} text-[10px] text-zinc-400`}>
                      {fmtUTC(item.published_at, "compact")}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-900 group-hover:translate-x-1 transition-transform">
                      VIEW REPORT ↗
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>

          {remaining.length === 0 && !featured && (
            <div className="text-center py-16 text-sm text-zinc-500">
              No briefings in this category yet.
            </div>
          )}

          {totalPages > 1 && (
            <nav aria-label="Insights pagination" className="mt-14 flex items-center justify-center gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => goToPage(n)}
                  aria-current={n === currentPage ? "page" : undefined}
                  className={`min-w-[36px] rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    n === currentPage
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </nav>
          )}


          {/* LOAD MORE / NEWSLETTER */}
          <div className="mt-20 rounded-3xl bg-zinc-50 border border-zinc-200 p-8 sm:p-12 text-center text-zinc-900 relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.07]" style={{
              backgroundImage: "radial-gradient(#000 0.5px, transparent 0.5px)",
              backgroundSize: "20px 20px"
            }} />
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4">
                Institutional briefings, delivered live.
              </h2>
              <p className="text-zinc-600 max-w-xl mx-auto mb-8 text-sm sm:text-base">
                Join 5,000+ traders receiving Jenvu terminal insights directly in their inbox before the New York open.
              </p>
              <SubscribeForm />
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
    </>
  );
}

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(255, "Too long")
  .email("Enter a valid email");

function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("newsletter_subscribers")
        .insert({ email: parsed.data.toLowerCase() });
      if (error) {
        if (error.code === "23505") {
          toast.success("You're already subscribed — briefings on their way.");
          setDone(true);
        } else {
          toast.error("Could not subscribe. Please try again.");
        }
      } else {
        toast.success("Subscribed. Watch your inbox for the next briefing.");
        setDone(true);
        setEmail("");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-700">
        ✓ You're on the list. Next briefing lands directly in your inbox.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        maxLength={255}
        placeholder="Enter email for daily briefings"
        className="flex-1 bg-white border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 rounded-xl px-4 py-3 text-sm outline-none focus:border-zinc-900 transition-all"
      />
      <button
        type="submit"
        disabled={busy}
        className="bg-zinc-900 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors whitespace-nowrap disabled:opacity-60"
      >
        {busy ? "…" : "SUBSCRIBE"}
      </button>
    </form>
  );
}