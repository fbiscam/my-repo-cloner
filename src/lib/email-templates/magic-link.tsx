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
import { EmailHead, LogoHeader, shellStyles as s } from './_shared'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <EmailHead />
    <Preview>Your one-tap login link for {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <LogoHeader tagline="JENVU · MAGIC LINK" />
        <Section style={s.card}>
          <Text style={s.eyebrow}>AUTH // ONE_TAP_LOGIN</Text>
          <Heading as="h1" style={s.h1}>
            Your login link.
          </Heading>
          <Text style={s.text}>
            Tap the button below to sign in to {siteName}. This link is
            single-use and expires shortly.
          </Text>
          <Link href={confirmationUrl} style={s.button}>
            Sign In →
          </Link>
          <Text style={{ ...s.footer, marginTop: '24px' }}>
            Didn't request this? Ignore this email — no session is created without your tap.
          </Text>

        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
