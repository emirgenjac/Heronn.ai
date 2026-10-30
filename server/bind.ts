import type { Server } from 'node:http'
import type { Express } from 'express'

/**
 * IPv4 loopback. Packets to this address never leave the machine.
 * Binding here keeps /api/decide and /hook/* off the LAN and the public internet.
 */
export const LOOPBACK_HOST = '127.0.0.1'

export function listenOnLoopback(app: Express, port: number, onListening?: () => void): Server {
  return app.listen(port, LOOPBACK_HOST, onListening)
}
