import React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { EmailFonts } from './_shared'

interface Props {
  pair?: string
  grade?: 'A+' | 'A' | 'B' | 'C'
  direction?: 'BUY' | 'SELL'
  entry?: number | string
  sl?: number | string
  tp?: number | string
  rr?: number | string
  confidence?: number | string
  session?: string
  killzone?: string
  htfBias?: string
  rationale?: string
  firedAt?: string
  signalUrl?: string
  // Personalized position sizing (from user's /dashboard/risk settings)
  sizeLots?: string
  sizeUnits?: string
  sizeRiskUsd?: string
  sizeBalance?: string
  sizeRiskPct?: string
  unsubscribe_token?: string
}

const SITE = 'https://jenvu.com'

function fmtTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} UTC`
}

const Email = ({
  pair = 'XAUUSD',
  grade = 'A+',
  direction = 'BUY',
  entry = '—',
  sl = '—',
  tp = '—',
  rr = '—',
  confidence = '—',
  session = 'New York',
  killzone = 'NY AM Killzone',
  htfBias = 'bullish',
  rationale = 'High-confluence institutional setup detected.',
  firedAt,
  signalUrl = `${SITE}/signal`,
  sizeLots,
  sizeUnits,
  sizeRiskUsd,
  sizeBalance,
  sizeRiskPct,
  unsubscribe_token,
}: Props) => {
  const unsubUrl = unsubscribe_token
    ? `${SITE}/unsubscribe?token=${encodeURIComponent(unsubscribe_token)}`
    : `${SITE}/unsubscribe`
  const dirColor = direction === 'BUY' ? '#059669' : '#dc2626'
  const hasSize = !!sizeLots
  return (
    <Html lang="en" dir="ltr">
      <Head><EmailFonts /></Head>
      <Preview>{`${grade} ${direction} ${pair} · Entry ${entry} · TP ${tp}`}</Preview>
      <Body style={main}>
        <Container style={outer}>
          {/* HEADER */}
          <Section style={headerBar}>
            <table width="100%" cellPadding={0} cellSpacing={0} border={0}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: 'middle' }}>
                    <Img
                      src={`${SITE}/favicon.png`}
                      width={24}
                      height={24}
                      alt="Jenvu"
                      style={{ borderRadius: 6, display: 'inline-block', verticalAlign: 'middle' }}
                    />
                    <span style={brandWordmark}>JENVU AI</span>
                  </td>
                  <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                    <span style={headerMeta}>SIGNAL DESK</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* LIVE EYEBROW */}
          <Section style={liveBar}>
            <span style={liveDot}>●</span>
            <span style={liveText}>LIVE · {grade} SETUP FIRED</span>
          </Section>

          {/* HERO */}
          <Section style={bodySection}>
            <Text style={categoryLabel}>
              {pair} · {session.toUpperCase()} · {killzone.toUpperCase()} {firedAt ? `// ${fmtTime(firedAt)}` : ''}
            </Text>
            <Heading as="h1" style={h1}>
              <span style={{ color: dirColor }}>{direction}</span> {pair} — {grade} Setup
            </Heading>
            <Text style={lead}>{rationale}</Text>

            {/* Trade box */}
            <Section style={tradeBox}>
              <table width="100%" cellPadding={0} cellSpacing={0} border={0}>
                <tbody>
                  <tr>
                    <td style={tradeCell}>
                      <div style={tradeLabel}>ENTRY</div>
                      <div style={tradeValue}>{entry}</div>
                    </td>
                    <td style={tradeCell}>
                      <div style={tradeLabel}>STOP</div>
                      <div style={{ ...tradeValue, color: '#dc2626' }}>{sl}</div>
                    </td>
                    <td style={tradeCellLast}>
                      <div style={tradeLabel}>TARGET</div>
                      <div style={{ ...tradeValue, color: '#059669' }}>{tp}</div>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} style={tradeFooter}>
                      R:R <strong style={{ color: '#09090b' }}>1:{rr}</strong> &nbsp;·&nbsp;
                      CONF <strong style={{ color: '#09090b' }}>{confidence}%</strong> &nbsp;·&nbsp;
                      HTF <strong style={{ color: '#09090b' }}>{String(htfBias).toUpperCase()}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            {hasSize ? (
              <Section style={sizeBox}>
                <Text style={sizeHeader}>YOUR SUGGESTED POSITION</Text>
                <table width="100%" cellPadding={0} cellSpacing={0} border={0}>
                  <tbody>
                    <tr>
                      <td style={sizeCell}>
                        <div style={tradeLabel}>LOT SIZE</div>
                        <div style={tradeValue}>{sizeLots}</div>
                      </td>
                      <td style={sizeCell}>
                        <div style={tradeLabel}>UNITS (OZ)</div>
                        <div style={tradeValue}>{sizeUnits}</div>
                      </td>
                      <td style={sizeCellLast}>
                        <div style={tradeLabel}>RISK</div>
                        <div style={tradeValue}>${sizeRiskUsd}</div>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={3} style={tradeFooter}>
                        Based on balance <strong style={{ color: '#09090b' }}>${sizeBalance}</strong>
                        &nbsp;·&nbsp; risk <strong style={{ color: '#09090b' }}>{sizeRiskPct}%</strong>
                        &nbsp;·&nbsp; from your Risk Manager
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            ) : null}

            <Section style={{ padding: '8px 0 0' }}>
              <Link href={signalUrl} style={cta}>
                Open signal desk →
              </Link>
            </Section>


            <Text style={fineprint}>
              Trade at your own risk. This is institutional analysis, not financial advice.
              Always use proper position sizing.
            </Text>
          </Section>

          {/* DIVIDER */}
          <Section style={{ padding: '0 32px' }}>
            <div style={divider} />
          </Section>

          {/* FOOTER */}
          <Section style={footer}>
            <Text style={footerBrand}>JENVU AI · SIGNAL ALERTS</Text>
            <Text style={footerMeta}>
              You're receiving this because you subscribed to A+ setup alerts at jenvu.com/signal.
            </Text>
            <Text style={footerMeta}>
              <Link href={unsubUrl} style={unsubLink}>Unsubscribe</Link>
              {' · '}
              <Link href={`${SITE}/dashboard/notifications`} style={unsubLink}>Manage alerts</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `${d?.grade ?? 'A+'} ${d?.direction ?? ''} ${d?.pair ?? 'XAUUSD'} · Entry ${d?.entry ?? ''}`.trim(),
  displayName: 'Signal Alert (A+ Setup)',
  previewData: {
    pair: 'XAUUSD',
    grade: 'A+',
    direction: 'BUY',
    entry: '2654.20',
    sl: '2648.80',
    tp: '2672.10',
    rr: '3.31',
    confidence: 87,
    session: 'New York AM',
    killzone: 'NY AM Killzone',
    htfBias: 'bullish',
    rationale:
      'Price swept Asian session lows into a bullish 1H order block aligned with daily premium discount. FVG above unfilled, BSL resting at PDH.',
    firedAt: new Date().toISOString(),
    signalUrl: 'https://jenvu.com/signal',
  },
} satisfies TemplateEntry

// ===== Styles =====
const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily: "'Google Sans','Google Sans Normal',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
  margin: 0,
  padding: '24px 0',
  color: '#18181b',
}
const outer: React.CSSProperties = {
  width: '100%',
  maxWidth: 600,
  margin: '0 auto',
  border: '1px solid #e4e4e7',
  borderRadius: 16,
  overflow: 'hidden',
  backgroundColor: '#ffffff',
}
const headerBar: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: '14px 24px',
  color: '#09090b',
  borderBottom: '1px solid #e4e4e7',
}
const brandWordmark: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 10,
  verticalAlign: 'middle',
  fontWeight: 700,
  letterSpacing: '0.02em',
  fontSize: 14,
  color: '#09090b',
}
const headerMeta: React.CSSProperties = {
  fontFamily: "'Google Sans','Google Sans Normal',ui-monospace,monospace",
  fontSize: 10,
  letterSpacing: '0.22em',
  color: '#71717a',
}
const liveBar: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: '10px 24px',
  color: '#09090b',
  borderBottom: '1px solid #e4e4e7',
}
const liveDot: React.CSSProperties = { fontSize: 10, marginRight: 8, color: '#dc2626' }
const liveText: React.CSSProperties = {
  fontFamily: "'Google Sans','Google Sans Normal',ui-monospace,monospace",
  fontSize: 11,
  letterSpacing: '0.2em',
  fontWeight: 700,
  color: '#09090b',
}
const bodySection: React.CSSProperties = { padding: '24px 32px 8px' }
const categoryLabel: React.CSSProperties = {
  fontFamily: "'Google Sans','Google Sans Normal',ui-monospace,monospace",
  fontSize: 10,
  letterSpacing: '0.22em',
  color: '#71717a',
  margin: '0 0 12px 0',
}
const h1: React.CSSProperties = {
  fontSize: 24,
  lineHeight: 1.2,
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: '#09090b',
  margin: '0 0 14px 0',
}
const lead: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.65,
  color: '#52525b',
  margin: '0 0 20px 0',
}
const tradeBox: React.CSSProperties = {
  border: '1px solid #e4e4e7',
  borderRadius: 12,
  overflow: 'hidden',
  margin: '0 0 8px 0',
}
const tradeCell: React.CSSProperties = {
  padding: '14px 12px',
  borderRight: '1px solid #e4e4e7',
  textAlign: 'center',
  backgroundColor: '#fafafa',
  width: '33.33%',
}
const tradeCellLast: React.CSSProperties = { ...tradeCell, borderRight: 'none' }
const sizeBox: React.CSSProperties = {
  border: '1px solid #e4e4e7',
  borderRadius: 12,
  overflow: 'hidden',
  margin: '14px 0 0 0',
  backgroundColor: '#fafafa',
}
const sizeHeader: React.CSSProperties = {
  fontFamily: "'Google Sans','Google Sans Normal',ui-monospace,monospace",
  fontSize: 10,
  letterSpacing: '0.22em',
  color: '#71717a',
  padding: '10px 12px 4px',
  margin: 0,
  fontWeight: 700,
}
const sizeCell: React.CSSProperties = {
  padding: '12px 12px',
  borderRight: '1px solid #e4e4e7',
  textAlign: 'center',
  backgroundColor: '#ffffff',
  width: '33.33%',
}
const sizeCellLast: React.CSSProperties = { ...sizeCell, borderRight: 'none' }
const tradeLabel: React.CSSProperties = {
  fontFamily: "'Google Sans','Google Sans Normal',ui-monospace,monospace",
  fontSize: 10,
  letterSpacing: '0.22em',
  color: '#000000',
  fontWeight: 700,
  marginBottom: 6,
}
const tradeValue: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: '#000000',
  fontFeatureSettings: '"tnum"',
}
const unsubLink: React.CSSProperties = {
  color: '#52525b',
  textDecoration: 'underline',
}
const tradeFooter: React.CSSProperties = {
  padding: '10px 12px',
  fontFamily: "'Google Sans','Google Sans Normal',ui-monospace,monospace",
  fontSize: 11,
  textAlign: 'center',
  color: '#52525b',
  backgroundColor: '#ffffff',
  borderTop: '1px solid #e4e4e7',
  letterSpacing: '0.05em',
}
const cta: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#09090b',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
  letterSpacing: '0.01em',
}
const fineprint: React.CSSProperties = {
  fontSize: 11,
  color: '#a1a1aa',
  margin: '20px 0 0 0',
  lineHeight: 1.6,
}
const divider: React.CSSProperties = { borderTop: '1px solid #e4e4e7', margin: '24px 0 0 0' }
const footer: React.CSSProperties = { padding: '20px 32px 28px', textAlign: 'center' }
const footerBrand: React.CSSProperties = {
  fontFamily: "'Google Sans','Google Sans Normal',ui-monospace,monospace",
  fontSize: 10,
  letterSpacing: '0.28em',
  color: '#09090b',
  fontWeight: 700,
  margin: '0 0 8px 0',
}
const footerMeta: React.CSSProperties = {
  fontSize: 11,
  color: '#a1a1aa',
  margin: 0,
  lineHeight: 1.5,
}
