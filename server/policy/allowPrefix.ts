import { neverAutoAllow, stablePrefix, type CommandClass } from './classifyCmd.ts'
import { normalizeCmd } from './prefix.ts'

/**
 * Longest prefix already saved in policies.json is about 60 characters.
 * 160 still fits one typed command with a path and flags.
 * A pasted script does not fit, and must not become a match key.
 */
export const MAX_ALLOW_PREFIX_CHARS = 160

export function allowPrefixFor(command: string, cls: CommandClass): string | null {
  if (/[\r\n]/.test(command)) return null
  const prefix = neverAutoAllow(cls) ? normalizeCmd(command) : stablePrefix(command)
  if (!prefix || prefix.length > MAX_ALLOW_PREFIX_CHARS) return null
  return prefix
}
