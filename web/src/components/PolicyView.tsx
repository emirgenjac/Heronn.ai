import { useEffect, useMemo, useState } from 'react'
import { postPolicy, type LogRow, type PolicyDecision, type PolicyOp, type PolicySnapshot, type ScopedPolicy } from '../api.ts'
import {
  loadCursorAllows,
  loadLogs,
  loadPolicy,
  peekCursorAllows,
  peekPolicy,
  setCursorAllowsCache,
  setPolicyCache,
} from '../dataCache.ts'
import { commandOfLog, formatStamp, shortLabel } from '../format.ts'
import { LogDetails } from './LogDetails.tsx'
import { DetailBlock, Kv, Reveal, type KvItem } from './Reveal.tsx'
import { SkeletonRows } from './SkeletonRows.tsx'

type PolicyViewProps = {
  search: string
  onSearch: (value: string) => void
  onToast: (text: string) => void
}

type PolicyRow = {
  key: string
  kind: 'class' | 'prefix' | 'rule' | 'log'
  section: 'saved' | 'cursor' | 'search'
  title: string
  chip: string
  chipCursor?: boolean
  meta: string
  command?: string
  op: PolicyOp
  canAllow: boolean
  canDeny: boolean
  canForget: boolean
  destructive?: boolean
  fields: KvItem[]
  related?: PolicyDecision[]
  log?: LogRow
}

function matches(haystack: string, q: string): boolean {
  if (!q) return true
  return haystack.toLowerCase().includes(q.toLowerCase())
}

function reviewableCommand(command: string): boolean {
  return command.length > 0 && command.length <= 280 && !command.includes('\n')
}

function relatedForClass(policy: ScopedPolicy, cls: string): PolicyDecision[] {
  return policy.decisions.filter((d) => d.class === cls).slice(-8).reverse()
}

function relatedForPrefix(policy: ScopedPolicy, prefix: string): PolicyDecision[] {
  return policy.decisions
    .filter((d) => d.command === prefix || d.command.startsWith(`${prefix} `))
    .slice(-8)
    .reverse()
}

function logRow(log: LogRow, command: string, section: PolicyRow['section'], meta: string): PolicyRow {
  return {
    key: `${section}-${log.id}`,
    kind: 'log',
    section,
    title: log.title?.trim() || shortLabel(command),
    chip: section === 'cursor' ? 'CURSOR' : 'LOG',
    chipCursor: section === 'cursor',
    meta,
    command,
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
    destructive: log.destructive === 1,
    fields: [],
    log,
  }
}

export function PolicyView({ search, onSearch, onToast }: PolicyViewProps) {
  const [policy, setPolicy] = useState<PolicySnapshot | null>(() => peekPolicy())
  const [logs, setLogs] = useState<LogRow[]>([])
  const [cursorAllows, setCursorAllows] = useState<LogRow[]>(() => peekCursorAllows() ?? [])
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  async function reload() {
    const q = search.trim()
    const [nextPolicy, nextCursor, nextLogs] = await Promise.all([
      loadPolicy(),
      loadCursorAllows(),
      q ? loadLogs({ q, limit: 50 }) : Promise.resolve([]),
    ])
    setPolicyCache(nextPolicy)
    setCursorAllowsCache(nextCursor)
    setPolicy(nextPolicy)
    setCursorAllows(nextCursor)
    setLogs(nextLogs)
    setNow(Date.now())
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
        title: `Class ${cls}`,
        chip: 'CLASS',
        meta: 'this PC',
        op: { op: 'forget', scope: 'global', class: cls },
        canAllow: false,
        canDeny: false,
        canForget: true,
        fields: [
          { label: 'Kind', value: 'Class auto-allow' },
          { label: 'Scope', value: 'this PC' },
          { label: 'Repo', value: '—' },
          { label: 'Class', value: cls, mono: true },
        ],
        related: relatedForClass(policy.machine, cls),
      })
    }
    for (const prefix of policy.machine.allowPrefixes) {
      if (!matches(`${prefix} this PC prefix`, q)) continue
      next.push({
        key: `prefix-global-${prefix}`,
        kind: 'prefix',
        section: 'saved',
        title: shortLabel(prefix),
        chip: 'PREFIX',
        meta: 'this PC · prefix',
        command: prefix,
        op: { op: 'forget', scope: 'global', prefix },
        canAllow: false,
        canDeny: true,
        canForget: true,
        fields: [
          { label: 'Kind', value: 'Allowed prefix' },
          { label: 'Scope', value: 'this PC' },
          { label: 'Repo', value: '—' },
        ],
        related: relatedForPrefix(policy.machine, prefix),
      })
    }
    for (const [repo, project] of Object.entries(policy.projects)) {
      for (const cls of project.allowClasses) {
        if (!matches(`class ${cls} ${repo}`, q)) continue
        next.push({
          key: `class-${repo}-${cls}`,
          kind: 'class',
          section: 'saved',
          title: `Class ${cls}`,
          chip: 'CLASS',
          meta: `${repo} · this project`,
          op: { op: 'forget', scope: 'repo', repo, class: cls },
          canAllow: false,
          canDeny: false,
          canForget: true,
          fields: [
            { label: 'Kind', value: 'Class auto-allow' },
            { label: 'Scope', value: 'this project' },
            { label: 'Repo', value: repo },
            { label: 'Class', value: cls, mono: true },
          ],
          related: relatedForClass(project, cls),
        })
      }
      for (const prefix of project.allowPrefixes) {
        if (!matches(`${prefix} ${repo} prefix`, q)) continue
        next.push({
          key: `prefix-${repo}-${prefix}`,
          kind: 'prefix',
          section: 'saved',
          title: shortLabel(prefix),
          chip: 'PREFIX',
          meta: `${repo} · this project · prefix`,
          command: prefix,
          op: { op: 'forget', scope: 'repo', repo, prefix },
          canAllow: false,
          canDeny: true,
          canForget: true,
          fields: [
            { label: 'Kind', value: 'Allowed prefix' },
            { label: 'Scope', value: 'this project' },
            { label: 'Repo', value: repo },
          ],
          related: relatedForPrefix(project, prefix),
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
        title: `${rule.action} ${rule.fingerprint.slice(0, 12)}`,
        chip: 'RULE',
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
        fields: [
          { label: 'Kind', value: 'Fingerprint rule' },
          { label: 'Action', value: rule.action },
          { label: 'Scope', value: rule.scope === 'global' ? 'this PC' : 'this project' },
          { label: 'Repo', value: rule.repo || '—' },
          { label: 'Hits', value: String(rule.hits) },
          { label: 'Created', value: formatStamp(rule.createdAt, now) },
          { label: 'Rule ID', value: rule.id, mono: true },
          { label: 'Fingerprint', value: rule.fingerprint, mono: true },
        ],
      })
    }

    const encoded = new Set(next.map((row) => row.command ?? row.title))
    const seenCommands = new Set(encoded)
    for (const log of cursorAllows) {
      const command = commandOfLog(log)
      if (!reviewableCommand(command) || seenCommands.has(command)) continue
      if (!matches(`${command} ${log.repo} ${log.title}`, q)) continue
      seenCommands.add(command)
      next.push(logRow(log, command, 'cursor', `${log.repo || 'repo'} · allowed in Cursor`))
    }
    for (const log of logs) {
      const command = commandOfLog(log)
      if (!command || seenCommands.has(command)) continue
      if (!matches(`${command} ${log.repo} ${log.title}`, q)) continue
      seenCommands.add(command)
      next.push(
        logRow(log, command, 'search', `${log.repo || 'repo'} · ${log.decidedBy ?? log.state} · from logs`),
      )
    }
    return next
  }, [policy, logs, cursorAllows, search, now])

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
        <SkeletonRows />
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
                {slice.map((row) => {
                  const open = expanded === row.key
                  return (
                    <article
                      key={row.key}
                      className={`row${row.destructive ? ' destructive' : ''}${open ? ' selected' : ''}`}
                    >
                      <div className="row-top">
                        <span className="title clip">{row.title}</span>
                        <span className={`chip kind${row.chipCursor ? ' cursor' : ''}`}>{row.chip}</span>
                        {row.destructive ? <span className="chip">DESTRUCTIVE</span> : null}
                      </div>
                      <div className="meta">{row.meta}</div>
                      {row.command ? (
                        <div className="cmd-fold static">
                          <pre className="cmd-text">{row.command}</pre>
                        </div>
                      ) : null}
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
                                  command: row.op.command ?? row.command,
                                  prefix: row.kind === 'prefix' ? row.command : row.op.prefix,
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
                        <button
                          className={`btn${open ? ' on' : ''}`}
                          type="button"
                          aria-expanded={open}
                          onClick={() => setExpanded(open ? null : row.key)}
                        >
                          {open ? 'Hide details' : 'Details'}
                        </button>
                      </div>
                      <Reveal open={open}>
                        {row.log ? (
                          <LogDetails row={row.log} now={now} />
                        ) : (
                          <div className="detail-panel">
                            <Kv items={row.fields} />
                            {row.command ? (
                              <DetailBlock label="Command">
                                <pre className="detail-pre">{row.command}</pre>
                              </DetailBlock>
                            ) : null}
                            {row.related && row.related.length > 0 ? (
                              <>
                                <div className="agent-list-label">Recent matching decisions</div>
                                {row.related.map((decision, index) => (
                                  <div key={`${decision.ts}-${index}`} className="agent-row">
                                    <div className="agent-top">
                                      <span>
                                        {decision.action} · {decision.class}
                                      </span>
                                      <span>{formatStamp(decision.ts, now)}</span>
                                    </div>
                                    <div className="mono agent-meta">{decision.command}</div>
                                  </div>
                                ))}
                              </>
                            ) : null}
                          </div>
                        )}
                      </Reveal>
                    </article>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
