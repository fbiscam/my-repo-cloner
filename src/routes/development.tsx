import { createFileRoute } from "@tanstack/react-router";
import { PageShell, H2, P, UL } from "@/components/PageShell";

export const Route = createFileRoute("/development")({
  head: () => ({
    meta: [
      { title: "Engineering — Jenvu" },
      { name: "description", content: "The stack, architecture and engineering principles powering the Jenvu voice trading agent and A+ signal engine." },
      { property: "og:title", content: "Development & Engineering — Jenvu" },
      { property: "og:url", content: "https://jenvu.com/development" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/development" }],
  }),
  component: DevPage,
});

function DevPage() {
  return (
    <PageShell
      eyebrow="Engineering"
      title="How JENVU Is Built"
      intro="A modern, edge-rendered, type-safe stack tuned for sub-second voice latency and reliable signal generation."
    >
      <section className="space-y-3">
        <H2>Frontend</H2>
        <UL>
          <li>React 19 with TanStack Start (file-based routing, SSR-ready).</li>
          <li>Vite 7 + Tailwind v4 for instant builds and design tokens.</li>
          <li>Framer Motion for entrance animations and the floating orb.</li>
          <li>lightweight-charts for institutional-grade dual-timeframe rendering.</li>
        </UL>
      </section>
      <section className="space-y-3">
        <H2>Voice Layer</H2>
        <P>
          The Web Speech API powers low-latency speech-to-text and text-to-speech directly
          in the browser. Word-boundary events drive the orb's pulsing animation so the
          agent feels alive while it speaks.
        </P>
      </section>
      <section className="space-y-3">
        <H2>Server Functions</H2>
        <P>
          Market data fetching, news aggregation, and LLM orchestration run as TanStack
          server functions on a serverless edge runtime. Each XAU cross-pair routes to
          OANDA and Yahoo Finance bullion feeds with automatic fallbacks for resilience.
        </P>
      </section>
      <section className="space-y-3">
        <H2>Backend</H2>
        <UL>
          <li>Managed cloud backend for authentication and persistence.</li>
          <li>Row-level security on every table; roles isolated in a dedicated table.</li>
          <li>Edge functions for webhooks and scheduled tasks only.</li>
        </UL>
      </section>
      <section className="space-y-3">
        <H2>Principles</H2>
        <UL>
          <li>Type safety from route params to server-function payloads.</li>
          <li>Schema-bound LLM outputs — the UI never trusts free-form text.</li>
          <li>Honest defaults — when uncertainty is high, the agent stands aside.</li>
          <li>Performance budget: speak in under one second.</li>
        </UL>
      </section>
    </PageShell>
  );
}
