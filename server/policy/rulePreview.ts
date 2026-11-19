import { classifyCommand, neverAutoAllow, stablePrefix, type CommandClass } from './classifyCmd.ts'
import { normalizeCmd } from './prefix.ts'

export type RememberScope = 'repo' | 'global'

function where(scope: RememberScope, repo: string): string {
  if (scope === 'global') return 'this PC'
  return repo ? `this project (${repo})` : 'this project'
}

export function rulePreview(
  command: string,
  scope: RememberScope,
  repo: string,
  classMap: Record<string, string> = {},
): string {
  const place = where(scope, repo)
  const text = command.trim()
  if (!text) return `Saves a fingerprint rule for ${place}.`
  const cls: CommandClass = classifyCommand(text, classMap)
  if (neverAutoAllow(cls)) return `Saves class ${cls} for ${place} as this command only.`
  return `Saves class ${cls} for ${place}, prefix ${stablePrefix(text)}.`
}
