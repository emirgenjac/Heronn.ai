import type { Response } from 'express'
import { getSnapshot } from './snapshot.ts'

const clients = new Set<Response>()

function payload(): string {
  return `event: update\ndata: ${JSON.stringify(getSnapshot())}\n\n`
}

export function broadcast(): void {
  if (clients.size === 0) return
  const chunk = payload()
  for (const res of clients) res.write(chunk)
}

export function addSseClient(res: Response): void {
  clients.add(res)
  res.write(payload())
}

export function removeSseClient(res: Response): void {
  clients.delete(res)
}

setInterval(() => {
  broadcast()
}, 1000).unref()
