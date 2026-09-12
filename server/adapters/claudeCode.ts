import { existsSync } from 'node:fs'
import { basename, dirname, join, parse } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Action, Interrupt } from '../../shared/types.ts'

export const ClaudeCodeHookSchema = z.object({
  session_id: z.string(),
  cwd: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()).optional().default({}),
  tool_use_id: z.string().optional(),
  permission_mode: z.string().optional(),
  hook_event_name: z.string().optional(),
})

export type ClaudeCodeHookBody = z.infer<typeof ClaudeCodeHookSchema>

function gitRoot(cwd: string): string {
  let dir = cwd
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir || parse(dir).root === dir) return cwd
    dir = parent
  }
}

export function toInterrupt(body: ClaudeCodeHookBody): Interrupt {
  const root = gitRoot(body.cwd)
  return {
    id: body.tool_use_id ?? randomUUID(),
    ts: Date.now(),
    host: 'claude-code',
    sessionId: body.session_id,
    cwd: body.cwd,
    repo: basename(root),
    tool: body.tool_name,
    args: body.tool_input,
    fingerprint: '',
    title: '',
    detail: '',
    destructive: false,
  }
}

export function toResponse(action: Action, reason: string): object {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: action,
      permissionDecisionReason: reason,
    },
  }
}
