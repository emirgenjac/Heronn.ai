import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const webDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(webDir, '..')

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    fs: { allow: [rootDir] },
    proxy: {
      '/api': {
        target: 'http://localhost:7777',
        timeout: 0,
        proxyTimeout: 0,
      },
    },
  },
})
