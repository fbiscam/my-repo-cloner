import { getIpGeo } from "@/lib/ip-geo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, Clock, MapPin, Radar, Lock } from "lucide-react";
import { PAIR_PROFILES, type PairProfile } from "@/lib/analysis/engine";

export const Route = createFileRoute("/killzones")({
  head: () => ({
    meta: [
      { title: "Killzone Times Tracker" },
      {
        name: "description",
        content:
          "Live ICT/SMC killzone times for XAU/USD gold — shown in UTC and your local timezone with real-time IN/OUT status.",
      },
      { property: "og:title", content: "Gold Killzone Times Tracker" },
      {
        property: "og:description",
        content:
          "Live ICT/SMC killzone times for XAU/USD gold — shown in UTC and your local timezone with real-time IN/OUT status.",
      },
      { property: "og:url", content: "https://jenvu.com/killzones" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/killzones" }],
  }),
  component: KillzonesPage,
});

const MONO = "font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal normal-case tracking-normal";

type Category = "XAU";

const META: Record<string, { name: string; category: Category; region: string; flag: string }> = {
  XAUUSD: { name: "Gold / US Dollar", category: "XAU", region: "London / New York", flag: "🥇" },
};

const CATEGORIES: (Category | "All")[] = ["All", "XAU"];

// Gold market: closed Fri 22:00 UTC → Sun 22:00 UTC
function isMarketOpen(d: Date): boolean {
  const day = d.getUTCDay();
  const h = d.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && h >= 22) return false;
  if (day === 0 && h < 22) return false;
  return true;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function fmtUTC(h: number) {
  const hh = h === 24 ? 0 : h;
  return `${pad(hh)}:00`;
}

// Convert a UTC hour to a local HH:mm using the given IANA timezone.
function utcHourToLocal(hUTC: number, tz?: string): string {
  const d = new Date();
  d.setUTCHours(hUTC === 24 ? 0 : hUTC, 0, 0, 0);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });
}

function shortTZ(): string {
  try {
    const parts = new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(new Date());
    return parts.find(p => p.type === "timeZoneName")?.value || "Local";
  } catch {
    return "Local";
  }
}

function longTZ(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "Local";
  }
}

function inZone(kz: { startUTC: number; endUTC: number }, h: number) {
  return kz.startUTC <= kz.endUTC
    ? h >= kz.startUTC && h < kz.endUTC
    : h >= kz.startUTC || h < kz.endUTC;
}

function nextStartInMs(startUTC: number, now: Date): number {
  const d = new Date(now);
  d.setUTCHours(startUTC === 24 ? 0 : startUTC, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime() - now.getTime();
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}

function statusFor(profile: PairProfile, now: Date) {
  const h = now.getUTCHours();
  const active = profile.killzones.find(k => inZone(k, h));
  if (active) {
    const endHour = active.endUTC === 24 ? 0 : active.endUTC;
    const end = new Date(now);
    end.setUTCHours(endHour, 0, 0, 0);
    if (end.getTime() <= now.getTime()) end.setUTCDate(end.getUTCDate() + 1);
    return {
      inKillzone: true,
      label: active.name,
      countdown: `ends in ${fmtCountdown(end.getTime() - now.getTime())}`,
    };
  }
  // find next killzone
  let best: { kz: PairProfile["killzones"][number]; ms: number } | null = null;
  for (const kz of profile.killzones) {
    const ms = nextStartInMs(kz.startUTC, now);
    if (!best || ms < best.ms) best = { kz, ms };
  }
  return {
    inKillzone: false,
    label: "Outside killzone",
    countdown: best ? `${best.kz.name} in ${fmtCountdown(best.ms)}` : "",
  };
}

function KillzonesPage() {
  const navigate = useNavigate();
  const [now, setNow] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [ipTZ, setIpTZ] = useState<string | null>(null);
  const [ipCity, setIpCity] = useState<string | null>(null);
  const tz = ipTZ ?? longTZ();
  const tzShort = useMemo(() => {
    try {
      const parts = new Intl.DateTimeFormat([], { timeZone: tz, timeZoneName: "short" })
        .formatToParts(new Date());
      return parts.find(p => p.type === "timeZoneName")?.value || "Local";
    } catch {
      return shortTZ();
    }
  }, [tz]);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);


  // Detect timezone from user IP (cached 24h). Falls back to browser TZ on error.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const j = await getIpGeo();
      if (cancelled || !j) return;
      if (j.timezone) setIpTZ(j.timezone);
      if (j.city || j.country_name)
        setIpCity([j.city, j.country_name].filter(Boolean).join(", "));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return Object.values(PAIR_PROFILES)
      .map(p => ({ profile: p, meta: META[p.key] }))
      .filter(r => r.meta)
      .filter(r => (cat === "All" ? true : r.meta.category === cat))
      .filter(
        r =>
          !q ||
          r.profile.key.includes(q) ||
          r.meta.name.toUpperCase().includes(q) ||
          r.meta.region.toUpperCase().includes(q),
      );
  }, [query, cat]);

  const grouped = useMemo(() => {
    const g: Record<Category, typeof rows> = {
      XAU: [],
    };
    rows.forEach(r => g[r.meta.category].push(r));
    return g;
  }, [rows]);

  const utcNow = now ? now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }) : "--:--:--";
  const localNow = now ? now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: tz,
  }) : "--:--:--";


  return (
    <div className="killzones-root min-h-dvh w-full bg-[#FAFAFA] text-slate-900 font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif] antialiased">
      <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
        <div className="relative mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-5 py-3 sm:px-6 sm:py-4">
          <button
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                navigate({ to: "/app" });
              }
            }}
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg border border-zinc-200 bg-white text-[12px] text-zinc-700 hover:bg-zinc-50 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:flex items-center gap-2.5">
            <Link
              to="/"
              aria-label="Jenvu home"
              className="pointer-events-auto shrink-0 inline-flex items-center justify-center rounded-md hover:opacity-80 transition"
            >
              <img src="/favicon.png" alt="Jenvu" className="h-6 w-6 rounded-md" />
            </Link>
            <span className="truncate text-[22px] tracking-tight leading-none select-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
          </div>
          <Link
            to="/signals-live"
            className="h-8 inline-flex items-center gap-1.5 px-3 rounded-lg bg-zinc-900 text-[12px] font-medium text-white hover:bg-zinc-800 transition"
          >
            <Radar className="h-3.5 w-3.5" /> Live Signals
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-6 sm:px-6 sm:py-10" style={{ fontFamily: '"Google Sans", "Product Sans", "DM Sans", system-ui, sans-serif' }}>
        {/* Hero */}
        <div className="mb-6 sm:mb-8">
          <div className={`${MONO} text-[10px] tracking-[0.2em] uppercase text-zinc-500 mb-2`} aria-hidden="true">
            &nbsp;
          </div>
          <h1 className="text-[19px] sm:text-4xl font-semibold tracking-tight whitespace-nowrap sm:whitespace-normal">
            Every pair. Every killzone. Live.
          </h1>
          <p className="text-sm sm:text-[13px] lg:text-[14px] xl:text-[15px] text-zinc-600 mt-2 max-w-2xl sm:max-w-none sm:whitespace-nowrap">
            ICT / SMC session windows for every instrument Jenvu analyzes — shown in UTC and your local time, with a live IN/OUT status.
          </p>
        </div>

        {/* Live clock strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-[22px] border border-zinc-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_-12px_rgba(16,24,40,0.10)] ring-1 ring-white/60">
            <div className={`${MONO} text-[10px] uppercase tracking-widest text-zinc-500`}>UTC</div>
            <div className={`${MONO} text-xl sm:text-2xl font-semibold mt-1`}>{utcNow}</div>
          </div>
          <div className="rounded-[22px] border border-zinc-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_-12px_rgba(16,24,40,0.10)] ring-1 ring-white/60">
            <div className={`${MONO} text-[10px] uppercase tracking-widest text-zinc-500`}>
              Local · {tzShort}
            </div>
            <div className={`${MONO} text-xl sm:text-2xl font-semibold mt-1`}>{localNow}</div>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-[22px] border border-zinc-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_-12px_rgba(16,24,40,0.10)] ring-1 ring-white/60">
            <div className={`${MONO} text-[10px] uppercase tracking-widest text-zinc-500`}>
              {ipCity ? "Detected location" : "Timezone"}
            </div>
            <div className="text-sm font-medium mt-1 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-zinc-400" />
              <span className="truncate">{ipCity ?? tz}</span>
            </div>
            <div className={`${MONO} mt-1 text-[10px] text-zinc-500 truncate`}>
              {tz}
              {ipTZ ? " · via IP" : ""}
            </div>
          </div>
        </div>

        {/* Search + tabs */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search symbol, name or region…"
              className="w-full h-10 rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-zinc-400 transition"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`h-8 px-3 rounded-lg border text-[12px] font-medium transition ${
                  cat === c
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Groups */}
        <div className="space-y-8">
          {(Object.keys(grouped) as Category[]).map(section => {
            const items = grouped[section];
            if (!items.length) return null;
            return (
              <section key={section}>
                <div className="mb-3 flex items-center gap-2">
                  <div className={`${MONO} text-[11px] uppercase tracking-[0.2em] text-zinc-500`}>
                    {section}
                  </div>
                  <div className="h-px flex-1 bg-zinc-200" />
                  <div className={`${MONO} text-[10px] text-zinc-400`}>{items.length}</div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {items.map(({ profile, meta }) => {
                    const nowRef = now ?? new Date(0);
                    const st = statusFor(profile, nowRef);
                    const marketOpen = now ? isMarketOpen(nowRef) : false;

                    const locked = false;
                    return (
                      <button
                        key={profile.key}
                        onClick={() => {
                          navigate({ to: "/signals-live", search: { symbol: profile.key } as never });
                        }}
                        className={`group text-left rounded-[22px] border p-4 ring-1 ring-white/60 transition-all duration-300 hover:-translate-y-1 ${
                          locked
                            ? "border-zinc-200/70 bg-zinc-50/60 shadow-[0_1px_2px_rgba(16,24,40,0.03),0_8px_20px_-12px_rgba(16,24,40,0.08)] hover:border-zinc-300/70"
                            : "border-zinc-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_-12px_rgba(16,24,40,0.10)] hover:border-zinc-300/70 hover:shadow-[0_2px_4px_rgba(16,24,40,0.05),0_18px_40px_-16px_rgba(16,24,40,0.14)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg leading-none">{meta.flag}</span>
                              <span className={`${MONO} text-sm font-semibold ${locked ? "text-zinc-500" : ""}`}>
                                {profile.key}
                              </span>
                              {locked && (
                                <span className={`${MONO} inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-zinc-600`}>
                                  <Lock className="h-2.5 w-2.5" /> Pro
                                </span>
                              )}
                              <span className="text-xs text-zinc-500 truncate">{meta.name}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
                              <MapPin className="h-3 w-3" />
                              {meta.region}
                            </div>
                          </div>
                          <div
                            className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${MONO} text-[10px] uppercase tracking-wider ${
                              !marketOpen
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : st.inKillzone
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-zinc-50 text-zinc-600 border border-zinc-200"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                !marketOpen
                                  ? "bg-amber-500"
                                  : st.inKillzone
                                    ? "bg-emerald-500 animate-pulse"
                                    : "bg-zinc-400"
                              }`}
                            />
                            {!marketOpen ? "Market Closed" : st.inKillzone ? "In Killzone" : "Outside"}
                          </div>
                        </div>


                        <div className="mt-3 space-y-1.5">
                          {profile.killzones.map(kz => {
                            const active = now ? inZone(kz, now.getUTCHours()) : false;
                            return (
                              <div
                                key={kz.name}
                                className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[11px] ${
                                  active
                                    ? "bg-emerald-50/60 border border-emerald-100"
                                    : "bg-zinc-50/70 border border-zinc-100"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <Clock className="h-3 w-3 text-zinc-400 shrink-0" />
                                  <span className="text-zinc-700 truncate">{kz.name}</span>
                                </div>
                                <div className={`${MONO} text-[10.5px] text-zinc-600 text-right`}>
                                  <span>
                                    {fmtUTC(kz.startUTC)}–{fmtUTC(kz.endUTC)} UTC
                                  </span>
                                  <span className="mx-1 text-zinc-300">·</span>
                                  <span className="text-zinc-500">
                                    {utcHourToLocal(kz.startUTC, tz)}–{utcHourToLocal(kz.endUTC, tz)}{" "}
                                    {tzShort}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <div className={`${MONO} text-[10.5px] text-zinc-500`}>
                            Prime: {profile.primeSession.name} ·{" "}
                            {fmtUTC(profile.primeSession.startUTC)}–
                            {fmtUTC(profile.primeSession.endUTC)} UTC
                          </div>
                          <div
                            className={`${MONO} text-[10.5px] ${
                              st.inKillzone ? "text-emerald-700" : "text-zinc-500"
                            }`}
                          >
                            {st.countdown}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {rows.length === 0 && (
            <div className="rounded-[22px] border border-dashed border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              No instruments match your search.
            </div>
          )}
        </div>

        <p className="mt-10 text-center text-[11px] text-zinc-500">
          Local times auto-converted from UTC using your device timezone. Trade during killzones for
          highest A+ setup probability.
        </p>
      </main>
    </div>
  );
}
