import { formatAgo, formatClock, formatPct } from '../format.ts'
import type { Diag } from '../api.ts'
import type { Stats } from '../../../shared/types.ts'

export type AppTab = 'queue' | 'policy' | 'logs'

type HeaderProps = {
  stats: Stats
  oldestLive: number
  autonomyShown: number
  flash: boolean
  diag: Diag | null
  live: boolean
  tab: AppTab
  onTab: (tab: AppTab) => void
  onUpgrade: () => void
}

export function Header({
  stats,
  oldestLive,
  autonomyShown,
  flash,
  diag,
  live,
  tab,
  onTab,
  onUpgrade,
}: HeaderProps) {
  const blockedLabel = stats.blocked === 1 ? 'agent blocked' : 'agents blocked'
  const now = Date.now()
  const hooksLabel =
    live && diag?.lastCursorHookAt ? formatAgo(diag.lastCursorHookAt, now) : live ? 'never' : 'mock'

  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-title-row">
          <a className="brand" href="/" aria-label="heronn">
            <span className="brand-logo-clip">
              <img src="/heronnLogo.png" alt="" />
            </span>
            <span className="brand-word-clip">
              <img src="/HeronnText.png" alt="" />
            </span>
          </a>
          <nav className="tabs" aria-label="Dashboard">
            <button className={`tab${tab === 'queue' ? ' on' : ''}`} type="button" onClick={() => onTab('queue')}>
              Queue
            </button>
            <button className={`tab${tab === 'policy' ? ' on' : ''}`} type="button" onClick={() => onTab('policy')}>
              Policy
            </button>
            <button className={`tab${tab === 'logs' ? ' on' : ''}`} type="button" onClick={() => onTab('logs')}>
              Logs
            </button>
          </nav>
          <div className="header-actions">
            <button className="upgrade-btn" type="button" onClick={onUpgrade}>
              Upgrade
            </button>
          </div>
        </div>
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
          <span className="header-muted header-stat-break">·</span>
          <span className={`autonomy nums ${flash ? 'flash' : ''}`}>
            autonomy {formatPct(autonomyShown)}%
          </span>
          <span className="header-muted">·</span>
          <span className="nums">{stats.autoResolved} auto-resolved</span>
        </div>
      </div>
    </header>
  )
}
