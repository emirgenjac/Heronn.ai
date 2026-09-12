import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { neverAutoAllow, stablePrefix, type CommandClass } from './classifyCmd.ts'
import { longestPrefix, normalizeCmd } from './prefix.ts'

export type DecisionRecord = {
  command: string
  class: string
  action: string
  ts: number
}

export type ScopedPolicy = {
  allowClasses: string[]
  allowPrefixes: string[]
  decisions: DecisionRecord[]
}

export type ProjectPolicy = ScopedPolicy

export type PoliciesFile = {
  blacklist: { prefixes: string[]; bins: string[] }
  classMap: Record<string, string>
  machine: ScopedPolicy
  projects: Record<string, ProjectPolicy>
}

export type BlacklistIndex = {
  prefixes: string[]
  bins: Set<string>
}

const PATH = join(import.meta.dirname, 'policies.json')

let cached: PoliciesFile | null = null
let cachedIndex: BlacklistIndex | null = null

const pending: Array<() => void> = []
let draining = false

function enqueueWrite(fn: () => void): void {
  pending.push(fn)
  if (draining) return
  draining = true
  try {
    while (pending.length > 0) pending.shift()!()
  } finally {
    draining = false
  }
}

function emptyPolicy(): ScopedPolicy {
  return { allowClasses: [], allowPrefixes: [], decisions: [] }
}

function readPolicies(): PoliciesFile {
  const raw = JSON.parse(readFileSync(PATH, 'utf8')) as Partial<PoliciesFile> & {
    machine?: Partial<ScopedPolicy>
  }
  return {
    blacklist: {
      prefixes: raw.blacklist?.prefixes ?? [],
      bins: raw.blacklist?.bins ?? [],
    },
    classMap: raw.classMap ?? {},
    machine: {
      allowClasses: raw.machine?.allowClasses ?? [],
      allowPrefixes: raw.machine?.allowPrefixes ?? [],
      decisions: raw.machine?.decisions ?? [],
    },
    projects: raw.projects ?? {},
  }
}

export function loadPolicies(): PoliciesFile {
  cached ??= readPolicies()
  return cached
}

export function loadBlacklistIndex(): BlacklistIndex {
  if (cachedIndex) return cachedIndex
  const { blacklist } = loadPolicies()
  cachedIndex = {
    prefixes: blacklist.prefixes.map(normalizeCmd).filter(Boolean).sort((a, b) => b.length - a.length),
    bins: new Set(blacklist.bins.map((b) => b.toLowerCase())),
  }
  return cachedIndex
}

function savePolicies(policies: PoliciesFile): void {
  cached = policies
  cachedIndex = null
  writeFileSync(PATH, `${JSON.stringify(policies, null, 2)}\n`)
}

function matches(policy: ScopedPolicy | undefined, command: string, cls: CommandClass): boolean {
  if (!policy) return false
  if (longestPrefix(command, policy.allowPrefixes)) return true
  if (neverAutoAllow(cls)) return false
  return policy.allowClasses.includes(cls)
}

export function lookupAllow(repo: string, command: string, cls: CommandClass): boolean {
  const policies = loadPolicies()
  if (matches(policies.machine, command, cls)) return true
  return matches(policies.projects[repo], command, cls)
}

function applyAllow(policy: ScopedPolicy, command: string, cls: CommandClass): void {
  if (!neverAutoAllow(cls) && !policy.allowClasses.includes(cls)) {
    policy.allowClasses.push(cls)
  }
  const prefix = neverAutoAllow(cls) ? normalizeCmd(command) : stablePrefix(command)
  const exists = policy.allowPrefixes.some((p) => normalizeCmd(p) === normalizeCmd(prefix))
  if (prefix && !exists) policy.allowPrefixes.push(prefix)
  policy.decisions.push({ command, class: cls, action: 'allow', ts: Date.now() })
}

export function recordAllow(
  repo: string,
  command: string,
  cls: CommandClass,
  scope: 'repo' | 'global' = 'repo',
): void {
  enqueueWrite(() => {
    const policies = loadPolicies()
    if (scope === 'global') {
      applyAllow(policies.machine, command, cls)
    } else {
      const project = policies.projects[repo] ?? emptyPolicy()
      applyAllow(project, command, cls)
      policies.projects[repo] = project
    }
    savePolicies(policies)
  })
}
