import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { networkInterfaces } from 'node:os'
import { test } from 'node:test'
import express from 'express'
import { LOOPBACK_HOST, listenOnLoopback } from './bind.ts'

function externalIPv4(): string | undefined {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address
    }
  }
  return undefined
}

async function withLoopback(fn: (port: number) => Promise<void>): Promise<void> {
  const app = express()
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })
  const server = listenOnLoopback(app, 0)
  if (!server.listening) await once(server, 'listening')
  const address = server.address() as AddressInfo
  try {
    assert.equal(address.address, '127.0.0.1')
    assert.equal(address.family, 'IPv4')
    await fn(address.port)
  } finally {
    server.close()
    if (server.listening) await once(server, 'close')
  }
}

test('daemon host is IPv4 loopback, not every interface', () => {
  assert.equal(LOOPBACK_HOST, '127.0.0.1')
  assert.notEqual(LOOPBACK_HOST, '0.0.0.0')
  assert.notEqual(LOOPBACK_HOST, '::')
})

test('a request to 127.0.0.1 reaches the daemon', async () => {
  await withLoopback(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
  })
})

test('the same port refuses a connection on a LAN address', async (t) => {
  const lan = externalIPv4()
  if (!lan) {
    t.skip('this machine has no external IPv4 address')
    return
  }
  await withLoopback(async (port) => {
    await assert.rejects(
      fetch(`http://${lan}:${port}/api/health`, { signal: AbortSignal.timeout(1500) }),
      (err: unknown) => err instanceof Error,
    )
  })
})
