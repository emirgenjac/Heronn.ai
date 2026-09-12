import type { Action, Group } from '../../../shared/types.ts'
import type { QueueAgent } from '../api.ts'
import { LIVE } from '../live.ts'
import { repoFor } from '../mock.ts'
import { InterruptCard } from './InterruptCard.tsx'

type QueueListProps = {
  groups: Group[]
  agents: Record<string, QueueAgent[]>
  selected: number
  expanded: string | null
  always: Set<string>
  machineAlways: Set<string>
  onSelect: (index: number) => void
  onToggleDetails: (fingerprint: string) => void
  onDecide: (group: Group, action: Action) => void
  onToggleAlways: (group: Group) => void
  onToggleMachine: (group: Group) => void
}

export function QueueList({
  groups,
  agents,
  selected,
  expanded,
  always,
  machineAlways,
  onSelect,
  onToggleDetails,
  onDecide,
  onToggleAlways,
  onToggleMachine,
}: QueueListProps) {
  const now = Date.now()
  return (
    <div className="list">
      {groups.map((group, index) => {
        const repo = LIVE ? undefined : repoFor(group.fingerprint)
        return (
          <InterruptCard
            key={group.fingerprint}
            group={group}
            agents={agents[group.fingerprint] ?? []}
            repo={repo}
            selected={index === Math.min(selected, groups.length - 1)}
            alwaysOn={always.has(group.fingerprint)}
            machineOn={machineAlways.has(group.fingerprint)}
            expanded={expanded === group.fingerprint}
            now={now}
            onSelect={() => onSelect(index)}
            onToggleDetails={() => onToggleDetails(group.fingerprint)}
            onDecide={(action) => onDecide(group, action)}
            onToggleAlways={() => onToggleAlways(group)}
            onToggleMachine={() => onToggleMachine(group)}
          />
        )
      })}
    </div>
  )
}
