import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

function readClientIp(): string {
  try {
    const req = getRequest()
    const h = req.headers
    const raw =
      h.get('cf-connecting-ip') ||
      h.get('x-forwarded-for')?.split(',')[0] ||
      h.get('x-real-ip') ||
      ''
    return raw.trim()
  } catch {
    return ''
  }
}

import {
  createRecoveryOtp,
  createSignupOtp,
  verifyRecoveryOtp,
  verifySignupOtp,
} from './custom-auth.server'

const siteUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((url) => /^https?:\/\//i.test(url), 'Invalid site URL')
  .optional()

export const requestSignupOtp = createServerFn({ method: 'POST' })
  .inputValidator((data) =>
    z
      .object({
        fullName: z.string().trim().min(1, 'Name is required').max(100),
        email: z.string().trim().email('Enter a valid email').max(255),
        password: z.string().min(8, 'Password must be at least 8 characters').max(72),
        siteUrl: siteUrlSchema,
        fingerprint: z.string().trim().max(128).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const ua = (() => { try { return getRequest().headers.get('user-agent') || '' } catch { return '' } })()
      await createSignupOtp({ ...data, ip: readClientIp(), fingerprint: data.fingerprint, userAgent: ua })
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Could not send code.' }
    }
  })

export const confirmSignupOtp = createServerFn({ method: 'POST' })
  .inputValidator((data) =>
    z
      .object({
        email: z.string().trim().email('Enter a valid email').max(255),
        code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
        password: z.string().min(8, 'Password must be at least 8 characters').max(72),
        fingerprint: z.string().trim().max(128).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const ua = (() => { try { return getRequest().headers.get('user-agent') || '' } catch { return '' } })()
    return verifySignupOtp({ ...data, ip: readClientIp(), fingerprint: data.fingerprint, userAgent: ua })
  })

export const requestRecoveryOtp = createServerFn({ method: 'POST' })
  .inputValidator((data) =>
    z
      .object({
        email: z.string().trim().email('Enter a valid email').max(255),
        siteUrl: siteUrlSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      await createRecoveryOtp(data)
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Could not send code.' }
    }
  })

export const confirmRecoveryOtp = createServerFn({ method: 'POST' })
  .inputValidator((data) =>
    z
      .object({
        email: z.string().trim().email('Enter a valid email').max(255),
        code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
        siteUrl: siteUrlSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => verifyRecoveryOtp(data))