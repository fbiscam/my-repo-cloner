import SiteNavLinks from "@/components/SiteNavLinks";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { Suspense } from "react";
import { listBriefs, type BriefListItem } from "@/lib/killzone-briefs.functions";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { Play, Pause, Headphones, Rss } from "lucide-react";
import { useRef, useState, useEffect } from "react";

export const briefsQuery = queryOptions({
  queryKey: ["briefs", "list"],
  queryFn: () => listBriefs({ data: { limit: 30 } }),
});

export const Route = createFileRoute("/briefs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(briefsQuery),
  head: () => ({
    meta: [
      { title: "Daily Killzone Briefs — Jenvu AI" },
      {
        name: "description",
        content:
          "Institutional-grade audio briefs on gold for the London, New York, and Asia killzones. Delivered every session by Jenvu AI.",
      },
      { property: "og:title", content: "Daily Killzone Briefs — Jenvu AI" },
      {
        property: "og:description",
        content: "Audio briefs on gold delivered every killzone by Jenvu AI.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://jenvu.com/briefs" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/briefs" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Daily Killzone Briefs",
          description:
            "Institutional-grade audio briefs on gold for the London, New York, and Asia killzones.",
          url: "https://jenvu.com/briefs",
          isPartOf: { "@type": "WebSite", name: "Jenvu", url: "https://jenvu.com/" },
        }),
      },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-dvh flex items-center justify-center bg-[#FAFAFA] p-8">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-semibold text-zinc-900">Couldn't load briefs</h2>
        <p className="mt-2 text-sm text-zinc-600">{error.message}</p>
        <button
          onClick={() => reset()}
          className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
        >
          Try again
        </button>
      </div>
    </div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
  component: BriefsPage,
});

const SESSION_LABEL: Record<BriefListItem["session"], string> = {
  london: "London",
  new_york: "New York",
  asia: "Asia",
};
const SESSION_TINT: Record<BriefListItem["session"], string> = {
  london: "bg-blue-50 text-blue-700 ring-blue-200",
  new_york: "bg-amber-50 text-amber-800 ring-amber-200",
  asia: "bg-rose-50 text-rose-700 ring-rose-200",
};

function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function formatDuration(sec: number | null) {
  const s = Math.max(0, Math.round(sec ?? 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function BriefsPage() {
  return (
    <div className="jenvu-zoom min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 antialiased">
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

      <section className="border-b border-zinc-100">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 py-14 sm:py-20">
          <div className="inline-flex items-center gap-2 rounded-full bg-zinc-900/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
            <Headphones className="h-3.5 w-3.5" /> Killzone audio briefs
          </div>
          <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            The gold desk, in your<span className="md:hidden"> </span><br className="hidden md:inline" />ear — every session.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-zinc-600 leading-relaxed sm:text-lg md:max-w-none">
            60- to 120-second audio briefs on gold before the London, New York, and Asia killzones open.<br className="hidden md:inline" />
            <span className="md:hidden"> </span>Structured spoken analysis by Jenvu AI, referencing the desk's live signal.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="/api/public/podcast.xml"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              <Rss className="h-4 w-4" /> Podcast RSS
            </a>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 sm:px-6 py-14 sm:py-20">
        <Suspense fallback={<div className="text-zinc-500">Loading briefs…</div>}>
          <BriefsList />
        </Suspense>
      </main>

      <SiteFooter />
    </div>
  );
}

function BriefsList() {
  const { data: briefs } = useSuspenseQuery(briefsQuery);
  if (!briefs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 p-12 text-center">
        <Headphones className="mx-auto h-8 w-8 text-zinc-400" />
        <p className="mt-3 text-zinc-600">
          No briefs published yet. The desk generates them 3× per day around each session open.
        </p>
      </div>
    );
  }
  return (
    <ul className="grid gap-4">
      {briefs.map((b) => (
        <li key={b.id}>
          <BriefRow brief={b} />
        </li>
      ))}
    </ul>
  );
}

function BriefRow({ brief }: { brief: BriefListItem }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState<number | null>(brief.duration_seconds);

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

  const pct = dur && dur > 0 ? Math.min(100, (t / dur) * 100) : 0;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.15)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 ring-1 ${SESSION_TINT[brief.session]}`}>
              {SESSION_LABEL[brief.session]} Killzone
            </span>
            <span className="text-zinc-500">{timeAgo(brief.published_at)}</span>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-500 tabular-nums">{formatDuration(dur)}</span>
          </div>
          <Link
            to="/brief/$id"
            params={{ id: brief.id }}
            className="mt-2 block text-lg font-semibold tracking-tight text-zinc-900 hover:underline sm:text-xl"
          >
            {brief.headline}
          </Link>
          {brief.summary && (
            <p className="mt-1.5 text-sm text-zinc-600 leading-relaxed line-clamp-2">{brief.summary}</p>
          )}
        </div>
        <button
          onClick={toggle}
          aria-label={playing ? "Pause brief" : "Play brief"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition hover:bg-zinc-800"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full bg-zinc-900 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <audio ref={audioRef} src={brief.audio_url} preload="none" />
    </div>
  );
}
