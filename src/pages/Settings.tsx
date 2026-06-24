import { useState, type FormEvent } from 'react'
import { MapPin, Plus } from 'lucide-react'
import { Avatar, Badge, Card } from '../components'
import { Busy, ErrorBox, PageHeading } from '../components/ui'
import { api, patch, post } from '../api'
import { useLoad } from '../hooks/useLoad'
import type { Organization, Session, WorkLocation } from '../types'
import { initials } from '../utils/format'

const canManageWorkLocations = (role: Session['role']) => ['owner', 'hrd', 'manager'].includes(role)
const roleLabel: Record<Session['role'], string> = {
  owner: 'Owner',
  admin: 'Administrator',
  hrd: 'HRD',
  manager: 'Manager',
  employee: 'Karyawan',
}

export function SettingsPage({ user, org, setOrg, notify }: { user: Session; org: Organization; setOrg: (o: Organization) => void; notify: (text: string, error?: boolean) => void }) {
  const [name, setName] = useState(org.name), [zone, setZone] = useState(org.timezone)
  const locations = useLoad(() => api<WorkLocation[]>('/work-locations'), [])
  const save = async () => {
    try {
      if (['owner', 'admin'].includes(user.role)) { await patch('/organization', { name, timezone: zone }); setOrg({ ...org, name, timezone: zone }) }
      notify('Pengaturan berhasil disimpan.')
    } catch (e) { notify(e instanceof Error ? e.message : 'Gagal menyimpan.', true) }
  }
  const saveLocation = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = Object.fromEntries(new FormData(form))
    try {
      await post('/work-locations', {
        name: String(data.name || ''),
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        radiusMeters: Number(data.radiusMeters || 100),
        isActive: true,
      })
      form.reset()
      notify('Lokasi kerja disimpan.')
      await locations.reload()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Gagal menyimpan lokasi.', true)
    }
  }
  return (
    <>
      <PageHeading title="Pengaturan" subtitle="Konfigurasi organisasi dan preferensi operasional." />
      <Card><div className="settings-form">
        <label>Nama organisasi<input value={name} onChange={e => setName(e.target.value)} disabled={!['owner', 'admin'].includes(user.role)} /></label>
        <label>Zona waktu<select value={zone} onChange={e => setZone(e.target.value)} disabled={!['owner', 'admin'].includes(user.role)}><option>Asia/Jakarta</option><option>Asia/Makassar</option><option>Asia/Jayapura</option></select></label>
        <button className="button primary" onClick={save} disabled={!['owner', 'admin'].includes(user.role)}>Simpan perubahan</button>
      </div></Card>
      <Card className="compact">
        <div className="card-heading payroll-heading">
          <div><h2>Lokasi kerja</h2><p>Radius validasi absensi wajib 50-100 meter.</p></div>
        </div>
        {canManageWorkLocations(user.role) && (
          <form className="settings-form work-location-form" onSubmit={saveLocation}>
            <label>Nama lokasi<input name="name" required placeholder="Kantor pusat" /></label>
            <label>Latitude<input name="latitude" type="number" step="0.000001" required placeholder="-6.200000" /></label>
            <label>Longitude<input name="longitude" type="number" step="0.000001" required placeholder="106.816666" /></label>
            <label>Radius meter<input name="radiusMeters" type="number" min="50" max="100" defaultValue="100" required /></label>
            <button className="button primary"><Plus size={17} /> Tambah lokasi</button>
          </form>
        )}
        {locations.loading ? <Busy /> : locations.error ? <ErrorBox message={locations.error} retry={locations.reload} /> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>LOKASI</th><th>KOORDINAT</th><th>RADIUS</th><th>STATUS</th></tr></thead>
              <tbody>{locations.data?.map(location => (
                <tr key={location.id}>
                  <td><div className="person"><span className="metric-icon tone-blue"><MapPin size={17} /></span><strong>{location.name}</strong></div></td>
                  <td>{Number(location.latitude).toFixed(6)}, {Number(location.longitude).toFixed(6)}</td>
                  <td>{location.radius_meters} m</td>
                  <td><Badge tone={location.is_active ? 'green' : 'orange'}>{location.is_active ? 'Aktif' : 'Nonaktif'}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

export function ProfilePage({ user, org, notify, force = false, onPasswordChanged }: { user: Session; org: Organization; notify: (text: string, error?: boolean) => void; force?: boolean; onPasswordChanged?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const changePassword = async () => {
    if (form.newPassword !== form.confirmPassword) return notify('Konfirmasi password baru tidak cocok.', true)
    setBusy(true)
    try {
      await patch('/me/password', { currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      onPasswordChanged?.()
      notify('Password berhasil diganti.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Gagal mengganti password.', true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeading title={force ? 'Ganti password sementara' : 'Profil saya'} subtitle={force ? 'Akun baru wajib mengganti password sebelum memakai fitur lain.' : 'Informasi akun yang sedang digunakan.'} />
      <Card><div className="profile-live"><Avatar initials={initials(user.name)} color="#dbeafe" /><div><h2>{user.name}</h2><p>{roleLabel[user.role]} • {org.name}</p></div></div>
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
