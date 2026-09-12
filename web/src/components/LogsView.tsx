import { useEffect, useState } from 'react'
import { fetchLogs, type LogRow } from '../api.ts'
import { formatAgo } from '../format.ts'

type LogsViewProps = {
  onUseInPolicy: (command: string) => void
  onToast: (text: string) => void
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

export function LogsView({ onUseInPolicy, onToast }: LogsViewProps) {
  const [q, setQ] = useState('')
  const [decidedBy, setDecidedBy] = useState('')
  const [action, setAction] = useState('')
  const [host, setHost] = useState('')
  const [rows, setRows] = useState<LogRow[]>([])
  const [now, setNow] = useState(() => Date.now())

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
            const command = commandOf(row)
            return (
              <article key={row.id} className={`row${row.destructive ? ' destructive' : ''}`}>
                <div className="row-top">
                  <span className="title">{row.title || command}</span>
                  <span className="chip kind">{row.decision ?? row.state}</span>
                </div>
                <div className="meta">
                  {row.host} · {row.repo || 'repo'} · {row.decidedBy ?? '—'} · {formatAgo(row.ts, now)}
                </div>
                <div className="cmd">{command}</div>
                <div className="actions">
                  <button className="btn" type="button" onClick={() => onUseInPolicy(command)}>
                    Use in policy
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
