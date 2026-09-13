/**
 * Round 2 of the live demo. Same hosts / classes as test.js, different commands.
 *
 * If you Allow + "this project" or "this PC" on test 1, these should skip the
 * queue (class, prefix, or fingerprint) even though the text is not identical.
 *
 *   node test.js     decide with this project / this PC
 *   node test2.js    similar traffic; auto-allows stay out of the queue
 *
 * Daemon must already be up (npm run dev).
 */

const BASE = 'http://127.0.0.1:7777'
const cwd = process.cwd()

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function jitter(minMs, maxMs) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1))
}

function rid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function claudeBody(tool, toolInput, session, id) {
  return {
    session_id: session,
    transcript_path: '/tmp/transcript.jsonl',
    cwd,
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: toolInput,
    tool_use_id: id,
  }
}

function cursorShell(command, session, event, id) {
  if (event === 'preToolUse') {
    return {
      hook_event_name: 'preToolUse',
      session_id: session,
      cwd,
      tool_name: 'Shell',
      tool_input: { command },
      tool_use_id: id,
    }
  }
  return {
    hook_event_name: 'beforeShellExecution',
    session_id: session,
    cwd,
    command,
    tool_use_id: id,
  }
}

function mcpBody(tool, toolInput, session, id) {
  return {
    session_id: session,
    cwd,
    tool_name: tool,
    tool_input: toolInput,
    tool_use_id: id,
  }
}

const scenarios = [
  {
    host: 'claude-code',
    path: '/hook/claude-code',
    class: 'git-write',
    like: 'git commit -m "Add interrupt host marks"',
    label: 'Bash git commit (different message)',
    body: (id) =>
      claudeBody(
        'Bash',
        { command: 'git commit -m "Wire SSE reconnect on the approve UI"', description: 'Commit SSE retry' },
        'claude-session-commit-2',
        id,
      ),
  },
  {
    host: 'cursor',
    path: '/hook/cursor',
    class: 'git-write',
    like: 'git add web/src/App.tsx',
    label: 'beforeShellExecution git add (different file)',
    body: (id) => cursorShell('git add web/src/components/Header.tsx', 'cursor-session-add-2', 'beforeShellExecution', id),
  },
  {
    host: 'mcp',
    path: '/hook/mcp',
    class: 'mcp',
    like: 'browser.navigate inbox',
    label: 'browser.navigate (different url)',
    body: (id) =>
      mcpBody('browser.navigate', { url: 'https://example.com/queue?view=learned' }, 'mcp-session-browser-2', id),
  },
  {
    host: 'claude-code',
    path: '/hook/claude-code',
    class: 'unknown / fingerprint',
    like: 'pytest tests/test_auth.py -k login --maxfail=1',
    label: 'Bash pytest (different file, same flags)',
    body: (id) =>
      claudeBody(
        'Bash',
        { command: 'pytest tests/test_session.py -k login --maxfail=1', description: 'Run session tests' },
        'claude-session-pytest-2',
        id,
      ),
  },
  {
    host: 'cursor',
    path: '/hook/cursor',
    class: 'fs-write',
    like: 'mkdir -p tmp/agent-out',
    label: 'preToolUse mkdir (different dir)',
    body: (id) => cursorShell('mkdir -p tmp/learned-out', 'cursor-session-mkdir-2', 'preToolUse', id),
  },
  {
    host: 'claude-code',
    path: '/hook/claude-code',
    class: 'Write fingerprint',
    like: 'Write server/routes/health.ts',
    label: 'Write in-repo file (different path)',
    body: (id) =>
      claudeBody(
        'Write',
        {
          file_path: `${cwd}/server/pipeline.ts`,
          content: 'export const parked = true\n',
        },
        'claude-session-write-2',
        id,
      ),
  },
  {
    host: 'cursor',
    path: '/hook/cursor',
    class: 'test',
    like: 'cargo test -p engine -- --nocapture',
    label: 'beforeShellExecution cargo test (different crate)',
    body: (id) =>
      cursorShell('cargo test -p policy -- --nocapture', 'cursor-session-cargo-2', 'beforeShellExecution', id),
  },
  {
    host: 'mcp',
    path: '/hook/mcp',
    class: 'mcp',
    like: 'slack.postMessage #ops',
    label: 'slack.postMessage (different channel)',
    body: (id) =>
      mcpBody(
        'slack.postMessage',
        { channel: '#platform', text: 'learned policy auto-allowed the follow-up shells' },
        'mcp-session-slack-2',
        id,
      ),
  },
  {
    host: 'claude-code',
    path: '/hook/claude-code',
    class: 'unknown / fingerprint',
    like: 'python scripts/seed_demo.py --env local --limit 25',
    label: 'Bash python script (different file, same flags)',
    body: (id) =>
      claudeBody(
        'Bash',
        { command: 'python scripts/seed_users.py --env local --limit 25', description: 'Seed user rows' },
        'claude-session-python-2',
        id,
      ),
  },
  {
    host: 'cursor',
    path: '/hook/cursor',
    class: 'network',
    like: 'curl https://api.github.com/rate_limit',
    label: 'preToolUse curl (different url)',
    body: (id) => cursorShell('curl https://httpbin.org/get', 'cursor-session-curl-2', 'preToolUse', id),
  },
  {
    host: 'mcp',
    path: '/hook/mcp',
    class: 'unknown / fingerprint',
    like: 'ffmpeg -i demo.mp4 ...',
    label: 'ffmpeg (different file, same flags)',
    body: (id) =>
      mcpBody(
        'Bash',
        { command: 'ffmpeg -i clip.mp4 -ss 00:00:03 -frames:v 1 tmp/thumb.png' },
        'mcp-session-ffmpeg-2',
        id,
      ),
  },
]

async function getJson(url) {
  return fetch(url).then((r) => r.json())
}

function inGroups(snap, id) {
  for (const g of snap.groups ?? []) {
    if ((g.interruptIds ?? []).includes(id)) return g
  }
  return null
}

async function outcomeOf(id) {
  await sleep(200)
  const snap = await getJson(`${BASE}/api/groups`)
  const parked = inGroups(snap, id)
  if (parked) return { kind: 'park', title: parked.title, detail: parked.detail }
  const logs = await getJson(`${BASE}/api/logs?limit=80`)
  const row = (logs.rows ?? []).find((r) => r.id === id)
  if (row?.state === 'auto' || row?.decision === 'allow') {
    return { kind: 'auto', by: row.decidedBy ?? 'policy', title: row.title, detail: row.detail }
  }
  if (row?.decision) {
    return { kind: row.decision, by: row.decidedBy, title: row.title, detail: row.detail }
  }
  return { kind: 'unknown' }
}

async function fire(scenario) {
  const id = rid(scenario.host.replace(/[^a-z0-9]+/gi, '_'))
  const body = scenario.body(id)
  const res = await fetch(`${BASE}${scenario.path}?hold=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json())
  const outcome = await outcomeOf(id)
  return { id, res, outcome }
}

async function main() {
  console.log(`\nTest 2 (similar, not identical) against ${BASE}`)
  const health = await getJson(`${BASE}/api/health`)
  if (!health.ok) throw new Error('health nije ok — pokreni npm run dev')
  console.log('health ok\n')

  const results = []
  for (const scenario of scenarios) {
    const wait = jitter(1200, 4000)
    console.log(`waiting ${wait}ms  ${scenario.host} / ${scenario.label}`)
    await sleep(wait)
    const { outcome } = await fire(scenario)
    const mark = outcome.kind === 'auto' ? 'AUTO ' : outcome.kind === 'park' ? 'PARK ' : String(outcome.kind).toUpperCase().padEnd(5)
    console.log(`  ${mark}  class=${scenario.class}`)
    console.log(`         like test1: ${scenario.like}`)
    if (outcome.detail) console.log(`         this run:  ${outcome.detail}`)
    if (outcome.kind === 'auto') console.log(`         skipped queue (${outcome.by})`)
    console.log('')
    results.push({ scenario, outcome })
  }

  const auto = results.filter((r) => r.outcome.kind === 'auto')
  const park = results.filter((r) => r.outcome.kind === 'park')
  console.log('─'.repeat(56))
  console.log(`summary  AUTO ${auto.length}  PARK ${park.length}  / ${results.length}`)
  if (auto.length === 0) {
    console.log('nothing auto-allowed — on test 1, Allow with "this project" or "this PC" first')
  } else {
    console.log('auto-allowed (not identical, same class / prefix / fingerprint):')
    for (const r of auto) console.log(`  - ${r.outcome.detail || r.scenario.label}`)
  }
  if (park.length > 0) {
    console.log(`still parked at http://localhost:5173  (${park.length})`)
    for (const r of park) console.log(`  - ${r.outcome.detail || r.scenario.label}`)
  }
  console.log('')
}

main().catch((err) => {
  console.error('\nGreska:', err.message)
  console.error('Je li server upaljen?  npm run dev\n')
  process.exit(1)
})
