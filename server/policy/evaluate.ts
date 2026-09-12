import type { Action, Interrupt } from '../../shared/types.ts'
import { canonicalise } from '../engine/index.ts'
import { handleInterrupt } from '../pipeline.ts'
import { insertInterrupt } from '../snapshot.ts'
import { broadcast } from '../sse.ts'
import { isBlacklisted, isPrefixBlacklisted } from './blacklist.ts'
import { classifyCommand } from './classifyCmd.ts'
import { loadPolicies, lookupAllow } from './store.ts'

function persistAuto(interrupt: Interrupt, action: 'allow' | 'deny', by: string): void {
  setImmediate(() => {
    const row = interrupt.fingerprint
      ? interrupt
      : { ...interrupt, ...canonicalise(interrupt) }
    insertInterrupt(row, 'auto', action, by, Date.now())
    broadcast()
  })
}

export async function evaluateCommand(interrupt: Interrupt): Promise<Action> {
  const command = typeof interrupt.args.command === 'string' ? interrupt.args.command : ''

  if (command && isPrefixBlacklisted(command)) {
    persistAuto(interrupt, 'deny', 'blacklist')
    return 'deny'
  }

  const canon: Interrupt = { ...interrupt, ...canonicalise(interrupt) }

  if (command && isBlacklisted(command, canon.cwd, canon.repo)) {
    persistAuto(canon, 'deny', 'blacklist')
    return 'deny'
  }

  if (command) {
    const cls = classifyCommand(command, loadPolicies().classMap)
    if (lookupAllow(canon.repo, command, cls)) {
      persistAuto(canon, 'allow', 'policy')
      return 'allow'
    }
  }

  return handleInterrupt(canon)
}
