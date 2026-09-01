import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { Shield, Award, AlertTriangle } from "lucide-react";
import founderPhoto from "@/assets/haseeb-ijaz-founder.png.asset.json";

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

export const Route = createFileRoute("/founder")({
  head: () => ({
    meta: [
      { title: "Haseeb Ijaz — Founder of Jenvu" },
      { name: "description", content: "Meet Haseeb Ijaz, founder of Jenvu. At 21, he built a voice-native gold trading intelligence desk powered by ICT, SMC and AI." },
      { property: "og:title", content: "Haseeb Ijaz — Founder of Jenvu" },
      { property: "og:description", content: "At 21, Haseeb Ijaz founded Jenvu to turn institutional gold trading logic into a voice-first AI any serious trader can use." },
      { property: "og:url", content: "https://jenvu.com/founder" },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/founder" }],
  }),
  component: FounderPage,
});

const FOUNDING_STORY = {
  name: "Haseeb Ijaz",
  role: "Founder & Architect",
  foundedAge: 21,
  tagline: "Built for traders who refuse to guess.",
  bio: [
    "Haseeb Ijaz started Jenvu at age 21 with a single conviction: institutional-grade gold analysis should not be locked behind a Bloomberg terminal or a Wall Street desk.",
    "He spent years dissecting ICT, SMC, liquidity engineering and market structure across XAU/USD and every major gold cross-pair. The patterns were repeatable, but the execution tools were fragmented. So he built the desk he wished he had at 18 — voice-native, AI-augmented, and ruthlessly honest about risk.",
    "Beyond the terminal, Haseeb has sharpened 25 proprietary skills and techniques spanning market research, product marketing, community building and AI-driven growth. That same research discipline is why Jenvu learns faster with every scan.",
    "Today, Jenvu combines those 25 disciplines into a single terminal that speaks in real time, draws institutional logic on the chart, and tells traders exactly when to step aside.",
  ],
};


function FounderPage() {
  return (
    <PageShell
      eyebrow="Founder"
      title={"The founder behind\nthe voice terminal."}
      intro="Haseeb Ijaz started Jenvu at 21 to give independent traders the same structural edge that institutional desks have used for decades."
    >
      {/* Profile Card */}
      <section className="grid gap-8 md:grid-cols-[1.1fr_1.4fr] items-start">
        <div className="relative">
          <div className="aspect-square overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
            <img
              src={founderPhoto.url}
              alt="Haseeb Ijaz — Founder of Jenvu"
              className="h-full w-full object-cover"
              width={1024}
              height={1024}
            />
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">Founded at age {FOUNDING_STORY.foundedAge}</p>
                <p className={`text-xs text-zinc-500 ${MONO} uppercase tracking-wider`}>Jenvu · Voice Trading Desk</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">Pakistan No. #1 Scams Awareness Provider</p>
                <p className={`text-xs text-zinc-500 ${MONO} uppercase tracking-wider`}>PROTECTING PEOPLE ONLINE</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <h2 className={`text-2xl font-semibold tracking-tight text-zinc-900 ${SANS}`}>
              {FOUNDING_STORY.name}
            </h2>
            <p className="mt-1 text-sm font-medium text-zinc-500">{FOUNDING_STORY.role}</p>
          </div>
          <p className="text-lg font-medium text-zinc-900">{FOUNDING_STORY.tagline}</p>
          {FOUNDING_STORY.bio.map((p, i) => (
            <p key={i} className="text-zinc-700 leading-relaxed">
              {p}
            </p>
          ))}
        </div>
      </section>



      {/* Philosophy */}
      <section className="space-y-4">
        <h2 className={`text-2xl font-semibold tracking-tight text-zinc-900 ${SANS}`}>
          The idea behind Jenvu
        </h2>
        <p className="text-zinc-700 leading-relaxed">
          Haseeb believed that the best trading ideas come from a clean, structured read of the market — not from chasing alerts or sitting in discords. He wanted a terminal that could:
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Analyze every XAU cross-pair through one consistent engine",
            "Narrate the setup in plain language so traders can trust it",
            "Only fire when bias, structure, liquidity and timing align",
            "Tell the truth when the market offers no clear edge",
            "Learn from every model and senior reviewer to raise confidence",
            "Stay fast, private and accessible to serious traders everywhere",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              <span className="mt-1 text-zinc-900">→</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section className="rounded-2xl bg-white p-6 sm:p-10 text-zinc-900 border border-zinc-200">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className={`text-2xl font-semibold tracking-tight sm:text-3xl ${SANS}`}>
            Start trading with the same edge.
          </h2>
          <p className="mt-3 text-zinc-600">
            Join the desk Haseeb built. 14 days of Pro free, $5 of scan credits, and no card required.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/founding"
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
            >
              Apply for access
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
