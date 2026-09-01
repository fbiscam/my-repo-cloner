import * as React from 'react'
import {
  Body,
  Container,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { EmailHead, LogoHeader, shellStyles as s, COLORS, MONO } from './_shared'
import type { TemplateEntry } from './registry'

interface Props {
  recipient?: string
  plan?: string
  creditsRemaining?: number
  threshold?: number
  topUpUrl?: string
  upgradeUrl?: string
}

const SITE = 'https://jenvu.com'

const LowCreditEmail = ({
  recipient = 'trader@jenvu.com',
  plan = 'Signal',
  creditsRemaining = 42,
  threshold = 100,
  topUpUrl = `${SITE}/dashboard/billing`,
  upgradeUrl = `${SITE}/pricing`,
}: Props) => (
  <Html lang="en" dir="ltr">
    <EmailHead />
    <Preview>{`Only ${creditsRemaining} credits left on your ${plan} plan`}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <LogoHeader tagline="JENVU · BILLING" />
        <Section style={s.card}>
          <Text style={{ ...s.eyebrow, color: '#b45309' }}>BILLING // LOW_CREDIT</Text>
          <Heading as="h1" style={s.h1}>
            Your credits are running low.
          </Heading>
          <Text style={s.text}>
            Heads up <span style={mono}>{recipient}</span> — your{' '}
            <strong style={{ color: COLORS.ink }}>{plan}</strong> plan has
            dropped below {threshold} credits. Top up or upgrade to keep your
            voice desk and alerts running without interruption.
          </Text>

          <Section style={meterBox}>
            <Text style={meterLabel}>REMAINING CREDITS</Text>
            <Text style={meterValue}>{creditsRemaining.toLocaleString()}</Text>
            <Text style={meterHint}>Below your {threshold.toLocaleString()} threshold</Text>
          </Section>

          <table cellPadding={0} cellSpacing={0} role="presentation">
            <tbody>
              <tr>
                <td style={{ paddingRight: '10px' }}>
                  <Link href={topUpUrl} style={s.button}>
                    Top Up Credits →
                  </Link>
                </td>
                <td>
                  <Link href={upgradeUrl} style={ghostBtn}>
                    See Plans
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>

          <Text style={{ ...s.footer, marginTop: '24px' }}>
            Manage alert frequency from your Jenvu dashboard.
          </Text>

          <Text style={s.legal}>JENVU · Billing notifications</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const mono = { color: COLORS.ink, fontFamily: MONO, fontSize: '13px' }
const meterBox = {
  backgroundColor: '#ffffff',
  border: `1px solid ${COLORS.border}`,
  borderRadius: '12px',
  padding: '22px 20px',
  margin: '4px 0 22px',
  textAlign: 'center' as const,
}
const meterLabel = {
  fontFamily: MONO,
  fontSize: '10px',
  letterSpacing: '0.28em',
  color: COLORS.ink,
  textTransform: 'uppercase' as const,
  margin: '0 0 8px',
}
const meterValue = {
  fontFamily: MONO,
  fontSize: '38px',
  fontWeight: 700 as const,
  color: COLORS.ink,
  letterSpacing: '0.06em',
  margin: '0 0 6px',
}
const meterHint = {
  fontFamily: MONO,
  fontSize: '10px',
  letterSpacing: '0.15em',
  color: COLORS.ink,
  textTransform: 'uppercase' as const,
  margin: 0,
}
const ghostBtn = {
  display: 'inline-block',
  color: COLORS.ink,
  fontFamily: "'Google Sans','Google Sans Normal',Arial,sans-serif",
  fontSize: '14px',
  fontWeight: 600 as const,
  borderRadius: '10px',
  padding: '12px 22px',
  textDecoration: 'none',
  border: `1px solid ${COLORS.border}`,
}

export default LowCreditEmail

export const template: TemplateEntry = {
  component: LowCreditEmail,
  subject: (d) =>
    `Low credits · ${d?.creditsRemaining ?? 0} left on your Jenvu ${d?.plan || 'Signal'} plan`,
  displayName: 'Low credit / billing alert',
  previewData: {
    recipient: 'trader@jenvu.com',
    plan: 'Signal',
    creditsRemaining: 42,
    threshold: 100,
    topUpUrl: 'https://jenvu.com/dashboard/billing',
    upgradeUrl: 'https://jenvu.com/pricing',
  },
}
