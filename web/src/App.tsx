import { useEffect, useMemo, useRef, useState } from 'react'
import type { Action, Group, Stats } from '../../shared/types.ts'
import { decide, subscribe } from './api.ts'
import { formatAgo, formatClock, formatPct } from './format.ts'
import { LIVE } from './live.ts'
import { repoFor } from './mock.ts'
import './App.css'

type Toast = { id: number; text: string }

function useTickingOldest(oldestMs: number, receivedAt: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (oldestMs <= 0) return 0
  return oldestMs + (now - receivedAt)
}

function useAutonomyTween(target: number): number {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(shown)
  shownRef.current = shown
  useEffect(() => {
    const from = shownRef.current
    if (from === target) return
    const start = performance.now()
    const dur = 500
    let frame = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      setShown(from + (target - from) * p)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return shown
}

export function App() {
  const [groups, setGroups] = useState<Group[]>([])
  const [stats, setStats] = useState<Stats>({
    blocked: 0,
    oldestMs: 0,
    autoResolved: 0,
    total: 0,
    autonomy: 0,
  })
  const [receivedAt, setReceivedAt] = useState(Date.now())
  const [selected, setSelected] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [always, setAlways] = useState<Set<string>>(() => new Set())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [flash, setFlash] = useState(false)
  const prevAutonomy = useRef(stats.autonomy)
  const groupsRef = useRef(groups)
  const selectedRef = useRef(selected)
  const alwaysRef = useRef(always)
  groupsRef.current = groups
  selectedRef.current = selected
  alwaysRef.current = always

  useEffect(() => {
    return subscribe((snap) => {
      setGroups(snap.groups)
      setStats(snap.stats)
      setReceivedAt(Date.now())
    })
  }, [])

  useEffect(() => {
    if (prevAutonomy.current !== stats.autonomy) {
      prevAutonomy.current = stats.autonomy
      setFlash(true)
      const t = window.setTimeout(() => setFlash(false), 600)
      return () => window.clearTimeout(t)
    }
  }, [stats.autonomy])

  const oldestLive = useTickingOldest(stats.oldestMs, receivedAt)
  const autonomyShown = useAutonomyTween(stats.autonomy)

  const blockedLabel = stats.blocked === 1 ? 'agent blocked' : 'agents blocked'

  function showToast(text: string) {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text }])
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 4000)
  }

  function applyLocal(fingerprint: string, count: number, createRule: boolean) {
    setGroups((gs) => gs.filter((g) => g.fingerprint !== fingerprint))
    setStats((s) => {
      const blocked = Math.max(0, s.blocked - count)
      const autoResolved = s.autoResolved + (createRule ? 1 : 0)
      return {
        ...s,
        blocked,
        autoResolved,
        autonomy: autoResolved / Math.max(s.total, 1),
        oldestMs: blocked === 0 ? 0 : s.oldestMs,
      }
    })
    setSelected((i) => Math.max(0, Math.min(i, groupsRef.current.length - 2)))
  }

  function onDecide(group: Group, action: Action) {
    const createRule = action === 'allow' && alwaysRef.current.has(group.fingerprint) && !group.destructive
    void decide({
      interruptIds: group.interruptIds,
      action,
      createRule,
      scope: 'repo',
      by: 'web',
    })
    applyLocal(group.fingerprint, group.count, createRule)
    if (createRule) showToast('Rule created — future matches auto-approved')
  }

  function toggleAlways(group: Group) {
    if (group.destructive) return
    const next = new Set(alwaysRef.current)
    if (next.has(group.fingerprint)) next.delete(group.fingerprint)
    else next.add(group.fingerprint)
    alwaysRef.current = next
    setAlways(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const list = groupsRef.current
      if (list.length === 0) return
      const group = list[Math.min(selectedRef.current, list.length - 1)]
      if (!group) return
      if (e.key === 'j') {
        e.preventDefault()
        setSelected((i) => Math.min(list.length - 1, i + 1))
      } else if (e.key === 'k') {
        e.preventDefault()
        setSelected((i) => Math.max(0, i - 1))
      } else if (e.key === 'a') {
        e.preventDefault()
        onDecide(group, 'allow')
      } else if (e.key === 'd') {
        e.preventDefault()
        onDecide(group, 'deny')
      } else if (e.key === 'r') {
        e.preventDefault()
        toggleAlways(group)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setExpanded((cur) => (cur === group.fingerprint ? null : group.fingerprint))
      }
    }
    const bag = globalThis as unknown as { __interruptKeys?: (e: KeyboardEvent) => void }
    if (bag.__interruptKeys) window.removeEventListener('keydown', bag.__interruptKeys)
    bag.__interruptKeys = onKey
    window.addEventListener('keydown', onKey)
    return () => {
      if (bag.__interruptKeys === onKey) {
        window.removeEventListener('keydown', onKey)
        bag.__interruptKeys = undefined
      }
    }
  }, [])

  const now = useMemo(() => Date.now(), [oldestLive])

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className={`pulse${stats.blocked === 0 ? ' off' : ''}`} aria-hidden="true" />
          <span className="nums">
            {stats.blocked} {blockedLabel}
          </span>
          <span className="header-muted">·</span>
          <span className="nums">longest {formatClock(oldestLive)}</span>
        </div>
        <div className="header-right">
          <span className={`autonomy nums ${flash ? 'flash' : ''}`}>
            autonomy {formatPct(autonomyShown)}%
          </span>
          <span className="header-muted">·</span>
          <span className="nums">{stats.autoResolved} auto-resolved</span>
        </div>
      </header>

      {groups.length === 0 ? (
        <div className="empty">
          <h1>Nothing needs you.</h1>
          <p className="empty-count">{stats.autoResolved} decisions auto-resolved in the last hour.</p>
        </div>
      ) : (
        <div className="list">
          {groups.map((group, index) => {
            const repo = LIVE ? undefined : repoFor(group.fingerprint)
            const isSelected = index === Math.min(selected, groups.length - 1)
            const alwaysOn = always.has(group.fingerprint)
            return (
              <article
                key={group.fingerprint}
                className={`row${group.destructive ? ' destructive' : ''}${isSelected ? ' selected' : ''}`}
                onClick={() => setSelected(index)}
              >
                <div className="row-top">
                  <span className="title">{group.title}</span>
                  {group.destructive ? <span className="chip">DESTRUCTIVE</span> : null}
                </div>
                <div className="meta">
                  {group.count} {group.count === 1 ? 'agent' : 'agents'}
                  {repo ? ` · ${repo}` : ''}
                  {` · first seen ${formatAgo(group.oldestTs, now)}`}
                </div>
                <div className="cmd">{group.detail}</div>
                <div className="actions">
                  <button className="btn allow" type="button" onClick={() => onDecide(group, 'allow')}>
                    Allow all {group.count}
                  </button>
                  <button className="btn deny" type="button" onClick={() => onDecide(group, 'deny')}>
                    Deny all
                  </button>
                  <label
                    className={`check${group.destructive ? ' disabled' : ''}`}
                    title={group.destructive ? 'destructive actions can never become a rule' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={alwaysOn && !group.destructive}
                      disabled={group.destructive}
                      onChange={() => toggleAlways(group)}
                    />
                    <span>always allow this</span>
                  </label>
                </div>
                {expanded === group.fingerprint ? (
                  <div className="detail">
                    {group.count} queued · fingerprint {group.fingerprint}
                    {'\n'}
                    {group.detail}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}

      <div className="hint">j/k select · a allow · d deny · r always allow · enter detail{LIVE ? ' · LIVE' : ' · MOCK'}</div>

      {toasts.map((t) => (
        <div key={t.id} className="toast" role="status">
          {t.text}
        </div>
      ))}
    </div>
  )
}
