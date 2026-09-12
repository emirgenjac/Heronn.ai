import { canonicalise } from './canonicalise.ts'
import { match } from './rules.ts'
import type { Interrupt } from '../../shared/types.ts'

const sample: Interrupt = {
  id: 'bench',
  ts: 0,
  host: 'cursor',
  sessionId: 's',
  cwd: '/home/dev/Adria-Hack-AI-Project',
  repo: 'Adria-Hack-AI-Project',
  tool: 'Bash',
  args: { command: 'npm install -D typescript' },
  fingerprint: '',
  title: '',
  detail: '',
  destructive: false,
}

const n = 10_000
const t0 = performance.now()
for (let i = 0; i < n; i++) {
  const c = canonicalise(sample)
  match(c.fingerprint, sample.repo)
}
const elapsedMs = performance.now() - t0
const avgUs = (elapsedMs * 1000) / n
console.log(`canonicalise+match ${n}x avg ${avgUs.toFixed(2)} µs (${(avgUs / 1000).toFixed(4)} ms)`)
