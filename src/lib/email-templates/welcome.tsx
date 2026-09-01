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
import { EmailHead, LogoHeader, shellStyles as s, COLORS } from './_shared'
import type { TemplateEntry } from './registry'

interface Props {
  recipient?: string
  fullName?: string
  siteUrl?: string
}

const SITE = 'https://jenvu.com'

const listItem: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '15px',
  color: COLORS.body,
  lineHeight: '1.6',
  margin: '0 0 8px',
}
const linkStyle: React.CSSProperties = {
  color: COLORS.ink,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
}
const fineprint: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: '12px',
  color: COLORS.soft,
  lineHeight: '1.6',
  margin: '24px 0 0',
}

const WelcomeEmail = ({
  recipient = 'trader@jenvu.com',
  fullName,
  siteUrl = SITE,
}: Props) => {
  const first = fullName?.split(/\s+/)[0]
  return (
    <Html lang="en" dir="ltr">
      <EmailHead />
      <Preview>Welcome to Jenvu — your voice-native trading desk is ready</Preview>
      <Body style={s.main}>
        <Container style={s.container}>
          <LogoHeader />

          <Section style={s.card}>
            <Heading style={s.h1}>
              {first ? `Welcome, ${first}` : 'Welcome to Jenvu'}
            </Heading>
            <Text style={s.text}>
              You&apos;re in. Jenvu turns real-time ICT & SMC market structure into
              voice briefings, precision signals, and a journal that shows
              exactly where your edge lives.
            </Text>

            <Text style={{ ...s.text, marginTop: 20, fontWeight: 600, color: COLORS.ink }}>
              Get started in 60 seconds:
            </Text>
            <Text style={listItem}>
              1. Open your{' '}
              <Link href={`${siteUrl}/dashboard`} style={linkStyle}>Dashboard</Link>{' '}
              — check your credits & plan.
            </Text>
            <Text style={listItem}>
              2. Visit the{' '}
              <Link href={`${siteUrl}/signal`} style={linkStyle}>Signal page</Link>{' '}
              — analyze XAU/USD, EUR, GBP in one click.
            </Text>
            <Text style={listItem}>
              3. Enable{' '}
              <Link href={`${siteUrl}/dashboard/alerts`} style={linkStyle}>Signal Alerts</Link>{' '}
              — never miss a killzone opportunity.
            </Text>
            <Text style={listItem}>
              4. Log your first trade in the{' '}
              <Link href={`${siteUrl}/dashboard/journal`} style={linkStyle}>Journal</Link>.
            </Text>

            <Section style={{ textAlign: 'center', marginTop: 28 }}>
              <Link href={`${siteUrl}/dashboard`} style={s.button}>
                Open Dashboard
              </Link>
            </Section>

            <Text style={fineprint}>
              Questions? Just reply to this email — it lands with our support desk.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: WelcomeEmail,
  subject: 'Welcome to Jenvu — your desk is ready',
  displayName: 'Welcome email',
  previewData: {
    recipient: 'trader@jenvu.com',
    fullName: 'Alex Trader',
    siteUrl: SITE,
  },
}
