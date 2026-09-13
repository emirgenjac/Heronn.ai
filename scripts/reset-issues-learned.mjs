import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'issues-learned.json')
mkdirSync(dirname(path), { recursive: true })
writeFileSync(path, `${JSON.stringify({ allows: [] }, null, 2)}\n`)
console.log(`cleared ${path}`)
console.log('park cases will card again until you tick this project / this PC and Allow')
