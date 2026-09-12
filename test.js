/**
 * Test Claude Code hook -> Interrupt Scheduler.
 * Pokreni server (npm run dev), pa: node test.js
 */

const BASE = 'http://127.0.0.1:7777'

function bashPayload() {
  return {
    session_id: 'test-session-bash',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: process.cwd(),
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: {
      command: 'npm test',
      description: 'Run test suite',
    },
    tool_use_id: `toolu_bash_${Date.now()}`,
  }
}

function writePayload() {
  return {
    session_id: 'test-session-write',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: process.cwd(),
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: {
      file_path: `${process.cwd()}/hello.txt`,
      content: 'Hello from Interrupt Scheduler',
    },
    tool_use_id: `toolu_write_${Date.now()}`,
  }
}

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

async function decideParked(action) {
  for (let i = 0; i < 20; i++) {
    const snap = await fetch(`${BASE}/api/groups`).then((r) => r.json())
    const ids = (snap.groups ?? []).flatMap((g) => g.interruptIds)
    if (ids.length > 0) {
      const body = {
        interruptIds: ids,
        action,
        createRule: false,
        scope: 'repo',
        by: 'test.js',
      }
      dump(`REQUEST  POST /api/decide  (unpark -> ${action})`, body)
      const res = await fetch(`${BASE}/api/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json())
      dump('RESPONSE  POST /api/decide', res)
      return ids
    }
    await sleep(100)
  }
  throw new Error('nema pending interrupta za decide')
}

async function main() {
  console.log(`\nTest protiv ${BASE}`)

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

  const bashBody = bashPayload()
  dump('REQUEST  POST /hook/claude-code  (Bash PreToolUse)', bashBody)
  const bashPromise = fetch(`${BASE}/hook/claude-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bashBody),
  }).then((r) => r.json())
  await sleep(200)
  await decideParked('allow')
  const bashRes = await bashPromise
  dump('RESPONSE  POST /hook/claude-code  (Bash PreToolUse)', bashRes)

  const writeBody = writePayload()
  dump('REQUEST  POST /hook/claude-code  (Write PreToolUse)', writeBody)
  const writePromise = fetch(`${BASE}/hook/claude-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(writeBody),
  }).then((r) => r.json())
  await sleep(200)
  await decideParked('deny')
  const writeRes = await writePromise
  dump('RESPONSE  POST /hook/claude-code  (Write PreToolUse)', writeRes)

  console.log('\nGotovo.\n')
}

main().catch((err) => {
  console.error('\nGreska:', err.message)
  console.error('Je li server upaljen?  npm run dev\n')
  process.exit(1)
})
