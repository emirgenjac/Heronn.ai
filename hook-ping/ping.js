/**
 * Ping Claude Code hook from this folder.
 * Usage: node ping.js
 */

const BASE = 'http://127.0.0.1:7777'
const HOOK = `${BASE}/hook/claude-code`

function dump(title, value) {
  console.log('\n' + '='.repeat(60))
  console.log(title)
  console.log('='.repeat(60))
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  console.log('='.repeat(60))
}

const body = {
  session_id: 'hook-ping',
  transcript_path: '/tmp/transcript.jsonl',
  cwd: process.cwd(),
  permission_mode: 'default',
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: {
    command: 'echo ping',
    description: 'Connection ping from hook-ping folder',
  },
  tool_use_id: `toolu_ping_${Date.now()}`,
}

async function main() {
  dump('PING FROM', process.cwd())

  dump('REQUEST  GET /api/health', '(no body)')
  const healthRes = await fetch(`${BASE}/api/health`)
  const health = await healthRes.json()
  dump(`RESPONSE  GET /api/health  HTTP ${healthRes.status}`, health)
  if (!health.ok) throw new Error('server health nije ok')

  dump('REQUEST  POST /hook/claude-code', body)
  const started = Date.now()
  const hookPromise = fetch(HOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  // Parked hook waits for a human. Unpark so the ping can finish.
  await new Promise((r) => setTimeout(r, 250))
  const snap = await fetch(`${BASE}/api/groups`).then((r) => r.json())
  const ids = (snap.groups ?? []).flatMap((g) => g.interruptIds)
  dump('PENDING GROUPS', snap)
  if (ids.length > 0) {
    const decideBody = {
      interruptIds: ids,
      action: 'allow',
      createRule: false,
      scope: 'repo',
      by: 'hook-ping',
    }
    dump('REQUEST  POST /api/decide  (unpark)', decideBody)
    const decide = await fetch(`${BASE}/api/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(decideBody),
    }).then((r) => r.json())
    dump('RESPONSE  POST /api/decide', decide)
  }

  const hookRes = await hookPromise
  const json = await hookRes.json()
  dump(`RESPONSE  POST /hook/claude-code  HTTP ${hookRes.status}  ${Date.now() - started}ms`, json)

  const decision = json?.hookSpecificOutput?.permissionDecision
  if (hookRes.ok && decision) {
    console.log(`\nKonekcija OK. Hook je odgovorio: ${decision}\n`)
  } else {
    console.log('\nHook nije vratio ocekivani odziv.\n')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\nKonekcija FAIL:', err.message)
  console.error('Server mora biti upaljen: npm run dev\n')
  process.exit(1)
})
