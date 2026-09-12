import type { Diag } from '../api.ts'

type EmptyStateProps = {
  autoResolved: number
  live: boolean
  diag: Diag | null
}

export function EmptyState({ autoResolved, live, diag }: EmptyStateProps) {
  return (
    <div className="empty">
      <h1>Nothing needs you.</h1>
      <p className="empty-count">{autoResolved} decisions auto-resolved in the last hour.</p>
      {live && diag && diag.cursorHookHits === 0 ? (
        <p className="empty-count">
          No Cursor hooks have hit this daemon. Open this repo in Cursor (not VS Code) and ask the Agent to run a
          shell command.
        </p>
      ) : null}
    </div>
  )
}
