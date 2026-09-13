/**
 * Simulate mixed Claude / Cursor / MCP hook traffic.
 * Start the daemon first (npm run dev), then: node test.js
 *
 * Posts with ?hold=1 so cards stay parked in the queue for you to approve.
 */

const BASE = 'http://127.0.0.1:7777'
const cwd = process.cwd()

function dump(title, value) {
  console.log('\n' + '='.repeat(60))
  console.log(title)
  console.log('='.repeat(60))
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  console.log('='.repeat(60))
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function jitter(minMs, maxMs) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1))
}

function claudeBody(tool, toolInput, session) {
  return {
    session_id: session,
    transcript_path: '/tmp/transcript.jsonl',
    cwd,
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: toolInput,
    tool_use_id: `toolu_${tool.toLowerCase()}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
  }
}

function cursorShell(command, session, event) {
  if (event === 'preToolUse') {
    return {
      hook_event_name: 'preToolUse',
      session_id: session,
      cwd,
      tool_name: 'Shell',
      tool_input: { command },
    }
  }
  return {
    hook_event_name: 'beforeShellExecution',
    session_id: session,
    cwd,
    command,
  }
}

function mcpBody(tool, toolInput, session) {
  return {
    session_id: session,
    cwd,
    tool_name: tool,
    tool_input: toolInput,
    tool_use_id: `mcp_${tool.replace(/[^a-z0-9]+/gi, '_')}_${Date.now()}`,
  }
}

const scenarios = [
  {
    host: 'claude-code',
    path: '/hook/claude-code',
    label: 'Bash git commit',
    body: () =>
      claudeBody(
        'Bash',
        { command: 'git commit -m "Add interrupt host marks"', description: 'Commit host-mark UI' },
        'claude-session-commit',
      ),
  },
  {
    host: 'cursor',
    path: '/hook/cursor',
    label: 'beforeShellExecution git add',
    body: () => cursorShell('git add web/src/App.tsx', 'cursor-session-add', 'beforeShellExecution'),
  },
  {
    host: 'mcp',
    path: '/hook/mcp',
    label: 'browser.navigate',
    body: () =>
      mcpBody('browser.navigate', { url: 'https://example.com/inbox?view=parked' }, 'mcp-session-browser'),
  },
  {
    host: 'claude-code',
    path: '/hook/claude-code',
    label: 'Bash pytest',
    body: () =>
      claudeBody(
        'Bash',
        { command: 'pytest tests/test_auth.py -k login --maxfail=1', description: 'Run login tests' },
        'claude-session-pytest',
      ),
  },
  {
    host: 'cursor',
    path: '/hook/cursor',
    label: 'preToolUse mkdir',
    body: () => cursorShell('mkdir -p tmp/agent-out', 'cursor-session-mkdir', 'preToolUse'),
  },
  {
    host: 'claude-code',
    path: '/hook/claude-code',
    label: 'Write in-repo file',
    body: () =>
      claudeBody(
        'Write',
        {
          file_path: `${cwd}/server/routes/health.ts`,
          content: 'export const ok = true\n',
        },
        'claude-session-write',
      ),
  },
  {
    host: 'cursor',
    path: '/hook/cursor',
    label: 'beforeShellExecution cargo test',
    body: () =>
      cursorShell('cargo test -p engine -- --nocapture', 'cursor-session-cargo', 'beforeShellExecution'),
  },
  {
    host: 'mcp',
    path: '/hook/mcp',
    label: 'slack.postMessage',
    body: () =>
      mcpBody(
        'slack.postMessage',
        { channel: '#ops', text: 'interrupt queue has new parked shells' },
        'mcp-session-slack',
      ),
  },
  {
    host: 'claude-code',
    path: '/hook/claude-code',
    label: 'Bash python script',
    body: () =>
      claudeBody(
        'Bash',
        { command: 'python scripts/seed_demo.py --env local --limit 25', description: 'Seed demo rows' },
        'claude-session-python',
      ),
  },
  {
    host: 'cursor',
    path: '/hook/cursor',
    label: 'preToolUse curl',
    body: () =>
      cursorShell('curl https://api.github.com/rate_limit', 'cursor-session-curl', 'preToolUse'),
  },
  {
    host: 'mcp',
    path: '/hook/mcp',
    label: 'ffmpeg unknown binary',
    body: () =>
      mcpBody(
        'Bash',
        { command: 'ffmpeg -i demo.mp4 -ss 00:00:03 -frames:v 1 tmp/frame.png' },
        'mcp-session-ffmpeg',
      ),
  },
]

async function fire(scenario) {
  const body = scenario.body()
  dump(`REQUEST  POST ${scenario.path}?hold=1  host=${scenario.host}  (${scenario.label})`, body)
  const res = await fetch(`${BASE}${scenario.path}?hold=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json())
  dump(`RESPONSE  POST ${scenario.path}?hold=1  host=${scenario.host}`, res)
}

async function main() {
  console.log(`\nTraffic sim against ${BASE}`)

  dump('REQUEST  GET /api/health', '(no body)')
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json())
  dump('RESPONSE  GET /api/health', health)
  if (!health.ok) throw new Error('health nije ok — pokreni npm run dev')

  const badBody = { not: 'a claude hook' }
  dump('REQUEST  POST /hook/claude-code  (bad payload)', badBody)
  const bad = await fetch(`${BASE}/hook/claude-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(badBody),
  }).then((r) => r.json())
  dump('RESPONSE  POST /hook/claude-code  (bad payload)', bad)

  for (const scenario of scenarios) {
    const wait = jitter(1200, 4000)
    console.log(`\nwaiting ${wait}ms before ${scenario.host} / ${scenario.label}`)
    await sleep(wait)
    await fire(scenario)
  }

  await sleep(250)
  const snap = await fetch(`${BASE}/api/groups`).then((r) => r.json())
  dump('QUEUE  GET /api/groups', {
    pending: snap.stats?.blocked,
    hosts: (snap.groups ?? []).map((g) => {
      const agents = snap.agents?.[g.fingerprint] ?? []
      return {
        title: g.title,
        host: agents[0]?.host ?? '(none)',
        detail: g.detail,
      }
    }),
  })

  console.log('\nGotovo. Kartice ostaju parked — odobri ih u UI.\n')
}

main().catch((err) => {
  console.error('\nGreska:', err.message)
  console.error('Je li server upaljen?  npm run dev\n')
  process.exit(1)
})
