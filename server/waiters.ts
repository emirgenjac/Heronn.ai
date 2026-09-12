import type { Action } from '../shared/types.ts'

const waiters = new Map<string, (action: Action) => void>()

export function park(id: string, timeoutMs = 540_000): Promise<Action> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (waiters.get(id) !== onSettle) return
      waiters.delete(id)
      resolve('ask')
    }, timeoutMs)

    function onSettle(action: Action) {
      clearTimeout(timer)
      waiters.delete(id)
      resolve(action)
    }

    waiters.set(id, onSettle)
  })
}

export function settle(ids: string[], action: Action): void {
  for (const id of ids) {
    waiters.get(id)?.(action)
  }
}
