const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const body = Buffer.concat(chunks)

function eventName(raw) {
  try {
    const parsed = JSON.parse(raw.toString('utf8'))
    const name = parsed.hook_event_name ?? parsed.hookEventName
    return typeof name === 'string' && name.trim() ? name.trim() : 'PreToolUse'
  } catch {
    return 'PreToolUse'
  }
}

function ask(event) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: event,
      permissionDecision: 'ask',
      permissionDecisionReason: 'Policy daemon is not running; using Claude Code permission prompt.',
    },
  })
}

const event = eventName(body)

try {
  const res = await fetch('http://127.0.0.1:7777/hook/claude-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(540_000),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`claude relay HTTP ${res.status} (is the daemon on http://127.0.0.1:7777?)`)
    process.stdout.write(ask(event))
    process.exit(0)
  }
  process.stdout.write(text)
  process.exit(0)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`claude relay offline: ${message}`)
  process.stdout.write(ask(event))
  process.exit(0)
}
