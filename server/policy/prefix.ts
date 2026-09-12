export function normalizeCmd(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ')
}

export function matchesNormalizedPrefix(cmd: string, prefix: string): boolean {
  if (!prefix) return false
  if (cmd === prefix || cmd.startsWith(`${prefix} `)) return true
  const last = prefix[prefix.length - 1]
  return Boolean(last && !/[A-Za-z0-9]/.test(last) && cmd.startsWith(prefix))
}

export function startsWithPrefix(cmd: string, prefix: string): boolean {
  return matchesNormalizedPrefix(normalizeCmd(cmd), normalizeCmd(prefix))
}

export function longestPrefix(cmd: string, prefixes: string[]): string | null {
  let best: string | null = null
  for (const prefix of prefixes) {
    if (!startsWithPrefix(cmd, prefix)) continue
    if (best === null || normalizeCmd(prefix).length > normalizeCmd(best).length) best = prefix
  }
  return best
}
