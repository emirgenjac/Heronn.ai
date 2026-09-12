import type { Decision, Group, Interrupt, Stats } from '../../shared/types.ts'
import jsonl from '../../fixtures/interrupts.jsonl?raw'

export type Snapshot = { groups: Group[]; agents?: Record<string, never>; stats: Stats }
export type DisplayGroup = Group & { repo?: string }

type Listener = (snap: Snapshot) => void

type Store = {
  groups: DisplayGroup[]
  autoResolved: number
  total: number
  listeners: Set<Listener>
  timer: ReturnType<typeof setInterval> | null
  repos: Map<string, string>
}

function bucket(i: Interrupt): string {
  const cmd = String(i.args.command ?? '')
  if (i.tool === 'Write' && i.destructive) return 'write-out'
  if (i.tool === 'Write') return 'write-in'
  if (cmd.includes('install') || /\badd\b/.test(cmd)) return 'install'
  if (cmd.includes('test') || cmd.includes('vitest')) return 'test'
  if (cmd.startsWith('mkdir')) return 'mkdir'
  if (cmd.includes('git commit')) return 'commit'
  if (cmd.includes('git push')) return 'push'
  if (cmd.startsWith('curl')) return 'curl'
  return i.id
}

const TITLES: Record<string, string> = {
  install: 'Install a package not in the lockfile',
  test: 'Run tests',
  'write-in': 'Write a file in the repo',
  mkdir: 'Create a directory',
  commit: 'Create a git commit',
  push: 'Force-push to remote',
  'write-out': 'Write a file outside the repo',
  curl: 'Fetch a URL',
}

function commandOf(i: Interrupt): string {
  if (typeof i.args.command === 'string') return i.args.command
  if (typeof i.args.path === 'string') return i.args.path
  return i.detail
}

function parseFixtures(): Interrupt[] {
  return jsonl
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Interrupt)
}

function buildGroups(items: Interrupt[], now: number): DisplayGroup[] {
  const buckets = new Map<string, Interrupt[]>()
  for (const i of items) {
    const key = bucket(i)
    const list = buckets.get(key)
    if (list) list.push(i)
    else buckets.set(key, [i])
  }

  const keys = [...buckets.keys()]
  return keys.map((key, index) => {
    const list = buckets.get(key)!
    const oldestOffset = (4 * 60 + 12) * 1000 - index * 18_000
    const first = list[0]!
    return {
      fingerprint: key,
      title: TITLES[key] ?? first.title,
      detail: commandOf(first),
      destructive: list.some((x) => x.destructive),
      count: list.length,
      interruptIds: list.map((x) => x.id),
      oldestTs: now - Math.max(8_000, oldestOffset),
      repo: first.repo,
    }
  })
}

function statsFrom(groups: DisplayGroup[], autoResolved: number, total: number): Stats {
  const blocked = groups.reduce((n, g) => n + g.count, 0)
  const oldestTs = groups.reduce((min, g) => Math.min(min, g.oldestTs), Number.POSITIVE_INFINITY)
  return {
    blocked,
    oldestMs: groups.length === 0 ? 0 : Date.now() - oldestTs,
    autoResolved,
    total,
    autonomy: autoResolved / Math.max(total, 1),
  }
}

const g = globalThis as unknown as { __mockStore?: Store }

function createStore(): Store {
  const groups = buildGroups(parseFixtures(), Date.now())
  const autoResolved = 47
  return {
    groups,
    autoResolved,
    total: autoResolved + groups.reduce((n, gr) => n + gr.count, 0),
    listeners: new Set(),
    timer: null,
    repos: new Map(groups.map((gr) => [gr.fingerprint, gr.repo ?? ''])),
  }
}

function store(): Store {
  if (!g.__mockStore) g.__mockStore = createStore()
  return g.__mockStore
}

function snapshot(): Snapshot {
  const s = store()
  return {
    groups: s.groups.map(({ repo: _repo, ...gr }) => gr),
    agents: {},
    stats: statsFrom(s.groups, s.autoResolved, s.total),
  }
}

function emit(): void {
  const snap = snapshot()
  for (const fn of store().listeners) fn(snap)
}

export function subscribeMock(fn: Listener): () => void {
  const s = store()
  s.listeners.add(fn)
  fn(snapshot())
  if (!s.timer) s.timer = setInterval(emit, 2000)
  return () => {
    s.listeners.delete(fn)
    if (s.listeners.size === 0 && s.timer) {
      clearInterval(s.timer)
      s.timer = null
    }
  }
}

export function decideMock(body: Decision): void {
  const s = store()
  const ids = new Set(body.interruptIds)
  s.groups = s.groups.filter((gr) => !gr.interruptIds.some((id) => ids.has(id)))
  if (body.createRule) s.autoResolved += 1
  emit()
}

export function repoFor(fingerprint: string): string | undefined {
  const repo = store().repos.get(fingerprint)
  return repo || undefined
}
