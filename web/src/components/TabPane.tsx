import { useLayoutEffect, type ReactNode } from 'react'
import type { AppTab } from './Header.tsx'

type StageProps = {
  tab: AppTab
  children: ReactNode
}

type TabPaneProps = {
  id: AppTab
  active: boolean
  children: ReactNode
}

export function Stage({ tab, children }: StageProps) {
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  return <div className="stage">{children}</div>
}

export function TabPane({ id, active, children }: TabPaneProps) {
  return (
    <div
      className={`stage-pane${active ? ' is-on' : ''}`}
      data-tab={id}
      aria-hidden={!active}
      inert={!active}
    >
      {children}
    </div>
  )
}
