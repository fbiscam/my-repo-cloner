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
  title?: string
  country?: string
  impact?: string
  eventTime?: string
  minutesUntil?: number
  forecast?: string
  previous?: string
  signalUrl?: string
}

const SITE = 'https://jenvu.com'

const NewsEventEmail = ({
  title = 'US CPI m/m',
  country = 'USD',
  impact = 'High',
  eventTime = '',
  minutesUntil = 60,
  forecast = '',
  previous = '',
  signalUrl = `${SITE}/signal`,
}: Props) => (
  <Html lang="en" dir="ltr">
    <EmailHead />
    <Preview>{`${impact} impact ${country} event in ${minutesUntil} min — ${title}`}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <LogoHeader tagline="JENVU · MARKET NEWS" />
        <Section style={s.card}>
          <Text style={{ ...s.eyebrow, color: '#b45309' }}>
            {`NEWS // ${String(impact).toUpperCase()}_IMPACT`}
          </Text>
          <Heading as="h1" style={s.h1}>
            {title}
          </Heading>
          <Text style={s.text}>
            A <strong style={{ color: COLORS.ink }}>{impact}</strong> impact{' '}
            {country} release lands in about{' '}
            <strong style={{ color: COLORS.ink }}>{minutesUntil} minutes</strong>.
            Volatility on gold can spike around this print — manage open risk
            before the release.
          </Text>

          <Section style={box}>
            <Text style={rowLabel}>EVENT TIME (UTC)</Text>
            <Text style={rowValue}>{eventTime || '—'}</Text>
            <Text style={rowLabel}>FORECAST / PREVIOUS</Text>
            <Text style={rowValue}>{`${forecast || '—'}  /  ${previous || '—'}`}</Text>
          </Section>

          <Link href={signalUrl} style={s.button}>
            Open Live Signals →
          </Link>

          <Text style={{ ...s.footer, marginTop: '24px' }}>
            You receive news alerts because alerts are enabled on your Jenvu
            account. Manage them anytime from your dashboard.
          </Text>
          <Text style={s.legal}>JENVU · Market news notifications</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const box = {
  backgroundColor: '#ffffff',
  border: `1px solid ${COLORS.border}`,
  borderRadius: '12px',
  padding: '18px 20px',
  margin: '4px 0 22px',
}
const rowLabel = {
  fontFamily: MONO,
  fontSize: '10px',
  letterSpacing: '0.24em',
  color: COLORS.ink,
  textTransform: 'uppercase' as const,
  margin: '0 0 4px',
}
const rowValue = {
  fontFamily: MONO,
  fontSize: '15px',
  fontWeight: 700 as const,
  color: COLORS.ink,
  margin: '0 0 14px',
}

export default NewsEventEmail

export const template: TemplateEntry = {
  component: NewsEventEmail,
  subject: (d) =>
    `${d?.impact || 'High'} impact ${d?.country || 'USD'} news in ${d?.minutesUntil ?? 60} min · ${d?.title || 'Market event'}`,
  displayName: 'Market news / economic event alert',
  previewData: {
    title: 'US CPI m/m',
    country: 'USD',
    impact: 'High',
    eventTime: '2026-08-13 12:30 UTC',
    minutesUntil: 45,
    forecast: '0.3%',
    previous: '0.2%',
    signalUrl: 'https://jenvu.com/signal',
  },
}
