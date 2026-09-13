export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export function formatAgo(ts: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - ts) / 1000))
  if (sec < 60) return `${sec}s ago`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

export function formatHost(host: string): string {
  if (host === 'claude-code') return 'Claude Code'
  if (host === 'cursor') return 'Cursor'
  if (host === 'mcp') return 'MCP'
  return host
}

export function formatPct(autonomy: number): number {
  return Math.round(autonomy * 100)
}

export function formatStamp(ts: number | null | undefined, now: number): string {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return '—'
  return `${formatAgo(ts, now)} · ${new Date(ts).toLocaleString()}`
}

export function shortLabel(text: string, max = 80): string {
  const one = text.replace(/\s+/g, ' ').trim()
  if (one.length <= max) return one
  return `${one.slice(0, max - 1)}…`
}

export function parseArgs(args: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(args) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  return {}
}

export function commandOfLog(row: { args: string; detail: string; title: string }): string {
  const command = parseArgs(row.args).command
  if (typeof command === 'string' && command.trim()) return command
  return row.detail || row.title
}
