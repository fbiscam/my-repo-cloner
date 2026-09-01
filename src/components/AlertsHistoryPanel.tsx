import { useState } from 'react'
import type { SignalAlertRow } from '@/lib/signal-alerts.functions'
import { cn } from '@/lib/utils'
import { MiniPairChart } from '@/components/MiniPairChart'
import { ChevronLeft, ChevronRight } from 'lucide-react'


const MONO = 'font-mono'
const PER_PAGE = 9

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function AlertsHistoryPanel({
  alerts,
  loading,
}: {
  alerts: SignalAlertRow[]
  loading: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(alerts.length / PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pagedAlerts = alerts.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100">
        <span className="text-[14px] font-normal font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] tracking-normal normal-case text-zinc-900">
          Recent Alerts
        </span>
        <span className="text-[12px] font-normal font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] tracking-normal text-zinc-400">
          {alerts.length}
        </span>
      </div>

      {loading && alerts.length === 0 ? (
        <div className="px-3 py-6 text-center text-[11px] text-zinc-500">Loading…</div>
      ) : alerts.length === 0 ? (
        <div className="px-3 py-6 text-center font-['Urbanist',sans-serif] text-[13px] font-medium text-zinc-800 leading-relaxed">
          No A+ setups fired yet.<br />
          The scanner is watching every 5 min.
        </div>
      ) : (
        <>
          <ul className="max-h-[420px] overflow-y-auto divide-y divide-zinc-100">
            {pagedAlerts.map((a) => {
              const isBuy = a.direction === 'BUY'
              const open = openId === a.id
              return (
                <li key={a.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          `text-[9px] ${MONO} font-bold tracking-widest px-1.5 py-0.5 rounded`,
                          a.grade === 'A+'
                            ? 'bg-zinc-900 text-white'
                            : 'bg-zinc-100 text-zinc-700 border border-zinc-200',
                        )}
                      >
                        {a.grade}
                      </span>
                      <span
                        className={cn(
                          `text-[10px] ${MONO} font-bold tracking-widest`,
                          isBuy ? 'text-emerald-600' : 'text-rose-600',
                        )}
                      >
                        {a.direction}
                      </span>
                      <span className={`text-[10px] ${MONO} text-zinc-500`}>{a.pair}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : a.id)}
                        className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[9px] font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50"
                      >
                        {open ? 'Hide chart' : 'Chart'}
                      </button>
                      <span className={`text-[9px] ${MONO} text-zinc-400 tabular-nums`}>
                        {timeAgo(a.fired_at)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] tabular-nums">
                    <div>
                      <div className={`${MONO} text-[8px] tracking-widest text-zinc-400`}>ENTRY</div>
                      <div className="text-zinc-900 font-semibold">{a.entry}</div>
                    </div>
                    <div>
                      <div className={`${MONO} text-[8px] tracking-widest text-zinc-400`}>SL</div>
                      <div className="text-rose-600 font-semibold">{a.sl}</div>
                    </div>
                    <div>
                      <div className={`${MONO} text-[8px] tracking-widest text-zinc-400`}>TP</div>
                      <div className="text-emerald-600 font-semibold">{a.tp}</div>
                    </div>
                  </div>
                  {a.rationale && (
                    <p className="mt-1.5 text-[10px] text-zinc-600 leading-snug line-clamp-2">
                      {a.rationale}
                    </p>
                  )}
                  {open && (
                    <div className="mt-2 animate-fade-in">
                      <MiniPairChart symbol={a.pair} height={120} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2">
              <span className="text-[11px] text-zinc-500">
                Page {safePage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

