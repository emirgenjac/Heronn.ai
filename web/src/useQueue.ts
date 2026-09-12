import { useCallback, useEffect, useRef, useState } from 'react'
import type { Action, Group, Stats } from '../../shared/types.ts'
import { decide, subscribe, subscribeDiag, type Diag, type QueueAgent } from './api.ts'

export type Toast = { id: number; text: string }

function applyDismissed(groups: Group[], dismissed: Set<string>): Group[] {
  const seen = new Set<string>()
  const next: Group[] = []
  for (const group of groups) {
    for (const id of group.interruptIds) seen.add(id)
    const interruptIds = group.interruptIds.filter((id) => !dismissed.has(id))
    if (interruptIds.length === 0) continue
    next.push({ ...group, interruptIds, count: interruptIds.length })
  }
  for (const id of [...dismissed]) {
    if (!seen.has(id)) dismissed.delete(id)
  }
  return next
}

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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function useQueue(keysPaused: boolean) {
  const [groups, setGroups] = useState<Group[]>([])
  const [agents, setAgents] = useState<Record<string, QueueAgent[]>>({})
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
  const [machineAlways, setMachineAlways] = useState<Set<string>>(() => new Set())
  const [toasts, setToasts] = useState<Toast[]>([])
  const [flash, setFlash] = useState(false)
  const [diag, setDiag] = useState<Diag | null>(null)
  const prevAutonomy = useRef(stats.autonomy)
  const groupsRef = useRef(groups)
  const selectedRef = useRef(selected)
  const alwaysRef = useRef(always)
  const machineRef = useRef(machineAlways)
  const dismissedRef = useRef(new Set<string>())
  const keysPausedRef = useRef(keysPaused)
  const onDecideRef = useRef<(group: Group, action: Action) => void>(() => {})
  const toggleAlwaysRef = useRef<(group: Group) => void>(() => {})
  const toggleMachineRef = useRef<(group: Group) => void>(() => {})
  groupsRef.current = groups
  selectedRef.current = selected
  alwaysRef.current = always
  machineRef.current = machineAlways
  keysPausedRef.current = keysPaused

  useEffect(() => {
    return subscribe((snap) => {
      const next = applyDismissed(snap.groups, dismissedRef.current)
      const blocked = next.reduce((n, g) => n + g.count, 0)
      setGroups(next)
      setAgents(snap.agents ?? {})
      setStats({
        ...snap.stats,
        blocked,
        oldestMs: blocked === 0 ? 0 : snap.stats.oldestMs,
      })
      setReceivedAt(Date.now())
    })
  }, [])

  useEffect(() => {
    return subscribeDiag(setDiag)
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

  const showToast = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text }])
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 4000)
  }, [])

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

  const onDecide = useCallback(
    (group: Group, action: Action) => {
      const onPc = machineRef.current.has(group.fingerprint)
      const onRepo = alwaysRef.current.has(group.fingerprint)
      const createRule = action === 'allow' && (onPc || onRepo) && !group.destructive
      for (const id of group.interruptIds) dismissedRef.current.add(id)
      applyLocal(group.fingerprint, group.count, createRule)
      if (createRule) {
        showToast(onPc ? 'Rule created — this PC (all repos)' : 'Rule created — this project')
      }
      void decide({
        interruptIds: group.interruptIds,
        action,
        createRule,
        scope: onPc ? 'global' : 'repo',
        by: 'web',
      }).catch(() => {
        for (const id of group.interruptIds) dismissedRef.current.delete(id)
        setGroups((gs) => {
          if (gs.some((g) => g.fingerprint === group.fingerprint)) return gs
          return [...gs, group]
        })
        setStats((s) => ({
          ...s,
          blocked: s.blocked + group.count,
        }))
        showToast('Decide failed — card restored')
      })
    },
    [showToast],
  )

  const toggleAlways = useCallback((group: Group) => {
    if (group.destructive) return
    const next = new Set(alwaysRef.current)
    if (next.has(group.fingerprint)) next.delete(group.fingerprint)
    else {
      next.add(group.fingerprint)
      const machines = new Set(machineRef.current)
      machines.delete(group.fingerprint)
      machineRef.current = machines
      setMachineAlways(machines)
    }
    alwaysRef.current = next
    setAlways(next)
  }, [])

  const toggleMachine = useCallback((group: Group) => {
    if (group.destructive) return
    const next = new Set(machineRef.current)
    if (next.has(group.fingerprint)) next.delete(group.fingerprint)
    else {
      next.add(group.fingerprint)
      const repos = new Set(alwaysRef.current)
      repos.delete(group.fingerprint)
      alwaysRef.current = repos
      setAlways(repos)
    }
    machineRef.current = next
    setMachineAlways(next)
  }, [])

  onDecideRef.current = onDecide
  toggleAlwaysRef.current = toggleAlways
  toggleMachineRef.current = toggleMachine

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (keysPausedRef.current || isTypingTarget(e.target)) return
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
        onDecideRef.current(group, 'allow')
      } else if (e.key === 'd') {
        e.preventDefault()
        onDecideRef.current(group, 'deny')
      } else if (e.key === 'r') {
        e.preventDefault()
        toggleAlwaysRef.current(group)
      } else if (e.key === 'g') {
        e.preventDefault()
        toggleMachineRef.current(group)
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

  return {
    groups,
    agents,
    stats,
    selected,
    setSelected,
    expanded,
    setExpanded,
    always,
    machineAlways,
    toasts,
    flash,
    diag,
    oldestLive,
    autonomyShown,
    showToast,
    onDecide,
    toggleAlways,
    toggleMachine,
  }
}
