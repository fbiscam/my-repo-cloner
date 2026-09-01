// Client-safe helpers for auto-recovery.
// Use `withRetry` around any flaky async call (fetch, DB, AI) to add
// exponential backoff. Use `circuitBreaker` to short-circuit repeated
// failures against a specific endpoint.

export type RetryOptions = {
  attempts?: number      // default 3
  baseDelayMs?: number   // default 300
  maxDelayMs?: number    // default 3000
  onRetry?: (err: unknown, attempt: number) => void
  shouldRetry?: (err: unknown) => boolean
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3
  const base = opts.baseDelayMs ?? 300
  const max = opts.maxDelayMs ?? 3000
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (opts.shouldRetry && !opts.shouldRetry(err)) throw err
      opts.onRetry?.(err, i + 1)
      if (i === attempts - 1) break
      const delay = Math.min(max, base * Math.pow(2, i)) + Math.random() * 100
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

const breakerState = new Map<string, { openUntil: number; failures: number }>()

export function circuitBreaker(key: string) {
  return {
    canPass(): boolean {
      const s = breakerState.get(key)
      if (!s) return true
      if (s.openUntil > Date.now()) return false
      return true
    },
    recordSuccess() {
      breakerState.delete(key)
    },
    recordFailure(cooldownMs = 30_000, threshold = 5) {
      const s = breakerState.get(key) ?? { openUntil: 0, failures: 0 }
      s.failures += 1
      if (s.failures >= threshold) s.openUntil = Date.now() + cooldownMs
      breakerState.set(key, s)
    },
  }
}
