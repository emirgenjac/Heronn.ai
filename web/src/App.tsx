import { useEffect, useState } from 'react'
import { LIVE } from './live.ts'
import { preloadDashboard } from './dataCache.ts'
import { useQueue } from './useQueue.ts'
import { Header, type AppTab } from './components/Header.tsx'
import { EmptyState } from './components/EmptyState.tsx'
import { QueueList } from './components/QueueList.tsx'
import { UpgradeModal } from './components/UpgradeModal.tsx'
import { HintBar } from './components/HintBar.tsx'
import { Toasts } from './components/Toasts.tsx'
import { PolicyView } from './components/PolicyView.tsx'
import { LogsView } from './components/LogsView.tsx'
import { Stage, TabPane } from './components/TabPane.tsx'

export function App() {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [tab, setTab] = useState<AppTab>('queue')
  const [policySearch, setPolicySearch] = useState('')
  const queue = useQueue(upgradeOpen || tab !== 'queue')

  useEffect(() => {
    preloadDashboard()
  }, [])

  function onTab(next: AppTab) {
    setTab(next)
  }

  return (
    <div className="app">
      <Header
        tab={tab}
        onTab={onTab}
        onUpgrade={() => setUpgradeOpen(true)}
        stats={queue.stats}
        oldestLive={queue.oldestLive}
        autonomyShown={queue.autonomyShown}
        flash={queue.flash}
        diag={queue.diag}
        live={LIVE}
      />

      <Stage tab={tab}>
        <TabPane id="queue" active={tab === 'queue'}>
          {queue.groups.length === 0 ? (
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
          )}
        </TabPane>

        <TabPane id="policy" active={tab === 'policy'}>
          <PolicyView search={policySearch} onSearch={setPolicySearch} onToast={queue.showToast} />
        </TabPane>

        <TabPane id="logs" active={tab === 'logs'}>
          <LogsView
            onToast={queue.showToast}
            onUseInPolicy={(command) => {
              setPolicySearch(command)
              onTab('policy')
            }}
          />
        </TabPane>
      </Stage>

      <HintBar live={LIVE} />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} onToast={queue.showToast} />
      <Toasts toasts={queue.toasts} />
    </div>
  )
}
