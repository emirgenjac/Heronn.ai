import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import express from 'express'
import { z } from 'zod'
import { DecisionSchema, InterruptSchema } from '../shared/types.ts'
import { ClaudeCodeHookSchema, toInterrupt, toResponse } from './adapters/claudeCode.ts'
import {
  CursorHookSchema,
  isAfterHook,
  toInterrupt as cursorToInterrupt,
  toResponse as cursorToResponse,
} from './adapters/cursor.ts'
import {
  McpHookSchema,
  toInterrupt as mcpToInterrupt,
  toResponse as mcpToResponse,
} from './adapters/mcp.ts'
import './db.ts'
import { addRule, canonicalise, deleteRule, listRules } from './engine/index.ts'
import { classifyCommand } from './policy/classifyCmd.ts'
import { evaluateCommand } from './policy/evaluate.ts'
import { forgetAllow, loadPolicies, recordAllow, recordDeny } from './policy/store.ts'
import { handleInterrupt } from './pipeline.ts'
import { getCursorHookDiag, noteCursorHook } from './hookDiag.ts'
import { addSseClient, broadcast, removeSseClient } from './sse.ts'
import {
  expireOrphanPending,
  getSnapshot,
  latestInterruptForCommand,
  loadInterruptsByIds,
  markDecided,
  queryLogs,
  recordHostAllow,
} from './snapshot.ts'
import { onParkExpire, settle } from './waiters.ts'

const PolicyOpSchema = z.object({
  op: z.enum(['allow', 'deny', 'forget']),
  scope: z.enum(['repo', 'global']),
  repo: z.string().optional(),
  command: z.string().optional(),
  class: z.string().optional(),
  ruleId: z.string().optional(),
  prefix: z.string().optional(),
  fingerprint: z.string().optional(),
})

const LOG_BY = new Set(['blacklist', 'policy', 'rule', 'web', 'host', 'timeout', 'orphan'])
const LOG_ACTION = new Set(['allow', 'deny', 'ask'])
const LOG_HOST = new Set(['claude-code', 'cursor', 'mcp'])

function queryString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim()
  return undefined
}

function queryNumber(value: unknown): number | undefined {
  const raw = queryString(value)
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

onParkExpire((id) => {
  markDecided([id], 'ask', 'timeout', Date.now())
  broadcast()
})
expireOrphanPending()

const app = express()
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/diag', (_req, res) => {
  const snap = getSnapshot()
  res.json({
    ok: true,
    liveHint:
      'Cursor Agent must run in this repo folder. VS Code can host npm run dev but cannot fire .cursor/hooks.json. UI footer must say LIVE.',
    pending: snap.stats.blocked,
    ...getCursorHookDiag(),
  })
})

app.get('/api/groups', (_req, res) => {
  res.json(getSnapshot())
})

app.get('/api/policy', (_req, res) => {
  const policies = loadPolicies()
  res.json({
    machine: policies.machine,
    projects: policies.projects,
    rules: listRules(),
  })
})

app.post('/api/policy', (req, res) => {
  const parsed = PolicyOpSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid policy op' })
    return
  }
  const body = parsed.data
  const command = body.command?.trim()
  const row = command ? latestInterruptForCommand(command) : null
  const repo = body.repo?.trim() || row?.repo || ''
  const fingerprint = body.fingerprint?.trim() || row?.fingerprint || ''
  const destructive = row?.destructive === 1

  if (body.op === 'allow') {
    if (!command) {
      res.status(400).json({ ok: false, error: 'command required' })
      return
    }
    if (body.scope === 'repo' && !repo) {
      res.status(400).json({ ok: false, error: 'repo required' })
      return
    }
    const cls = classifyCommand(command, loadPolicies().classMap)
    recordAllow(repo, command, cls, body.scope)
    if (fingerprint && !destructive) {
      addRule(fingerprint, body.scope === 'repo' ? repo : null, body.scope, 'allow')
    }
    broadcast()
    res.json({ ok: true })
    return
  }

  if (body.op === 'deny') {
    if (!command && !fingerprint) {
      res.status(400).json({ ok: false, error: 'command required' })
      return
    }
    if (command) {
      const cls = classifyCommand(command, loadPolicies().classMap)
      recordDeny(repo, command, cls, body.scope)
    }
    if (fingerprint) {
      addRule(fingerprint, body.scope === 'repo' ? repo || null : null, body.scope, 'deny')
    }
    broadcast()
    res.json({ ok: true })
    return
  }

  if (body.ruleId) deleteRule(body.ruleId)
  forgetAllow({
    scope: body.scope,
    repo: repo || undefined,
    command,
    class: body.class,
    prefix: body.prefix,
  })
  broadcast()
  res.json({ ok: true })
})

app.get('/api/logs', (req, res) => {
  const decidedBy = queryString(req.query.decidedBy)
  const action = queryString(req.query.action)
  const host = queryString(req.query.host)
  if (decidedBy && !LOG_BY.has(decidedBy)) {
    res.status(400).json({ ok: false, error: 'invalid decidedBy' })
    return
  }
  if (action && !LOG_ACTION.has(action)) {
    res.status(400).json({ ok: false, error: 'invalid action' })
    return
  }
  if (host && !LOG_HOST.has(host)) {
    res.status(400).json({ ok: false, error: 'invalid host' })
    return
  }
  const rows = queryLogs({
    q: queryString(req.query.q),
    decidedBy,
    action,
    host,
    from: queryNumber(req.query.from),
    to: queryNumber(req.query.to),
    limit: queryNumber(req.query.limit),
  })
  res.json({ rows })
})

app.get('/api/stream', (req, res) => {
  req.setTimeout(0)
  res.setTimeout(0)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  addSseClient(res)
  req.on('close', () => {
    removeSseClient(res)
  })
})

app.post('/api/decide', (req, res) => {
  const parsed = DecisionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'invalid decision' })
    return
  }
  const decision = parsed.data
  const rows = loadInterruptsByIds(decision.interruptIds)
  const destructive = rows.some((row) => row.destructive === 1)
  markDecided(decision.interruptIds, decision.action, decision.by, Date.now())
  settle(decision.interruptIds, decision.action)
  if (
    decision.createRule &&
    (decision.action === 'allow' || decision.action === 'deny') &&
    !destructive
  ) {
    const first = rows[0]
    if (first) {
      addRule(
        first.fingerprint,
        decision.scope === 'repo' ? first.repo : null,
        decision.scope,
        decision.action,
      )
      if (decision.action === 'allow') {
        let command = ''
        try {
          const args = JSON.parse(first.args) as { command?: unknown }
          if (typeof args.command === 'string') command = args.command
        } catch {
          /* ignore */
        }
        if (command) {
          const cls = classifyCommand(command, loadPolicies().classMap)
          recordAllow(first.repo, command, cls, decision.scope)
        }
      }
    }
  }
  broadcast()
  res.json({ ok: true })
})

app.post('/api/replay', async (req, res) => {
  const speedRaw = req.body?.speed
  const speed = typeof speedRaw === 'number' && speedRaw > 0 ? speedRaw : 1
  const delayMs = 60 / speed
  const path = join(import.meta.dirname, '..', 'fixtures', 'interrupts.jsonl')
  const text = readFileSync(path, 'utf8')
  let count = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = InterruptSchema.safeParse(JSON.parse(line))
      if (!parsed.success) continue
      void handleInterrupt(parsed.data)
    } catch {
      continue
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  res.json({ ok: true, count })
})

app.post('/hook/claude-code', async (req, res) => {
  const started = Date.now()
  try {
    const parsed = ClaudeCodeHookSchema.safeParse(req.body)
    if (!parsed.success) {
      console.log(`hook claude-code unparseable elapsed=${Date.now() - started}ms`)
      res.json(toResponse('ask', 'unparseable hook body'))
      return
    }
    const interrupt = toInterrupt(parsed.data)
    console.log(
      `hook claude-code tool=${interrupt.tool} cwd=${interrupt.cwd} session=${interrupt.sessionId}`,
    )
    req.setTimeout(0)
    res.setTimeout(0)
    if (req.query.hold === '1') {
      void evaluateCommand(interrupt, { hold: true })
      res.json(toResponse('ask', 'parked'))
      return
    }
    const action = await evaluateCommand(interrupt)
    res.json(toResponse(action, `decision: ${action}`))
  } catch (err) {
    console.log(`hook claude-code error=${err instanceof Error ? err.message : 'unknown'}`)
    res.json(toResponse('ask', 'hook error'))
  } finally {
    console.log(`hook claude-code elapsed=${Date.now() - started}ms`)
  }
})

app.post('/hook/mcp', async (req, res) => {
  const started = Date.now()
  try {
    const parsed = McpHookSchema.safeParse(req.body)
    if (!parsed.success) {
      console.log(`hook mcp unparseable elapsed=${Date.now() - started}ms`)
      res.json(mcpToResponse('ask', 'unparseable hook body'))
      return
    }
    const interrupt = mcpToInterrupt(parsed.data)
    console.log(`hook mcp tool=${interrupt.tool} cwd=${interrupt.cwd} session=${interrupt.sessionId}`)
    req.setTimeout(0)
    res.setTimeout(0)
    if (req.query.hold === '1') {
      void evaluateCommand(interrupt, { hold: true })
      res.json(mcpToResponse('ask', 'parked'))
      return
    }
    const action = await evaluateCommand(interrupt)
    res.json(mcpToResponse(action, `decision: ${action}`))
  } catch (err) {
    console.log(`hook mcp error=${err instanceof Error ? err.message : 'unknown'}`)
    res.json(mcpToResponse('ask', 'hook error'))
  } finally {
    console.log(`hook mcp elapsed=${Date.now() - started}ms`)
  }
})

app.post('/hook/cursor', async (req, res) => {
  const started = Date.now()
  try {
    const parsed = CursorHookSchema.safeParse(req.body)
    if (!parsed.success) {
      noteCursorHook('unparseable hook body')
      console.log(`hook cursor unparseable elapsed=${Date.now() - started}ms`)
      const raw =
        req.body && typeof req.body === 'object'
          ? (req.body as { hook_event_name?: string; tool_name?: string; command?: string })
          : {}
      res.json(cursorToResponse(enforceCursorAction(raw, 'ask'), 'unparseable hook body'))
      return
    }
    if (isAfterHook(parsed.data)) {
      const after = cursorToInterrupt(parsed.data)
      if (after) {
        const canon = { ...after, ...canonicalise(after) }
        recordHostAllow(canon)
        broadcast()
        noteCursorHook(`after-allow ${canon.detail}`)
        console.log(`hook cursor after-allow cmd=${canon.detail}`)
      }
      res.json({})
      return
    }
    const interrupt = cursorToInterrupt(parsed.data)
    if (!interrupt) {
      noteCursorHook('missing command or path')
      console.log(`hook cursor missing command elapsed=${Date.now() - started}ms`)
      res.json(cursorToResponse(enforceCursorAction(body, 'ask'), 'unparseable hook body'))
      return
    }
    noteCursorHook(`${interrupt.tool} ${interrupt.cwd}`)
    console.log(
      `hook cursor tool=${interrupt.tool} cwd=${interrupt.cwd} session=${interrupt.sessionId}`,
    )
    req.setTimeout(0)
    res.setTimeout(0)
    if (req.query.hold === '1') {
      void evaluateCommand(interrupt, { hold: true })
      res.json(cursorToResponse('ask', 'parked'))
      return
    }
    const action = await evaluateCommand(interrupt)
    res.json(cursorToResponse(action, `decision: ${action}`))
  } catch (err) {
    noteCursorHook(err instanceof Error ? err.message : 'hook error')
    console.log(`hook cursor error=${err instanceof Error ? err.message : 'unknown'}`)
    res.json(cursorToResponse('ask', 'hook error'))
  } finally {
    console.log(`hook cursor elapsed=${Date.now() - started}ms`)
  }
})

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path === '/hook/cursor') {
    noteCursorHook('unparseable hook body')
    console.log('hook cursor unparseable')
    res.json(cursorToResponse('ask', 'unparseable hook body'))
    return
  }
  if (req.path === '/hook/mcp') {
    console.log('hook mcp unparseable')
    res.json(mcpToResponse('ask', 'unparseable hook body'))
    return
  }
  if (req.path.startsWith('/hook/')) {
    console.log('hook claude-code unparseable')
    res.json(toResponse('ask', 'unparseable hook body'))
    return
  }
  next(err)
})

const server = app.listen(7777, () => {
  console.log('server listening on http://localhost:7777')
})
server.requestTimeout = 0
server.headersTimeout = 0
server.timeout = 0
