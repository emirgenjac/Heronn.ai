import { performance } from 'node:perf_hooks'
import type { Interrupt } from '../../shared/types.ts'
import { canonicalise } from '../engine/index.ts'
import { isBlacklisted, isPrefixBlacklisted } from './blacklist.ts'
import { evaluateCommand } from './evaluate.ts'
import { loadPolicies } from './store.ts'

function irq(command: string): Interrupt {
  return {
    id: 'bench',
    ts: 0,
    host: 'cursor',
    sessionId: 's',
    cwd: process.cwd(),
    repo: 'Adria Hack',
    tool: 'Shell',
    args: { command },
    fingerprint: '',
    title: '',
    detail: command,
    destructive: false,
  }
}

function time(label: string, n: number, fn: () => void): number {
  for (let i = 0; i < 50; i++) fn()
  const t0 = performance.now()
  for (let i = 0; i < n; i++) fn()
  const avg = (performance.now() - t0) / n
  console.log(`${label.padEnd(44)} ${avg.toFixed(3)} ms`)
  return avg
}

const force = irq('git push --force')
const forceOrigin = irq('git push origin main --force')
const n = 2_000

console.log(`\nin-process x${n}  cwd=${process.cwd()}\n`)
time('loadPolicies()', n, () => {
  loadPolicies()
})
time('isPrefixBlacklisted(git push --force)', n, () => {
  isPrefixBlacklisted('git push --force')
})
time('canonicalise(git push --force)', n, () => {
  canonicalise(force)
})
time('isBlacklisted(git push --force)', n, () => {
  isBlacklisted('git push --force', force.cwd, force.repo)
})
time('isBlacklisted(git push origin --force)', n, () => {
  isBlacklisted('git push origin main --force', forceOrigin.cwd, forceOrigin.repo)
})

const t0 = performance.now()
for (let i = 0; i < n; i++) await evaluateCommand(irq('npm install lodash'))
console.log(`${'evaluateCommand(npm install lodash)'.padEnd(44)} ${((performance.now() - t0) / n).toFixed(3)} ms\n`)
