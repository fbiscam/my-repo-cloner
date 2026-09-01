import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import SiteFooter from "@/components/SiteFooter";

export const Route = createFileRoute('/unsubscribe')({
  head: () => ({
    meta: [
      { title: 'Unsubscribe — Jenvu' }, { name: 'robots', content: 'noindex, nofollow' },
      { name: 'robots', content: 'noindex, nofollow' },
      {
        name: 'description',
        content: 'Manage your subscription to Jenvu terminal briefings.',
      },
    ],
  }),
  component: UnsubscribePage,
})

type State =
  | { kind: 'loading' }
  | { kind: 'invalid'; reason?: string }
  | { kind: 'ready' }
  | { kind: 'submitting' }
  | { kind: 'already_unsubscribed' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]"

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (!t) {
      setState({ kind: 'invalid', reason: 'missing_token' })
      return
    }
    setToken(t)
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          setState({ kind: 'invalid', reason: data?.error })
          return
        }
        if (data?.valid === false && data?.reason === 'already_unsubscribed') {
          setState({ kind: 'already_unsubscribed' })
          return
        }
        if (data?.valid === true) {
          setState({ kind: 'ready' })
          return
        }
        setState({ kind: 'invalid' })
      })
      .catch(() => setState({ kind: 'error', message: 'Could not reach the server.' }))
  }, [])

  const onConfirm = async () => {
    if (!token) return
    setState({ kind: 'submitting' })
    try {
      const res = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setState({ kind: 'error', message: data?.error || 'Request failed.' })
        return
      }
      if (data?.success) {
        setState({ kind: 'success' })
      } else if (data?.reason === 'already_unsubscribed') {
        setState({ kind: 'already_unsubscribed' })
      } else {
        setState({ kind: 'error', message: 'Unexpected response.' })
      }
    } catch {
      setState({ kind: 'error', message: 'Network error.' })
    }
  }

  return (
    <div className="min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif] flex flex-col">
      <header className="border-b border-zinc-100">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
            <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
          </Link>
          <span className={`hidden sm:inline ${MONO} text-[10px] uppercase tracking-[0.28em] text-zinc-500`}>
            BRIEFINGS · SUBSCRIPTION
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md text-center">
          <div className={`${MONO} text-[10px] uppercase tracking-[0.3em] text-red-600 font-bold mb-4`}>
            MANAGE SUBSCRIPTION
          </div>

          {state.kind === 'loading' && (
            <Card title="Verifying your link…" body="One moment while we check your unsubscribe token." />
          )}

          {state.kind === 'ready' && (
            <Card
              title="Unsubscribe from Jenvu briefings?"
              body="You'll stop receiving new article notifications immediately. You can resubscribe anytime from the Insights page."
            >
              <button
                onClick={onConfirm}
                className="mt-6 w-full bg-zinc-900 text-white rounded-xl px-5 py-3 text-sm font-bold hover:bg-zinc-800 transition-colors"
              >
                Confirm unsubscribe
              </button>
              <Link
                to="/insights"
                className="mt-3 inline-block text-xs text-zinc-500 hover:text-zinc-900"
              >
                Keep me subscribed →
              </Link>
            </Card>
          )}

          {state.kind === 'submitting' && (
            <Card title="Processing…" body="Removing your address from the list." />
          )}

          {state.kind === 'success' && (
            <Card
              title="You're unsubscribed."
              body="You will no longer receive briefing emails from Jenvu. Markets keep moving — come back any time."
            >
              <Link
                to="/insights"
                className="mt-6 inline-block bg-zinc-900 text-white rounded-xl px-5 py-3 text-sm font-bold hover:bg-zinc-800 transition-colors"
              >
                Back to Insights →
              </Link>
            </Card>
          )}

          {state.kind === 'already_unsubscribed' && (
            <Card
              title="Already unsubscribed."
              body="This address is no longer on the Jenvu briefings list. Nothing more to do."
            />
          )}

          {state.kind === 'invalid' && (
            <Card
              title="Invalid or expired link."
              body="This unsubscribe link is no longer valid. If you keep receiving emails, reach us via the Contact page."
            >
              <Link
                to="/contact"
                className="mt-6 inline-block border border-zinc-200 rounded-xl px-5 py-3 text-sm font-semibold hover:border-zinc-900 transition-colors"
              >
                Contact support →
              </Link>
            </Card>
          )}

          {state.kind === 'error' && (
            <Card title="Something went wrong." body={state.message} />
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}

function Card({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-zinc-50/60 p-8 sm:p-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">
        {title}
      </h1>
      <p className="mt-3 text-sm text-zinc-600 leading-relaxed">{body}</p>
      {children}
    </div>
  )
}
