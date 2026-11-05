import type { Action } from './types.ts'

/** A destructive card can be allowed once. It cannot be saved for this project or this PC. */
export function canRememberScope(destructive: boolean): boolean {
  return !destructive
}

/** Rule flag the queue sends. Allow itself is a separate field and stays available. */
export function queueCreateRule(
  action: Action,
  destructive: boolean,
  rememberProject: boolean,
  rememberMachine: boolean,
): boolean {
  if (!canRememberScope(destructive)) return false
  return action === 'allow' && (rememberProject || rememberMachine)
}

/** Daemon-side guard. A client that asks to remember a destructive row is ignored. */
export function daemonMayRemember(createRule: boolean, action: Action, destructive: boolean): boolean {
  if (!canRememberScope(destructive)) return false
  return createRule && (action === 'allow' || action === 'deny')
}
