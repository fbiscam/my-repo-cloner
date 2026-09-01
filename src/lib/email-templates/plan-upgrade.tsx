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
  fromPlan?: string
  toPlan?: string
  effectiveDate?: string
  amount?: string
  features?: string[]
  manageUrl?: string
}

const SITE = 'https://jenvu.com'

const PlanUpgradeEmail = ({
  recipient = 'trader@jenvu.com',
  fromPlan = 'Signal',
  toPlan = 'ICT Pro',
  effectiveDate = new Date().toUTCString(),
  amount = '$79 / month',
  features = [
    'Unlimited voice-native briefings',
    'Real-time ICT session alerts',
    'Priority signal delivery',
    'Extended market replay & journal',
  ],
  manageUrl = `${SITE}/dashboard/billing`,
}: Props) => (
  <Html lang="en" dir="ltr">
    <EmailHead />
    <Preview>Welcome to Jenvu {toPlan} — upgrade active.</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <LogoHeader tagline="JENVU · PLAN UPGRADE" />
        <Section style={s.card}>
          <Text style={{ ...s.eyebrow, color: '#166534' }}>BILLING // UPGRADE_ACTIVE</Text>
          <Heading as="h1" style={s.h1}>
            You're on {toPlan}.
          </Heading>
          <Text style={s.text}>
            Nice move <span style={mono}>{recipient}</span> — your desk has
            upgraded from <strong style={{ color: COLORS.ink }}>{fromPlan}</strong>{' '}
            to <strong style={{ color: COLORS.ink }}>{toPlan}</strong>. All new
            capabilities are live right now.
          </Text>

          <Section style={box}>
            <Text style={boxLabel}>NEW PLAN</Text>
            <Text style={boxValue}>{toPlan}</Text>
            <Text style={boxSub}>{amount} · Active {effectiveDate}</Text>
          </Section>

          <Text style={stepsHeading}>WHAT'S UNLOCKED</Text>
          {features.map((f, i) => (
            <Text key={i} style={feat}>
              <span style={bullet}>▸</span> {f}
            </Text>
          ))}

          <Link href={manageUrl} style={{ ...s.button, marginTop: '18px' }}>
            Manage Subscription →
          </Link>

          <Text style={{ ...s.footer, marginTop: '24px' }}>
            Questions about your plan or invoice? Reply to this email.
          </Text>

          <Text style={s.legal}>JENVU · Subscription updates</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const mono = { color: COLORS.ink, fontFamily: MONO, fontSize: '13px' }
const box = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: '12px',
  padding: '18px 20px',
  margin: '4px 0 22px',
  backgroundColor: '#fafafa',
}
const boxLabel = {
  fontFamily: MONO,
  fontSize: '10px',
  letterSpacing: '0.24em',
  color: COLORS.soft,
  textTransform: 'uppercase' as const,
  margin: '0 0 6px',
}
const boxValue = {
  fontFamily: "'Google Sans','Google Sans Normal',Arial,sans-serif",
  fontSize: '22px',
  fontWeight: 700 as const,
  color: COLORS.ink,
  margin: '0 0 4px',
}
const boxSub = {
  fontFamily: MONO,
  fontSize: '11px',
  letterSpacing: '0.06em',
  color: COLORS.muted,
  margin: 0,
}
const stepsHeading = {
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 700 as const,
  letterSpacing: '0.2em',
  color: COLORS.muted,
  textTransform: 'uppercase' as const,
  margin: '4px 0 10px',
}
const feat = {
  fontFamily: "'Google Sans','Google Sans Normal',Arial,sans-serif",
  fontSize: '14px',
  color: '#3f3f46',
  lineHeight: '1.6',
  margin: '0 0 6px',
}
const bullet = { color: COLORS.ink, marginRight: '8px', fontFamily: MONO }

export default PlanUpgradeEmail

export const template: TemplateEntry = {
  component: PlanUpgradeEmail,
  subject: (d) => `Welcome to Jenvu ${d?.toPlan || 'Pro'} — upgrade active`,
  displayName: 'Plan upgrade confirmation',
  previewData: {
    recipient: 'trader@jenvu.com',
    fromPlan: 'Signal',
    toPlan: 'ICT Pro',
    effectiveDate: new Date().toUTCString(),
    amount: '$79 / month',
    features: [
      'Unlimited voice-native briefings',
      'Real-time ICT session alerts',
      'Priority signal delivery',
      'Extended market replay & journal',
    ],
    manageUrl: 'https://jenvu.com/dashboard/billing',
  },
}
