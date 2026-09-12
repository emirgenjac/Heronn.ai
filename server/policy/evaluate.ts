import type { Action, Interrupt } from '../../shared/types.ts'
import { canonicalise } from '../engine/index.ts'
import { handleInterrupt } from '../pipeline.ts'
import { insertInterrupt } from '../snapshot.ts'
import { broadcast } from '../sse.ts'
import { isBlacklisted } from './blacklist.ts'
import { classifyCommand } from './classifyCmd.ts'
import { loadPolicies, lookupAllow } from './store.ts'

export async function evaluateCommand(interrupt: Interrupt): Promise<Action> {
  const command = typeof interrupt.args.command === 'string' ? interrupt.args.command : ''
  const canon: Interrupt = { ...interrupt, ...canonicalise(interrupt) }

  if (command && isBlacklisted(command, canon.cwd, canon.repo)) {
    queueMicrotask(() => {
      insertInterrupt(canon, 'auto', 'deny', 'blacklist', Date.now())
      broadcast()
    })
    return 'deny'
  }

  if (command) {
    const cls = classifyCommand(command, loadPolicies().classMap)
    if (lookupAllow(canon.repo, command, cls)) {
      queueMicrotask(() => {
        insertInterrupt(canon, 'auto', 'allow', 'policy', Date.now())
        broadcast()
      })
      return 'allow'
    }
  }

  return handleInterrupt(interrupt)
}
