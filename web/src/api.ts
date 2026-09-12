import type { Decision, Group, Rule, Stats } from '../../shared/types.ts'
import { LIVE } from './live.ts'
import { decideMock, subscribeMock } from './mock.ts'

export type QueueAgent = {
  id: string
  host: string
  sessionId: string
  cwd: string
  repo: string
  tool: string
  ts: number
  command: string
}

export type Snapshot = { groups: Group[]; agents?: Record<string, QueueAgent[]>; stats: Stats }

export type Diag = {
  ok: boolean
  liveHint: string
  pending: number
  lastCursorHookAt: number | null
  cursorHookHits: number
  lastCursorLog: string
}

export type PolicyDecision = { command: string; class: string; action: string; ts: number }

export type ScopedPolicy = {
  allowClasses: string[]
  allowPrefixes: string[]
  decisions: PolicyDecision[]
}

export type PolicySnapshot = {
  machine: ScopedPolicy
  projects: Record<string, ScopedPolicy>
  rules: Rule[]
}

export type PolicyOp = {
  op: 'allow' | 'deny' | 'forget'
  scope: 'repo' | 'global'
  repo?: string
  command?: string
  class?: string
  ruleId?: string
  prefix?: string
  fingerprint?: string
}

export type LogRow = {
  id: string
  ts: number
  host: string
  repo: string
  tool: string
  args: string
  fingerprint: string
  title: string
  detail: string
  destructive: number
  state: string
  decision: string | null
  decidedBy: string | null
  decidedAt: number | null
}

export type LogQuery = {
  q?: string
  decidedBy?: string
  action?: string
  host?: string
  from?: number
  limit?: number
}

const EMPTY_POLICY: PolicySnapshot = {
  machine: { allowClasses: [], allowPrefixes: [], decisions: [] },
  projects: {},
  rules: [],
}

export function subscribe(onData: (snap: Snapshot) => void): () => void {
  if (!LIVE) return subscribeMock(onData)

  let source: EventSource | null = null
  const handle = (raw: string) => {
    try {
      onData(JSON.parse(raw) as Snapshot)
    } catch {
      /* fail closed */
    }
  }

  void fetch('/api/groups')
    .then((res) => res.json())
    .then((data: Snapshot) => onData(data))
    .catch(() => {})

  source = new EventSource('/api/stream')
  source.addEventListener('update', (ev: MessageEvent<string>) => {
    handle(ev.data)
  })

  return () => {
    source?.close()
  }
}

export async function decide(body: Decision): Promise<void> {
  if (!LIVE) {
    decideMock(body)
    return
  }
  await fetch('/api/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error(`decide failed: ${res.status}`)
  })
}

export function subscribeDiag(onData: (diag: Diag) => void): () => void {
  if (!LIVE) return () => {}

  let stopped = false
  const pull = () => {
    void fetch('/api/diag')
      .then((res) => res.json())
      .then((data: Diag) => {
        if (!stopped) onData(data)
      })
      .catch(() => {})
  }
  pull()
  const timer = window.setInterval(pull, 1000)
  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}

export async function fetchPolicy(): Promise<PolicySnapshot> {
  if (!LIVE) return EMPTY_POLICY
  const res = await fetch('/api/policy')
  if (!res.ok) throw new Error(`policy failed: ${res.status}`)
  return res.json() as Promise<PolicySnapshot>
}

export async function postPolicy(body: PolicyOp): Promise<void> {
  if (!LIVE) return
  await fetch('/api/policy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => {
    if (!res.ok) throw new Error(`policy failed: ${res.status}`)
  })
}

export async function fetchLogs(query: LogQuery = {}): Promise<LogRow[]> {
  if (!LIVE) return []
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.decidedBy) params.set('decidedBy', query.decidedBy)
  if (query.action) params.set('action', query.action)
  if (query.host) params.set('host', query.host)
  if (typeof query.from === 'number') params.set('from', String(query.from))
  if (query.limit) params.set('limit', String(query.limit))
  const res = await fetch(`/api/logs?${params.toString()}`)
  if (!res.ok) throw new Error(`logs failed: ${res.status}`)
  const data = (await res.json()) as { rows: LogRow[] }
  return data.rows
}
