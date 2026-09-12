import type { Action } from '../shared/types.ts'

const waiters = new Map<string, (action: Action) => void>()

type ExpireHandler = (id: string) => void
let expireHandler: ExpireHandler | null = null

export function onParkExpire(fn: ExpireHandler): void {
  expireHandler = fn
}

export function liveWaiterIds(): string[] {
  return [...waiters.keys()]
}

export function park(id: string, timeoutMs = 540_000): Promise<Action> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (waiters.get(id) !== onSettle) return
      waiters.delete(id)
      expireHandler?.(id)
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
