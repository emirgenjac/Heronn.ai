import { formatHost } from '../format.ts'

function CursorMark() {
  return <img src="/cursor.webp" alt="" />
}

function ClaudeMark() {
  return <img src="/claude.png" alt="" />
}

function AgentMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.2" y="5" width="9.6" height="8.2" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6.3" cy="9" r="1" fill="currentColor" />
      <circle cx="9.7" cy="9" r="1" fill="currentColor" />
      <path d="M8 2.2v2.2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="1.8" r="0.9" fill="currentColor" />
    </svg>
  )
}

function iconFor(host: string) {
  if (host === 'cursor') return <CursorMark />
  if (host === 'claude-code') return <ClaudeMark />
  return <AgentMark />
}

export function HostMark({ host }: { host?: string }) {
  const key = host?.trim() || ''
  const label = key ? formatHost(key) : 'Agent'
  return (
    <span className={`host-mark host-${key || 'agent'}`} title={label} aria-label={label}>
      {iconFor(key)}
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function HostMarks({ hosts }: { hosts: string[] }) {
  const unique: string[] = []
  for (const host of hosts) {
    const key = host?.trim() || ''
    if (!unique.includes(key)) unique.push(key)
  }
  if (unique.length === 0) return <HostMark />
  return (
    <span className="host-marks">
      {unique.map((host) => (
        <HostMark key={host || 'agent'} host={host} />
      ))}
    </span>
  )
}
