import SiteNavLinks from "@/components/SiteNavLinks";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { createFileRoute, Link } from "@tanstack/react-router";
import SiteFooter from "@/components/SiteFooter";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download our app" },
      {
        name: "description",
        content:
          "Get Jenvu on your device. Native iOS, Android APK and desktop PWA — the institutional voice-native gold trading agent covering every XAU cross-pair in your pocket.",
      },
      { property: "og:title", content: "Download our app" },
      {
        property: "og:description",
        content:
          "Native iOS, Android APK and desktop PWA. Carry the voice-powered ICT/SMC trading desk with you.",
      },
      { property: "og:url", content: "https://jenvu.com/download" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/download" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Jenvu",
          applicationCategory: "FinanceApplication",
          operatingSystem: "iOS, Android, Web",
          description:
            "Voice-native institutional AI gold trading terminal covering every XAU cross-pair — available on iOS, Android and as an installable PWA.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: DownloadPage,
});

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

// Placeholder download URLs — wire real links here when builds are ready.
const DOWNLOADS = {
  ios: "", // App Store URL
  android: "", // APK / Play Store URL
  pwa: "https://jenvu.com",
};

type Platform = {
  key: "ios" | "android" | "pwa";
  label: string;
  channel: string;
  blurb: string;
  status: "INSTALL" | "COMING SOON";
  cta: string;
  href: string;
  glyph: string;
};

const PLATFORMS: Platform[] = [
  {
    key: "ios",
    label: "iOS",
    channel: "App Store",
    blurb: "Native iPhone & iPad build. Background voice, push alerts and haptics — wrapped in a signed Apple bundle.",
    status: "COMING SOON",
    cta: "Notify on release",
    href: DOWNLOADS.ios,
    glyph: "",
  },
  {
    key: "android",
    label: "Android",
    channel: "APK · Play Store",
    blurb: "Signed APK and Play Store release. Native microphone, push notifications and full background streaming.",
    status: "COMING SOON",
    cta: "Notify on release",
    href: DOWNLOADS.android,
    glyph: "▲",
  },
  {
    key: "pwa",
    label: "Desktop / PWA",
    channel: "Install from browser",
    blurb: "Install JENVU directly from Chrome, Edge or Safari. Standalone window, offline shell, instant updates.",
    status: "INSTALL",
    cta: "Open & install",
    href: DOWNLOADS.pwa,
    glyph: "◐",
  },
];

const REQS = [
  ["iOS", "15.0 or newer", "iPhone / iPad"],
  ["Android", "9.0 or newer", "ARM64 device"],
  ["Desktop", "Chrome · Edge · Safari", "1 GB RAM free"],
];

const CHANGELOG = [
  { v: "v1.0.0", t: "Initial release", body: "Voice agent, signal engine, ICT/SMC analyzer and live A+ setup grading." },
  { v: "v0.9.0", t: "Public preview", body: "Web terminal with multi-timeframe alignment and live tick streaming." },
];

function DownloadPage() {
  return (
    <>
      <div className={`jenvu-zoom min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased selection:bg-zinc-900 selection:text-white`}>
        {/* NAV — matches homepage */}
        <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
              <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
            </Link>
            <SiteNavLinks active="/download" />
            <HeaderAuthButtons />
          </div>
        </header>

        {/* HERO */}
        <section className="mx-auto max-w-6xl px-5 pt-12 pb-10 sm:px-6 sm:pt-16 sm:pb-14">
          <h1 className="mt-5 max-w-5xl text-[22px] font-semibold tracking-tight leading-[1.15] whitespace-nowrap sm:text-4xl md:text-5xl">
            Carry the desk in your pocket.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-900 md:text-lg">
            <span className="sm:hidden">Jenvu on iOS, Android and desktop — same voice agent, same institutional engine, same A+ setups. Links coming soon.</span>
            <span className="hidden sm:inline">Jenvu on iOS, Android and desktop same voice agent, same institutional engine, same A+ setups. Download links are being prepared shortly</span>
          </p>
        </section>

        {/* PLATFORM GRID */}
        <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-6 sm:pb-20">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PLATFORMS.map((p) => {
              const available = p.status === "INSTALL" && !!p.href;
              return (
                <div
                  key={p.key}
                  className="rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_60px_-28px_rgba(0,0,0,0.10)] overflow-hidden flex flex-col"
                >
                  <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
                        <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
                        <div className="w-2.5 h-2.5 rounded-full bg-zinc-200" />
                      </div>
                      <span className={`ml-3 text-[10px] ${MONO} tracking-widest text-zinc-900 uppercase`}>
                        {p.channel}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${MONO} uppercase tracking-wider ${
                        available ? "bg-emerald-500 text-white" : "bg-zinc-900 text-white"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <div className="p-6 flex flex-col gap-5 flex-1">
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-xl font-semibold tracking-tight">{p.label}</h3>
                      <span className={`${MONO} text-[11px] text-zinc-500`}>{p.glyph}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-zinc-600 flex-1">{p.blurb}</p>

                    {available ? (
                      <a
                        href={p.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
                      >
                        {p.cta}
                        <span className={`${MONO} text-xs opacity-80`}>→</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-400 cursor-not-allowed ${MONO} tracking-wide`}
                      >
                        {p.cta}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* REQUIREMENTS */}
        <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-6 sm:pb-20">
          <div className={`flex items-center gap-3 ${MONO} text-[10px] tracking-[0.22em] uppercase text-zinc-900 mb-5`}>
            <span className="h-px w-6 bg-zinc-300" />
            REQUIREMENTS
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-zinc-200 rounded-xl overflow-hidden border border-zinc-200">
            {REQS.map(([k, v, sub]) => (
              <div key={k} className="bg-white p-5">
                <div className={`${MONO} text-[10px] uppercase tracking-widest text-zinc-500`}>{k}</div>
                <div className="mt-2 text-base font-semibold tracking-tight text-zinc-900">{v}</div>
                <div className={`mt-1 ${MONO} text-[11px] text-zinc-500`}>{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CHANGELOG */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6 sm:pb-24">
          <div className={`flex items-center gap-3 ${MONO} text-[10px] tracking-[0.22em] uppercase text-zinc-900 mb-5`}>
            <span className="h-px w-6 bg-zinc-300" />
            CHANGELOG
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            {CHANGELOG.map((c, i) => (
              <div
                key={c.v}
                className={`grid grid-cols-[auto_minmax(0,1fr)] gap-5 px-5 sm:px-6 py-5 ${
                  i !== 0 ? "border-t border-zinc-100" : ""
                }`}
              >
                <div className={`${MONO} text-[11px] uppercase tracking-widest text-zinc-900 pt-0.5`}>{c.v}</div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900">{c.t}</div>
                  <p className="mt-1 text-sm text-zinc-600 leading-relaxed">{c.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <SiteFooter />
      </div>
    </>
  );
}
