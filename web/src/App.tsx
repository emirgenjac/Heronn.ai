import { useState } from 'react'
import { LIVE } from './live.ts'
import { useQueue } from './useQueue.ts'
import { Header, type AppTab } from './components/Header.tsx'
import { EmptyState } from './components/EmptyState.tsx'
import { QueueList } from './components/QueueList.tsx'
import { UpgradeModal } from './components/UpgradeModal.tsx'
import { Toasts } from './components/Toasts.tsx'
import { PolicyView } from './components/PolicyView.tsx'
import { LogsView } from './components/LogsView.tsx'

export function App() {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [tab, setTab] = useState<AppTab>('queue')
  const [policySearch, setPolicySearch] = useState('')
  const queue = useQueue(upgradeOpen || tab !== 'queue')

  return (
    <div className="app">
      <Header
        stats={queue.stats}
        oldestLive={queue.oldestLive}
        autonomyShown={queue.autonomyShown}
        flash={queue.flash}
        diag={queue.diag}
        live={LIVE}
        tab={tab}
        onTab={setTab}
        onUpgrade={() => setUpgradeOpen(true)}
      />

      {tab === 'queue' ? (
        queue.groups.length === 0 ? (
          <EmptyState autoResolved={queue.stats.autoResolved} live={LIVE} diag={queue.diag} />
        ) : (
          <QueueList
            groups={queue.groups}
            agents={queue.agents}
            selected={queue.selected}
            expanded={queue.expanded}
            always={queue.always}
            machineAlways={queue.machineAlways}
            onSelect={queue.setSelected}
            onToggleDetails={(fingerprint) => {
              queue.setExpanded((cur) => (cur === fingerprint ? null : fingerprint))
            }}
            onDecide={queue.onDecide}
            onToggleAlways={queue.toggleAlways}
            onToggleMachine={queue.toggleMachine}
          />
        )
      ) : null}

      {tab === 'policy' ? (
        <PolicyView search={policySearch} onSearch={setPolicySearch} onToast={queue.showToast} />
      ) : null}

      {tab === 'logs' ? (
        <LogsView
          onToast={queue.showToast}
          onUseInPolicy={(command) => {
            setPolicySearch(command)
            setTab('policy')
          }}
        />
      ) : null}

      {tab === 'queue' ? (
        <div className="hint">
          j/k select · a allow · d deny · r this project · g this PC · enter details
          {LIVE ? ' · LIVE' : ' · MOCK'}
        </div>
      ) : tab === 'policy' ? (
        <div className="hint">{LIVE ? 'LIVE' : 'MOCK'} · Allow in Cursor is reviewed here</div>
      ) : (
        <div className="hint">{LIVE ? 'LIVE' : 'MOCK'} · logs are never deleted</div>
      )}

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} onToast={queue.showToast} />
      <Toasts toasts={queue.toasts} />
    </div>
  )
}
