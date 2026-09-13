import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Action, Interrupt } from '../../shared/types.ts'
import { canonicalise } from '../engine/canonicalise.ts'
import { addRule, deleteRule } from '../engine/rules.ts'
import { getSnapshot, markDecided } from '../snapshot.ts'
import { settle } from '../waiters.ts'
import { evaluateCommand } from './evaluate.ts'

const cwd = process.cwd()
const repo = 'Adria-Hack-AI-Project'

function irq(command: string): Interrupt {
  return {
    id: `eval-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: Date.now(),
    host: 'cursor',
    sessionId: 'evaluate-test',
    cwd,
    repo,
    tool: 'Shell',
    args: { command },
    fingerprint: '',
    title: '',
    detail: command,
    destructive: false,
  }
}

async function waitForCard(id: string, ms = 1000): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const snap = getSnapshot()
    if (snap.groups.some((g) => g.interruptIds.includes(id))) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return false
}

async function decideParked(id: string, pending: Promise<Action>, action: Action = 'deny'): Promise<void> {
  assert.equal(await waitForCard(id), true, 'expected a pending UI card')
  settle([id], action)
  markDecided([id], action, 'evaluate-test', Date.now())
  assert.equal(await pending, action)
}

test('blacklist force-push parks a card instead of auto-deny', async () => {
  const i = irq('git push --force origin main')
  const pending = evaluateCommand(i)
  const raced = await Promise.race([
    pending.then((action) => action),
    new Promise<string>((r) => setTimeout(() => r('still-parked'), 40)),
  ])
  assert.equal(raced, 'still-parked')
  await decideParked(i.id, pending)
})

test('rm -rf parks a card instead of auto-deny', async () => {
  const i = irq('rm -rf /')
  await decideParked(i.id, evaluateCommand(i))
})

test('fingerprint deny rule parks instead of auto-deny', async () => {
  const i = irq('python evaluate-test-deny-rule.py')
  const canon = { ...i, ...canonicalise(i) }
  const rule = addRule(canon.fingerprint, repo, 'repo', 'deny')
  try {
    await decideParked(canon.id, evaluateCommand(canon))
  } finally {
    await new Promise((r) => setImmediate(r))
    deleteRule(rule.id)
  }
})

test('npm install still auto-allows', async () => {
  const action = await evaluateCommand(irq('npm install lodash'))
  assert.equal(action, 'allow')
})
