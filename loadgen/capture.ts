import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Host, Interrupt } from '../shared/types.ts'
import { projectRoot } from './util.ts'

const jsonlPath = join(projectRoot(), 'fixtures', 'interrupts.jsonl')
const dbPath = join(projectRoot(), 'app.db')

function loadIds(): Set<string> {
  const ids = new Set<string>()
  if (!existsSync(jsonlPath)) return ids
  for (const line of readFileSync(jsonlPath, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line) as { id?: string }
      if (row.id) ids.add(row.id)
    } catch {
      /* skip bad line */
    }
  }
  return ids
}

function asInterrupt(row: {
  id: string
  ts: number
  host: string
  sessionId: string
  cwd: string
  repo: string
  tool: string
  args: string
  fingerprint: string
  title: string
  detail: string
  destructive: number
}): Interrupt {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(row.args) as Record<string, unknown>
  } catch {
    args = { raw: row.args }
  }
  const host = row.host as Host
  return {
    id: row.id,
    ts: row.ts,
    host: host === 'cursor' || host === 'mcp' || host === 'claude-code' ? host : 'claude-code',
    sessionId: row.sessionId,
    cwd: row.cwd,
    repo: row.repo,
    tool: row.tool,
    args,
    fingerprint: row.fingerprint ?? '',
    title: row.title,
    detail: row.detail,
    destructive: row.destructive === 1,
  }
}

const seen = loadIds()
console.log(`capture watching ${dbPath} (already have ${seen.size} ids)`)

function tick(): void {
  if (!existsSync(dbPath)) return
  let db
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true })
  } catch {
    return
  }
  try {
    const rows = db.prepare(`SELECT * FROM interrupts ORDER BY ts ASC`).all() as Parameters<
      typeof asInterrupt
    >[0][]
    for (const row of rows) {
      if (seen.has(row.id)) continue
      const interrupt = asInterrupt(row)
      writeFileSync(jsonlPath, `${JSON.stringify(interrupt)}\n`, { flag: 'a' })
      seen.add(row.id)
      console.log(`appended ${interrupt.id} ${interrupt.tool} ${interrupt.title}`)
    }
  } finally {
    db.close()
  }
}

setInterval(tick, 500)
tick()
