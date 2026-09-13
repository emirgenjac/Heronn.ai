/**
 * Live hook scenarios against the local daemon.
 *
 *   npm run test:issues
 *
 * Daemon must already be up: npm run dev
 * Parked cases are left in the UI at http://localhost:5173
 */

const BASE = 'http://127.0.0.1:7777'
const CWD = process.cwd()
const PARK_MS = 2000

const CASES = [
  {
    id: 'auto-npm',
    kind: 'auto',
    expect: 'allow',
    why: 'project class dependency / prefix npm install',
    host: 'cursor',
    command: 'npm install lodash',
  },
  {
    id: 'auto-pnpm',
    kind: 'auto',
    expect: 'allow',
    why: 'project class dependency (pnpm add)',
    host: 'cursor',
    command: 'pnpm add msw',
  },
  {
    id: 'deny-force',
    kind: 'deny',
    expect: 'deny',
    why: 'blacklist prefix git push --force — no card',
    host: 'cursor',
    command: 'git push --force origin main',
  },
  {
    id: 'deny-rm',
    kind: 'deny',
    expect: 'deny',
    why: 'blacklist prefix rm -rf / — no card',
    host: 'cursor',
    command: 'rm -rf /',
  },
  {
    id: 'deny-ssh',
    kind: 'deny',
    expect: 'deny',
    why: 'destructive path ~/.ssh — no card',
    host: 'cursor',
    command: 'cat ~/.ssh/id_rsa',
  },
  {
    id: 'deny-claude-force',
    kind: 'deny',
    expect: 'deny',
    why: 'Claude hook, same blacklist',
    host: 'claude',
    command: 'git push -f origin main',
  },
  {
    id: 'park-git-read',
    kind: 'park',
    expect: 'park',
    why: 'git-read is not class-auto-allowed (plain git status may already have an app.db fingerprint rule)',
    host: 'cursor',
    command: 'git rev-parse --is-inside-work-tree',
  },
  {
    id: 'park-unknown',
    kind: 'park',
    expect: 'park',
    why: 'unknown never class-auto-allows',
    host: 'cursor',
    command: 'python evil.py',
  },
  {
    id: 'park-write',
    kind: 'park',
    expect: 'park',
    why: 'Write has no command class allow',
    host: 'cursor',
    tool: 'Write',
    path: 'tmp-issue-write.txt',
  },
]

function ts() {
  return new Date().toISOString().slice(11, 23)
}

function line(msg) {
  console.log(`${ts()}  ${msg}`)
}

function cursorShell(command, toolUseId) {
  return {
    command,
    cwd: CWD,
    hook_event_name: 'beforeShellExecution',
    session_id: 'issues-script',
    tool_use_id: toolUseId,
  }
}

function cursorWrite(filePath, toolUseId) {
  return {
    hook_event_name: 'preToolUse',
    tool_name: 'Write',
    cwd: CWD,
    session_id: 'issues-script',
    tool_use_id: toolUseId,
    tool_input: { path: filePath, contents: 'issue-script' },
  }
}

function claudeShell(command, toolUseId) {
  return {
    session_id: 'issues-script',
    cwd: CWD,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    tool_use_id: toolUseId,
  }
}

function permissionOf(json) {
  if (!json || typeof json !== 'object') return ''
  if (typeof json.permission === 'string') return json.permission
  const nested = json.hookSpecificOutput?.permissionDecision
  return typeof nested === 'string' ? nested : ''
}

function labelOf(c) {
  return c.command ?? `${c.tool} ${c.path}`
}

async function getJson(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { ok: res.ok, status: res.status, json }
}

async function pendingById(id) {
  const { json } = await getJson(`${BASE}/api/groups`)
  const groups = json.groups ?? []
  for (const g of groups) {
    const ids = g.interruptIds ?? []
    if (ids.includes(id)) return g
  }
  return null
}

async function runCase(c, index, total) {
  const toolUseId = `issue-${c.id}-${Date.now()}-${index}`
  const path = c.host === 'claude' ? '/hook/claude-code' : '/hook/cursor'
  const body = c.tool === 'Write'
    ? cursorWrite(c.path, toolUseId)
    : c.host === 'claude'
      ? claudeShell(c.command, toolUseId)
      : cursorShell(c.command, toolUseId)

  line(`CASE ${index}/${total}  ${c.kind.toUpperCase().padEnd(4)}  ${labelOf(c)}`)
  line(`         expect=${c.expect}  why: ${c.why}`)
  line(`         POST ${path}  id=${toolUseId}`)

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), PARK_MS)
  const started = Date.now()

  let got = 'park'
  let detail = ''
  try {
    const { status, json } = await getJson(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    const perm = permissionOf(json)
    got = perm || `http-${status}`
    detail = json.user_message ?? json.hookSpecificOutput?.permissionDecisionReason ?? ''
  } catch (err) {
    if (err?.name !== 'AbortError') throw err
    const group = await pendingById(toolUseId)
    if (group) {
      got = 'park'
      detail = `card "${group.title ?? group.detail ?? ''}"  pending=${group.interruptIds?.length ?? 1}`
    } else {
      got = 'timeout'
      detail = `no hook response and no card after ${PARK_MS}ms`
    }
  } finally {
    clearTimeout(timer)
  }

  const ms = Date.now() - started
  const pass = got === c.expect
  line(`         got=${got}  ${ms}ms  ${pass ? 'PASS' : 'FAIL'}${detail ? `  ${detail}` : ''}`)
  if (!pass) line(`         FAIL expected ${c.expect}, got ${got}`)
  return { ...c, got, ms, pass, toolUseId, detail }
}

async function main() {
  console.log('')
  line(`issue run  ${BASE}  cwd=${CWD}`)
  line('health check')

  let health
  try {
    health = await getJson(`${BASE}/api/health`)
  } catch (err) {
    line(`FAIL  cannot reach daemon: ${err.message}`)
    line('start it with:  npm run dev')
    process.exit(1)
  }
  if (!health.json?.ok) {
    line(`FAIL  /api/health HTTP ${health.status} ${JSON.stringify(health.json)}`)
    process.exit(1)
  }
  line('health ok')

  const results = []
  for (let i = 0; i < CASES.length; i++) {
    console.log('')
    results.push(await runCase(CASES[i], i + 1, CASES.length))
  }

  const pass = results.filter((r) => r.pass)
  const fail = results.filter((r) => !r.pass)
  const parked = results.filter((r) => r.got === 'park')

  console.log('')
  line('─'.repeat(56))
  line(
    `summary  ${pass.length} PASS / ${fail.length} FAIL / ${results.length} total` +
      `  auto=${results.filter((r) => r.kind === 'auto').length}` +
      `  deny=${results.filter((r) => r.kind === 'deny').length}` +
      `  park=${results.filter((r) => r.kind === 'park').length}`,
  )
  for (const r of results) {
    line(
      `  ${r.pass ? 'PASS' : 'FAIL'}  ${r.kind.padEnd(4)}  ${String(r.ms).padStart(4)}ms  ${r.expect}→${r.got}  ${labelOf(r)}`,
    )
  }
  if (parked.length > 0) {
    line(`parked cards left for UI  http://localhost:5173  (${parked.length})`)
    for (const r of parked) line(`  ${r.toolUseId}  ${labelOf(r)}`)
  }
  console.log('')
  process.exit(fail.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(`${ts()}  FAIL  ${err.message}`)
  console.error('Is the daemon up?  npm run dev')
  process.exit(1)
})
