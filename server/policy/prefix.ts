export function normalizeCmd(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ')
}

export function startsWithPrefix(cmd: string, prefix: string): boolean {
  const c = normalizeCmd(cmd)
  const p = normalizeCmd(prefix)
  if (!p) return false
  if (c === p || c.startsWith(`${p} `)) return true
  const last = p[p.length - 1]
  return Boolean(last && !/[A-Za-z0-9]/.test(last) && c.startsWith(p))
}

export function longestPrefix(cmd: string, prefixes: string[]): string | null {
  let best: string | null = null
  for (const prefix of prefixes) {
    if (!startsWithPrefix(cmd, prefix)) continue
    if (best === null || normalizeCmd(prefix).length > normalizeCmd(best).length) best = prefix
  }
  return best
}
