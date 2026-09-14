import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { createLogger, defineConfig } from 'vite'

const webDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(webDir, '..')

const TRANSIENT = /ECONNREFUSED|ECONNRESET|EPIPE|ECONNABORTED|ETIMEDOUT/
const viteLogger = createLogger()

export default defineConfig({
  root: 'web',
  plugins: [react()],
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
