/**
 * Time daemon decisions. Does NOT run the commands — only POSTs to /hook/cursor.
 * Usage: node hook-ping/bench.js
 */

const HOOK = 'http://127.0.0.1:7777/hook/cursor'
const GROUPS = 'http://127.0.0.1:7777/api/groups'
const DECIDE = 'http://127.0.0.1:7777/api/decide'
const CWD = process.cwd()

const CASES = [
  'git push --force',
  'git push -f',
  'git push origin main --force',
  'git push --force-with-lease',
  'rm -rf /',
  'npm install lodash',
  'echo hello-bench',
]

async function decidePending(action) {
  const snap = await fetch(GROUPS).then((r) => r.json())
  const ids = (snap.groups ?? []).flatMap((g) => g.interruptIds)
  if (!ids.length) return
  await fetch(DECIDE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      interruptIds: ids,
      action,
      createRule: false,
      scope: 'repo',
      by: 'bench',
    }),
  })
}

async function runCase(command) {
  const t0 = performance.now()
  const hookPromise = fetch(HOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, cwd: CWD, tool_name: 'Shell' }),
  }).then(async (r) => ({ status: r.status, json: await r.json() }))

  await new Promise((r) => setTimeout(r, 80))
  await decidePending('deny')

  const { status, json } = await hookPromise
  const ms = performance.now() - t0
  const decision =
    json.permission ?? json.hookSpecificOutput?.permissionDecision ?? '?'
  return { command, status, decision, ms, body: json }
}

async function main() {
  const health = await fetch('http://127.0.0.1:7777/api/health').then((r) => r.json())
  if (!health.ok) throw new Error('server nije up')

  console.log('\nDaemon bench  POST /hook/cursor\n')
  console.log('command'.padEnd(36), 'decision'.padEnd(10), 'ms')
  console.log('-'.repeat(56))

  for (const command of CASES) {
    const row = await runCase(command)
    console.log(
      command.padEnd(36),
      String(row.decision).padEnd(10),
      row.ms.toFixed(2),
    )
  }

  console.log('\nWarm 200x git push --force (park then settle deny)')
  const t0 = performance.now()
  for (let i = 0; i < 200; i++) {
    const hookPromise = fetch(HOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: 'git push --force',
        cwd: CWD,
        tool_name: 'Shell',
      }),
    }).then((r) => r.json())
    await new Promise((r) => setTimeout(r, 20))
    await decidePending('deny')
    const res = await hookPromise
    const d = res.permission ?? res.hookSpecificOutput?.permissionDecision
    if (d !== 'deny') throw new Error(`expected deny after park, got ${d}`)
  }
  const elapsed = performance.now() - t0
  console.log(
    `avg ${(elapsed / 200).toFixed(2)} ms  (${elapsed.toFixed(0)} ms total)\n`,
  )
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
