import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Interrupt } from '../shared/types.ts'
import { projectRoot } from './util.ts'

const path = join(projectRoot(), 'fixtures', 'interrupts.jsonl')
const lines = readFileSync(path, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)

const counts = new Map<string, number>()
for (const line of lines) {
  let row: Interrupt
  try {
    row = JSON.parse(line) as Interrupt
  } catch {
    continue
  }
  const fp = row.fingerprint || `${row.tool}:${JSON.stringify(row.args)}`
  counts.set(fp, (counts.get(fp) ?? 0) + 1)
}

const total = [...counts.values()].reduce((a, b) => a + b, 0)
const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
let covered = 0
let k90 = 0
for (const [, n] of ranked) {
  covered += n
  k90++
  if (covered / Math.max(total, 1) >= 0.9) break
}
const longTail = ranked.filter(([, n]) => n === 1).length

console.log(`total requests:     ${total}`)
console.log(`distinct fingerprints: ${ranked.length}`)
console.log(`fingerprints covering 90%: ${k90}`)
console.log(`long tail (count=1): ${longTail}`)
console.log('top fingerprints:')
for (const [fp, n] of ranked.slice(0, 8)) {
  const label = fp.length > 80 ? `${fp.slice(0, 77)}...` : fp
  console.log(`  ${String(n).padStart(4)}  ${label}`)
}
