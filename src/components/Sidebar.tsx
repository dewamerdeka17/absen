import {
  Bell, CalendarDays, ChevronDown, ChevronRight, Fingerprint, FileBarChart,
  LayoutDashboard, LocateFixed, LogOut, Menu, MessageSquareText, Moon, Search, Settings,
  Sparkles, Sun, UserRound, Users, WalletCards, X,
} from 'lucide-react'
import { Avatar } from '../components'
import { BrandLogo } from './BrandLogo'
import type { NavId, Session, Organization } from '../types'
import { initials } from '../utils/format'

const navGroups = [
  {
    label: 'UTAMA',
    items: [
      { id: 'dashboard' as NavId, label: 'Ringkasan', icon: LayoutDashboard },
      { id: 'attendance' as NavId, label: 'Absensi', icon: Fingerprint },
      { id: 'employees' as NavId, label: 'Karyawan', icon: Users },
      { id: 'roster' as NavId, label: 'Jadwal & Shift', icon: CalendarDays },
    ],
  },
  {
    label: 'OPERASIONAL',
    items: [
      { id: 'payroll' as NavId, label: 'Penggajian', icon: WalletCards },
      { id: 'reports' as NavId, label: 'Laporan', icon: FileBarChart },
      { id: 'maps' as NavId, label: 'Live Tracking', icon: LocateFixed },
    ],
  },
  {
    label: 'AKUN',
    items: [
      { id: 'profile' as NavId, label: 'Profil', icon: UserRound },
      { id: 'settings' as NavId, label: 'Pengaturan', icon: Settings },
    ],
  },
]

const roleLabel: Record<Session['role'], string> = {
  owner: 'Owner',
  admin: 'Administrator',
  hrd: 'HRD',
  manager: 'Manager',
  employee: 'Karyawan',
}

const canOpen = (role: Session['role'], id: NavId) => {
  if (['employees', 'payroll', 'reports'].includes(id)) return ['owner', 'admin', 'hrd'].includes(role)
  if (id === 'roster') return ['owner', 'admin', 'hrd', 'manager'].includes(role)
  return true
}

export const pageTitles: Record<NavId, string> = {
  dashboard: 'Ringkasan', attendance: 'Absensi', employees: 'Karyawan',
  roster: 'Jadwal & Shift', payroll: 'Penggajian', reports: 'Laporan',
  maps: 'Live Tracking', profile: 'Profil', settings: 'Pengaturan',
}

export function Sidebar({ active, setActive, open, close, user, org, onLogout }: {
  active: NavId; setActive: (id: NavId) => void; open: boolean; close: () => void
  user: Session; org: Organization; onLogout: () => void
}) {
  const go = (id: NavId) => { setActive(id); close() }
  return (
    <>
      {open && <button className="mobile-overlay" onClick={close} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <BrandLogo compact />
          <button className="sidebar-close" onClick={close}><X size={20} /></button>
        </div>
        <div className="workspace">
          <span className="workspace-logo">{org.name[0]?.toUpperCase()}</span>
          <span><small>Workspace</small><strong>{org.name}</strong></span>
          <ChevronDown size={16} />
        </div>
        <nav>
          {navGroups.map(group => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items
                .filter(item => canOpen(user.role, item.id))
                .map(item => {
                  const Icon = item.icon
                  return (
                    <button key={item.id} className={active === item.id ? 'active' : ''} onClick={() => go(item.id)}>
                      <Icon size={19} /><span>{item.label}</span>
                    </button>
                  )
                })}
            </div>
          ))}
        </nav>
        <div className="ai-card">
          <span><Sparkles size={17} /></span>
          <strong>Roster otomatis</strong>
          <p>Buat jadwal adil dari data karyawan dan shift.</p>
          <button onClick={() => go('roster')}>Buka roster <ChevronRight size={14} /></button>
        </div>
        <div className="user-card">
          <Avatar initials={initials(user.name)} color="#dbeafe" />
          <span><strong>{user.name}</strong><small>{roleLabel[user.role]}</small></span>
          <button onClick={onLogout}><LogOut size={17} /></button>
        </div>
      </aside>
    </>
  )
}

export function Header({ active, menu, setSearch, search, theme, toggleTheme }: {
  active: NavId; menu: () => void; setSearch: (v: string) => void; search: string
  theme: 'light' | 'dark'; toggleTheme: () => void
}) {
  return (
    <header className="topbar">
      <button className="menu-button" onClick={menu}><Menu size={22} /></button>
      <label className="global-search">
        <Search size={18} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari karyawan..." />
        <kbd>⌘ K</kbd>
      </label>
      <div className="top-actions">
        <button className="top-status"><span />Database terhubung</button>
        <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Gunakan mode terang' : 'Gunakan mode gelap'}>
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button className="icon-button"><MessageSquareText size={19} /></button>
        <button className="icon-button notify"><Bell size={19} /></button>
      </div>
      <span className="mobile-title">{pageTitles[active]}</span>
    </header>
  )
}
