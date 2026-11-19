import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { isReviewable, rememberEdit, reviewFollowup, takeEdits } from './review.mjs'

const dir = mkdtempSync(join(tmpdir(), 'heronn-review-test-'))

test('source files are reviewable and lockfiles are not', () => {
  assert.equal(isReviewable('C:/repo/server/index.ts'), true)
  assert.equal(isReviewable('C:/repo/web/src/App.css'), true)
  assert.equal(isReviewable('C:/repo/package-lock.json'), false)
  assert.equal(isReviewable('C:/repo/node_modules/vite/index.js'), false)
  assert.equal(isReviewable('C:/repo/README.md'), false)
})

test('a completed stop reviews the files written in that conversation', () => {
  process.env.HERONN_REVIEW_DIR = dir
  rememberEdit('conv-1', 'C:/repo/server/index.ts')
  rememberEdit('conv-1', 'C:/repo/server/index.ts')
  rememberEdit('conv-1', 'C:/repo/README.md')
  const response = reviewFollowup({ status: 'completed', conversation_id: 'conv-1' })
  assert.match(response.followup_message, /server\/index\.ts/)
  assert.doesNotMatch(response.followup_message, /README\.md/)
  assert.equal(takeEdits('conv-1').length, 0)
})

test('an aborted stop does not ask for a review', () => {
  process.env.HERONN_REVIEW_DIR = dir
  rememberEdit('conv-2', 'C:/repo/server/index.ts')
  assert.deepEqual(reviewFollowup({ status: 'aborted', conversation_id: 'conv-2' }), {})
  assert.deepEqual(takeEdits('conv-2'), ['C:/repo/server/index.ts'])
})

function runHook(input) {
  const child = spawn(process.execPath, ['.cursor/hooks/review.mjs'], {
    env: { ...process.env, HERONN_REVIEW_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stdin.end(JSON.stringify(input))
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve({ code: code ?? -1, stdout }))
  })
}

test('the hook records an edit and asks for a review when the agent stops', async () => {
  const edited = await runHook({
    hook_event_name: 'afterFileEdit',
    conversation_id: 'conv-3',
    file_path: 'C:/repo/web/src/App.tsx',
  })
  assert.equal(edited.code, 0)
  assert.deepEqual(JSON.parse(edited.stdout), {})

  const stopped = await runHook({
    hook_event_name: 'stop',
    status: 'completed',
    conversation_id: 'conv-3',
    loop_count: 0,
  })
  assert.equal(stopped.code, 0)
  const body = JSON.parse(stopped.stdout)
  assert.match(body.followup_message, /App\.tsx/)
})

test.after(() => {
  rmSync(dir, { recursive: true, force: true })
})
