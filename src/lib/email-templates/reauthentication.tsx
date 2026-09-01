import * as React from 'react'
import {
  Body,
  Container,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { EmailHead, LogoHeader, shellStyles as s } from './_shared'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <EmailHead />
    <Preview>Your Jenvu reauthentication code: {token}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <LogoHeader tagline="JENVU · REAUTHENTICATION" />
        <Section style={s.card}>
          <Text style={s.eyebrow}>SECURITY // IDENTITY_CHECK</Text>
          <Heading as="h1" style={s.h1}>
            Confirm it's you.
          </Heading>
          <Text style={s.text}>
            Use the code below to confirm your identity and continue your
            action on Jenvu.
          </Text>
          <Section style={s.codeBox}>
            <Text style={s.codeLabel}>REAUTH CODE</Text>
            <Text style={s.codeValue}>{token}</Text>
            <Text style={s.codeExpiry}>Expires shortly · One-time use</Text>
          </Section>
          <Text style={{ ...s.footer, marginTop: '10px' }}>
            Didn't request this? Ignore this email — no action is taken without the code.
          </Text>

          <Text style={s.legal}>JENVU · Voice-native terminal</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
