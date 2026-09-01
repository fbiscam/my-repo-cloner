import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense, useEffect, useRef, useState } from "react";
import { getBrief, type BriefDetail } from "@/lib/killzone-briefs.functions";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { Play, Pause, ArrowLeft, Link as LinkIcon, Share2 } from "lucide-react";

const briefQuery = (id: string) =>
  queryOptions({
    queryKey: ["brief", id],
    queryFn: async () => {
      const b = await getBrief({ data: { id } });
      if (!b) throw notFound();
      return b;
    },
  });

export const Route = createFileRoute("/brief/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(briefQuery(params.id)),
  head: ({ params, loaderData }) => {
    const b = loaderData as BriefDetail | undefined;
    const title = b ? `${sessionLabel(b.session)}: ${b.headline} — Jenvu AI` : "Killzone brief — Jenvu AI";
    const desc = b?.summary || b?.transcript.slice(0, 160) || "Killzone audio brief on gold from Jenvu AI.";
    const url = `https://jenvu.com/brief/${params.id}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: b
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Article",
                headline: b.headline,
                description: desc,
                datePublished: b.published_at,
                dateModified: b.published_at,
                author: { "@type": "Organization", name: "Jenvu" },
                publisher: {
                  "@type": "Organization",
                  name: "Jenvu",
                  logo: { "@type": "ImageObject", url: "https://jenvu.com/favicon.png" },
                },
                mainEntityOfPage: { "@type": "WebPage", "@id": url },
              }),
            },
          ]
        : [],
    };
  },
  errorComponent: ({ error, reset }) => (
    <div className="min-h-dvh flex items-center justify-center bg-[#FAFAFA] p-8">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-semibold text-zinc-900">Couldn't load this brief</h2>
        <p className="mt-2 text-sm text-zinc-600">{error.message}</p>
        <button onClick={() => reset()} className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800">
          Try again
        </button>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-dvh flex items-center justify-center bg-[#FAFAFA] p-8 text-center">
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">Brief not found</h2>
        <Link to="/briefs" className="mt-3 inline-block text-sm text-zinc-700 underline">
          Back to all briefs
        </Link>
      </div>
    </div>
  ),
  component: BriefPage,
});

function sessionLabel(s: BriefDetail["session"]) {
  return s === "london" ? "London Killzone" : s === "new_york" ? "New York Killzone" : "Asia Killzone";
}

function BriefPage() {
  return (
    <div className="jenvu-zoom min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 antialiased">
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
        <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
            <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
          </Link>
          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-7 text-sm">
            <Link to="/signals-live">Live Signals</Link>
            <Link to="/briefs" className="font-semibold">Briefs</Link>
            <Link to="/founding">Founding</Link>
            <Link to="/insights">Insights</Link>
          </nav>
          <HeaderAuthButtons />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 sm:px-6 py-14 sm:py-20">
        <Link to="/briefs" className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> All briefs
        </Link>
        <Suspense fallback={<div className="mt-8 text-zinc-500">Loading brief…</div>}>
          <BriefBody />
        </Suspense>
      </main>

      <SiteFooter />
    </div>
  );
}

function BriefBody() {
  const { id } = Route.useParams();
  const { data: brief } = useSuspenseQuery(briefQuery(id));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState<number | null>(brief.duration_seconds);
  const [speed, setSpeed] = useState(1);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onT = () => setT(a.currentTime);
    const onD = () => setDur(a.duration);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onT);
    a.addEventListener("loadedmetadata", onD);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onT);
      a.removeEventListener("loadedmetadata", onD);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: brief.headline,
          text: brief.summary ?? sessionLabel(brief.session),
          url: window.location.href,
        });
      } catch {
        /* cancelled */
      }
    } else {
      copyLink();
    }
  }

  const pct = dur && dur > 0 ? Math.min(100, (t / dur) * 100) : 0;
  const mmss = (s: number) => {
    const x = Math.max(0, Math.round(s));
    return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
  };

  return (
    <article className="mt-6">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{sessionLabel(brief.session)}</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">{brief.headline}</h1>
      {brief.summary && <p className="mt-3 text-zinc-600 leading-relaxed">{brief.summary}</p>}

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.15)]">
        <div className="flex items-center gap-4">
          <button
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-800"
          >
            {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full bg-zinc-900 transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 tabular-nums">
              <span>{mmss(t)}</span>
              <span>{mmss(dur ?? 0)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">Speed</span>
          {[0.75, 1, 1.25, 1.5, 2].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded-full px-2.5 py-1 ring-1 ring-inset ${
                speed === s ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {s}×
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 hover:bg-zinc-50">
              <LinkIcon className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy link"}
            </button>
            <button onClick={share} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 hover:bg-zinc-50">
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </div>
        </div>

        <audio ref={audioRef} src={brief.audio_url} preload="metadata" />
      </div>

      <details className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 open:pb-6">
        <summary className="cursor-pointer text-sm font-medium text-zinc-800">Read transcript</summary>
        <div className="mt-4 whitespace-pre-wrap text-zinc-700 leading-relaxed">{brief.transcript}</div>
      </details>
    </article>
  );
}
