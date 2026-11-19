import { appendFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.json'])

function stateDir() {
  return process.env.HERONN_REVIEW_DIR ?? join(tmpdir(), 'heronn-code-review')
}

function stateFile(conversationId) {
  const safe = String(conversationId || 'session').replace(/[^a-zA-Z0-9._-]/g, '_')
  return join(stateDir(), `${safe}.txt`)
}

function extension(filePath) {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot === -1 ? '' : base.slice(dot).toLowerCase()
}

export function isReviewable(filePath) {
  if (!filePath) return false
  const normalized = filePath.replace(/\\/g, '/')
  if (normalized.includes('/node_modules/')) return false
  const base = normalized.split('/').pop() ?? ''
  if (base === 'package-lock.json') return false
  return CODE_EXT.has(extension(normalized))
}

export function rememberEdit(conversationId, filePath) {
  if (!isReviewable(filePath)) return
  const file = stateFile(conversationId)
  mkdirSync(stateDir(), { recursive: true })
  appendFileSync(file, `${filePath}\n`, 'utf8')
}

export function takeEdits(conversationId) {
  const file = stateFile(conversationId)
  let raw = ''
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return []
  }
  rmSync(file, { force: true })
  return [...new Set(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
}

export function reviewFollowup(input) {
  if (input.status !== 'completed') return {}
  const files = takeEdits(input.conversation_id)
  if (files.length === 0) return {}
  const list = files.map((file) => `- ${file}`).join('\n')
  return {
    followup_message: [
      'Review the code you just wrote. Review only these files:',
      list,
      'Look for bugs, missing tests for the change, and security mistakes.',
      'Lead with the findings, highest severity first.',
      'Fix a definite bug. Do not start new work.',
      'If the change is sound, say so in one sentence.',
    ].join('\n'),
  }
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('/.cursor/hooks/review.mjs')

if (isDirectRun) {
  try {
    const raw = await readStdin()
    const input = raw.trim() ? JSON.parse(raw) : {}
    const event = input.hook_event_name ?? ''
    if (event === 'afterFileEdit') {
      rememberEdit(input.conversation_id, input.file_path)
      process.stdout.write('{}\n')
    } else if (event === 'stop') {
      process.stdout.write(`${JSON.stringify(reviewFollowup(input))}\n`)
    } else {
      process.stdout.write('{}\n')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`code review hook failed: ${message}`)
    process.stdout.write('{}\n')
  }
}
