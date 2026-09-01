import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, H2, P, UL } from "@/components/PageShell";

export const Route = createFileRoute("/cancellation")({
  head: () => ({
    meta: [
      { title: "Cancellation Policy — Jenvu" },
      { name: "description", content: "How to cancel your Jenvu subscription, when it takes effect and how it affects billing and credits." },
      { property: "og:title", content: "Cancellation Policy — Jenvu" },
      { property: "og:description", content: "How to cancel your Jenvu subscription, when it takes effect and how it affects billing and credits." },
      { property: "og:url", content: "https://jenvu.com/cancellation" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/cancellation" }],
  }),
  component: CancellationPage,
});

function CancellationPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Cancellation Policy"
      intro="You can cancel your Jenvu subscription at any time. This policy explains how cancellation works and how it interacts with billing, credits and refunds."
    >
      <section className="space-y-3">
        <H2>1. Cancel anytime</H2>
        <P>You can cancel your subscription whenever you like:</P>
        <UL>
          <li>From your <Link to="/dashboard" className="underline">Dashboard</Link> → Billing section.</li>
          <li>Or by emailing <a href="mailto:support@jenvu.com" className="underline">support@jenvu.com</a> from your account email.</li>
        </UL>
      </section>

      <section className="space-y-3">
        <H2>2. When cancellation takes effect</H2>
        <P>Cancellation takes effect at the <strong>end of your current billing period</strong>. You keep full access — including any remaining plan credits — until that date. After it passes, your account moves to the free tier and paid features stop.</P>
      </section>

      <section className="space-y-3">
        <H2>3. No pro-rata refund for the remaining period</H2>
        <P>Consistent with our <Link to="/refund" className="underline">Refund Policy</Link>, we do not refund the unused portion of the current billing period. Cancel whenever you want, but the charge already made for the active cycle stands.</P>
      </section>

      <section className="space-y-3">
        <H2>4. Auto-renewal</H2>
        <P>Paid plans renew automatically at the end of each billing cycle until you cancel. We do not send reminder emails before renewal; please cancel before your renewal date if you do not wish to be charged again.</P>
      </section>

      <section className="space-y-3">
        <H2>5. Downgrades</H2>
        <UL>
          <li>Downgrades (for example Elite → Pro) take effect at the start of the next billing cycle.</li>
          <li>Any higher-tier credits or benefits unused at the switch-over are forfeited and do not carry across.</li>
          <li>Downgrades themselves are not refundable.</li>
        </UL>
      </section>

      <section className="space-y-3">
        <H2>6. Reactivation</H2>
        <P>You can resubscribe at any time from the <Link to="/pricing" className="underline">pricing page</Link>. Your journal, saved signals and history stay attached to your account.</P>
      </section>

      <section className="space-y-3">
        <H2>7. Account deletion</H2>
        <P>Cancelling a subscription is different from deleting your account. To fully delete your account and associated data, see our <Link to="/privacy" className="underline">Privacy Policy</Link> or email support.</P>
      </section>

      <section className="space-y-3">
        <H2>8. Contact</H2>
        <P>Questions about cancellation? Email <a href="mailto:support@jenvu.com" className="underline">support@jenvu.com</a>.</P>
      </section>
    </PageShell>
  );
}
