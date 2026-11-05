import http from 'node:http'
import net from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { createLogger, defineConfig, type Plugin } from 'vite'

const webDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(webDir, '..')

const TRANSIENT = /ECONNREFUSED|ECONNRESET|EPIPE|ECONNABORTED|ETIMEDOUT/
const viteLogger = createLogger()

/** Vite on Windows often listens on ::1 only, so 127.0.0.1:5173 is refused. */
function ipv4Loopback(): Plugin {
  return {
    name: 'ipv4-loopback',
    configureServer(server) {
      const httpServer = server.httpServer
      if (!httpServer) return
      httpServer.once('listening', () => {
        const addr = httpServer.address()
        if (!addr || typeof addr === 'string' || addr.address === '127.0.0.1') return
        const port = addr.port
        const bridge = http.createServer((req, res) => {
          const proxy = http.request(
            {
              hostname: '::1',
              family: 6,
              port,
              method: req.method,
              path: req.url,
              headers: req.headers,
            },
            (upstream) => {
              res.writeHead(upstream.statusCode ?? 502, upstream.headers)
              upstream.pipe(res)
            },
          )
          proxy.on('error', () => {
            if (!res.headersSent) res.writeHead(502)
            res.end()
          })
          req.pipe(proxy)
        })
        bridge.on('upgrade', (req, socket, head) => {
          const upstream = net.connect({ host: '::1', port, family: 6 }, () => {
            const lines = [`${req.method} ${req.url} HTTP/1.1`]
            for (const [key, value] of Object.entries(req.headers)) {
              if (value == null) continue
              for (const item of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${item}`)
            }
            upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
            if (head.length > 0) upstream.write(head)
            socket.pipe(upstream)
            upstream.pipe(socket)
          })
          const closeBoth = () => {
            socket.destroy()
            upstream.destroy()
          }
          upstream.on('error', closeBoth)
          socket.on('error', closeBoth)
        })
        bridge.listen(port, '127.0.0.1')
      })
    },
  }
}

export default defineConfig({
  root: 'web',
  plugins: [react(), ipv4Loopback()],
  customLogger: {
    ...viteLogger,
    error(msg, options) {
      const text = String(msg)
      if (text.includes('http proxy error') && TRANSIENT.test(text)) return
      const code =
        options?.error && typeof options.error === 'object' && 'code' in options.error
          ? String((options.error as { code?: string }).code)
          : ''
      if (text.includes('http proxy error') && TRANSIENT.test(code)) return
      viteLogger.error(msg, options)
    },
  },
  server: {
    fs: { allow: [rootDir] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7777',
        timeout: 0,
        proxyTimeout: 0,
        configure(proxy) {
          proxy.on('error', (err, _req, res) => {
            if (!TRANSIENT.test(String((err as NodeJS.ErrnoException).code ?? err.message))) {
              viteLogger.error(String(err.stack ?? err))
            }
            const out = res as { writeHead?: (code: number) => void; headersSent?: boolean; end?: () => void }
            if (typeof out.writeHead === 'function' && !out.headersSent) {
              out.writeHead(502)
              out.end?.()
            }
          })
        },
      },
    },
  },
})
