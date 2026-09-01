import { useEffect, useRef, useState, useCallback } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { supabase } from '@/integrations/supabase/client'
import { listSignalAlerts, type SignalAlertRow } from '@/lib/signal-alerts.functions'
import { getAlertsEnabled } from '@/lib/alert-toggle.functions'
import { getAlertCutoff } from '@/lib/alert-cutoff'

const SEEN_KEY = 'jenvu_seen_alert_id'
const ALERTS_ENABLED_CACHE_KEY = 'jenvu_alerts_enabled'

function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const t0 = ctx.currentTime
    const tones = [880, 1175, 1568] // A5, D6, G6
    tones.forEach((f, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0 + i * 0.12)
      g.gain.exponentialRampToValueAtTime(0.18, t0 + i * 0.12 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.12 + 0.18)
      o.connect(g)
      g.connect(ctx.destination)
      o.start(t0 + i * 0.12)
      o.stop(t0 + i * 0.12 + 0.2)
    })
    setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch {
    /* ignore */
  }
}

function notify(a: SignalAlertRow) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    new Notification(`${a.grade} ${a.direction} ${a.pair}`, {
      body: `Entry ${a.entry} · SL ${a.sl} · TP ${a.tp} · R:R 1:${(a.rr ?? 0).toFixed(2)}`,
      icon: '/favicon.png',
      tag: `signal-${a.id}`,
    })
  } catch {
    /* ignore */
  }
}

export function useSignalAlerts(pair: string = 'XAUUSD') {
  const fetcher = useServerFn(listSignalAlerts)
  const alertsEnabledFn = useServerFn(getAlertsEnabled)
  const [alerts, setAlerts] = useState<SignalAlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const enabledRef = useRef<boolean>(
    typeof window !== 'undefined'
      ? window.localStorage.getItem(ALERTS_ENABLED_CACHE_KEY) !== '0'
      : true,
  )
  const seenRef = useRef<string | null>(
    typeof window !== 'undefined' ? window.localStorage.getItem(SEEN_KEY) : null,
  )
  const firstLoadRef = useRef(true)

  const handleNew = useCallback((row: SignalAlertRow) => {
    if (seenRef.current === row.id) return
    seenRef.current = row.id
    try {
      window.localStorage.setItem(SEEN_KEY, row.id)
    } catch {
      /* ignore */
    }
    if (!enabledRef.current) return
    beep()
    notify(row)
  }, [])

  // Fetch current alerts_enabled preference and cache it (only when signed in)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled || !data.session) return
      alertsEnabledFn()
        .then((r) => {
          if (cancelled) return
          enabledRef.current = r.enabled !== false
          try {
            window.localStorage.setItem(ALERTS_ENABLED_CACHE_KEY, r.enabled ? '1' : '0')
          } catch {
            /* ignore */
          }
        })
        .catch(() => {})
    })()
    return () => {
      cancelled = true
    }
  }, [alertsEnabledFn])


  // Initial fetch
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAlertCutoff()
      .then((since) => fetcher({ data: { limit: 20, pair, since: since ?? undefined } }))
      .then((res) => {
        if (cancelled) return
        const list = res.alerts ?? []
        setAlerts(list)
        // Don't chime on first load — just record latest as seen
        if (list[0] && firstLoadRef.current) {
          seenRef.current = list[0].id
          try {
            window.localStorage.setItem(SEEN_KEY, list[0].id)
          } catch {
            /* ignore */
          }
        }
        firstLoadRef.current = false
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [fetcher, pair])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`signal_alerts:${pair}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'signal_alerts', filter: `pair=eq.${pair}` },
        (payload) => {
          const row = payload.new as SignalAlertRow
          setAlerts((prev) => {
            if (prev.find((p) => p.id === row.id)) return prev
            return [row, ...prev].slice(0, 20)
          })
          handleNew(row)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [pair, handleNew])

  return { alerts, loading, latest: alerts[0] ?? null }
}

export async function requestAlertPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission
  }
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}
