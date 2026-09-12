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

export type ProjectPolicy = {
  allowClasses: string[]
  allowPrefixes: string[]
  decisions: DecisionRecord[]
}

export type PoliciesFile = {
  blacklist: { prefixes: string[]; bins: string[] }
  classMap: Record<string, string>
  projects: Record<string, ProjectPolicy>
}

const PATH = join(import.meta.dirname, 'policies.json')

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

export function loadPolicies(): PoliciesFile {
  const raw = JSON.parse(readFileSync(PATH, 'utf8')) as Partial<PoliciesFile>
  return {
    blacklist: {
      prefixes: raw.blacklist?.prefixes ?? [],
      bins: raw.blacklist?.bins ?? [],
    },
    classMap: raw.classMap ?? {},
    projects: raw.projects ?? {},
  }
}

function savePolicies(policies: PoliciesFile): void {
  writeFileSync(PATH, `${JSON.stringify(policies, null, 2)}\n`)
}

function emptyProject(): ProjectPolicy {
  return { allowClasses: [], allowPrefixes: [], decisions: [] }
}

export function lookupAllow(repo: string, command: string, cls: CommandClass): boolean {
  const project = loadPolicies().projects[repo]
  if (!project) return false
  if (longestPrefix(command, project.allowPrefixes)) return true
  if (neverAutoAllow(cls)) return false
  return project.allowClasses.includes(cls)
}

export function recordAllow(repo: string, command: string, cls: CommandClass): void {
  enqueueWrite(() => {
    const policies = loadPolicies()
    const project = policies.projects[repo] ?? emptyProject()
    if (!neverAutoAllow(cls) && !project.allowClasses.includes(cls)) {
      project.allowClasses.push(cls)
    }
    const prefix = neverAutoAllow(cls) ? normalizeCmd(command) : stablePrefix(command)
    const exists = project.allowPrefixes.some((p) => normalizeCmd(p) === normalizeCmd(prefix))
    if (prefix && !exists) project.allowPrefixes.push(prefix)
    project.decisions.push({ command, class: cls, action: 'allow', ts: Date.now() })
    policies.projects[repo] = project
    savePolicies(policies)
  })
}
