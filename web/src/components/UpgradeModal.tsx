import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'

const CLOUD_COVERS = ['Phone approve', 'Multi-device compatibility', 'Hosted control plane']

const ENTERPRISE_COVERS = [
  'Fail-closed hooks',
  'Global blacklist — destructive never auto-learns',
  'Command classes, not one-off fingerprints',
  '9-minute park + live approve UI',
  'Cursor, Claude Code, MCP',
  'Boss RBAC (org → team → project → agent)',
  'Policy pack import / export',
  'On-prem Compose, air-gap, no cloud control plane',
  'Bring-your-own model stack',
  'Audit trail',
  'Linux / Windows / macOS',
]

type Plan = 'cloud' | 'enterprise'

type UpgradeModalProps = {
  open: boolean
  onClose: () => void
  onToast: (text: string) => void
}

export function UpgradeModal({ open, onClose, onToast }: UpgradeModalProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const cloudRef = useRef<HTMLElement>(null)
  const enterpriseRef = useRef<HTMLElement>(null)
  const [plan, setPlan] = useState<Plan>('cloud')
  const [stageHeight, setStageHeight] = useState(0)
  const [animateStage, setAnimateStage] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')

  useEffect(() => {
    if (open) setPlan('cloud')
    else setAnimateStage(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!open) return
    const active = plan === 'cloud' ? cloudRef.current : enterpriseRef.current
    if (!active) return
    const measure = () => setStageHeight(active.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(active)
    const frame = requestAnimationFrame(() => setAnimateStage(true))
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [open, plan])

  if (!open) return null

  function onStart() {
    onToast('Demo only — billing is not wired')
  }

  function onContact(e: FormEvent) {
    e.preventDefault()
    setName('')
    setEmail('')
    setCompany('')
    onToast("We'll reach out")
    onClose()
  }

  const isCloud = plan === 'cloud'

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal${isCloud ? '' : ' wide'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-top">
          <h2 id={titleId}>Upgrade</h2>
          <button ref={closeRef} className="btn header-btn" type="button" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <div className="plan-toggle" role="tablist" aria-label="Plan">
          <button
            className={isCloud ? 'on' : ''}
            type="button"
            role="tab"
            aria-selected={isCloud}
            onClick={() => setPlan('cloud')}
          >
            Cloud
          </button>
          <button
            className={isCloud ? '' : 'on'}
            type="button"
            role="tab"
            aria-selected={!isCloud}
            onClick={() => setPlan('enterprise')}
          >
            Enterprise
          </button>
        </div>

        <div
          className={`plan-stage${animateStage ? ' anim' : ''}`}
          style={stageHeight > 0 ? { height: stageHeight } : undefined}
        >
          <article
            ref={cloudRef}
            className={`plan-card plan-slide${isCloud ? ' on' : ''}`}
            aria-hidden={!isCloud}
            inert={!isCloud ? true : undefined}
          >
            <p className="plan-kicker">Cloud</p>
            <p className="plan-price">
              $5 <span>/ month / agent</span>
            </p>
            <p className="plan-pitch">Approve from your phone. Same daemon on laptop and phone — multi-device.</p>
            <ul className="plan-list">
              {CLOUD_COVERS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <button className="btn plan-cta" type="button" onClick={onStart} tabIndex={isCloud ? 0 : -1}>
              Start
            </button>
          </article>

          <article
            ref={enterpriseRef}
            className={`plan-card plan-slide plan-enterprise${isCloud ? '' : ' on'}`}
            aria-hidden={isCloud}
            inert={isCloud ? true : undefined}
          >
            <div className="plan-copy">
              <p className="plan-kicker">Enterprise</p>
              <p className="plan-price">Contact</p>
              <p className="plan-pitch">Everything we cover, on your network.</p>
              <ul className="plan-list">
                {ENTERPRISE_COVERS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <form className="contact-form" onSubmit={onContact}>
              <label>
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  name="name"
                  autoComplete="name"
                  required={plan === 'enterprise'}
                  tabIndex={isCloud ? -1 : 0}
                />
              </label>
              <label>
                Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required={plan === 'enterprise'}
                  tabIndex={isCloud ? -1 : 0}
                />
              </label>
              <label>
                Company
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  name="company"
                  autoComplete="organization"
                  required={plan === 'enterprise'}
                  tabIndex={isCloud ? -1 : 0}
                />
              </label>
              <button className="btn plan-cta" type="submit" tabIndex={isCloud ? -1 : 0}>
                Contact
              </button>
            </form>
          </article>
        </div>
      </div>
    </div>
  )
}
