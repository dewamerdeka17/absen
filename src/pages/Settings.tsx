import { useState } from 'react'
import { Avatar, Card } from '../components'
import { PageHeading } from '../components/ui'
import { patch } from '../api'
import type { Organization, Session } from '../types'
import { initials } from '../utils/format'

export function SettingsPage({ user, org, setOrg, notify }: { user: Session; org: Organization; setOrg: (o: Organization) => void; notify: (text: string, error?: boolean) => void }) {
  const [name, setName] = useState(org.name), [zone, setZone] = useState(org.timezone)
  const save = async () => {
    try {
      if (user.role === 'admin') { await patch('/organization', { name, timezone: zone }); setOrg({ ...org, name, timezone: zone }) }
      notify('Pengaturan berhasil disimpan.')
    } catch (e) { notify(e instanceof Error ? e.message : 'Gagal menyimpan.', true) }
  }
  return (
    <>
      <PageHeading title="Pengaturan" subtitle="Konfigurasi organisasi dan preferensi operasional." />
      <Card><div className="settings-form">
        <label>Nama organisasi<input value={name} onChange={e => setName(e.target.value)} disabled={user.role !== 'admin'} /></label>
        <label>Zona waktu<select value={zone} onChange={e => setZone(e.target.value)} disabled={user.role !== 'admin'}><option>Asia/Jakarta</option><option>Asia/Makassar</option><option>Asia/Jayapura</option></select></label>
        <button className="button primary" onClick={save}>Simpan perubahan</button>
      </div></Card>
    </>
  )
}

export function ProfilePage({ user, org, notify }: { user: Session; org: Organization; notify: (text: string, error?: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const changePassword = async () => {
    if (form.newPassword !== form.confirmPassword) return notify('Konfirmasi password baru tidak cocok.', true)
    setBusy(true)
    try {
      await patch('/me/password', { currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      notify('Password berhasil diganti.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Gagal mengganti password.', true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeading title="Profil saya" subtitle="Informasi akun yang sedang digunakan." />
      <Card><div className="profile-live"><Avatar initials={initials(user.name)} color="#dbeafe" /><div><h2>{user.name}</h2><p>{user.role === 'admin' ? 'Administrator' : 'Karyawan'} • {org.name}</p></div></div>
      <div className="profile-details"><div><span>Role</span><strong>{user.role}</strong></div><div><span>Workspace</span><strong>{org.name}</strong></div><div><span>Status database</span><strong className="positive">Terhubung</strong></div></div></Card>
      <Card className="compact"><div className="settings-form password-form">
        <label>Password lama<input type="password" autoComplete="current-password" minLength={8} value={form.currentPassword} onChange={e => setForm({ ...form, currentPassword: e.target.value })} /></label>
        <label>Password baru<input type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} /></label>
        <label>Konfirmasi password<input type="password" autoComplete="new-password" minLength={8} value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })} /></label>
        <button className="button primary" onClick={changePassword} disabled={busy || !form.currentPassword || !form.newPassword || !form.confirmPassword}>Ganti password</button>
      </div></Card>
    </>
  )
}
