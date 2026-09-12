import { randomUUID } from 'node:crypto'
import type { Rule } from '../../shared/types.ts'
import { db } from '../db.ts'

const repoRules = new Map<string, Rule>()
const globalRules = new Map<string, Rule>()

function repoKey(fingerprint: string, repo: string): string {
  return `${fingerprint}|${repo}`
}

const globalKey = (fingerprint: string): string => `${fingerprint}|*`

function persistRule(rule: Rule): void {
  queueMicrotask(() => {
    db.prepare(
      `INSERT OR REPLACE INTO rules (id, fingerprint, scope, repo, action, hits, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(rule.id, rule.fingerprint, rule.scope, rule.repo, rule.action, rule.hits, rule.createdAt)
  })
}

function persistHits(rule: Rule): void {
  queueMicrotask(() => {
    db.prepare(`UPDATE rules SET hits = ? WHERE id = ?`).run(rule.hits, rule.id)
  })
}

export function loadRules(): void {
  repoRules.clear()
  globalRules.clear()
  const rows = db
    .prepare(`SELECT id, fingerprint, scope, repo, action, hits, createdAt FROM rules`)
    .all() as Rule[]
  for (const row of rows) {
    const rule: Rule = {
      id: row.id,
      fingerprint: row.fingerprint,
      scope: row.scope === 'global' ? 'global' : 'repo',
      repo: row.repo,
      action: row.action === 'deny' ? 'deny' : 'allow',
      hits: Number(row.hits) || 0,
      createdAt: Number(row.createdAt) || 0,
    }
    if (rule.scope === 'global') globalRules.set(globalKey(rule.fingerprint), rule)
    else if (rule.repo) repoRules.set(repoKey(rule.fingerprint, rule.repo), rule)
  }
}

export function listRules(): Rule[] {
  return [...repoRules.values(), ...globalRules.values()]
}

export function match(fingerprint: string, repo: string): Rule | null {
  const local = repoRules.get(repoKey(fingerprint, repo))
  if (local) {
    local.hits += 1
    persistHits(local)
    return local
  }
  const global = globalRules.get(globalKey(fingerprint))
  if (global) {
    global.hits += 1
    persistHits(global)
    return global
  }
  return null
}

export function addRule(
  fingerprint: string,
  repo: string | null,
  scope: 'repo' | 'global',
  action: 'allow' | 'deny',
): Rule {
  const rule: Rule = {
    id: randomUUID(),
    fingerprint,
    scope,
    repo: scope === 'global' ? null : repo,
    action,
    hits: 0,
    createdAt: Date.now(),
  }
  if (scope === 'global') globalRules.set(globalKey(fingerprint), rule)
  else if (repo) repoRules.set(repoKey(fingerprint, repo), rule)
  persistRule(rule)
  return rule
}

export function deleteRule(id: string): boolean {
  for (const [key, rule] of repoRules) {
    if (rule.id === id) {
      repoRules.delete(key)
      db.prepare(`DELETE FROM rules WHERE id = ?`).run(id)
      return true
    }
  }
  for (const [key, rule] of globalRules) {
    if (rule.id === id) {
      globalRules.delete(key)
      db.prepare(`DELETE FROM rules WHERE id = ?`).run(id)
      return true
    }
  }
  const info = db.prepare(`DELETE FROM rules WHERE id = ?`).run(id)
  return info.changes > 0
}
