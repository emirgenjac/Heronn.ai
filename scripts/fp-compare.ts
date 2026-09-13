import { classifyCommand, stablePrefix } from '../server/policy/classifyCmd.ts'
import { canonicalise } from '../server/engine/canonicalise.ts'
import { parseCommand } from '../server/engine/parse.ts'
import type { Interrupt } from '../shared/types.ts'

const cwd = process.cwd()
const repo = 'Adria-Hack-AI-Project'
const map = { cargo: 'dependency', npm: 'dependency', npx: 'dependency' }

function irq(tool: string, command: string, args?: Record<string, unknown>): Interrupt {
  return {
    id: 't',
    ts: 0,
    host: 'cursor',
    sessionId: 's',
    cwd,
    repo,
    tool,
    args: args ?? { command },
    fingerprint: '',
    title: '',
    detail: '',
    destructive: false,
  }
}

const pairs: Array<[string, string, string]> = [
  ['Bash', 'git commit -m "Add interrupt host marks"', 'git commit -m "Wire SSE reconnect on the approve UI"'],
  ['Shell', 'git add web/src/App.tsx', 'git add web/src/components/Header.tsx'],
  ['Shell', 'mkdir -p tmp/agent-out', 'mkdir -p tmp/learned-out'],
  ['Bash', 'pytest tests/test_auth.py -k login --maxfail=1', 'pytest tests/test_session.py -k login --maxfail=1'],
  ['Shell', 'cargo test -p engine -- --nocapture', 'cargo test -p policy -- --nocapture'],
  ['Bash', 'python scripts/seed_demo.py --env local --limit 25', 'python scripts/seed_users.py --env local --limit 25'],
  ['Shell', 'curl https://api.github.com/rate_limit', 'curl https://httpbin.org/get'],
  [
    'Bash',
    'ffmpeg -i demo.mp4 -ss 00:00:03 -frames:v 1 tmp/frame.png',
    'ffmpeg -i clip.mp4 -ss 00:00:03 -frames:v 1 tmp/thumb.png',
  ],
]

for (const [tool, a, b] of pairs) {
  const ca = classifyCommand(a, map)
  const fa = canonicalise(irq(tool, a)).fingerprint
  const fb = canonicalise(irq(tool, b)).fingerprint
  console.log(`${ca} fpEqual=${fa === fb} prefix=${JSON.stringify(stablePrefix(a))}`)
  console.log(`  A ${a}`)
  console.log(`  B ${b}`)
  console.log(`  parseA ${JSON.stringify(parseCommand(a).stages[0])}`)
  console.log(`  parseB ${JSON.stringify(parseCommand(b).stages[0])}`)
}

const w1 = canonicalise(irq('Write', '', { file_path: `${cwd}/server/routes/health.ts`, content: 'x' }))
const w2 = canonicalise(irq('Write', '', { file_path: `${cwd}/server/pipeline.ts`, content: 'y' }))
console.log(`Write fpEqual=${w1.fingerprint === w2.fingerprint} dest=${w1.destructive}/${w2.destructive}`)
