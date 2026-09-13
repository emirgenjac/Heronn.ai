import {
  fetchLogs,
  fetchPolicy,
  type LogQuery,
  type LogRow,
  type PolicySnapshot,
} from './api.ts'

let policyCache: PolicySnapshot | null = null
let logsCache: LogRow[] | null = null
let cursorCache: LogRow[] | null = null
let policyInflight: Promise<PolicySnapshot> | null = null

export function peekPolicy(): PolicySnapshot | null {
  return policyCache
}

export function peekLogs(): LogRow[] | null {
  return logsCache
}

export function peekCursorAllows(): LogRow[] | null {
  return cursorCache
}

export function setPolicyCache(data: PolicySnapshot): void {
  policyCache = data
}

export function setLogsCache(data: LogRow[]): void {
  logsCache = data
}

export function setCursorAllowsCache(data: LogRow[]): void {
  cursorCache = data
}

export async function loadPolicy(): Promise<PolicySnapshot> {
  if (policyInflight) return policyInflight
  policyInflight = fetchPolicy()
    .then((data) => {
      policyCache = data
      policyInflight = null
      return data
    })
    .catch((err) => {
      policyInflight = null
      throw err
    })
  return policyInflight
}

function isDefaultLogQuery(query: LogQuery): boolean {
  return !query.q && !query.decidedBy && !query.action && !query.host && !query.from
}

export async function loadLogs(query: LogQuery = {}): Promise<LogRow[]> {
  const data = await fetchLogs(query)
  if (isDefaultLogQuery(query)) logsCache = data
  return data
}

export async function loadCursorAllows(): Promise<LogRow[]> {
  const data = await fetchLogs({
    decidedBy: 'host',
    action: 'allow',
    from: Date.now() - 30 * 60 * 1000,
    limit: 40,
  })
  cursorCache = data
  return data
}

export function preloadDashboard(): void {
  void loadPolicy().catch(() => {})
  void loadLogs({ limit: 100 }).catch(() => {})
  void loadCursorAllows().catch(() => {})
}
