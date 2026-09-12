import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

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

type UpgradeModalProps = {
  open: boolean
  onClose: () => void
  onToast: (text: string) => void
}

export function UpgradeModal({ open, onClose, onToast }: UpgradeModalProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')

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
        className="modal"
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
        <div className="plan-grid">
          <article className="plan-card">
            <p className="plan-kicker">Pro</p>
            <p className="plan-price">
              $5 <span>/ month / agent</span>
            </p>
            <p className="plan-pitch">Approve from your phone. Same daemon on laptop and phone — multi-device.</p>
            <ul className="plan-list">
              <li>Phone approve</li>
              <li>Multi-device compatibility</li>
            </ul>
            <button className="btn plan-cta" type="button" onClick={onStart}>
              Start
            </button>
          </article>
          <article className="plan-card">
            <p className="plan-kicker">Enterprise</p>
            <p className="plan-price">Contact</p>
            <p className="plan-pitch">Everything we cover, on your network.</p>
            <ul className="plan-list">
              {ENTERPRISE_COVERS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <form className="contact-form" onSubmit={onContact}>
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} name="name" autoComplete="name" required />
              </label>
              <label>
                Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Company
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  name="company"
                  autoComplete="organization"
                  required
                />
              </label>
              <button className="btn plan-cta" type="submit">
                Contact
              </button>
            </form>
          </article>
        </div>
      </div>
    </div>
  )
}
