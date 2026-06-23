import { useCallback, useEffect, useMemo, useState } from 'react'
import { lazy, Suspense } from 'react'
import {
  Camera as CameraIcon, LayoutDashboard, LoaderCircle,
  Map as MapIcon, Settings, UserRound,
} from 'lucide-react'
import { api, hasToken, post, setToken } from './api'
import { BrandLogo } from './components/BrandLogo'
import { Sidebar, Header } from './components/Sidebar'
import { Busy, Toast } from './components/ui'
import { AuthScreen, SearchResults } from './pages/Auth'
import type { Employee, NavId, Organization, Session } from './types'

type ThemeMode = 'light' | 'dark'

function initialTheme(): ThemeMode {
  const saved = localStorage.getItem('identime_theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Lazy-load heavy pages for better initial bundle
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const EmployeesPage = lazy(() => import('./pages/Employees').then(m => ({ default: m.EmployeesPage })))
const AttendancePage = lazy(() => import('./pages/Attendance').then(m => ({ default: m.AttendancePage })))
const CaptureModal = lazy(() => import('./pages/Attendance').then(m => ({ default: m.CaptureModal })))
const RosterPage = lazy(() => import('./pages/Roster').then(m => ({ default: m.RosterPage })))
const PayrollPage = lazy(() => import('./pages/Payroll').then(m => ({ default: m.PayrollPage })))
const ReportsPage = lazy(() => import('./pages/Reports').then(m => ({ default: m.ReportsPage })))
const MapsPage = lazy(() => import('./pages/Maps').then(m => ({ default: m.MapsPage })))
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })))
const ProfilePage = lazy(() => import('./pages/Settings').then(m => ({ default: m.ProfilePage })))

export default function LiveApp() {
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState<Session | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [active, setActive] = useState<NavId>('dashboard')
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [scan, setScan] = useState(false)
  const [scanRefresh, setScanRefresh] = useState(0)
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [theme, setTheme] = useState<ThemeMode>(initialTheme)

  const notify = (text: string, error = false) => setToast({ text, error })
  const toggleTheme = () => setTheme(value => value === 'dark' ? 'light' : 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('identime_theme', theme)
  }, [theme])

  const bootstrap = useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const oauthToken = params.get('oauth_token')
    if (oauthToken) {
      setToken(oauthToken, true)
      params.delete('oauth_token')
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', next)
    }
    if (!oauthToken && !hasToken()) { setBooting(false); return }
    try {
      const me = await api<{ user: Session; organization: Organization }>('/me')
      setUser(me.user)
      setOrg(me.organization)
    } catch {
      setToken()
    } finally {
      setBooting(false)
    }
  }, [])

  useEffect(() => { void bootstrap() }, [bootstrap])

  useEffect(() => {
    if (user && scan) {
      void api<Employee[]>('/employees')
        .then(setEmployees)
        .catch(e => notify(e instanceof Error ? e.message : 'Gagal memuat karyawan.', true))
    }
  }, [user, scan])

  const logout = async () => {
    try { await post('/auth/logout') } catch { /* ignore */ }
    setToken()
    setUser(null)
    setOrg(null)
  }

  const page = useMemo(() => {
    if (!user || !org) return null
    const props = { notify }
    switch (active) {
      case 'dashboard': return <Dashboard go={setActive} scan={() => setScan(true)} />
      case 'employees': return <EmployeesPage {...props} />
      case 'attendance': return <AttendancePage openScan={() => setScan(true)} refreshKey={scanRefresh} />
      case 'roster': return <RosterPage {...props} />
      case 'payroll': return user.role === 'admin' ? <PayrollPage {...props} /> : <div className="error-box">Penggajian hanya dapat diakses administrator.</div>
      case 'reports': return <ReportsPage {...props} />
      case 'maps': return <MapsPage user={user} {...props} />
      case 'settings': return <SettingsPage user={user} org={org} setOrg={setOrg} {...props} />
      default: return <ProfilePage user={user} org={org} notify={notify} />
    }
  }, [active, user, org, scanRefresh])

  if (booting) return <div className="app-boot"><BrandLogo markOnly /><LoaderCircle className="spin" /></div>

  if (!user || !org) return <AuthScreen onAuthenticated={(u, o) => { setUser(u); setOrg(o) }} />

  return (
    <div className="app-shell">
      <Sidebar active={active} setActive={setActive} open={menu} close={() => setMenu(false)} user={user} org={org} onLogout={logout} />
      <div className="main-shell">
        <Header active={active} menu={() => setMenu(true)} search={search} setSearch={setSearch} theme={theme} toggleTheme={toggleTheme} />
        <main>
          <Suspense fallback={<Busy />}>
            {search ? <SearchResults search={search} close={() => setSearch('')} /> : page}
          </Suspense>
        </main>
        <nav className="bottom-nav">
          {([
            { id: 'dashboard' as NavId, icon: LayoutDashboard, label: 'Beranda' },
            { id: 'maps' as NavId, icon: MapIcon, label: 'Peta' },
            { id: 'scan' as const, icon: CameraIcon, label: 'Scan' },
            { id: 'profile' as NavId, icon: UserRound, label: 'Profil' },
            { id: 'settings' as NavId, icon: Settings, label: 'Setelan' },
          ]).map(item => {
            const Icon = item.icon
            return (
              <button key={item.id} className={`${active === item.id ? 'active' : ''} ${item.id === 'scan' ? 'scan-nav' : ''}`}
                onClick={() => item.id === 'scan' ? setScan(true) : setActive(item.id)}>
                <span><Icon size={21} /></span>
                <small>{item.label}</small>
              </button>
            )
          })}
        </nav>
      </div>
      {scan && (
        <Suspense fallback={<Busy />}>
          <CaptureModal employees={employees} user={user} onClose={() => setScan(false)}
            onDone={() => { setScan(false); setScanRefresh(v => v + 1); notify('Absensi berhasil disimpan.') }} />
        </Suspense>
      )}
      {toast && <Toast text={toast.text} error={toast.error} onClose={() => setToast(null)} />}
    </div>
  )
}
