import type { ReactNode } from 'react'

export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`reveal${open ? ' open' : ''}`}>
      <div className="reveal-inner">{children}</div>
    </div>
  )
}

export type KvItem = {
  label: string
  value: string
  mono?: boolean
}

export function Kv({ items }: { items: KvItem[] }) {
  return (
    <dl className="kv">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.mono ? 'mono' : undefined}>{item.value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-block">
      <div className="detail-block-label">{label}</div>
      {children}
    </div>
  )
}
