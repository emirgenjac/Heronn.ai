const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const body = Buffer.concat(chunks)

const url = process.env.HERONN_CLAUDE_HOOK_URL ?? 'http://127.0.0.1:7777/hook/claude-code'

function block(message) {
  console.error(message)
  process.exit(2)
}

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(540_000),
  })
  const text = await res.text()
  if (!res.ok) {
    block(`claude relay HTTP ${res.status} (is the daemon on http://127.0.0.1:7777?)`)
  }
  process.stdout.write(text)
  process.exit(0)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  block(`claude relay offline: ${message} (is the daemon on http://127.0.0.1:7777?)`)
}
