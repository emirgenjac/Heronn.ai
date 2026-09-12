const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const body = Buffer.concat(chunks)

try {
  const res = await fetch('http://127.0.0.1:7777/hook/cursor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(540_000),
  })
  const text = await res.text()
  process.stdout.write(text)
  process.exit(res.ok ? 0 : 2)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`relay failed: ${message} (is the daemon on http://127.0.0.1:7777?)`)
  process.exit(1)
}
