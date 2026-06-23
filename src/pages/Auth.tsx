import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Building2, Check, ChevronDown, ChevronRight, Eye, EyeOff, GitBranch,
  LoaderCircle, LockKeyhole, Mail, Search, Server, Sparkles, UserRound, X,
} from 'lucide-react'
import { Avatar, Badge, Card, EmptyState } from '../components'
import { Busy, ErrorBox } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api, getApiBase, post, setApiBase, setToken } from '../api'
import type { Employee, Organization, Session } from '../types'
import { initials } from '../utils/format'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: Session, org: Organization) => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showServer, setShowServer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [server, setServer] = useState(getApiBase())
  const [form, setForm] = useState({ organizationName: '', fullName: '', email: '', password: '' })

  const check = useCallback(async () => {
    setError('')
    try {
      const result = await api<{ configured: boolean }>('/status')
      setConfigured(result.configured)
    } catch (e) {
      setConfigured(null)
      setError(e instanceof Error ? e.message : 'Server tidak dapat dihubungi.')
    }
  }, [])

  useEffect(() => { void check() }, [check])

  const saveServer = async () => { setApiBase(server); await check(); setShowServer(false) }

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const result = await post<{ token: string; user: Session; organization?: Organization }>(configured ? '/auth/login' : '/setup', form)
      setToken(result.token)
      if (result.organization) onAuthenticated(result.user, result.organization)
      else { const me = await api<{ user: Session; organization: Organization }>('/me'); onAuthenticated(me.user, me.organization) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal masuk.') }
    finally { setBusy(false) }
  }

  return (
    <div className="login-page">
      <section className="login-showcase">
        <div className="login-brand">
          <span className="brand-mark"><Check size={21} strokeWidth={3} /></span>
          <strong>hadirin<em>ai</em></strong>
        </div>
        <div className="showcase-copy">
          <Badge tone="blue"><Sparkles size={11} /> Attendance & HR workspace</Badge>
          <h1>Kerja lebih teratur.<br /><span>Data selalu aktual.</span></h1>
          <p>Absensi, jadwal, dan penggajian tersimpan aman dalam satu ruang kerja yang terhubung.</p>
          <div className="showcase-stats">
            <div><strong>Live</strong><span>Database cloud</span></div>
            <div><strong>AI</strong><span>Roster otomatis</span></div>
            <div><strong>24/7</strong><span>Akses web & Android</span></div>
          </div>
        </div>
        <div className="login-orb orb-one" />
        <div className="login-orb orb-two" />
        <div className="login-grid" />
        <p className="showcase-foot">Data awal kosong—milik organisasi Anda sepenuhnya.</p>
      </section>
      <section className="login-panel">
        <div className="mobile-login-brand">
          <span className="brand-mark"><Check size={18} strokeWidth={3} /></span>
          <strong>hadirin<em>ai</em></strong>
        </div>
        <div className="login-box">
          <div className="login-heading">
            <h2>{configured === false ? 'Siapkan ruang kerja' : 'Selamat datang kembali'}</h2>
            <p>{configured === false ? 'Buat akun administrator pertama organisasi Anda.' : 'Masuk menggunakan akun organisasi Anda.'}</p>
          </div>
          {configured === true && (
            <div className="oauth-buttons">
              <button disabled title="Aktifkan OAuth provider di server"><span className="google-g">G</span> Google</button>
              <button disabled title="Aktifkan OAuth provider di server"><GitBranch size={17} /> GitHub</button>
            </div>
          )}
          {configured === true && <div className="or-divider"><span />atau masuk dengan email<span /></div>}
          <form onSubmit={submit}>
            {configured === false && <>
              <label>Nama organisasi<div className="field"><Building2 size={17} /><input required value={form.organizationName} onChange={e => setForm({ ...form, organizationName: e.target.value })} placeholder="Contoh: Nusantara Digital" /></div></label>
              <label>Nama administrator<div className="field"><UserRound size={17} /><input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="Nama lengkap" /></div></label>
            </>}
            <label>Email<div className="field"><Mail size={17} /><input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="admin@perusahaan.com" /></div></label>
            <label>Kata sandi<div className="field"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} minLength={8} required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Minimal 8 karakter" /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            {error && <p className="auth-error">{error}</p>}
            <button className="login-submit" disabled={busy || configured === null}>
              {busy ? <><LoaderCircle className="spin" /> Memproses...</> : <>{configured === false ? 'Buat ruang kerja' : 'Masuk ke Hadirin AI'} <ChevronRight size={17} /></>}
            </button>
          </form>
          <button className="server-toggle" onClick={() => setShowServer(!showServer)}>
            <Server size={15} />
            <span><strong>Server aplikasi</strong><small>{getApiBase() || 'Server deployment saat ini'}</small></span>
            <ChevronDown size={15} />
          </button>
          {showServer && (
            <div className="server-config">
              <label>URL Vercel<input value={server} onChange={e => setServer(e.target.value)} placeholder="https://nama-app.vercel.app" /></label>
              <button onClick={saveServer}>Hubungkan</button>
            </div>
          )}
          <p className="login-terms">Kamera dan lokasi hanya digunakan saat Anda menjalankan absensi.</p>
        </div>
      </section>
    </div>
  )
}

export function SearchResults({ search, close }: { search: string; close: () => void }) {
  const { data, loading, error } = useLoad(() => api<Employee[]>('/employees'), [])
  const filtered = data?.filter(e => `${e.full_name} ${e.department} ${e.job_title}`.toLowerCase().includes(search.toLowerCase())) || []

  return (
    <Card className="search-results">
      <div className="card-heading">
        <div><h2>Hasil pencarian</h2><p>"{search}"</p></div>
        <button className="icon-button" onClick={close}><X size={18} /></button>
      </div>
      {loading ? <Busy /> : error ? <ErrorBox message={error} /> : filtered.length ? (
        filtered.map(e => (
          <div className="online-person" key={e.id}>
            <Avatar initials={initials(e.full_name)} />
            <div><strong>{e.full_name}</strong><small>{e.job_title} • {e.department}</small></div>
          </div>
        ))
      ) : <EmptyState icon={<Search />} title="Tidak ada hasil" text="Coba nama atau divisi lain." />}
    </Card>
  )
}
