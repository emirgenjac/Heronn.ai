import { formatAgo, formatClock, formatPct } from '../format.ts'
import type { Diag } from '../api.ts'
import type { Stats } from '../../../shared/types.ts'

export type StatusBarProps = {
  stats: Stats
  oldestLive: number
  autonomyShown: number
  flash: boolean
  diag: Diag | null
  live: boolean
}

export function StatusBar({ stats, oldestLive, autonomyShown, flash, diag, live }: StatusBarProps) {
  const blockedLabel = stats.blocked === 1 ? 'agent blocked' : 'agents blocked'
  const now = Date.now()
  const hooksLabel =
    live && diag?.lastCursorHookAt ? formatAgo(diag.lastCursorHookAt, now) : live ? 'never' : 'mock'

  return (
    <div className="header-stats">
      <span className={`pulse${stats.blocked === 0 ? ' off' : ''}`} aria-hidden="true" />
      <span className="nums">
        {stats.blocked} {blockedLabel}
      </span>
      <span className="header-muted">·</span>
      <span className="nums">longest {formatClock(oldestLive)}</span>
      <span className="header-muted">·</span>
      <span className="nums" title={diag?.lastCursorLog ?? undefined}>
        hooks {hooksLabel}
      </span>
      <span className="header-muted">·</span>
      <span className={`autonomy nums ${flash ? 'flash' : ''}`}>
        autonomy {formatPct(autonomyShown)}%
      </span>
      <span className="header-muted">·</span>
      <span className="nums">{stats.autoResolved} auto-resolved</span>
    </div>
  )
}
