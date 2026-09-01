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
  title?: string
  excerpt?: string
  category?: string
  imageUrl?: string
  articleUrl?: string
  publishedAt?: string
}

const SITE = 'https://jenvu.com'

const MONTHS = [
  'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec',
]
function fmt(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const mo = MONTHS[d.getUTCMonth()]
  const day = d.getUTCDate()
  const yr = d.getUTCFullYear()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${mo} ${day}, ${yr} · ${hh}:${mm} UTC`
}

const Email = ({
  title = 'New Briefing Live on Jenvu Terminal',
  excerpt = 'A fresh institutional briefing has just been published on the Jenvu Insights desk.',
  category = 'Market News',
  imageUrl,
  articleUrl = `${SITE}/insights`,
  publishedAt,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head><EmailFonts /></Head>
    <Preview>{`${title} — ${excerpt.slice(0, 90)}`}</Preview>
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
                  <span style={headerMeta}>TERMINAL BRIEFING</span>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* RED LIVE EYEBROW */}
        <Section style={liveBar}>
          <span style={liveDot}>●</span>
          <span style={liveText}>LIVE · NEW BRIEFING PUBLISHED</span>
        </Section>

        {/* HERO IMAGE */}
        {imageUrl && (
          <Section style={{ padding: '24px 32px 0' }}>
            <Img
              src={imageUrl}
              width={536}
              alt={title}
              style={heroImg}
            />
          </Section>
        )}

        {/* BODY */}
        <Section style={bodySection}>
          <Text style={categoryLabel}>
            {category.toUpperCase()} {publishedAt ? `// ${fmt(publishedAt)}` : ''}
          </Text>
          <Heading as="h1" style={h1}>
            {title}
          </Heading>
          <Text style={lead}>{excerpt}</Text>

          <Section style={{ padding: '8px 0 0' }}>
            <Link href={articleUrl} style={cta}>
              Read full briefing →
            </Link>
          </Section>

          <Text style={fineprint}>
            Or paste this link into your browser:
            <br />
            <Link href={articleUrl} style={plainLink}>{articleUrl}</Link>
          </Text>
        </Section>

        {/* DIVIDER */}
        <Section style={{ padding: '0 32px' }}>
          <div style={divider} />
        </Section>

        {/* FOOTER */}
        <Section style={footer}>
          <Text style={footerBrand}>JENVU AI · TERMINAL BRIEFINGS</Text>
          <Text style={footerMeta}>
            You're receiving this because you subscribed to Jenvu briefings at jenvu.com.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    data?.title ? `📈 ${data.title}` : '📈 New Jenvu Briefing Published',
  displayName: 'New Article Notification',
  previewData: {
    title: 'Gold Holds Above 2,650 as Fed Pivot Speculation Builds',
    excerpt:
      'Institutional flows show fresh accumulation at the prior-day low while DXY rejects supply. Here is the multi-timeframe ICT/SMC read.',
    category: 'Analysis',
    imageUrl: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200',
    articleUrl: 'https://jenvu.com/insights/gold-holds-above-2650',
    publishedAt: new Date().toISOString(),
  },
} satisfies TemplateEntry

// ===== Styles (inline, email-safe) =====
const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily:
    "'Google Sans','Google Sans Normal',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif",
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
const liveDot: React.CSSProperties = {
  fontSize: 10,
  marginRight: 8,
  color: '#dc2626',
}
const liveText: React.CSSProperties = {
  fontFamily: "'Google Sans','Google Sans Normal',ui-monospace,monospace",
  fontSize: 11,
  letterSpacing: '0.2em',
  fontWeight: 700,
  color: '#09090b',
}
const heroImg: React.CSSProperties = {
  width: '100%',
  height: 'auto',
  borderRadius: 12,
  display: 'block',
  border: '1px solid #e4e4e7',
}
const bodySection: React.CSSProperties = {
  padding: '24px 32px 8px',
}
const categoryLabel: React.CSSProperties = {
  fontFamily: "'Google Sans','Google Sans Normal',ui-monospace,monospace",
  fontSize: 10,
  letterSpacing: '0.22em',
  color: '#71717a',
  margin: '0 0 12px 0',
}
const h1: React.CSSProperties = {
  fontSize: 26,
  lineHeight: 1.2,
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: '#09090b',
  margin: '0 0 14px 0',
}
const lead: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.65,
  color: '#52525b',
  margin: '0 0 24px 0',
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
  fontSize: 12,
  color: '#a1a1aa',
  margin: '24px 0 0 0',
  lineHeight: 1.6,
}
const plainLink: React.CSSProperties = {
  color: '#71717a',
  textDecoration: 'underline',
  wordBreak: 'break-all',
}
const divider: React.CSSProperties = {
  borderTop: '1px solid #e4e4e7',
  margin: '24px 0 0 0',
}
const footer: React.CSSProperties = {
  padding: '20px 32px 28px',
  textAlign: 'center',
}
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
