import { useEffect, useState } from 'react'
import { fetchLogs, type LogRow } from '../api.ts'
import { commandOfLog, formatAgo, formatHost } from '../format.ts'
import { LogDetails } from './LogDetails.tsx'
import { Reveal } from './Reveal.tsx'

type LogsViewProps = {
  onUseInPolicy: (command: string) => void
  onToast: (text: string) => void
}

export function LogsView({ onUseInPolicy, onToast }: LogsViewProps) {
  const [q, setQ] = useState('')
  const [decidedBy, setDecidedBy] = useState('')
  const [action, setAction] = useState('')
  const [host, setHost] = useState('')
  const [rows, setRows] = useState<LogRow[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [expanded, setExpanded] = useState<string | null>(null)

  async function reload(next = { q, decidedBy, action, host }) {
    try {
      const data = await fetchLogs({
        q: next.q || undefined,
        decidedBy: next.decidedBy || undefined,
        action: next.action || undefined,
        host: next.host || undefined,
        limit: 100,
      })
      setRows(data)
      setNow(Date.now())
    } catch {
      onToast('Log query failed')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  return (
    <div className="pane">
      <form
        className="log-filters"
        onSubmit={(e) => {
          e.preventDefault()
          void reload()
        }}
      >
        <input
          className="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, command, args"
          aria-label="Search logs"
        />
        <select value={decidedBy} onChange={(e) => setDecidedBy(e.target.value)} aria-label="decidedBy">
          <option value="">any decidedBy</option>
          {['blacklist', 'policy', 'rule', 'web', 'host', 'timeout', 'orphan'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="action">
          <option value="">any action</option>
          <option value="allow">allow</option>
          <option value="deny">deny</option>
          <option value="ask">ask</option>
        </select>
        <select value={host} onChange={(e) => setHost(e.target.value)} aria-label="host">
          <option value="">any host</option>
          <option value="cursor">cursor</option>
          <option value="claude-code">claude-code</option>
          <option value="mcp">mcp</option>
        </select>
        <button className="btn header-btn" type="submit">
          Query
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="empty-count">No log rows match.</p>
      ) : (
        <div className="list">
          {rows.map((row) => {
            const command = commandOfLog(row)
            const open = expanded === row.id
            return (
              <article
                key={row.id}
                className={`row${row.destructive ? ' destructive' : ''}${open ? ' selected' : ''}`}
              >
                <div className="row-top">
                  <span className="title clip">{row.title || command}</span>
                  <span className="chip kind">{formatHost(row.host)}</span>
                  {row.decision ? <span className="chip kind">{row.decision}</span> : null}
                  {row.destructive ? <span className="chip">DESTRUCTIVE</span> : null}
                </div>
                <div className="meta">
                  {row.repo || 'repo'} · {row.tool || 'tool'} · {row.decidedBy ?? '—'} · {formatAgo(row.ts, now)}
                </div>
                {command ? (
                  <div className="cmd-fold static">
                    <pre className="cmd-text">{command}</pre>
                  </div>
                ) : null}
                <div className="actions">
                  <button className="btn" type="button" onClick={() => onUseInPolicy(command)}>
                    Use in policy
                  </button>
                  <button
                    className={`btn${open ? ' on' : ''}`}
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : row.id)}
                  >
                    {open ? 'Hide details' : 'Details'}
                  </button>
                </div>
                <Reveal open={open}>
                  <LogDetails row={row} now={now} />
                </Reveal>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
