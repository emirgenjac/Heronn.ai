import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ClaudeCodeHookSchema, toInterrupt, toResponse } from './claudeCode.ts'

test('Bash command becomes an interrupt', () => {
  const parsed = ClaudeCodeHookSchema.parse({
    session_id: 's',
    cwd: process.cwd(),
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'whoami' },
  })
  const i = toInterrupt(parsed)
  assert.equal(i.host, 'claude-code')
  assert.equal(i.tool, 'Bash')
  assert.equal(i.args.command, 'whoami')
  assert.equal(i.detail, 'whoami')
})

test('Write file_path becomes an interrupt', () => {
  const parsed = ClaudeCodeHookSchema.parse({
    session_id: 's',
    cwd: process.cwd(),
    tool_name: 'Write',
    tool_input: { file_path: 'README.md', content: 'x' },
  })
  const i = toInterrupt(parsed)
  assert.equal(i.tool, 'Write')
  assert.equal(i.detail, 'README.md')
})

test('missing session_id still parses', () => {
  const parsed = ClaudeCodeHookSchema.parse({
    tool_name: 'Bash',
    tool_input: { command: 'pwd' },
  })
  const i = toInterrupt(parsed)
  assert.equal(i.sessionId, 'claude')
  assert.equal(i.detail, 'pwd')
})

test('toResponse uses the hook event name', () => {
  const json = toResponse('ask', 'offline', 'PreToolUse')
  assert.deepEqual(json, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: 'offline',
    },
  })
})
