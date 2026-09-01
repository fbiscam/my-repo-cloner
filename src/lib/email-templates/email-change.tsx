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

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <EmailHead />
    <Preview>Confirm your email change on {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <LogoHeader tagline="JENVU · EMAIL CHANGE" />
        <Section style={s.card}>
          <Text style={s.eyebrow}>SECURITY // EMAIL_CHANGE</Text>
          <Heading as="h1" style={s.h1}>
            Confirm your new email.
          </Heading>
          <Text style={s.text}>
            You requested to move your {siteName} account from{' '}
            <span style={mono}>{oldEmail}</span> to{' '}
            <span style={mono}>{newEmail}</span>. Confirm to complete the
            change.
          </Text>
          <Link href={confirmationUrl} style={s.button}>
            Confirm Email Change →
          </Link>
          <Text style={{ ...s.footer, marginTop: '24px' }}>
            Didn't request this? Reset your password immediately to secure your account.
          </Text>

        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const mono = { fontFamily: MONO, fontSize: '13px', color: COLORS.ink }
