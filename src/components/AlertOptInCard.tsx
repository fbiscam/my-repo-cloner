import { useEffect, useState } from 'react'
import { Bell, BellRing, Check, Loader2, Mail } from 'lucide-react'
import { useServerFn } from '@tanstack/react-start'
import { subscribeToAlerts, isAlertSubscribed } from '@/lib/signal-alerts.functions'
import { requestAlertPermission } from '@/hooks/useSignalAlerts'

const MONO = 'font-mono'

export default function AlertOptInCard() {
  const subscribe = useServerFn(subscribeToAlerts)
  const checkSubscribed = useServerFn(isAlertSubscribed)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPerm('unsupported')
    } else {
      setPerm(Notification.permission)
    }
    // Local cache
    if (typeof window !== 'undefined' && window.localStorage.getItem('jenvu:alerts:subscribed') === '1') {
      setDone(true)
      return
    }
    // Server-side check against the signed-in user's email
    checkSubscribed({})
      .then((r) => {
        if (r?.subscribed) {
          setDone(true)
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('jenvu:alerts:subscribed', '1')
          }
        }
      })
      .catch(() => {})
  }, [checkSubscribed])


  const enableBrowser = async () => {
    const next = await requestAlertPermission()
    setPerm(next)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setSubmitting(true)
    try {
      const res = await subscribe({ data: { email } })
      if (!res.ok) throw new Error(res.error || 'Subscription failed')
      setDone(true)
      setEmail('')
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('jenvu:alerts:subscribed', '1')
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Subscription failed')
    } finally {
      setSubmitting(false)
    }
  }

  const permGranted = perm === 'granted'
  const permBlocked = perm === 'denied' || perm === 'unsupported'

  if (done) return null

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] ${MONO} tracking-widest uppercase text-zinc-900 font-bold`}>
          A+ Setup Alerts
        </span>
        <span className={`text-[9px] ${MONO} tracking-widest uppercase text-zinc-400`}>
          INSTITUTIONAL
        </span>
      </div>

      {/* Browser notification toggle */}
      <button
        type="button"
        disabled={permGranted || permBlocked}
        onClick={enableBrowser}
        className={`w-full inline-flex items-center justify-center gap-2 py-2 rounded-md text-[11px] font-semibold tracking-wide transition-colors ${
          permGranted
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
            : permBlocked
              ? 'bg-zinc-50 text-zinc-400 border border-zinc-200 cursor-not-allowed'
              : 'bg-zinc-900 text-white hover:bg-zinc-800'
        }`}
      >
        {permGranted ? (
          <>
            <BellRing className="h-3.5 w-3.5" /> Browser alerts enabled
          </>
        ) : permBlocked ? (
          <>
            <Bell className="h-3.5 w-3.5" /> Browser alerts unavailable
          </>
        ) : (
          <>
            <Bell className="h-3.5 w-3.5" /> Enable browser alerts
          </>
        )}
      </button>

      {/* Email subscribe */}
      {done ? (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          Subscribed — A+ setups will land in your inbox.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2">
          <div className="relative">
            <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="email"
              required
              placeholder="you@desk.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-8 pr-2 py-2 text-[12px] rounded-md border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-md bg-white border border-zinc-300 text-zinc-900 text-[11px] font-semibold tracking-wide hover:bg-zinc-50 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {submitting ? 'Submitting…' : 'Email me A+ setups'}
          </button>
          {err && <p className="text-[11px] text-rose-600">{err}</p>}
        </form>
      )}

      <p className="font-['Urbanist',sans-serif] text-[13px] font-medium text-zinc-900 leading-relaxed tracking-normal max-w-[44ch]">
        We only alert on A+ / A institutional setups — typically 2–5 per week. Unsubscribe anytime.
      </p>
    </div>
  )
}
