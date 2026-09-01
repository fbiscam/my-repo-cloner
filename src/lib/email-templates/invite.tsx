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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <EmailHead />
    <Preview>You've been invited to {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <LogoHeader tagline="JENVU · INVITATION" />
        <Section style={s.card}>
          <Text style={s.eyebrow}>ACCESS // WORKSPACE_INVITE</Text>
          <Heading as="h1" style={s.h1}>
            You've been invited.
          </Heading>
          <Text style={s.text}>
            You've been invited to join{' '}
            <Link href={siteUrl} style={{ color: 'inherit' }}>
              <strong>{siteName}</strong>
            </Link>
            . Accept below to create your desk and start using voice-native
            institutional intelligence.
          </Text>
          <Link href={confirmationUrl} style={s.button}>
            Accept Invitation →
          </Link>
          <Text style={{ ...s.footer, marginTop: '24px' }}>
            Not expecting this? You can safely ignore this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
