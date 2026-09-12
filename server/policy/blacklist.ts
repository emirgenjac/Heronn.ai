import { isDestructiveCommand } from '../engine/classify.ts'
import { parseCommand } from '../engine/parse.ts'
import { longestPrefix, normalizeCmd } from './prefix.ts'
import { loadPolicies } from '../policy/store.ts'

let cachedBinsRef: string[] | null = null
let cachedBinsSet: Set<string> = new Set()

function getBannedSet(bins: string[]): Set<string> {
  if (bins !== cachedBinsRef) {
    cachedBinsRef = bins
    cachedBinsSet = new Set(bins.map((b) => b.toLowerCase()))
  }
  return cachedBinsSet
}

function basename(bin: string): string {
  
  return bin.split('/').pop()?.toLowerCase() ?? bin.toLowerCase()
}

const PRIVILEGE_ESCALATORS = new Set(['sudo', 'doas', 'pkexec'])

function realTarget(stage: { bin: string; operands: string[]; subcommand?: string }): string {

  const bin = basename(stage.bin)
  if (!PRIVILEGE_ESCALATORS.has(bin)) return bin
  for (const op of stage.operands) {
    if (op.startsWith('-')) continue
    return basename(op)
  }
  return stage.subcommand ? basename(stage.subcommand) : bin
}

function bannedBins(parsedStages: Array<{ bin: string; operands: string[]; subcommand?: string }>, bannedSet: Set<string>): boolean {
  for (const stage of parsedStages) {
    if (bannedSet.has(basename(stage.bin))) return true
    if (bannedSet.has(realTarget(stage))) return true
  }
  return false
}

export function isBlacklisted(command: string, cwd: string, repo: string): boolean {
  const policies = loadPolicies()
  const cmd = normalizeCmd(command)

  if (longestPrefix(cmd, policies.blacklist.prefixes)) return true

  let parsed
  try {
    parsed = parseCommand(cmd)
  } catch {

    return true
  }

  if (bannedBins(parsed.stages, getBannedSet(policies.blacklist.bins))) return true

  try {
    return isDestructiveCommand(parsed, cwd, repo)
  } catch {
    return true
  }
}