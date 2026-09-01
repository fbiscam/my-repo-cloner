import { createFileRoute } from "@tanstack/react-router";
import { PageShell, H2, P, UL } from "@/components/PageShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Jenvu" },
      { name: "description", content: "How Jenvu collects, processes, retains and protects your personal data across the voice agent, signals and account dashboard." },
      { property: "og:title", content: "Privacy Policy — Jenvu" },
      { property: "og:description", content: "How Jenvu collects, processes, retains and protects your personal data across the voice agent, signals and account dashboard." },
      { property: "og:url", content: "https://jenvu.com/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Privacy Policy"
      intro="Jenvu ('we', 'us', 'our') respects your privacy. This policy explains what we collect when you use jenvu.com or our voice agent, how we use it, and the rights you have over that data."
    >
      <section className="space-y-3">
        <H2>1. Information we collect</H2>
        <P>We collect the minimum data needed to operate Jenvu:</P>
        <UL>
          <li><strong>Account data</strong> — email, display name, hashed password, and authentication provider identifiers when you sign in.</li>
          <li><strong>Voice & text inputs</strong> — transcripts captured only while you have explicitly activated the microphone, plus text prompts you submit. We do not run background audio capture.</li>
          <li><strong>Trading interactions</strong> — saved signals, alert preferences, and journal entries you create.</li>
          <li><strong>Usage telemetry</strong> — routes visited, feature events, device type, browser, IP address (truncated where feasible), and crash diagnostics.</li>
          <li><strong>Email engagement</strong> — opens, clicks and unsubscribe events for newsletters and alerts you opted into.</li>
        </UL>
      </section>

      <section className="space-y-3">
        <H2>2. How we use it</H2>
        <UL>
          <li>Generate market analysis, narrate setups, and deliver realtime A+ alerts you requested.</li>
          <li>Authenticate sessions, prevent abuse, and protect against fraud.</li>
          <li>Send transactional emails (signups, password resets, signal alerts) and product announcements where opted in.</li>
          <li>Improve product quality via aggregated, de-identified analytics.</li>
          <li>Comply with legal obligations and respond to lawful requests.</li>
        </UL>
      </section>

      <section className="space-y-3">
        <H2>3. Legal bases (GDPR / UK GDPR)</H2>
        <P>Where the GDPR or UK GDPR applies, we rely on the following lawful bases: <em>contract</em> (to deliver the service you signed up for), <em>legitimate interests</em> (to secure the service and improve it), <em>consent</em> (for non-essential cookies and marketing emails), and <em>legal obligation</em> (tax, fraud prevention, lawful requests).</P>
      </section>

      <section className="space-y-3">
        <H2>4. Third-party processors</H2>
        <P>We use carefully vetted processors to deliver Jenvu, including:</P>
        <UL>
          <li><strong>Cloud infrastructure & database</strong> — to host the app and store your account data.</li>
          <li><strong>AI inference</strong> — to generate analysis, voice responses, and content.</li>
          <li><strong>Email delivery</strong> — to send transactional and alert emails.</li>
          <li><strong>Market data feeds</strong> — public price feeds (e.g. Binance, exchange APIs) for live quotes.</li>
        </UL>
        <P>All processors are bound by data processing agreements and use data strictly for the services we request.</P>
      </section>

      <section className="space-y-3">
        <H2>5. International transfers</H2>
        <P>Our processors may host data in the United States, the European Economic Area, or other jurisdictions. Where data leaves the EEA/UK we rely on Standard Contractual Clauses or equivalent safeguards.</P>
      </section>

      <section className="space-y-3">
        <H2>6. Data retention</H2>
        <UL>
          <li>Account data — retained while your account is active and for up to 30 days after deletion to handle disputes or legal claims.</li>
          <li>Voice transcripts & prompts — retained up to 90 days for quality and abuse review, then deleted or fully anonymised.</li>
          <li>Aggregated analytics — retained indefinitely; never tied to your identity.</li>
        </UL>
      </section>

      <section className="space-y-3">
        <H2>7. Your rights</H2>
        <P>Depending on your jurisdiction, you may have the right to access, correct, port, delete, or restrict processing of your personal data, and to object to processing or withdraw consent. To exercise any right, email <a href="mailto:support@jenvu.com" className="underline">support@jenvu.com</a> from the address linked to your account. We respond within 30 days.</P>
      </section>

      <section className="space-y-3">
        <H2>8. Security</H2>
        <P>We use TLS in transit, encryption at rest, scoped row-level security, principle-of-least-privilege access controls, and regular security reviews. No internet service is 100% secure — use a strong unique password and report suspected compromise immediately.</P>
      </section>

      <section className="space-y-3">
        <H2>9. Children</H2>
        <P>Jenvu is not directed at anyone under 18. We do not knowingly collect data from minors. If you believe a minor has provided us data, contact support and we will delete it.</P>
      </section>

      <section className="space-y-3">
        <H2>10. Cookies</H2>
        <P>We use essential cookies for authentication and session management. Optional analytics cookies are only set with your consent and can be cleared at any time from your browser settings.</P>
      </section>

      <section className="space-y-3">
        <H2>11. Changes & contact</H2>
        <P>We may update this policy as the product evolves. Material changes are announced in-app or by email. For any privacy question, write to <a href="mailto:support@jenvu.com" className="underline">support@jenvu.com</a>.</P>
      </section>
    </PageShell>
  );
}
