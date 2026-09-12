import type { Action, Interrupt } from '../shared/types.ts'
import { canonicalise, match } from './engine/index.ts'
import { insertInterrupt } from './snapshot.ts'
import { broadcast } from './sse.ts'
import { park } from './waiters.ts'

export function handleInterrupt(i: Interrupt, opts?: { hold?: boolean }): Promise<Action> {
  const interrupt: Interrupt = i.fingerprint ? i : { ...i, ...canonicalise(i) }
  const rule = match(interrupt.fingerprint, interrupt.repo)

  if (rule) {
    queueMicrotask(() => {
      insertInterrupt(interrupt, 'auto', rule.action, 'rule', Date.now())
      broadcast()
    })
    return Promise.resolve(rule.action)
  }

  if (opts?.hold) {
    insertInterrupt(interrupt, 'pending', null, null, null)
    broadcast()
    return park(interrupt.id)
  }

  insertInterrupt(interrupt, 'decided', 'ask', 'host', Date.now())
  broadcast()
  return Promise.resolve('ask')
}
