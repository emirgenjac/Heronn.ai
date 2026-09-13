import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import express from 'express'
import { DecisionSchema, InterruptSchema } from '../shared/types.ts'
import { ClaudeCodeHookSchema, toInterrupt, toResponse } from './adapters/claudeCode.ts'
import {
  CursorHookSchema,
  enforceCursorAction,
  toInterrupt as cursorToInterrupt,
  toResponse as cursorToResponse,
} from './adapters/cursor.ts'
import './db.ts'
import { addRule } from './engine/index.ts'
import { classifyCommand } from './policy/classifyCmd.ts'
import { evaluateCommand } from './policy/evaluate.ts'
import { loadPolicies, recordAllow } from './policy/store.ts'
import { handleInterrupt } from './pipeline.ts'
import { getCursorHookDiag, noteCursorHook } from './hookDiag.ts'
import { addSseClient, broadcast, removeSseClient } from './sse.ts'
import { getSnapshot, loadInterruptsByIds, markDecided } from './snapshot.ts'
import { settle } from './waiters.ts'

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
    const action = await evaluateCommand(interrupt)
    res.json(toResponse(action, `decision: ${action}`))
  } catch (err) {
    console.log(`hook claude-code error=${err instanceof Error ? err.message : 'unknown'}`)
    res.json(toResponse('ask', 'hook error'))
  } finally {
    console.log(`hook claude-code elapsed=${Date.now() - started}ms`)
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
    const body = parsed.data
    const interrupt = cursorToInterrupt(body)
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
    const action = enforceCursorAction(body, await evaluateCommand(interrupt))
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
