import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Action, Group } from '../../../shared/types.ts'
import type { QueueAgent } from '../api.ts'
import { formatAgo, formatHost } from '../format.ts'

type InterruptCardProps = {
  group: Group
  agents: QueueAgent[]
  repo?: string
  selected: boolean
  alwaysOn: boolean
  machineOn: boolean
  expanded: boolean
  now: number
  onSelect: () => void
  onToggleDetails: () => void
  onDecide: (action: Action) => void
  onToggleAlways: () => void
  onToggleMachine: () => void
}

function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`reveal${open ? ' open' : ''}`}>
      <div className="reveal-inner">{children}</div>
    </div>
  )
}

export function InterruptCard({
  group,
  agents,
  repo,
  selected,
  alwaysOn,
  machineOn,
  expanded,
  now,
  onSelect,
  onToggleDetails,
  onDecide,
  onToggleAlways,
  onToggleMachine,
}: InterruptCardProps) {
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdOverflows, setCmdOverflows] = useState(false)
  const foldRef = useRef<HTMLDivElement>(null)
  const cmdRef = useRef<HTMLPreElement>(null)
  const lead = agents[0]
  const hostLabel = lead ? formatHost(lead.host) : 'Agent'
  const repoLabel = lead?.repo || repo
  const uniqueSessions = new Set(agents.map((a) => a.sessionId)).size
  const canExpand = cmdOverflows || cmdOpen || group.detail.includes('\n')

  useLayoutEffect(() => {
    const fold = foldRef.current
    const pre = cmdRef.current
    if (!pre) return

    const measure = () => {
      if (cmdOpen) return
      const next = pre.scrollWidth > pre.clientWidth + 1 || group.detail.includes('\n')
      setCmdOverflows((prev) => (prev === next ? prev : next))
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(pre)
    if (fold) ro.observe(fold)
    const list = pre.closest('.list')
    if (list) ro.observe(list)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [cmdOpen, group.detail, now])

  return (
    <article
      className={`row${group.destructive ? ' destructive' : ''}${selected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <div className="row-top">
        <span className="title">{group.title}</span>
        {lead ? <span className="chip kind">{hostLabel}</span> : null}
        {group.destructive ? <span className="chip">DESTRUCTIVE</span> : null}
      </div>
      <div className="meta">
        {group.count} {group.count === 1 ? 'agent' : 'agents'}
        {repoLabel ? ` · ${repoLabel}` : ''}
        {lead ? ` · ${lead.tool}` : ''}
        {` · first seen ${formatAgo(group.oldestTs, now)}`}
      </div>

      <div
        ref={foldRef}
        className={`cmd-fold${cmdOpen ? ' open' : ''}${canExpand ? '' : ' static'}`}
      >
        {canExpand ? (
          <button
            className="cmd-caret"
            type="button"
            aria-expanded={cmdOpen}
            onClick={(e) => {
              e.stopPropagation()
              setCmdOpen((open) => !open)
            }}
          >
            {cmdOpen ? 'Collapse' : 'Expand'}
          </button>
        ) : null}
        <pre ref={cmdRef} className="cmd-text">
          {group.detail}
        </pre>
      </div>

      <div className="actions">
        <button className="btn allow" type="button" onClick={() => onDecide('allow')}>
          Allow all {group.count}
        </button>
        <button className="btn deny" type="button" onClick={() => onDecide('deny')}>
          Deny all
        </button>
        <button
          className={`btn${expanded ? ' on' : ''}`}
          type="button"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation()
            onToggleDetails()
          }}
        >
          {expanded ? 'Hide details' : 'Details'}
        </button>
        <label
          className={`check${group.destructive ? ' disabled' : ''}`}
          title={group.destructive ? 'destructive actions can never become a rule' : undefined}
        >
          <input
            type="checkbox"
            checked={alwaysOn && !group.destructive}
            disabled={group.destructive}
            onChange={onToggleAlways}
          />
          <span>this project</span>
        </label>
        <label
          className={`check${group.destructive ? ' disabled' : ''}`}
          title={group.destructive ? 'destructive actions can never become a rule' : undefined}
        >
          <input
            type="checkbox"
            checked={machineOn && !group.destructive}
            disabled={group.destructive}
            onChange={onToggleMachine}
          />
          <span>this PC</span>
        </label>
      </div>

      <Reveal open={expanded}>
        <div className="detail-panel">
          <dl className="kv">
            <div>
              <dt>Host</dt>
              <dd>{hostLabel}</dd>
            </div>
            <div>
              <dt>Repo</dt>
              <dd>{repoLabel || '—'}</dd>
            </div>
            <div>
              <dt>Working directory</dt>
              <dd className="mono">{lead?.cwd || '—'}</dd>
            </div>
            <div>
              <dt>Tool</dt>
              <dd>{lead?.tool || '—'}</dd>
            </div>
            <div>
              <dt>Sessions</dt>
              <dd>
                {uniqueSessions} {uniqueSessions === 1 ? 'session' : 'sessions'}
              </dd>
            </div>
            <div>
              <dt>Fingerprint</dt>
              <dd className="mono">{group.fingerprint}</dd>
            </div>
          </dl>
          <div className="agent-list-label">
            {agents.length > 0 ? 'Agents waiting on this command' : 'No agent records on this card'}
          </div>
          {agents.map((agent, index) => (
            <div key={agent.id} className="agent-row">
              <div className="agent-top">
                <span>
                  Agent {index + 1} · {formatHost(agent.host)}
                </span>
                <span>{formatAgo(agent.ts, now)}</span>
              </div>
              <div className="mono agent-meta">session {agent.sessionId}</div>
              <div className="mono agent-meta">cwd {agent.cwd}</div>
              <div className="mono agent-meta">id {agent.id}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </article>
  )
}
