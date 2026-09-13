import { existsSync } from 'node:fs'
import { basename, dirname, join, parse } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Action, Interrupt } from '../../shared/types.ts'

const PATH_KEYS = ['file_path', 'path', 'file', 'filepath', 'target', 'filename'] as const

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

function toolInputRecord(body: CursorHookBody): Record<string, unknown> {
  if (body.tool_input && typeof body.tool_input === 'object') return { ...body.tool_input }
  if (typeof body.tool_input === 'string') {
    try {
      const parsed = JSON.parse(body.tool_input) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) }
      }
    } catch {
      /* ignore */
    }
  }
  return {}
}

function pickPath(args: Record<string, unknown>): string {
  for (const key of PATH_KEYS) {
    const v = args[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function isShellTool(tool: string): boolean {
  const t = tool.toLowerCase()
  return t === 'shell' || t === 'bash'
}

export function askIsEnforced(body: CursorHookBody): boolean {
  const event = body.hook_event_name ?? ''
  if (event === 'beforeShellExecution') return true
  if (event === 'preToolUse' || event === 'beforeMCPExecution') return false
  return isShellTool(body.tool_name ?? '') || Boolean(body.command?.trim())
}

export function enforceCursorAction(body: CursorHookBody, action: Action): Action {
  if (action !== 'ask') return action
  return askIsEnforced(body) ? 'ask' : 'deny'
}

export function toInterrupt(body: CursorHookBody): Interrupt | null {
  const input = toolInputRecord(body)
  const command =
    body.command?.trim() || (typeof input.command === 'string' ? input.command.trim() : '')
  const args: Record<string, unknown> = command ? { ...input, command } : { ...input }
  const filePath = pickPath(args)
  const event = body.hook_event_name ?? ''
  const tool = body.tool_name?.trim() || (command ? 'Shell' : event === 'beforeMCPExecution' ? 'mcp' : '')
  if (!command && !filePath && event !== 'beforeMCPExecution') return null

  const cwd =
    body.cwd?.trim() ||
    (typeof input.working_directory === 'string' ? input.working_directory : '') ||
    process.cwd()
  const root = gitRoot(cwd)
  const detail = command || filePath || tool || 'tool'

  return {
    id: body.tool_use_id ?? randomUUID(),
    ts: Date.now(),
    host: 'cursor',
    sessionId: body.session_id ?? body.conversation_id ?? 'cursor',
    cwd,
    repo: basename(root),
    tool: tool || 'Shell',
    args,
    fingerprint: '',
    title: '',
    detail,
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
