import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { test } from 'node:test'

const stdin = JSON.stringify({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
})

function runRelay(url: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ['.claude/hooks/relay.mjs'], {
    env: { ...process.env, HERONN_CLAUDE_HOOK_URL: url },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  child.stdin.end(stdin)
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve({ code: code ?? -1, stdout, stderr }))
  })
}

async function listen(status: number, body: string): Promise<{ server: Server; url: string }> {
  const server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(body)
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  return { server, url: `http://127.0.0.1:${port}/hook/claude-code` }
}

async function closedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  server.close()
  await once(server, 'close')
  return port
}

test('daemon down: exit 2 and do not ask Claude to prompt', async () => {
  const port = await closedPort()
  const result = await runRelay(`http://127.0.0.1:${port}/hook/claude-code`)
  assert.equal(result.code, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /claude relay offline/)
})

test('daemon HTTP error: exit 2 and do not forward the body', async () => {
  const { server, url } = await listen(500, 'nope')
  try {
    const result = await runRelay(url)
    assert.equal(result.code, 2)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /HTTP 500/)
  } finally {
    server.close()
  }
})

test('daemon decision: exit 0 and forward the JSON', async () => {
  const decision = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  })
  const { server, url } = await listen(200, decision)
  try {
    const result = await runRelay(url)
    assert.equal(result.code, 0)
    assert.equal(result.stdout, decision)
  } finally {
    server.close()
  }
})
