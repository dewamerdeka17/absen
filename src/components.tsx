import type { ReactNode } from 'react'
import { ArrowUpRight, MoreHorizontal } from 'lucide-react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function Badge({ children, tone = 'blue' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Avatar({ initials, color = '#e0edff', small = false }: { initials: string; color?: string; small?: boolean }) {
  return <span className={`avatar ${small ? 'avatar-sm' : ''}`} style={{ background: color }}>{initials}</span>
}

export function MetricCard({ icon, label, value, note, tone = 'blue' }: { icon: ReactNode; label: string; value: string; note: string; tone?: string }) {
  return (
    <Card className="metric-card">
      <div className={`metric-icon tone-${tone}`}>{icon}</div>
      <button className="icon-button subtle" aria-label={`Detail ${label}`}><MoreHorizontal size={19} /></button>
      <p>{label}</p>
      <div className="metric-value-row"><strong>{value}</strong><span><ArrowUpRight size={13} /> {note}</span></div>
    </Card>
  )
}

export function EmptyState({ title, text, icon }: { title: string; text: string; icon: ReactNode }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>
}
