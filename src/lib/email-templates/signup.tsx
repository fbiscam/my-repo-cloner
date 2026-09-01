import * as React from 'react'
import {
  Body,
  Container,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { EmailHead, LogoHeader, shellStyles as s, COLORS, MONO } from './_shared'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  token?: string
  showLink?: boolean
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  token,
  showLink = true,
}: SignupEmailProps) => {
  const code = token || '••••••'
  return (
    <Html lang="en" dir="ltr">
      <EmailHead />
      <Preview>Your Jenvu verification code: {code} — activate your desk.</Preview>
      <Body style={s.main}>
        <Container style={s.container}>
          <LogoHeader tagline="JENVU · AUTH SESSION" />
          <Section style={s.card}>
            <Text style={s.eyebrow}>VERIFY_EMAIL // ACTIVATE_DESK</Text>
            <Heading as="h1" style={s.h1}>
              Confirm your desk.
            </Heading>
            <Text style={s.text}>
              Welcome to <strong style={{ color: COLORS.ink }}>{siteName}</strong>.
              Enter the 6-digit code below on the sign-up screen to activate
              voice-native institutional intelligence for{' '}
              <span style={mono}>{recipient}</span>.
            </Text>

            <Section style={s.codeBox}>
              <Text style={s.codeLabel}>YOUR VERIFICATION CODE</Text>
              <Text style={s.codeValue}>{code}</Text>
              <Text style={s.codeExpiry}>Expires in 15 minutes · One-time use</Text>
            </Section>

            <Text style={stepsHeading}>HOW TO USE</Text>
            <Text style={step}>
              <strong style={stepNum}>1.</strong> Return to the JENVU sign-up tab.
            </Text>
            <Text style={step}>
              <strong style={stepNum}>2.</strong> Enter the 6-digit code above.
            </Text>
            <Text style={step}>
              <strong style={stepNum}>3.</strong> Your desk activates — no link required.
            </Text>

            {showLink && (
              <>
                <Hr style={s.hr} />

                <Text style={stepsHeading}>OR ONE-TAP LINK</Text>
                <Text style={s.text}>
                  Prefer a link? Tap below to verify and open your desk directly.
                </Text>
                <Link href={confirmationUrl} style={s.button}>
                  Verify & Open Desk →
                </Link>
              </>
            )}

            <Hr style={s.hr} />

            <Text style={s.footer}>
              Didn't sign up? Ignore this email — no account is created without a verified code.
            </Text>

            <Text style={s.legal}>
              JENVU · Voice-native gold trading intelligence · {siteUrl.replace(/^https?:\/\//, '')}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default SignupEmail

const mono = { color: COLORS.muted, fontFamily: MONO, fontSize: '13px' }
const stepsHeading = {
  fontFamily: MONO,
  fontSize: '10px',
  fontWeight: 700 as const,
  letterSpacing: '0.2em',
  color: COLORS.muted,
  textTransform: 'uppercase' as const,
  margin: '4px 0 10px',
}
const step = {
  fontFamily: "'Google Sans','Google Sans Normal',Arial,sans-serif",
  fontSize: '14px',
  color: '#3f3f46',
  lineHeight: '1.6',
  margin: '0 0 6px',
}
const stepNum = { fontFamily: MONO, color: COLORS.ink, marginRight: '6px' }
