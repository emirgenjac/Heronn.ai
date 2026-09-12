import type { Decision, Group, Stats } from '../../shared/types.ts'
import { LIVE } from './live.ts'
import { decideMock, subscribeMock } from './mock.ts'

export type Snapshot = { groups: Group[]; stats: Stats }

export type Diag = {
  ok: boolean
  liveHint: string
  pending: number
  lastCursorHookAt: number | null
  cursorHookHits: number
  lastCursorLog: string
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
