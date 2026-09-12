import { isDestructiveCommand } from '../engine/classify.ts'
import { parseCommand } from '../engine/parse.ts'
import { longestPrefix, normalizeCmd } from './prefix.ts'
import { loadPolicies } from './store.ts'

function bannedBins(command: string, bins: string[]): boolean {
  const banned = new Set(bins.map((b) => b.toLowerCase()))
  const parsed = parseCommand(command)
  for (const stage of parsed.stages) {
    if (banned.has(stage.bin.toLowerCase())) return true
    if (stage.bin === 'sudo' || stage.bin === 'doas') {
      const next = (stage.operands[0] ?? stage.subcommand).toLowerCase()
      if (next && banned.has(next)) return true
    }
  }
  return false
}

export function isBlacklisted(command: string, cwd: string, repo: string): boolean {
  const policies = loadPolicies()
  const cmd = normalizeCmd(command)
  if (longestPrefix(cmd, policies.blacklist.prefixes)) return true
  if (bannedBins(cmd, policies.blacklist.bins)) return true
  try {
    return isDestructiveCommand(parseCommand(cmd), cwd, repo)
  } catch {
    return true
  }
}
