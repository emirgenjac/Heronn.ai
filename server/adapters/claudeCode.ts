import { existsSync } from 'node:fs'
import { basename, dirname, join, parse } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Action, Interrupt } from '../../shared/types.ts'

export const ClaudeCodeHookSchema = z
  .object({
    session_id: z.string().optional().default('claude'),
    cwd: z.string().optional().default(() => process.cwd()),
    tool_name: z.string(),
    tool_input: z.record(z.string(), z.unknown()).optional().default({}),
    tool_use_id: z.string().optional(),
    permission_mode: z.string().optional(),
    hook_event_name: z.string().optional(),
  })
  .passthrough()

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

function interruptDetail(body: ClaudeCodeHookBody): string {
  const args = body.tool_input
  if (typeof args.command === 'string' && args.command.trim()) return args.command.trim()
  for (const key of ['file_path', 'path', 'file', 'filepath', 'target', 'filename'] as const) {
    const v = args[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return body.tool_name
}

export function toInterrupt(body: ClaudeCodeHookBody): Interrupt {
  const cwd = body.cwd || process.cwd()
  const root = gitRoot(cwd)
  return {
    id: body.tool_use_id ?? randomUUID(),
    ts: Date.now(),
    host: 'claude-code',
    sessionId: body.session_id || 'claude',
    cwd,
    repo: basename(root),
    tool: body.tool_name,
    args: body.tool_input,
    fingerprint: '',
    title: '',
    detail: interruptDetail(body),
    destructive: false,
  }
}

export function toResponse(action: Action, reason: string, hookEventName = 'PreToolUse'): object {
  return {
    hookSpecificOutput: {
      hookEventName,
      permissionDecision: action,
      permissionDecisionReason: reason,
    },
  }
}
