import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canRememberScope, daemonMayRemember, queueCreateRule } from './queueDecision.ts'

test('destructive card can be allowed once and cannot be remembered', () => {
  assert.equal(canRememberScope(true), false)
  assert.equal(queueCreateRule('allow', true, true, true), false)
  assert.equal(queueCreateRule('deny', true, true, false), false)
  assert.equal(daemonMayRemember(true, 'allow', true), false)
})

test('ordinary allow is remembered only when a scope box is on', () => {
  assert.equal(canRememberScope(false), true)
  assert.equal(queueCreateRule('allow', false, true, false), true)
  assert.equal(queueCreateRule('allow', false, false, true), true)
  assert.equal(queueCreateRule('allow', false, false, false), false)
  assert.equal(queueCreateRule('deny', false, true, false), false)
})

test('daemon still drops a remember request for a destructive row', () => {
  assert.equal(daemonMayRemember(true, 'allow', true), false)
  assert.equal(daemonMayRemember(true, 'deny', true), false)
  assert.equal(daemonMayRemember(true, 'allow', false), true)
  assert.equal(daemonMayRemember(false, 'allow', false), false)
})
