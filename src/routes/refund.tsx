import { createFileRoute } from "@tanstack/react-router";
import { PageShell, H2, P, UL } from "@/components/PageShell";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Jenvu" },
      { name: "description", content: "Jenvu refund rules for plan upgrades and credit top-ups. Once credits are used, that payment is non-refundable." },
      { property: "og:title", content: "Refund Policy — Jenvu" },
      { property: "og:description", content: "Jenvu refund rules for plan upgrades and credit top-ups. Once credits are used, that payment is non-refundable." },
      { property: "og:url", content: "https://jenvu.com/refund" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/refund" }],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Refund Policy"
      intro="Jenvu is a digital service delivered instantly through credits, AI compute and live signals. This policy explains when refunds are — and are not — available."
    >
      <section className="space-y-3">
        <H2>1. Overview</H2>
        <P>Because Jenvu delivers digital value the moment you use it (voice minutes, signals, AI queries, analysis), refunds are limited by the nature of the service. Please read this policy carefully before purchasing a plan or topping up credits.</P>
      </section>

      <section className="space-y-3">
        <H2>2. No refunds after credits are used</H2>
        <P>This is the core rule of our billing:</P>
        <UL>
          <li>Once <strong>any</strong> credits from a top-up or plan upgrade have been consumed — even a single credit — that payment becomes <strong>non-refundable</strong>.</li>
          <li>This applies whether credits were spent on the voice agent, A+ signals, AI Engine queries, journal analysis, or any other feature.</li>
          <li>Partial usage does not entitle you to a partial refund. Using the service is considered acceptance of the charge in full.</li>
          <li>Unused credits carry no cash value and are not exchangeable for money.</li>
        </UL>
      </section>

      <section className="space-y-3">
        <H2>3. Plan upgrades</H2>
        <P>When you upgrade your plan (for example Pro → Elite), the upgraded tier and its credits are activated immediately. Once you have accessed any benefit of the upgraded tier — including its included credits — the upgrade charge is non-refundable.</P>
      </section>

      <section className="space-y-3">
        <H2>4. Credit top-ups</H2>
        <UL>
          <li>Credit top-ups are non-refundable once any credit from that top-up has been used.</li>
          <li>A <strong>fully unused</strong> top-up may be refunded within 7 days of purchase, at our discretion, on written request.</li>
          <li>Top-ups do not expire while your account remains active, but they are not transferable between accounts.</li>
        </UL>
      </section>

      <section className="space-y-3">
        <H2>5. Duplicate or accidental charges</H2>
        <P>If you were charged twice for the same purchase, or a charge was clearly made in error, contact us within 7 days at <a href="mailto:support@jenvu.com" className="underline">support@jenvu.com</a>. If none of the associated credits have been used, we will refund the duplicate/erroneous charge in full.</P>
      </section>

      <section className="space-y-3">
        <H2>6. Failed or undelivered service</H2>
        <P>If we materially fail to deliver a paid feature due to a fault on our side (extended outage, feature permanently removed, etc.), we will issue a pro-rata refund or equivalent account credit — your choice.</P>
      </section>

      <section className="space-y-3">
        <H2>7. Chargebacks</H2>
        <P>Please contact us before opening a chargeback with your bank or card provider. Chargebacks filed without first contacting support may result in your account being suspended pending resolution.</P>
      </section>

      <section className="space-y-3">
        <H2>8. Statutory rights</H2>
        <P>Nothing in this policy limits mandatory consumer-protection rights you may have in your jurisdiction. Where local law grants a stronger right, that law prevails over this policy.</P>
      </section>

      <section className="space-y-3">
        <H2>9. How to request a refund</H2>
        <P>Email <a href="mailto:support@jenvu.com" className="underline">support@jenvu.com</a> within 7 days of purchase with your account email and order ID. We usually respond within 2 business days.</P>
      </section>
    </PageShell>
  );
}
