import type { ReactNode } from 'react'
import { Check, LoaderCircle, ShieldCheck, X } from 'lucide-react'

export function Busy() {
  return <div className="live-loading"><LoaderCircle className="spin" /><span>Memuat data...</span></div>
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box">
      <ShieldCheck /><span>{message}</span>
      {retry && <button onClick={retry}>Coba lagi</button>}
    </div>
  )
}

export function Modal({ title, icon, children, onClose }: { title: string; icon: ReactNode; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-title">
          <span>{icon}</span>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toast({ text, error, onClose }: { text: string; error?: boolean; onClose: () => void }) {
  return (
    <div className={`toast ${error ? 'toast-error' : ''}`}>
      <span>{error ? <X size={16} /> : <Check size={16} />}</span>
      <strong>{text}</strong>
      <button onClick={onClose}><X size={16} /></button>
    </div>
  )
}

export function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  )
}
