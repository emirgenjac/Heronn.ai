export type CursorHookDiag = {
  lastCursorHookAt: number | null
  cursorHookHits: number
  lastCursorLog: string
}

let lastCursorHookAt: number | null = null
let cursorHookHits = 0
let lastCursorLog = 'never'

export function noteCursorHook(log: string): void {
  lastCursorHookAt = Date.now()
  cursorHookHits += 1
  lastCursorLog = log
}

export function getCursorHookDiag(): CursorHookDiag {
  return { lastCursorHookAt, cursorHookHits, lastCursorLog }
}
