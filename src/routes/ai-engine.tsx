import { createFileRoute } from "@tanstack/react-router";
import { PageShell, H2, P, UL } from "@/components/PageShell";

export const Route = createFileRoute("/ai-engine")({
  head: () => ({
    meta: [
      { title: "AI Engine — Jenvu" },
      { name: "description", content: "Inside the Jenvu AI engine: how it listens, reasons and narrates institutional ICT and SMC trade setups in real time." },
      { property: "og:title", content: "Artificial Intelligence Engine — Jenvu" },
      { property: "og:description", content: "How the Jenvu AI engine listens, reasons and narrates institutional ICT and SMC gold trade setups in real time." },
      { property: "og:url", content: "https://jenvu.com/ai-engine" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/ai-engine" }],
  }),
  component: AIPage,
});

function AIPage() {
  return (
    <PageShell
      eyebrow="Technology"
      title="The AI Engine"
      intro="More than a chatbot — a multi-stage reasoning pipeline fusing live market data, institutional concepts and natural-language synthesis."
    >
      <section className="space-y-3">
        <H2>Perception Layer</H2>
        <P>
          The Web Speech API captures your voice and converts it to text in real time.
          A lightweight intent resolver routes commands like "Analyze XAU/JPY" or
          "Show me gold in euros" to the correct XAU cross-pair adapter (OANDA and
          Yahoo Finance bullion feeds).
        </P>
      </section>
      <section className="space-y-3">
        <H2>Market Context Layer</H2>
        <UL>
          <li>Multi-timeframe candle ingestion (1H and 15M).</li>
          <li>Structural mapping: PDH/PDL, equilibrium, premium/discount arrays.</li>
          <li>News & economic calendar awareness with high-impact filtering.</li>
          <li>Session and killzone awareness (London / New York GMT windows).</li>
        </UL>
      </section>
      <section className="space-y-3">
        <H2>Reasoning Layer</H2>
        <P>
          A large language model with a 25-year institutional trader persona reasons over
          the prepared context using ICT and SMC playbooks — bias, sweep, displacement,
          OTE, OB, FVG, BOS/CHoCH — and outputs a structured plan with entry, stop, three
          targets, and an invalidation level.
        </P>
      </section>
      <section className="space-y-3">
        <H2>Output Layer</H2>
        <P>
          The plan is rendered on dual lightweight-charts (1H + 15M) with zones drawn for
          FVGs, OBs, and liquidity, while text-to-speech narrates each step in sync with
          word-level orb pulses for a Jarvis-class voice experience.
        </P>
      </section>
    </PageShell>
  );
}
