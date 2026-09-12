import type { Group, Interrupt, Stats } from '../shared/types.ts'
import { db } from './db.ts'

type InterruptRow = {
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
}

export function getSnapshot(): { groups: Group[]; stats: Stats } {
  const pending = db
    .prepare(`SELECT * FROM interrupts WHERE state = 'pending' ORDER BY ts ASC`)
    .all() as InterruptRow[]

  const grouped = new Map<string, Group>()
  for (const row of pending) {
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

  const autoResolved = (
    db.prepare(`SELECT COUNT(*) AS n FROM interrupts WHERE state = 'auto'`).get() as { n: number }
  ).n
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM interrupts`).get() as { n: number }).n
  const oldestTs = pending[0]?.ts
  const blocked = pending.length

  return {
    groups: [...grouped.values()],
    stats: {
      blocked,
      oldestMs: oldestTs === undefined ? 0 : Date.now() - oldestTs,
      autoResolved,
      total,
      autonomy: autoResolved / Math.max(total, 1),
    },
  }
}

export function insertInterrupt(i: Interrupt, state: string, decision: string | null, decidedBy: string | null, decidedAt: number | null): void {
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
