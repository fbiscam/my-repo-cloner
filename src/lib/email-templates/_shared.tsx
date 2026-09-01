import * as React from 'react'
import { Head, Img, Section, Text } from '@react-email/components'

export const SITE_URL = 'https://jenvu.com'
export const LOGO_URL = `${SITE_URL}/favicon.png`

/**
 * Shared design tokens for Jenvu emails — clean, minimal, professional.
 * Inter for everything (headings, body, labels, code digits).
 */
export const INTER =
  "'Google Sans Normal', 'Google Sans', 'Product Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

// Legacy aliases so existing templates keep compiling without edits.
export const URBANIST = INTER
export const MONO = INTER

export const COLORS = {
  bg: '#f7f7f8',
  card: '#ffffff',
  ink: '#111827',
  body: '#4b5563',
  muted: '#6b7280',
  soft: '#9ca3af',
  border: '#e5e7eb',
  hairline: '#f1f2f4',
  accent: '#111827',
}

/** Load Urbanist from Google Fonts inside <Head>. Falls back to system sans-serif in clients that block web fonts. */
export const EmailFonts = () => (
  <>
    <link
      rel="preconnect"
      href="https://fonts.googleapis.com"
    />
    <link
      rel="preconnect"
      href="https://fonts.gstatic.com"
      crossOrigin=""
    />
    <link
      href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&display=swap"
      rel="stylesheet"
    />
  </>
)


/** Centered logo + Jenvu wordmark, Replit-style masthead. */
export const LogoHeader = (_props: { tagline?: string } = {}) => (
  <Section style={logoWrap}>
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      align="center"
      style={{ borderCollapse: 'collapse' as const, margin: '0 auto' }}
    >
      <tbody>
        <tr>
          <td style={{ verticalAlign: 'middle' }}>
            <Img
              src={LOGO_URL}
              width="32"
              height="32"
              alt="Jenvu"
              style={{ display: 'block', borderRadius: '7px' }}
            />
          </td>
          <td style={{ paddingLeft: '12px', verticalAlign: 'middle' }}>
            <Text style={logoWord}>Jenvu</Text>
          </td>
        </tr>
      </tbody>
    </table>
  </Section>
)

const logoWrap = {
  padding: '26px 28px 22px',
  borderBottom: `1px solid ${COLORS.hairline}`,
  backgroundColor: '#ffffff',
  textAlign: 'center' as const,
}

const logoWord = {
  margin: 0,
  fontFamily: '"Google Sans","Google Sans Normal",-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif',
  fontSize: '22px',
  fontWeight: 400 as const,
  letterSpacing: '-0.005em',
  color: COLORS.ink,
  lineHeight: '1',
}

/** Shared container / body styles reused across all templates. */
export const shellStyles = {
  main: {
    backgroundColor: COLORS.bg,
    fontFamily: INTER,
    padding: '32px 12px',
    margin: 0,
  },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    backgroundColor: COLORS.card,
    borderRadius: '12px',
    border: `1px solid ${COLORS.border}`,
    overflow: 'hidden' as const,
  },
  card: { padding: '28px 28px 24px' },
  eyebrow: {
    fontFamily: INTER,
    fontSize: '12px',
    fontWeight: 500 as const,
    letterSpacing: '0.02em',
    color: COLORS.muted,
    margin: '0 0 8px',
  },
  h1: {
    fontFamily: INTER,
    fontSize: '22px',
    fontWeight: 600 as const,
    color: COLORS.ink,
    letterSpacing: '-0.02em',
    margin: '0 0 14px',
    lineHeight: '1.25',
  },
  text: {
    fontFamily: INTER,
    fontSize: '15px',
    color: COLORS.body,
    lineHeight: '1.6',
    margin: '0 0 16px',
    fontWeight: 400 as const,
  },
  hr: {
    border: 'none',
    borderTop: `1px solid ${COLORS.hairline}`,
    margin: '24px 0',
  },
  button: {
    display: 'inline-block',
    backgroundColor: '#ffffff',
    color: '#000000',
    border: `1px solid ${COLORS.border}`,
    fontFamily: INTER,
    fontSize: '14px',
    fontWeight: 500 as const,
    borderRadius: '8px',
    padding: '11px 20px',
    textDecoration: 'none',
    margin: '4px 0 0',
  },

  footer: {
    fontFamily: INTER,
    fontSize: '13px',
    color: COLORS.muted,
    lineHeight: '1.6',
    margin: '0 0 10px',
    fontWeight: 400 as const,
  },
  footerLink: {
    color: COLORS.body,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  legal: {
    fontFamily: INTER,
    fontSize: '12px',
    color: COLORS.soft,
    letterSpacing: '0',
    margin: '18px 0 0',
    fontWeight: 400 as const,
  },
  codeBox: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    padding: '20px 20px',
    margin: '18px 0 22px',
    textAlign: 'center' as const,
    border: `1px solid ${COLORS.border}`,
  },
  codeLabel: {
    fontFamily: INTER,
    fontSize: '12px',
    fontWeight: 500 as const,
    letterSpacing: '0.02em',
    color: COLORS.muted,
    margin: '0 0 10px',
  },
  codeValue: {
    fontFamily: INTER,
    fontSize: '34px',
    fontWeight: 700 as const,
    color: COLORS.ink,
    letterSpacing: '0.18em',
    margin: '0 0 10px',
    padding: '0 0 0 6px',
  },
  codeExpiry: {
    fontFamily: INTER,
    fontSize: '12px',
    color: COLORS.soft,
    letterSpacing: '0',
    margin: 0,
    fontWeight: 400 as const,
  },
}

/** Convenience <Head> that already includes the font loader. */
export const EmailHead = () => (
  <Head>
    <EmailFonts />
  </Head>
)
