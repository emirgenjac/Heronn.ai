import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowPrefixFor, MAX_ALLOW_PREFIX_CHARS } from './allowPrefix.ts'

test('a short unknown command is stored as its own prefix', () => {
  assert.equal(allowPrefixFor('  python  tool.py  ', 'unknown'), 'python tool.py')
})

test('a multi-line command is not stored as a prefix', () => {
  const script = 'python tool.py\nRemove-Item -Recurse C:\\secret'
  assert.equal(allowPrefixFor(script, 'unknown'), null)
  assert.equal(allowPrefixFor('npm install lodash\nnpm test', 'dependency'), null)
  assert.equal(allowPrefixFor('python tool.py\r\necho hi', 'unknown'), null)
})

test('an unknown command longer than the cap is not stored', () => {
  const atCap = 'p'.repeat(MAX_ALLOW_PREFIX_CHARS)
  const over = 'p'.repeat(MAX_ALLOW_PREFIX_CHARS + 1)
  assert.equal(allowPrefixFor(atCap, 'unknown'), atCap)
  assert.equal(allowPrefixFor(over, 'unknown'), null)
})

test('a long classed command stores the short class prefix, not the whole line', () => {
  const command = `npm install ${'lodash '.repeat(40)}`
  assert.ok(command.length > MAX_ALLOW_PREFIX_CHARS)
  assert.equal(allowPrefixFor(command, 'dependency'), 'npm install')
})
