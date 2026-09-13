import type { Group, Interrupt, Stats } from '../shared/types.ts'
import { db } from './db.ts'

export type InterruptRow = {
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
  state: string
  decision: string | null
  decidedBy: string | null
  decidedAt: number | null
}

export type LogQuery = {
  q?: string
  decidedBy?: string
  action?: string
  host?: string
  from?: number
  to?: number
  limit?: number
}

function commandOfRow(row: InterruptRow): string {
  try {
    const args = JSON.parse(row.args) as { command?: unknown }
    if (typeof args.command === 'string' && args.command.trim()) return args.command
  } catch {
    /* ignore */
  }
  return row.detail
}

export type QueueAgent = {
  id: string
  host: string
  sessionId: string
  cwd: string
  repo: string
  tool: string
  ts: number
  command: string
}

function agentsByFingerprint(rows: InterruptRow[]): Record<string, QueueAgent[]> {
  const map: Record<string, QueueAgent[]> = {}
  for (const row of rows) {
    const list = map[row.fingerprint] ?? (map[row.fingerprint] = [])
    list.push({
      id: row.id,
      host: row.host,
      sessionId: row.sessionId,
      cwd: row.cwd,
      repo: row.repo,
      tool: row.tool,
      ts: row.ts,
      command: commandOfRow(row),
    })
  }
  return map
}

function groupRows(rows: InterruptRow[]): Group[] {
  const grouped = new Map<string, Group>()
  for (const row of rows) {
    const existing = grouped.get(row.fingerprint)
    if (existing) {
      existing.count += 1
      existing.interruptIds.push(row.id)
      if (row.ts < existing.oldestTs) existing.oldestTs = row.ts
    } else {
      grouped.set(row.fingerprint, {
        fingerprint: row.fingerprint,
        title: row.title,
        detail: row.detail,
        destructive: row.destructive === 1,
        count: 1,
        interruptIds: [row.id],
        oldestTs: row.ts,
      })
    }
  }
  return [...grouped.values()]
}

const STATS_WINDOW_MS = 60 * 60 * 1000

export function getSnapshot(): { groups: Group[]; agents: Record<string, QueueAgent[]>; stats: Stats } {
  const pending = db
    .prepare(`SELECT * FROM interrupts WHERE state = 'pending' ORDER BY ts ASC`)
    .all() as InterruptRow[]

  const since = Date.now() - STATS_WINDOW_MS
  const autoResolved = (
    db.prepare(`SELECT COUNT(*) AS n FROM interrupts WHERE state = 'auto' AND ts > ?`).get(since) as { n: number }
  ).n
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM interrupts WHERE ts > ?`).get(since) as { n: number }).n
  const oldestTs = pending[0]?.ts
  const blocked = pending.length

  return {
    groups: groupRows(pending),
    agents: agentsByFingerprint(pending),
    stats: {
      blocked,
      oldestMs: oldestTs === undefined ? 0 : Date.now() - oldestTs,
      autoResolved,
      total,
      autonomy: autoResolved / Math.max(total, 1),
    },
  }
}

export function expireOrphanPending(): number {
  const info = db
    .prepare(
      `UPDATE interrupts SET state = 'decided', decision = 'ask', decidedBy = 'orphan', decidedAt = ?
       WHERE state = 'pending'`,
    )
    .run(Date.now())
  return info.changes
}

export function insertInterrupt(
  i: Interrupt,
  state: string,
  decision: string | null,
  decidedBy: string | null,
  decidedAt: number | null,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO interrupts (
      id, ts, host, sessionId, cwd, repo, tool, args, fingerprint, title, detail,
      destructive, state, decision, decidedBy, decidedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    i.id,
    i.ts,
    i.host,
    i.sessionId,
    i.cwd,
    i.repo,
    i.tool,
    JSON.stringify(i.args),
    i.fingerprint,
    i.title,
    i.detail,
    i.destructive ? 1 : 0,
    state,
    decision,
    decidedBy,
    decidedAt,
  )
}

export function bumpRuleHits(ruleId: string): void {
  db.prepare(`UPDATE rules SET hits = hits + 1 WHERE id = ?`).run(ruleId)
}

export function markDecided(ids: string[], action: string, by: string, at: number): void {
  const stmt = db.prepare(
    `UPDATE interrupts SET state = 'decided', decision = ?, decidedBy = ?, decidedAt = ? WHERE id = ?`,
  )
  const tx = db.transaction(() => {
    for (const id of ids) stmt.run(action, by, at, id)
  })
  tx()
}

export function loadInterruptsByIds(ids: string[]): InterruptRow[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  return db.prepare(`SELECT * FROM interrupts WHERE id IN (${placeholders})`).all(...ids) as InterruptRow[]
}

export function recordHostAllow(interrupt: Interrupt): void {
  const command = typeof interrupt.args.command === 'string' ? interrupt.args.command.trim() : interrupt.detail
  const since = Date.now() - 15 * 60 * 1000
  let row: InterruptRow | undefined
  if (interrupt.id) {
    row = db.prepare(`SELECT * FROM interrupts WHERE id = ?`).get(interrupt.id) as InterruptRow | undefined
  }
  if (!row && interrupt.fingerprint) {
    row = db
      .prepare(`SELECT * FROM interrupts WHERE fingerprint = ? AND ts > ? ORDER BY ts DESC LIMIT 1`)
      .get(interrupt.fingerprint, since) as InterruptRow | undefined
  }
  if (!row && command) {
    const like = `%${command.replace(/[%_]/g, '')}%`
    row = db
      .prepare(
        `SELECT * FROM interrupts
         WHERE ts > ? AND (detail = ? OR args LIKE ?)
         ORDER BY ts DESC LIMIT 1`,
      )
      .get(since, command, like) as InterruptRow | undefined
  }
  if (!row) {
    insertInterrupt(interrupt, 'decided', 'allow', 'host', Date.now())
    return
  }
  // Policy/rule/blacklist already decided this — do not duplicate as a Cursor allow.
  if (row.decidedBy && row.decidedBy !== 'host') return
  if (row.decision === 'allow') return
  markDecided([row.id], 'allow', 'host', Date.now())
}

export function latestInterruptForCommand(command: string): InterruptRow | null {
  const needle = command.trim()
  if (!needle) return null
  const like = `%${needle.replace(/[%_]/g, '')}%`
  const row = db
    .prepare(
      `SELECT * FROM interrupts
       WHERE detail = ? OR args LIKE ?
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(needle, like) as InterruptRow | undefined
  return row ?? null
}

export function queryLogs(query: LogQuery): InterruptRow[] {
  const clauses: string[] = []
  const params: Array<string | number> = []

  if (query.q?.trim()) {
    const like = `%${query.q.trim().replace(/[%_]/g, '')}%`
    clauses.push(`(title LIKE ? OR detail LIKE ? OR args LIKE ?)`)
    params.push(like, like, like)
  }
  if (query.decidedBy) {
    clauses.push(`decidedBy = ?`)
    params.push(query.decidedBy)
  }
  if (query.action) {
    clauses.push(`decision = ?`)
    params.push(query.action)
  }
  if (query.host) {
    clauses.push(`host = ?`)
    params.push(query.host)
  }
  if (typeof query.from === 'number' && Number.isFinite(query.from)) {
    clauses.push(`ts >= ?`)
    params.push(query.from)
  }
  if (typeof query.to === 'number' && Number.isFinite(query.to)) {
    clauses.push(`ts <= ?`)
    params.push(query.to)
  }

  const limit = Math.min(200, Math.max(1, query.limit ?? 100))
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  return db
    .prepare(`SELECT * FROM interrupts ${where} ORDER BY ts DESC LIMIT ?`)
    .all(...params, limit) as InterruptRow[]
}
