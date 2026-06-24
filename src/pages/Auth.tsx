import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Building2, ChevronRight, Eye, EyeOff,
  LoaderCircle, LockKeyhole, Mail, Search, Sparkles, UserRound, X,
} from 'lucide-react'
import { Avatar, Badge, Card, EmptyState } from '../components'
import { BrandLogo } from '../components/BrandLogo'
import { Busy, ErrorBox } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api, post, setToken } from '../api'
import type { Employee, Organization, Session } from '../types'
import { initials } from '../utils/format'

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: Session, org: Organization) => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(() => localStorage.getItem('identime_remember') !== 'false')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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

  useEffect(() => {
    void check()
  }, [check])

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const payload = configured ? { identifier: form.email, password: form.password } : form
      const result = await post<{ token: string; user: Session; organization?: Organization }>(configured ? '/auth/login' : '/setup', payload)
      localStorage.setItem('identime_remember', remember ? 'true' : 'false')
      setToken(result.token, remember)
      if (result.organization) onAuthenticated(result.user, result.organization)
      else { const me = await api<{ user: Session; organization: Organization }>('/me'); onAuthenticated(me.user, me.organization) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal masuk.') }
    finally { setBusy(false) }
  }

  return (
    <div className="login-page">
      <section className="login-showcase">
        <div className="login-brand">
          <BrandLogo inverse />
        </div>
        <div className="showcase-copy">
          <Badge tone="blue"><Sparkles size={11} /> Authentic Presence</Badge>
          <h1>Absensi autentik.<br /><span>Operasional terkendali.</span></h1>
          <p>Kelola kehadiran, jadwal, dan penggajian dengan identitas karyawan yang jelas di satu ruang kerja.</p>
          <div className="showcase-stats">
            <div><strong>Live</strong><span>Database cloud</span></div>
            <div><strong>HR</strong><span>Roster otomatis</span></div>
            <div><strong>24/7</strong><span>Akses web & Android</span></div>
          </div>
        </div>
        <div className="login-grid" />
        <p className="showcase-foot">Data awal kosong—milik organisasi Anda sepenuhnya.</p>
      </section>
      <section className="login-panel">
        <div className="mobile-login-brand">
          <BrandLogo compact tagline={false} />
        </div>
        <div className="login-box">
          <div className="login-heading">
            <h2>{configured === false ? 'Siapkan ruang kerja' : 'Selamat datang kembali'}</h2>
            <p>{configured === false ? 'Buat perusahaan dan akun owner pertama.' : 'Masuk menggunakan akun organisasi Anda.'}</p>
          </div>
          <form onSubmit={submit}>
            {configured === false && <>
              <label>Nama organisasi<div className="field"><Building2 size={17} /><input required value={form.organizationName} onChange={e => setForm({ ...form, organizationName: e.target.value })} placeholder="Contoh: Nusantara Digital" /></div></label>
              <label>Nama owner<div className="field"><UserRound size={17} /><input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="Nama lengkap" /></div></label>
            </>}
            <label>{configured === false ? 'Email owner' : 'Email / HP / nama / username'}<div className="field"><Mail size={17} /><input type={configured === false ? 'email' : 'text'} required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder={configured === false ? 'owner@perusahaan.com' : 'email, +628..., nama unik, atau EMP-001'} /></div></label>
            <label>Kata sandi<div className="field"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} minLength={8} required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Minimal 8 karakter" /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            <label className="remember-check">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span><strong>Ingat aku</strong><small>Tetap masuk di perangkat ini.</small></span>
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button className="login-submit" disabled={busy || configured === null}>
              {busy ? <><LoaderCircle className="spin" /> Memproses...</> : <>{configured === false ? 'Buat ruang kerja' : 'Masuk ke IdenTime'} <ChevronRight size={17} /></>}
            </button>
          </form>
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
