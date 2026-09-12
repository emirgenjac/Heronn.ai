import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyCommand } from './classifyCmd.ts'

const map = { npx: 'dependency', npm: 'dependency', pnpm: 'dependency' }

test('npx tsc and other wrappers classify as build, not unknown', () => {
  assert.equal(classifyCommand('npx tsc --noEmit', map), 'build')
  assert.equal(classifyCommand('npx tsc', map), 'build')
  assert.equal(classifyCommand('npx vite build', map), 'build')
  assert.equal(classifyCommand('pnpx tsc', map), 'build')
  assert.equal(classifyCommand('tsc --noEmit', map), 'build')
})

test('npx test runners classify as test', () => {
  assert.equal(classifyCommand('npx vitest run', map), 'test')
  assert.equal(classifyCommand('npx jest', map), 'test')
})

test('npm run test/build classify by script', () => {
  assert.equal(classifyCommand('npm run test', map), 'test')
  assert.equal(classifyCommand('pnpm run build', map), 'build')
  assert.equal(classifyCommand('npm test', map), 'test')
})

test('dependency class still covers install', () => {
  assert.equal(classifyCommand('npm install foo', map), 'dependency')
  assert.equal(classifyCommand('pnpm add bar', map), 'dependency')
})

test('unmapped npx tools stay unknown so they cannot class-auto-allow', () => {
  assert.equal(classifyCommand('npx eslint .', map), 'unknown')
  assert.equal(classifyCommand('python evil.py', map), 'unknown')
})
