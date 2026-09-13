import { useLayoutEffect, useRef, type ReactNode } from 'react'
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
  const stageRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const pane = stage.querySelector<HTMLElement>(`:scope > .stage-pane[data-tab="${tab}"]`)
    if (!pane) return

    const apply = () => {
      const header = document.querySelector('.header')
      const hint = document.querySelector('.hint-bar')
      const headerH = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0
      const hintH = hint instanceof HTMLElement ? hint.getBoundingClientRect().height : 0
      const fill = Math.max(0, window.innerHeight - headerH - hintH)
      stage.style.height = `${Math.max(fill, pane.scrollHeight)}px`
    }
    apply()
    window.scrollTo(0, 0)
    const ro = new ResizeObserver(apply)
    ro.observe(pane)
    const header = document.querySelector('.header')
    const hint = document.querySelector('.hint-bar')
    if (header) ro.observe(header)
    if (hint) ro.observe(hint)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [tab])

  return (
    <div ref={stageRef} className="stage">
      {children}
    </div>
  )
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
