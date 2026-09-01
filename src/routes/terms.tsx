import { createFileRoute } from "@tanstack/react-router";
import { PageShell, H2, P, UL } from "@/components/PageShell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Jenvu" },
      { name: "description", content: "The contract between you and Jenvu when you use our website, voice agent, A+ signals, journal and trading analysis." },
      { property: "og:title", content: "Terms of Service — Jenvu" },
      { property: "og:url", content: "https://jenvu.com/terms" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Terms of Service"
      intro="These Terms govern your access to and use of Jenvu ('the Service'). By creating an account or using the Service you agree to them in full."
    >
      <section className="space-y-3">
        <H2>1. Eligibility</H2>
        <P>You must be at least 18 years old and legally able to enter into a binding contract in your jurisdiction. By using Jenvu you confirm you meet both conditions.</P>
      </section>

      <section className="space-y-3">
        <H2>2. Your account</H2>
        <UL>
          <li>Provide accurate information when signing up and keep it current.</li>
          <li>You are responsible for safeguarding your credentials and all activity under your account.</li>
          <li>Notify us at <a href="mailto:support@jenvu.com" className="underline">support@jenvu.com</a> immediately of any unauthorised access.</li>
          <li>One person per account; do not share or resell your credentials.</li>
        </UL>
      </section>

      <section className="space-y-3">
        <H2>3. Acceptable use</H2>
        <P>You agree not to:</P>
        <UL>
          <li>Reverse engineer, scrape, or use automated means to access the Service beyond documented APIs.</li>
          <li>Resell, sublicense, or redistribute Jenvu's analysis or alerts to third parties without written permission.</li>
          <li>Use the Service to violate any law, infringe intellectual property, or harm others.</li>
          <li>Interfere with security, rate limits, or the integrity of the Service.</li>
          <li>Submit content that is unlawful, harmful, deceptive, or malicious.</li>
        </UL>
      </section>

      <section className="space-y-3">
        <H2>4. Subscriptions & billing</H2>
        <P>Paid plans (Pro, Elite) renew on a recurring basis until cancelled. You can cancel anytime; cancellation takes effect at the end of the current billing period and is not refundable for the unused portion unless required by law. Prices may change with at least 30 days' notice for existing subscribers.</P>
      </section>

      <section className="space-y-3">
        <H2>5. Intellectual property</H2>
        <P>Jenvu, its content, code, models, design, and trademarks are owned by us or our licensors. We grant you a limited, revocable, non-exclusive, non-transferable license to use the Service for your personal trading research. All other rights are reserved.</P>
        <P>Any content you submit (prompts, notes, journal entries) remains yours. You grant us a worldwide, royalty-free license to process it solely to operate and improve the Service.</P>
      </section>

      <section className="space-y-3">
        <H2>6. No financial advice</H2>
        <P>The Service is for informational and educational purposes only and is not investment, financial, tax, or legal advice. See the <a href="/disclaimer" className="underline">Risk Disclaimer</a> for full details. You are solely responsible for your trading decisions.</P>
      </section>

      <section className="space-y-3">
        <H2>7. Service availability</H2>
        <P>We aim for high availability but do not guarantee uninterrupted access. The Service may be modified, suspended, or discontinued for maintenance, upgrades, or any other reason without liability to you.</P>
      </section>

      <section className="space-y-3">
        <H2>8. Disclaimer of warranties</H2>
        <P>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, ACCURACY, AND NON-INFRINGEMENT, TO THE FULLEST EXTENT PERMITTED BY LAW.</P>
      </section>

      <section className="space-y-3">
        <H2>9. Limitation of liability</H2>
        <P>TO THE MAXIMUM EXTENT PERMITTED BY LAW, JENVU AND ITS AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY TRADING LOSSES, LOST PROFITS, LOST DATA, OR LOST OPPORTUNITIES, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO LIABILITY OR (B) USD 100.</P>
      </section>

      <section className="space-y-3">
        <H2>10. Indemnification</H2>
        <P>You agree to indemnify and hold Jenvu, its affiliates, officers, and employees harmless from any claim, loss, or expense (including reasonable legal fees) arising from your breach of these Terms, your use of the Service, or your trading activity.</P>
      </section>

      <section className="space-y-3">
        <H2>11. Termination</H2>
        <P>We may suspend or terminate your access at any time for breach of these Terms, suspected fraud, or to protect the Service. You may close your account at any time from the dashboard or by emailing support.</P>
      </section>

      <section className="space-y-3">
        <H2>12. Governing law</H2>
        <P>These Terms are governed by the laws of the jurisdiction where Jenvu is established, without regard to conflict-of-laws principles. Any dispute will be resolved in the competent courts of that jurisdiction, unless mandatory consumer-protection law in your country of residence provides otherwise.</P>
      </section>

      <section className="space-y-3">
        <H2>13. Changes</H2>
        <P>We may update these Terms. Material changes are announced in-app or by email at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.</P>
      </section>

      <section className="space-y-3">
        <H2>14. Contact</H2>
        <P>Questions about these Terms: <a href="mailto:support@jenvu.com" className="underline">support@jenvu.com</a>.</P>
      </section>
    </PageShell>
  );
}
