import { StatusBar, type StatusBarProps } from './StatusBar.tsx'

export type AppTab = 'queue' | 'policy' | 'logs'

type HeaderProps = StatusBarProps & {
  tab: AppTab
  onTab: (tab: AppTab) => void
  onUpgrade: () => void
}

export function Header({ tab, onTab, onUpgrade, ...status }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-bar">
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
        <StatusBar {...status} />
      </div>
    </header>
  )
}
