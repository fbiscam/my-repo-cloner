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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
  token?: string
  recipient?: string
  showLink?: boolean
  showCode?: boolean
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
  token,
  recipient,
  showLink = true,
  showCode,
}: RecoveryEmailProps) => {
  const code = token || '••••••'
  const displayCode = showCode ?? Boolean(token)
  const bodyLine = displayCode && showLink
    ? 'Click the button below to open the reset page, or use the 6-digit code.'
    : displayCode
      ? 'Use the 6-digit code below on the reset screen.'
      : 'Click the button below to open the reset page and choose a new password.'
  return (
    <Html lang="en" dir="ltr">
      <EmailHead />
      <Preview>Reset your {siteName} password{displayCode ? ` · code ${code}` : ''}</Preview>
      <Body style={s.main}>
        <Container style={s.container}>
          <LogoHeader tagline="JENVU · PASSWORD RESET" />
          <Section style={s.card}>
            <Text style={s.eyebrow}>SECURITY // PASSWORD_RESET</Text>
            <Heading as="h1" style={s.h1}>
              Reset your password.
            </Heading>
            <Text style={s.text}>
              We received a request to reset the password for{' '}
              <strong style={{ color: COLORS.ink }}>
                {recipient || 'your account'}
              </strong>
              . {bodyLine}
            </Text>

            {showLink && (
              <Link href={confirmationUrl} style={s.button}>
                Reset your password →
              </Link>
            )}

            {displayCode && (
              <Section style={s.codeBox}>
                <Text style={s.codeLabel}>RESET CODE</Text>
                <Text style={s.codeValue}>{code}</Text>
                <Text style={s.codeExpiry}>Expires in 15 minutes · One-time use</Text>
              </Section>
            )}



            <Text style={{ ...s.footer, marginTop: '24px' }}>
              Didn't request this? Ignore this email — your password stays the same.
            </Text>

          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default RecoveryEmail
