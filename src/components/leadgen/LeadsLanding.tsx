import { Link } from "@tanstack/react-router";
import {
  MapPin,
  Users,
  Globe,
  Upload,
  ListChecks,
  ShieldCheck,
  Check,
  ArrowRight,
} from "lucide-react";
import { JENVU_SANS, MONO } from "@/components/leadgen/LeadsShell";

const FEATURES = [
  {
    icon: MapPin,
    title: "Google Maps search",
    body: "Pull local businesses by category and city — name, address, phone, website, rating and ready to work.",
  },
  {
    icon: Users,
    title: "People search",
    body: "Find decision makers behind a company: role, seniority and verified work email where available.",
  },
  {
    icon: Globe,
    title: "Website enrichment",
    body: "Crawl any domain and extract emails, phone numbers and social profiles the contact page never lists.",
  },
  {
    icon: Upload,
    title: "CSV import",
    body: "Bring your own list. We dedupe against everything you already saved so you never pay twice for a lead.",
  },
  {
    icon: ListChecks,
    title: "Lists & pipeline",
    body: "Group leads into campaign lists and move them through New → Contacted → Qualified → Won.",
  },
  {
    icon: ShieldCheck,
    title: "Transparent credits",
    body: "Search is free. You only spend credits when you save or reveal a lead — every charge is logged in Activity.",
  },
];

const STEPS = [
  "Create your free account and get 50 credits instantly.",
  "Search Maps, people or enrich a website — results are free to browse.",
  "Save only the leads you want. Export to CSV and start outreach.",
  "Organize saved leads into lists and move them through your pipeline.",
  "Export clean CSVs and plug them into your CRM or outreach stack.",
  "Top up credits anytime, or upgrade as your pipeline grows.",
];

const PLAN_POINTS = [
  "Maps, people and website enrichment",
  "Unlimited searching and previews",
  "Campaign lists + pipeline status",
  "CSV export and duplicate protection",
  "Full credit activity log",
];

export function LeadsLanding() {
  return (
    <div
      className="leads-landing-zoom min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white"
      style={{ fontFamily: JENVU_SANS }}
    >
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:px-6 sm:py-4">
          <Link to="/leads" className="flex min-w-0 items-center gap-2.5">
            <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
            <span
              className="truncate text-[22px] leading-none tracking-tight text-[#3c4043]"
              style={{ fontWeight: 500 }}
            >
              Jenvu <span className="text-zinc-900">Leads</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/leads-signin"
              className="hidden rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/leads-signup"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Create free account
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-5 pt-12 pb-16 sm:px-6 sm:pt-16 sm:pb-24">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <span
                className={`inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-600 ${MONO}`}
              >
                50 free credits — no card
              </span>
              <h1 className="mt-5 max-w-3xl text-[28px] font-semibold leading-[1.1] tracking-tight text-zinc-900 sm:text-[42px] md:text-[56px]">
                <span className="block sm:whitespace-nowrap">B2B leads you can actually</span>
                <span className="block">reach — in one desk.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-zinc-700 sm:text-base md:text-lg">
                Jenvu Leads combines Google Maps business data, people search and live website
                enrichment into a single workspace. Search for free, save what matters, export and
                start selling.
              </p>
              <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-start">
                <Link
                  to="/leads-signup"
                  className="hover-lift inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Get 50 free credits
                  <ArrowRight className="h-4 w-4 opacity-80" />
                </Link>
                <Link
                  to="/leads-signin"
                  className="hover-glow inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-white"
                >
                  Sign in
                </Link>
              </div>
            </div>

            {/* stat rail — mirrors the jenvu.com hero grid */}
            <div className="lg:col-span-5">
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 shadow-[0_4px_20px_-8px_rgba(24,24,27,0.08)] sm:grid-cols-3">
                {[
                  ["Sources", "3"],
                  ["Per lead", "0.5"],
                  ["Free leads", "100"],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white px-4 py-5">
                    <div className={`text-[10px] uppercase tracking-[0.14em] text-zinc-400 ${MONO}`}>
                      {label}
                    </div>
                    <div className="mt-1.5 text-[24px] font-semibold tracking-tight text-zinc-900">
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="border-y border-zinc-100 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
            <h2 className="text-[24px] font-semibold tracking-tight text-zinc-900 sm:text-[32px]">
              Everything the desk does
            </h2>
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-zinc-700 sm:text-base">
              No scraping scripts, no spreadsheets glued together. One console for sourcing,
              enriching and organising your pipeline.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_4px_20px_-8px_rgba(24,24,27,0.08)] transition hover:shadow-[0_10px_30px_-12px_rgba(24,24,27,0.16)]"
                >
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-[#FAFAFA]">
                    <f.icon className="h-4 w-4 text-zinc-900" strokeWidth={1.8} />
                  </div>
                  <h3 className="mt-4 text-[15px] font-medium tracking-tight text-zinc-900">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-600">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS + PLAN */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <h2 className="text-[24px] font-semibold tracking-tight text-zinc-900 sm:text-[32px]">
                How it works
              </h2>
              <ol className="mt-7 space-y-5">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex gap-4">
                    <span
                      className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-[11px] text-zinc-900 ${MONO}`}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[14px] leading-relaxed text-zinc-700">{s}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-xl border border-zinc-200 bg-white p-7 shadow-[0_4px_20px_-8px_rgba(24,24,27,0.08)]">
                <div className={`text-[10px] uppercase tracking-[0.14em] text-zinc-400 ${MONO}`}>
                  Free plan
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-[44px] font-semibold leading-none tracking-tight text-zinc-900">
                    50
                  </span>
                  <span className="text-[14px] text-zinc-600">credits included</span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-zinc-600">
                  A saved or revealed lead costs 0.5 credits — that is{" "}
                  <strong className="font-medium text-zinc-900">100 leads free</strong> to start.
                  Searching and previewing results never costs anything.
                </p>

                <ul className="mt-6 space-y-2.5">
                  {PLAN_POINTS.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[13px] text-zinc-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-900" strokeWidth={2} />
                      {p}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/leads-signup"
                  className="mt-7 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Create free account
                </Link>
                <p className="mt-3 text-center text-[12px] text-zinc-400">
                  Need more volume? Ask an administrator to raise your monthly limit.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-[12px] text-zinc-500 sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} Jenvu. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <a href="https://jenvu.com" className="hover:text-zinc-900">
              Jenvu AI
            </a>
            <a href="https://support.jenvu.com" className="hover:text-zinc-900">
              Support
            </a>
            <Link to="/leads-signin" className="hover:text-zinc-900">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LeadsLanding;
