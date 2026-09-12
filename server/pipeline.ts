import type { Action, Interrupt } from '../shared/types.ts'
import { canonicalise, match } from './engineStub.ts'
import { bumpRuleHits, insertInterrupt } from './snapshot.ts'
import { broadcast } from './sse.ts'
import { park } from './waiters.ts'

export function handleInterrupt(i: Interrupt): Promise<Action> {
  const canon = canonicalise(i)
  const interrupt: Interrupt = { ...i, ...canon }
  const rule = match(interrupt.fingerprint, interrupt.repo)

  if (rule) {
    queueMicrotask(() => {
      insertInterrupt(interrupt, 'auto', rule.action, 'rule', Date.now())
      bumpRuleHits(rule.id)
      broadcast()
    })
    return Promise.resolve(rule.action)
  }

  insertInterrupt(interrupt, 'pending', null, null, null)
  broadcast()
  return park(interrupt.id)
}
