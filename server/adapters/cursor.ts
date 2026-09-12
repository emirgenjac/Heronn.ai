import { existsSync } from 'node:fs'
import { basename, dirname, join, parse } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Action, Interrupt } from '../../shared/types.ts'

const ToolInputSchema = z
  .object({
    command: z.string().optional(),
    working_directory: z.string().optional(),
  })
  .passthrough()

export const CursorHookSchema = z
  .object({
    command: z.string().optional(),
    cwd: z.string().optional(),
    sandbox: z.boolean().optional(),
    session_id: z.string().optional(),
    conversation_id: z.string().optional(),
    tool_name: z.string().optional(),
    tool_use_id: z.string().optional(),
    tool_input: z.union([ToolInputSchema, z.string()]).optional(),
    hook_event_name: z.string().optional(),
  })
  .passthrough()

export type CursorHookBody = z.infer<typeof CursorHookSchema>

function gitRoot(cwd: string): string {
  let dir = cwd
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir || parse(dir).root === dir) return cwd
    dir = parent
  }
}

export function extractCommand(body: CursorHookBody): { command: string; cwd: string; sessionId: string; tool: string; id: string } | null {
  let command = body.command?.trim() ?? ''
  if (!command && body.tool_input && typeof body.tool_input === 'object' && typeof body.tool_input.command === 'string') {
    command = body.tool_input.command.trim()
  }
  if (!command && typeof body.tool_input === 'string') {
    try {
      const parsed = JSON.parse(body.tool_input) as { command?: string }
      if (typeof parsed.command === 'string') command = parsed.command.trim()
    } catch {
      /* ignore */
    }
  }
  const cwd =
    body.cwd?.trim() ||
    (body.tool_input && typeof body.tool_input === 'object' && body.tool_input.working_directory) ||
    process.cwd()
  if (!command) return null
  return {
    command,
    cwd,
    sessionId: body.session_id ?? body.conversation_id ?? 'cursor',
    tool: body.tool_name ?? 'Shell',
    id: body.tool_use_id ?? randomUUID(),
  }
}

export function toInterrupt(body: CursorHookBody): Interrupt | null {
  const extracted = extractCommand(body)
  if (!extracted) return null
  const root = gitRoot(extracted.cwd)
  return {
    id: extracted.id,
    ts: Date.now(),
    host: 'cursor',
    sessionId: extracted.sessionId,
    cwd: extracted.cwd,
    repo: basename(root),
    tool: extracted.tool,
    args: { command: extracted.command },
    fingerprint: '',
    title: '',
    detail: extracted.command,
    destructive: false,
  }
}

export function toResponse(action: Action, reason: string): object {
  return {
    permission: action,
    user_message: reason,
    agent_message: reason,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: action,
      permissionDecisionReason: reason,
    },
  }
}
