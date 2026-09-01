import { createFileRoute } from "@tanstack/react-router";
import { PageShell, H2, P, UL } from "@/components/PageShell";

export const Route = createFileRoute("/llm")({
  head: () => ({
    meta: [
      { title: "LLM Overview — Jenvu" },
      { name: "description", content: "What large language models are, why they matter for trading analysis, and how Jenvu uses them responsibly for ICT and SMC reasoning." },
      { property: "og:title", content: "Large Language Models (LLM) — Jenvu" },
      { property: "og:url", content: "https://jenvu.com/llm" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/llm" }],
  }),
  component: LLMPage,
});

function LLMPage() {
  return (
    <PageShell
      eyebrow="Knowledge"
      title="Large Language Models"
      intro="A primer on the technology behind modern AI agents — and how JENVU applies it to institutional market analysis."
    >
      <section className="space-y-3">
        <H2>What Is an LLM?</H2>
        <P>
          A Large Language Model is a neural network trained on vast text corpora to
          predict the next token in a sequence. That deceptively simple objective lets
          the model summarize, translate, reason, write code, and follow nuanced
          instructions when paired with rich context.
        </P>
      </section>
      <section className="space-y-3">
        <H2>Why It Matters for Trading</H2>
        <UL>
          <li>Synthesizes multi-source context (price, news, sessions) into a single read.</li>
          <li>Applies playbooks consistently — no fear, no FOMO, no fatigue.</li>
          <li>Explains the "why" of every setup in natural language.</li>
          <li>Adapts to any instrument with a single prompt swap.</li>
        </UL>
      </section>
      <section className="space-y-3">
        <H2>How JENVU Uses LLMs</H2>
        <P>
          We deliberately keep the model on a short leash. It does not invent prices, news,
          or signals. It receives a structured payload of validated market context, then
          reasons within a strict institutional framework. Outputs are schema-bound so the
          UI can render entries, stops, and targets reliably.
        </P>
      </section>
      <section className="space-y-3">
        <H2>Cost & Model Selection</H2>
        <P>
          JENVU defaults to a fast, low-cost flash-tier model for ongoing analysis and
          escalates to a stronger model on demand. This keeps response times under a
          second while preserving high-quality reasoning for complex setups.
        </P>
      </section>
      <section className="space-y-3">
        <H2>Limitations</H2>
        <P>
          LLMs can hallucinate. That's why JENVU grounds every response in live data and
          surfaces an invalidation level — so you always know exactly where the idea is
          wrong, regardless of how confidently the model speaks.
        </P>
      </section>
    </PageShell>
  );
}
