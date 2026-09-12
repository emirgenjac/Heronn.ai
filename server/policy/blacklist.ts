import { isDestructiveCommand } from '../engine/classify.ts'
import { parseCommand, type ParsedCommand } from '../engine/parse.ts'
import { matchesNormalizedPrefix, normalizeCmd } from './prefix.ts'
import { loadBlacklistIndex } from './store.ts'

function firstBin(cmd: string): string {
  const sp = cmd.indexOf(' ')
  const word = (sp === -1 ? cmd : cmd.slice(0, sp)).toLowerCase()
  const slash = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'))
  return slash === -1 ? word : word.slice(slash + 1)
}

function restAfterFirst(cmd: string): string {
  const sp = cmd.indexOf(' ')
  return sp === -1 ? '' : cmd.slice(sp + 1)
}

function hasToken(cmd: string, token: string): boolean {
  return cmd === token || cmd.startsWith(`${token} `) || cmd.endsWith(` ${token}`) || cmd.includes(` ${token} `)
}

function unwrapSudo(cmd: string): { bin: string; cmd: string } {
  const bin = firstBin(cmd)
  if (bin === 'sudo' || bin === 'doas') {
    const rest = restAfterFirst(cmd)
    return { bin: firstBin(rest), cmd: rest }
  }
  return { bin, cmd }
}

function isForceGitPush(cmd: string): boolean {
  const inner = unwrapSudo(cmd)
  if (inner.bin !== 'git') return false
  if (!hasToken(inner.cmd, 'push')) return false
  return hasToken(inner.cmd, '--force') || hasToken(inner.cmd, '-f')
}

function isHardGitReset(cmd: string): boolean {
  const inner = unwrapSudo(cmd)
  if (inner.bin !== 'git') return false
  if (!hasToken(inner.cmd, 'reset')) return false
  return hasToken(inner.cmd, '--hard')
}

function isRmRf(cmd: string, bin: string): boolean {
  if (bin !== 'rm') return false
  if (hasToken(cmd, '-rf') || hasToken(cmd, '-fr') || hasToken(cmd, '-Rf') || hasToken(cmd, '-fR')) return true
  const recursive = hasToken(cmd, '-r') || hasToken(cmd, '-R')
  return recursive && hasToken(cmd, '-f')
}

function isChmod777(cmd: string): boolean {
  if (!cmd.startsWith('chmod ') && cmd !== 'chmod') return false
  return hasToken(cmd, '777') || hasToken(cmd, '0777')
}

function bannedBinsFromParsed(parsed: ParsedCommand, bins: Set<string>): boolean {
  for (const stage of parsed.stages) {
    if (bins.has(stage.bin.toLowerCase())) return true
    if (stage.bin === 'sudo' || stage.bin === 'doas') {
      const next = (stage.operands[0] ?? stage.subcommand).toLowerCase()
      if (next && bins.has(next)) return true
    }
  }
  return false
}

export function isPrefixBlacklisted(command: string): boolean {
  const cmd = normalizeCmd(command)
<<<<<<< HEAD
  if (!cmd) return false
  const index = loadBlacklistIndex()
  for (const prefix of index.prefixes) {
    if (matchesNormalizedPrefix(cmd, prefix)) return true
  }
  const bin = firstBin(cmd)
  if (index.bins.has(bin)) return true
  const inner = bin === 'sudo' || bin === 'doas' ? firstBin(restAfterFirst(cmd)) : bin
  if ((bin === 'sudo' || bin === 'doas') && index.bins.has(inner)) return true
  if (isForceGitPush(cmd)) return true
  if (isHardGitReset(cmd)) return true
  if (isRmRf(cmd, inner)) return true
  if (isChmod777(cmd)) return true
  return false
}

export function isBlacklisted(command: string, cwd: string, repo: string): boolean {
  if (isPrefixBlacklisted(command)) return true
  try {
    const parsed = parseCommand(normalizeCmd(command))
    if (bannedBinsFromParsed(parsed, loadBlacklistIndex().bins)) return true
=======

  if (longestPrefix(cmd, policies.blacklist.prefixes)) return true

  let parsed
  try {
    parsed = parseCommand(cmd)
  } catch {

    return true
  }

  if (bannedBins(parsed.stages, getBannedSet(policies.blacklist.bins))) return true

  try {
>>>>>>> origin/main
    return isDestructiveCommand(parsed, cwd, repo)
  } catch {
    return true
  }
}