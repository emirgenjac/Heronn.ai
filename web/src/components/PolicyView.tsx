import { useEffect, useMemo, useState } from 'react'
import {
  fetchLogs,
  fetchPolicy,
  postPolicy,
  type LogRow,
  type PolicyOp,
  type PolicySnapshot,
} from '../api.ts'

type PolicyViewProps = {
  search: string
  onSearch: (value: string) => void
  onToast: (text: string) => void
}

type PolicyRow = {
  key: string
  kind: 'class' | 'prefix' | 'rule' | 'log'
  section: 'saved' | 'cursor' | 'search'
  label: string
  meta: string
  op: PolicyOp
  canAllow: boolean
  canDeny: boolean
  canForget: boolean
}

function commandOf(row: LogRow): string {
  try {
    const args = JSON.parse(row.args) as { command?: unknown }
    if (typeof args.command === 'string' && args.command.trim()) return args.command
  } catch {
    /* ignore */
  }
  return row.detail || row.title
}

function matches(haystack: string, q: string): boolean {
  if (!q) return true
  return haystack.toLowerCase().includes(q.toLowerCase())
}

function reviewableCommand(command: string): boolean {
  return command.length > 0 && command.length <= 280 && !command.includes('\n')
}

function logRow(log: LogRow, command: string, section: PolicyRow['section'], meta: string): PolicyRow {
  return {
    key: `${section}-${log.id}`,
    kind: 'log',
    section,
    label: command,
    meta,
    op: {
      op: 'allow',
      scope: 'repo',
      repo: log.repo,
      command,
      fingerprint: log.fingerprint,
    },
    canAllow: log.destructive !== 1,
    canDeny: true,
    canForget: false,
  }
}

export function PolicyView({ search, onSearch, onToast }: PolicyViewProps) {
  const [policy, setPolicy] = useState<PolicySnapshot | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [cursorAllows, setCursorAllows] = useState<LogRow[]>([])
  const [busy, setBusy] = useState(false)

  async function reload() {
    const q = search.trim()
    const [nextPolicy, nextCursor, nextLogs] = await Promise.all([
      fetchPolicy(),
      fetchLogs({
        decidedBy: 'host',
        action: 'allow',
        from: Date.now() - 30 * 60 * 1000,
        limit: 40,
      }),
      q ? fetchLogs({ q, limit: 50 }) : Promise.resolve([]),
    ])
    setPolicy(nextPolicy)
    setCursorAllows(nextCursor)
    setLogs(nextLogs)
  }

  useEffect(() => {
    void reload().catch(() => onToast('Policy load failed'))
  }, [search])

  const rows = useMemo(() => {
    if (!policy) return []
    const next: PolicyRow[] = []
    const q = search.trim()

    for (const cls of policy.machine.allowClasses) {
      if (!matches(`class ${cls} this PC`, q)) continue
      next.push({
        key: `class-global-${cls}`,
        kind: 'class',
        section: 'saved',
        label: `Class ${cls}`,
        meta: 'this PC',
        op: { op: 'forget', scope: 'global', class: cls },
        canAllow: false,
        canDeny: false,
        canForget: true,
      })
    }
    for (const prefix of policy.machine.allowPrefixes) {
      if (!matches(`${prefix} this PC prefix`, q)) continue
      next.push({
        key: `prefix-global-${prefix}`,
        kind: 'prefix',
        section: 'saved',
        label: prefix,
        meta: 'this PC · prefix',
        op: { op: 'forget', scope: 'global', prefix },
        canAllow: false,
        canDeny: true,
        canForget: true,
      })
    }
    for (const [repo, project] of Object.entries(policy.projects)) {
      for (const cls of project.allowClasses) {
        if (!matches(`class ${cls} ${repo}`, q)) continue
        next.push({
          key: `class-${repo}-${cls}`,
          kind: 'class',
          section: 'saved',
          label: `Class ${cls}`,
          meta: `${repo} · this project`,
          op: { op: 'forget', scope: 'repo', repo, class: cls },
          canAllow: false,
          canDeny: false,
          canForget: true,
        })
      }
      for (const prefix of project.allowPrefixes) {
        if (!matches(`${prefix} ${repo} prefix`, q)) continue
        next.push({
          key: `prefix-${repo}-${prefix}`,
          kind: 'prefix',
          section: 'saved',
          label: prefix,
          meta: `${repo} · this project · prefix`,
          op: { op: 'forget', scope: 'repo', repo, prefix },
          canAllow: false,
          canDeny: true,
          canForget: true,
        })
      }
    }
    for (const rule of policy.rules) {
      const scopeLabel = rule.scope === 'global' ? 'this PC · rule' : `${rule.repo ?? 'repo'} · rule`
      if (!matches(`${rule.fingerprint} ${rule.action} ${scopeLabel}`, q)) continue
      next.push({
        key: `rule-${rule.id}`,
        kind: 'rule',
        section: 'saved',
        label: `${rule.action} ${rule.fingerprint.slice(0, 12)}`,
        meta: `${scopeLabel} · ${rule.hits} hits`,
        op: {
          op: 'forget',
          scope: rule.scope,
          repo: rule.repo ?? undefined,
          ruleId: rule.id,
          fingerprint: rule.fingerprint,
        },
        canAllow: false,
        canDeny: rule.action !== 'deny',
        canForget: true,
      })
    }

    const encoded = new Set(next.map((row) => row.label))
    const seenCommands = new Set(encoded)
    for (const log of cursorAllows) {
      const command = commandOf(log)
      if (!reviewableCommand(command) || seenCommands.has(command)) continue
      if (!matches(`${command} ${log.repo} ${log.title}`, q)) continue
      seenCommands.add(command)
      next.push(logRow(log, command, 'cursor', `${log.repo || 'repo'} · allowed in Cursor`))
    }
    for (const log of logs) {
      const command = commandOf(log)
      if (!command || seenCommands.has(command)) continue
      if (!matches(`${command} ${log.repo} ${log.title}`, q)) continue
      seenCommands.add(command)
      next.push(logRow(log, command, 'search', `${log.repo || 'repo'} · ${log.decidedBy ?? log.state} · from logs`))
    }
    return next
  }, [policy, logs, cursorAllows, search])

  async function run(op: PolicyOp, toast: string) {
    setBusy(true)
    try {
      await postPolicy(op)
      await reload()
      onToast(toast)
    } catch {
      onToast('Policy update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pane">
      <input
        className="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search policy and commands that went through"
        aria-label="Search policy"
      />
      {policy === null ? (
        <p className="empty-count">Loading policy…</p>
      ) : rows.length === 0 ? (
        <p className="empty-count">No policy rows match.</p>
      ) : (
        <div className="list">
          {(['saved', 'cursor', 'search'] as const).map((section) => {
            const slice = rows.filter((row) => row.section === section)
            if (slice.length === 0) return null
            const heading =
              section === 'saved'
                ? { title: 'Saved policy', hint: 'Already auto-allowed or denied next time.' }
                : section === 'cursor'
                  ? {
                      title: 'Allowed in Cursor',
                      hint: 'Already ran. Allow here if heronn should auto-allow next time.',
                    }
                  : { title: 'From logs', hint: 'Matches your search.' }
            return (
              <div key={section}>
                <div className="section-label">
                  {heading.title}
                  <span>{heading.hint}</span>
                </div>
                {slice.map((row) => (
                  <article key={row.key} className="row">
                    <div className="row-top">
                      <span className="title">{row.label}</span>
                      <span className={`chip kind${row.section === 'cursor' ? ' cursor' : ''}`}>
                        {row.section === 'cursor' ? 'CURSOR' : row.kind}
                      </span>
                    </div>
                    <div className="meta">{row.meta}</div>
                    <div className="actions">
                      {row.canAllow ? (
                        <button
                          className="btn allow"
                          type="button"
                          disabled={busy}
                          onClick={() => run({ ...row.op, op: 'allow' }, 'Allowed for next time')}
                        >
                          Allow
                        </button>
                      ) : null}
                      {row.canDeny ? (
                        <button
                          className="btn deny"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(
                              {
                                ...row.op,
                                op: 'deny',
                                command: row.op.command ?? (row.kind === 'prefix' ? row.label : undefined),
                                prefix: row.kind === 'prefix' ? row.label : row.op.prefix,
                              },
                              'Denied for next time',
                            )
                          }
                        >
                          Deny
                        </button>
                      ) : null}
                      {row.canForget ? (
                        <button
                          className="btn"
                          type="button"
                          disabled={busy}
                          onClick={() => run({ ...row.op, op: 'forget' }, 'Forgotten from policy — log kept')}
                        >
                          Forget
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
