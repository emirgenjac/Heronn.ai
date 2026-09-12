import { isDestructiveCommand } from '../engine/classify.ts'
import { parseCommand } from '../engine/parse.ts'
import { longestPrefix, normalizeCmd } from './prefix.ts'
import { loadPolicies } from './store.ts'

function bannedBinsFromParsed(parsed: ReturnType<typeof parseCommand>, bins: string[]): boolean {
  const banned = new Set(bins.map((b) => b.toLowerCase()))
  for (const stage of parsed.stages) {
    if (banned.has(stage.bin.toLowerCase())) return true
    if (stage.bin === 'sudo' || stage.bin === 'doas') {
      const next = (stage.operands[0] ?? stage.subcommand).toLowerCase()
      if (next && banned.has(next)) return true
    }
  }
  return false
}

export function isPrefixBlacklisted(command: string): boolean {
  const policies = loadPolicies()
  return Boolean(longestPrefix(normalizeCmd(command), policies.blacklist.prefixes))
}

export function isBlacklisted(command: string, cwd: string, repo: string): boolean {
  const policies = loadPolicies()
  const cmd = normalizeCmd(command)
  if (longestPrefix(cmd, policies.blacklist.prefixes)) return true
  try {
    const parsed = parseCommand(cmd)
    if (bannedBinsFromParsed(parsed, policies.blacklist.bins)) return true
    return isDestructiveCommand(parsed, cwd, repo)
  } catch {
    return true
  }
}
