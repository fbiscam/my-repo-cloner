import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { listBugGroups, listBugOccurrences, analyzeBugGroup, updateBugStatus } from '@/lib/bug-triage.functions'

export const Route = createFileRoute('/_authenticated/dashboard/admin/bugs')({
  head: () => ({
    meta: [
      { title: 'Bug Triage · Ops' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
  component: BugTriagePage,
})

type Group = {
  fingerprint: string
  first_seen: string
  last_seen: string
  occurrences: number
  sample_message: string
  sample_route: string | null
  sample_stack: string | null
  status: string
  severity: string
  ai_root_cause: string | null
  ai_suggested_fix: string | null
  ai_analyzed_at: string | null
  ai_model: string | null
  resolution_note: string | null
}

const SANS = 'font-["Google_Sans","Product_Sans","Roboto",system-ui,sans-serif]'
const STATUSES = ['all', 'open', 'investigating', 'resolved', 'ignored'] as const

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

function BugTriagePage() {
  const qc = useQueryClient()
  const listFn = useServerFn(listBugGroups)
  const analyzeFn = useServerFn(analyzeBugGroup)
  const statusFn = useServerFn(updateBugStatus)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>('open')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['bug-groups', statusFilter],
    queryFn: () => listFn({ data: { status: statusFilter, limit: 100 } }),
    refetchInterval: 15000,
  })

  const analyzeMut = useMutation({
    mutationFn: (fp: string) => analyzeFn({ data: { fingerprint: fp } }),
    onSuccess: () => {
      toast.success('AI diagnosis ready')
      qc.invalidateQueries({ queryKey: ['bug-groups'] })
    },
    onError: (e: any) => toast.error(e?.message || 'Analysis failed'),
  })

  const statusMut = useMutation({
    mutationFn: (args: { fp: string; status: 'open' | 'investigating' | 'resolved' | 'ignored' }) =>
      statusFn({ data: { fingerprint: args.fp, status: args.status } }),
    onSuccess: () => {
      toast.success('Updated')
      qc.invalidateQueries({ queryKey: ['bug-groups'] })
    },
    onError: (e: any) => toast.error(e?.message || 'Update failed'),
  })

  const groups = (data?.rows ?? []) as Group[]

  return (
    <div className={`min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased`}>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.08)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="pl-1 text-xl font-semibold tracking-tight sm:text-2xl">Bug Triage</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Grouped runtime errors from the app. Analyze with AI to get root cause + suggested fix.
              </p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs capitalize transition ${
                  statusFilter === s
                    ? 'bg-zinc-900 text-white'
                    : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {isLoading && <div className="text-sm text-zinc-500">Loading…</div>}
          {!isLoading && groups.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
              No errors in this bucket. 🎉
            </div>
          )}

          {groups.map((g) => {
            const isOpen = expanded === g.fingerprint
            return (
              <div key={g.fingerprint} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_8px_20px_-16px_rgba(0,0,0,0.08)] sm:p-5">
                <button
                  onClick={() => setExpanded(isOpen ? null : g.fingerprint)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        g.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                        g.status === 'investigating' ? 'bg-amber-100 text-amber-700' :
                        g.status === 'ignored' ? 'bg-zinc-100 text-zinc-500' :
                        'bg-rose-100 text-rose-700'
                      }`}>{g.status}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                        ×{g.occurrences}
                      </span>
                      {g.sample_route && (
                        <span className="truncate rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          {g.sample_route}
                        </span>
                      )}
                      <span className="text-[11px] text-zinc-400">last: {fmtTime(g.last_seen)}</span>
                    </div>
                    <div className="mt-1.5 truncate text-sm font-medium text-zinc-900">{g.sample_message}</div>
                    {g.ai_root_cause && (
                      <div className="mt-1 text-xs text-zinc-500 line-clamp-2">
                        <span className="font-semibold text-zinc-700">AI:</span> {g.ai_root_cause}
                      </div>
                    )}
                  </div>
                  <span className="mt-1 shrink-0 text-xs text-zinc-400">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="mt-4 space-y-3 border-t border-zinc-100 pt-4">
                    <OccurrencesList fp={g.fingerprint} />

                    {g.ai_root_cause ? (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
                        <div className="mb-1 font-semibold text-zinc-700">Root cause ({g.ai_model})</div>
                        <div className="text-zinc-700">{g.ai_root_cause}</div>
                        {g.ai_suggested_fix && (
                          <>
                            <div className="mt-2 mb-1 font-semibold text-zinc-700">Suggested fix</div>
                            <pre className="whitespace-pre-wrap font-sans text-zinc-700">{g.ai_suggested_fix}</pre>
                          </>
                        )}
                        <div className="mt-2 text-[10px] text-zinc-400">
                          Analyzed {g.ai_analyzed_at ? fmtTime(g.ai_analyzed_at) : ''}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">Not analyzed yet.</div>
                    )}

                    <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
                      <summary className="cursor-pointer font-semibold text-zinc-700">Stack sample</summary>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-zinc-600">
                        {g.sample_stack ?? '(no stack)'}
                      </pre>
                    </details>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => analyzeMut.mutate(g.fingerprint)}
                        disabled={analyzeMut.isPending}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {analyzeMut.isPending ? 'Analyzing…' : g.ai_root_cause ? 'Re-analyze' : 'Analyze with AI'}
                      </button>
                      {g.ai_suggested_fix && (
                        <button
                          onClick={() => {
                            const prompt = `Fix this bug in the codebase:\n\nRoot cause: ${g.ai_root_cause}\n\nSuggested fix:\n${g.ai_suggested_fix}\n\nSample error: ${g.sample_message}\nRoute: ${g.sample_route ?? 'n/a'}`
                            navigator.clipboard.writeText(prompt).then(() => toast.success('Prompt copied — paste into Lovable chat'))
                          }}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                        >
                          Copy fix prompt
                        </button>
                      )}
                      {g.status !== 'investigating' && (
                        <button
                          onClick={() => statusMut.mutate({ fp: g.fingerprint, status: 'investigating' })}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
                        >
                          Mark investigating
                        </button>
                      )}
                      {g.status !== 'resolved' && (
                        <button
                          onClick={() => statusMut.mutate({ fp: g.fingerprint, status: 'resolved' })}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100"
                        >
                          Mark resolved
                        </button>
                      )}
                      {g.status !== 'ignored' && (
                        <button
                          onClick={() => statusMut.mutate({ fp: g.fingerprint, status: 'ignored' })}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
                        >
                          Ignore
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function OccurrencesList({ fp }: { fp: string }) {
  const fn = useServerFn(listBugOccurrences)
  const { data, isLoading } = useQuery({
    queryKey: ['bug-occurrences', fp],
    queryFn: () => fn({ data: { fingerprint: fp } }),
  })
  if (isLoading) return <div className="text-xs text-zinc-500">Loading occurrences…</div>
  const rows = (data?.rows ?? []) as any[]
  if (rows.length === 0) return null
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs">
      <div className="mb-2 font-semibold text-zinc-700">Recent occurrences ({rows.length})</div>
      <div className="space-y-1.5">
        {rows.slice(0, 8).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-1.5 first:border-t-0 first:pt-0">
            <span className="text-[10px] text-zinc-400">{fmtTime(r.created_at)}</span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{r.source}/{r.mechanism ?? '—'}</span>
            {r.route && <span className="text-[10px] text-blue-700">{r.route}</span>}
            {r.user_email && <span className="text-[10px] text-zinc-500">{r.user_email}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
