import { z } from 'zod'

export type Host = 'claude-code' | 'cursor' | 'mcp'
export type Action = 'allow' | 'deny' | 'ask'

export interface Interrupt {
  id: string; ts: number; host: Host; sessionId: string
  cwd: string; repo: string
  tool: string; args: Record<string, unknown>
  fingerprint: string; title: string; detail: string; destructive: boolean
}
export interface Rule {
  id: string; fingerprint: string
  scope: 'repo' | 'global'; repo: string | null
  action: 'allow' | 'deny'; hits: number; createdAt: number
}
export interface Decision {
  interruptIds: string[]; action: Action
  createRule: boolean; scope: 'repo' | 'global'; by: string
}
export interface Group {
  fingerprint: string; title: string; detail: string; destructive: boolean
  count: number; interruptIds: string[]; oldestTs: number
}
export interface Stats {
  blocked: number; oldestMs: number
  autoResolved: number; total: number; autonomy: number
}

export const HostSchema = z.enum(['claude-code', 'cursor', 'mcp'])
export const ActionSchema = z.enum(['allow', 'deny', 'ask'])

export const InterruptSchema = z.object({
  id: z.string(),
  ts: z.number(),
  host: HostSchema,
  sessionId: z.string(),
  cwd: z.string(),
  repo: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  fingerprint: z.string(),
  title: z.string(),
  detail: z.string(),
  destructive: z.boolean(),
})

export const RuleSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  scope: z.enum(['repo', 'global']),
  repo: z.string().nullable(),
  action: z.enum(['allow', 'deny']),
  hits: z.number(),
  createdAt: z.number(),
})

export const DecisionSchema = z.object({
  interruptIds: z.array(z.string()),
  action: ActionSchema,
  createRule: z.boolean(),
  scope: z.enum(['repo', 'global']),
  by: z.string(),
})

export const GroupSchema = z.object({
  fingerprint: z.string(),
  title: z.string(),
  detail: z.string(),
  destructive: z.boolean(),
  count: z.number(),
  interruptIds: z.array(z.string()),
  oldestTs: z.number(),
})

export const StatsSchema = z.object({
  blocked: z.number(),
  oldestMs: z.number(),
  autoResolved: z.number(),
  total: z.number(),
  autonomy: z.number(),
})
