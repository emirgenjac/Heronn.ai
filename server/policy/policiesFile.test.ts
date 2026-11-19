import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { PoliciesFile } from './store.ts'

const text = readFileSync(new URL('./policies.json', import.meta.url), 'utf8')
const policies = JSON.parse(text) as PoliciesFile

test('tracked policy keeps the blacklist and class map', () => {
  assert.ok(policies.blacklist.prefixes.includes('git push --force'))
  assert.ok(policies.blacklist.prefixes.includes('rm -rf /'))
  assert.ok(policies.blacklist.bins.includes('diskpart'))
  assert.equal(policies.classMap.npm, 'dependency')
  assert.equal(policies.classMap.cargo, 'dependency')
})

test('tracked policy has no personal paths or pasted scripts', () => {
  assert.equal(text.includes('Faris'), false)
  assert.equal(text.includes('Join-Path'), false)
  const commands = [
    ...policies.machine.decisions.map((d) => d.command),
    ...Object.values(policies.projects).flatMap((project) => project.decisions.map((d) => d.command)),
  ]
  for (const command of commands) {
    assert.equal(command.includes('\n'), false, command)
  }
})
