import { useRef, type ReactNode } from 'react'
import { DUR_EXPAND, EASE_APPLE, dur, gsap, useGSAP } from '../motion.ts'

export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const shown = useRef(open)

  useGSAP(
    () => {
      const el = wrapRef.current
      if (!el) return
      const was = shown.current
      shown.current = open
      if (was === open) {
        gsap.set(el, { height: open ? 'auto' : 0, overflow: 'hidden' })
        return
      }
      gsap.to(el, {
        height: open ? 'auto' : 0,
        duration: dur(DUR_EXPAND),
        ease: EASE_APPLE,
        overwrite: 'auto',
        onStart: () => {
          el.style.overflow = 'hidden'
        },
        onComplete: () => {
          if (open) el.style.overflow = 'visible'
        },
      })
    },
    { dependencies: [open] },
  )

  return (
    <div ref={wrapRef} className="reveal">
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
