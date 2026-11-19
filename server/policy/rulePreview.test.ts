import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rulePreview } from './rulePreview.ts'

test('a classed command names the class, the project, and the prefix', () => {
  assert.equal(
    rulePreview('npm install lodash', 'repo', 'Heronn.ai'),
    'Saves class dependency for this project (Heronn.ai), prefix npm install.',
  )
})

test('this PC names the machine, not one repo', () => {
  assert.equal(
    rulePreview('git commit -m "wip"', 'global', 'Heronn.ai'),
    'Saves class git-write for this PC, prefix git commit.',
  )
})

test('an unknown command is saved as that command only', () => {
  assert.equal(
    rulePreview('python tool.py', 'repo', 'Heronn.ai'),
    'Saves class unknown for this project (Heronn.ai) as this command only.',
  )
})

test('a card with no command saves a fingerprint rule', () => {
  assert.equal(rulePreview('  ', 'repo', ''), 'Saves a fingerprint rule for this project.')
})
