import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enforceCursorAction, toInterrupt } from './cursor.ts'

test('beforeShellExecution still maps a command', () => {
  const i = toInterrupt({ command: 'whoami', cwd: process.cwd(), hook_event_name: 'beforeShellExecution' })
  assert.ok(i)
  assert.equal(i.tool, 'Shell')
  assert.equal(i.args.command, 'whoami')
  assert.equal(i.detail, 'whoami')
})

test('Write with path becomes an interrupt', () => {
  const i = toInterrupt({
    hook_event_name: 'preToolUse',
    tool_name: 'Write',
    cwd: process.cwd(),
    tool_input: { path: 'server/index.ts', contents: 'x' },
  })
  assert.ok(i)
  assert.equal(i.tool, 'Write')
  assert.equal(i.args.path, 'server/index.ts')
  assert.equal(i.detail, 'server/index.ts')
})

test('Write with file_path becomes an interrupt', () => {
  const i = toInterrupt({
    hook_event_name: 'preToolUse',
    tool_name: 'Write',
    cwd: process.cwd(),
    tool_input: { file_path: 'web/src/App.tsx', content: 'x' },
  })
  assert.ok(i)
  assert.equal(i.args.file_path, 'web/src/App.tsx')
  assert.equal(i.detail, 'web/src/App.tsx')
})

test('StrReplace and Delete keep their paths', () => {
  const edit = toInterrupt({
    hook_event_name: 'preToolUse',
    tool_name: 'StrReplace',
    cwd: process.cwd(),
    tool_input: { path: 'README.md', old_string: 'a', new_string: 'b' },
  })
  const del = toInterrupt({
    hook_event_name: 'preToolUse',
    tool_name: 'Delete',
    cwd: process.cwd(),
    tool_input: { path: 'tmp.txt' },
  })
  assert.equal(edit?.tool, 'StrReplace')
  assert.equal(edit?.detail, 'README.md')
  assert.equal(del?.tool, 'Delete')
  assert.equal(del?.detail, 'tmp.txt')
})

test('Read-like bodies with no command or path are ignored', () => {
  assert.equal(
    toInterrupt({ hook_event_name: 'preToolUse', tool_name: 'Read', cwd: process.cwd(), tool_input: {} }),
    null,
  )
})

test('preToolUse ask is denied because Cursor does not enforce ask', () => {
  const body = { hook_event_name: 'preToolUse', tool_name: 'Write' }
  assert.equal(enforceCursorAction(body, 'ask'), 'deny')
  assert.equal(enforceCursorAction(body, 'allow'), 'allow')
})

test('beforeShellExecution still allows ask', () => {
  const body = { hook_event_name: 'beforeShellExecution', command: 'ls' }
  assert.equal(enforceCursorAction(body, 'ask'), 'ask')
})

test('beforeMCPExecution parks even without a path', () => {
  const i = toInterrupt({
    hook_event_name: 'beforeMCPExecution',
    tool_name: 'browser',
    cwd: process.cwd(),
    tool_input: { url: 'https://example.com' },
  })
  assert.ok(i)
  assert.equal(i.tool, 'browser')
  assert.equal(enforceCursorAction({ hook_event_name: 'beforeMCPExecution' }, 'ask'), 'deny')
})
