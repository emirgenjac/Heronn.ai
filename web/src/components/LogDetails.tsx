import type { LogRow } from '../api.ts'
import { commandOfLog, formatHost, formatStamp, parseArgs } from '../format.ts'
import { DetailBlock, Kv } from './Reveal.tsx'

export function LogDetails({ row, now }: { row: LogRow; now: number }) {
  const command = commandOfLog(row)
  const args = parseArgs(row.args)
  const extraKeys = Object.keys(args).filter((key) => key !== 'command')
  const extra =
    extraKeys.length > 0
      ? JSON.stringify(
          Object.fromEntries(extraKeys.map((key) => [key, args[key]])),
          null,
          2,
        )
      : null

  return (
    <div className="detail-panel">
      <Kv
        items={[
          { label: 'Host', value: formatHost(row.host) },
          { label: 'Repo', value: row.repo || '—' },
          { label: 'Tool', value: row.tool || '—' },
          { label: 'Working directory', value: row.cwd || '—', mono: true },
          { label: 'Session', value: row.sessionId || '—', mono: true },
          { label: 'Fingerprint', value: row.fingerprint || '—', mono: true },
          { label: 'Decision', value: row.decision ?? '—' },
          { label: 'Decided by', value: row.decidedBy ?? '—' },
          { label: 'Seen', value: formatStamp(row.ts, now) },
          { label: 'Decided at', value: formatStamp(row.decidedAt, now) },
          { label: 'State', value: row.state || '—' },
          { label: 'Destructive', value: row.destructive === 1 ? 'yes' : 'no' },
          { label: 'ID', value: row.id, mono: true },
        ]}
      />
      {command ? (
        <DetailBlock label="Command">
          <pre className="detail-pre">{command}</pre>
        </DetailBlock>
      ) : null}
      {extra ? (
        <DetailBlock label="Other args">
          <pre className="detail-pre">{extra}</pre>
        </DetailBlock>
      ) : null}
    </div>
  )
}
