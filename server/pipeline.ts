import type { Action, Interrupt } from '../shared/types.ts'
import { canonicalise, match } from './engine/index.ts'
import { insertInterrupt } from './snapshot.ts'
import { broadcast } from './sse.ts'
import { park } from './waiters.ts'

export function queueForHuman(i: Interrupt): Promise<Action> {
  const interrupt: Interrupt = i.fingerprint ? i : { ...i, ...canonicalise(i) }
  insertInterrupt(interrupt, 'pending', null, null, null)
  broadcast()
  return park(interrupt.id)
}

export function handleInterrupt(i: Interrupt, opts?: { hold?: boolean }): Promise<Action> {
  const interrupt: Interrupt = i.fingerprint ? i : { ...i, ...canonicalise(i) }
  const rule = match(interrupt.fingerprint, interrupt.repo)

  if (rule?.action === 'allow') {
    queueMicrotask(() => {
      insertInterrupt(interrupt, 'auto', 'allow', 'rule', Date.now())
      broadcast()
    })
    return Promise.resolve('allow')
  }

  if (opts?.hold || rule?.action === 'deny') {
    return queueForHuman(interrupt)
  }

  insertInterrupt(interrupt, 'decided', 'ask', 'host', Date.now())
  broadcast()
  return Promise.resolve('ask')
}
