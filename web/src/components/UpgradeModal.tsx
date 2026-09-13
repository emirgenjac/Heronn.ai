import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { DUR_EXPAND, DUR_FADE, EASE_APPLE, dur, gsap, useGSAP } from '../motion.ts'

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
  const modalRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const cloudRef = useRef<HTMLElement>(null)
  const enterpriseRef = useRef<HTMLElement>(null)
  const shownPlan = useRef<Plan | null>(null)
  const [plan, setPlan] = useState<Plan>('cloud')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')

  useEffect(() => {
    if (!open) {
      setPlan('cloud')
      shownPlan.current = null
    }
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

  const isCloud = plan === 'cloud'

  useGSAP(
    () => {
      if (!open) return
      const modal = modalRef.current
      const stage = stageRef.current
      const cloud = cloudRef.current
      const enterprise = enterpriseRef.current
      const active = isCloud ? cloud : enterprise
      const idle = isCloud ? enterprise : cloud
      if (!modal || !stage || !active || !idle) return

      const width = Math.min(isCloud ? 440 : 760, window.innerWidth - 32)
      const height = active.offsetHeight
      const was = shownPlan.current
      shownPlan.current = plan

      if (was === plan || was === null) {
        gsap.set(modal, { width })
        gsap.set(stage, { height })
        gsap.set(active, { autoAlpha: 1, y: 0 })
        gsap.set(idle, { autoAlpha: 0, y: 8 })
        return
      }

      gsap.to(modal, { width, duration: dur(DUR_EXPAND), ease: EASE_APPLE, overwrite: 'auto' })
      gsap.to(stage, { height, duration: dur(DUR_EXPAND), ease: EASE_APPLE, overwrite: 'auto' })
      gsap.to(active, { autoAlpha: 1, y: 0, duration: dur(DUR_EXPAND), ease: EASE_APPLE, overwrite: 'auto' })
      gsap.to(idle, { autoAlpha: 0, y: 8, duration: dur(DUR_FADE), ease: EASE_APPLE, overwrite: 'auto' })
    },
    { dependencies: [open, plan] },
  )

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

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
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

        <div ref={stageRef} className="plan-stage">
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
