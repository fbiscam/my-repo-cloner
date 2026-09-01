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
  device?: string
  browser?: string
  os?: string
  location?: string
  ip?: string
  signedInAt?: string
  secureAccountUrl?: string
}

const SITE = 'https://jenvu.com'

const NewDeviceEmail = ({
  recipient = 'trader@jenvu.com',
  device = 'Unknown device',
  browser = 'Unknown browser',
  os = 'Unknown OS',
  location = 'Unknown location',
  ip = '0.0.0.0',
  signedInAt = new Date().toUTCString(),
  secureAccountUrl = `${SITE}/dashboard/profile`,
}: Props) => (
  <Html lang="en" dir="ltr">
    <EmailHead />
    <Preview>New sign-in to your Jenvu desk from {device} · {location}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <LogoHeader tagline="JENVU · SECURITY ALERT" />
        <Section style={s.card}>
          <Text style={{ ...s.eyebrow, color: '#b91c1c' }}>SECURITY // NEW_DEVICE</Text>
          <Heading as="h1" style={s.h1}>
            New sign-in detected.
          </Heading>
          <Text style={s.text}>
            A new device just signed in to your Jenvu desk (
            <span style={mono}>{recipient}</span>). If this was you, no action
            is needed. If it wasn't, secure your account immediately.
          </Text>

          <Section style={infoBox}>
            <Row label="DEVICE" value={device} />
            <Row label="BROWSER" value={browser} />
            <Row label="OS" value={os} />
            <Row label="LOCATION" value={location} />
            <Row label="IP" value={ip} />
            <Row label="SIGNED IN" value={signedInAt} last />
          </Section>

          <Link href={secureAccountUrl} style={s.button}>
            Secure My Account →
          </Link>

          <Text style={{ ...s.footer, marginTop: '24px' }}>
            Was this you? Ignore this email — we alert on every new device or location.
          </Text>

          <Text style={s.legal}>JENVU · Security notifications</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const Row = ({ label, value, last }: { label: string; value: string; last?: boolean }) => (
  <table
    width="100%"
    cellPadding={0}
    cellSpacing={0}
    role="presentation"
    style={{ borderCollapse: 'collapse' as const }}
  >
    <tbody>
      <tr>
        <td
          style={{
            padding: '8px 0',
            borderBottom: last ? 'none' : `1px solid ${COLORS.hairline}`,
            width: '35%',
            fontFamily: MONO,
            fontSize: '10.5px',
            letterSpacing: '0.18em',
            color: COLORS.soft,
            textTransform: 'uppercase' as const,
          }}
        >
          {label}
        </td>
        <td
          style={{
            padding: '8px 0',
            borderBottom: last ? 'none' : `1px solid ${COLORS.hairline}`,
            fontFamily: MONO,
            fontSize: '12.5px',
            color: COLORS.ink,
            textAlign: 'right' as const,
          }}
        >
          {value}
        </td>
      </tr>
    </tbody>
  </table>
)

const mono = { color: COLORS.ink, fontFamily: MONO, fontSize: '13px' }
const infoBox = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: '12px',
  padding: '4px 16px',
  margin: '4px 0 20px',
  backgroundColor: '#fafafa',
}

export default NewDeviceEmail

export const template: TemplateEntry = {
  component: NewDeviceEmail,
  subject: (d) =>
    `New sign-in to Jenvu · ${d?.device || 'Unknown device'} · ${d?.location || 'Unknown location'}`,
  displayName: 'New device sign-in alert',
  previewData: {
    recipient: 'trader@jenvu.com',
    device: 'iPhone 15 Pro',
    browser: 'Safari 17.4',
    os: 'iOS 18.1',
    location: 'Karachi, PK',
    ip: '203.0.113.24',
    signedInAt: new Date().toUTCString(),
    secureAccountUrl: 'https://jenvu.com/dashboard/profile',
  },
}
