import type { Decision, Group, Stats } from '../../shared/types.ts'
import { LIVE } from './live.ts'
import { decideMock, subscribeMock } from './mock.ts'

export type Snapshot = { groups: Group[]; stats: Stats }

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
