import { useState, useMemo, type FormEvent } from 'react'
import { Check, Download, Edit3, LoaderCircle, Plus, Search, Trash2, Users } from 'lucide-react'
import { Avatar, Badge, Card, EmptyState } from '../components'
import { Busy, ErrorBox, Modal, PageHeading } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api, downloadCsv, patch, post, remove } from '../api'
import type { Employee } from '../types'
import { dateText, initials, rupiah, today } from '../utils/format'

const normalizeEmail = (value: string) => value.trim().toLowerCase()
const temporaryPassword = () => `Hr!${crypto.randomUUID().slice(0, 8)}9`
const parseMoney = (value: unknown) => {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

function EmployeeForm({ employee, onClose, onSaved }: { employee?: Employee; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(employee)
  const generatedPassword = useMemo(temporaryPassword, [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState(() => normalizeEmail(employee?.email || ''))
  const [password, setPassword] = useState(editing ? '' : generatedPassword)
  const [basicSalary, setBasicSalary] = useState(() => rupiah(employee?.basic_salary || 0))
  const [overtimeRate, setOvertimeRate] = useState(() => rupiah(employee?.overtime_hourly_rate || 0))

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const values = Object.fromEntries(new FormData(e.currentTarget))
    const text = (key: string) => String(values[key] ?? '').trim()
    const accountEmail = normalizeEmail(email)
    try {
      const payload = {
        fullName: text('fullName'),
        employeeNumber: text('employeeNumber'),
        username: text('username') || undefined,
        email: accountEmail || (editing ? '' : undefined),
        temporaryPassword: accountEmail && password.trim() ? password.trim() : undefined,
        accountRole: text('accountRole') || 'employee',
        phone: text('phone') || undefined,
        department: text('department'),
        jobTitle: text('jobTitle'),
        employmentType: text('employmentType') || 'full_time',
        joinedOn: text('joinedOn'),
        basicSalary: parseMoney(values.basicSalary),
        overtimeHourlyRate: parseMoney(values.overtimeHourlyRate),
      }
      if (editing) await patch(`/employees/${employee!.id}`, payload)
      else await post('/employees', payload)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit karyawan' : 'Tambah karyawan'} icon={<Users />} onClose={onClose}>
      <form className="live-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Nama lengkap<input name="fullName" required defaultValue={employee?.full_name || ''} /></label>
          <label>Nomor karyawan<input name="employeeNumber" required placeholder="EMP-001" defaultValue={employee?.employee_number || ''} /></label>
          <label>Username<input name="username" placeholder="dewa" defaultValue={employee?.account_username || ''} /></label>
          <label>Email akun<input name="email" type="email" autoComplete="email" placeholder="Opsional" value={email} onChange={e => setEmail(normalizeEmail(e.target.value))} /></label>
          <label>{editing ? 'Password baru' : 'Password sementara'}<input name="temporaryPassword" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required={!editing && Boolean(email.trim())} placeholder={editing ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'} /></label>
          <label>Role akun
            <select name="accountRole" defaultValue={employee?.account_role || 'employee'}>
              <option value="employee">Karyawan</option>
              <option value="manager">Manager</option>
              <option value="hrd">HRD</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>Divisi<input name="department" required defaultValue={employee?.department || ''} /></label>
          <label>Jabatan<input name="jobTitle" required defaultValue={employee?.job_title || ''} /></label>
          <label>Tipe kerja
            <select name="employmentType" defaultValue={employee?.employment_type || 'full_time'}>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Kontrak</option>
              <option value="intern">Magang</option>
            </select>
          </label>
          <label>Tanggal bergabung<input name="joinedOn" type="date" defaultValue={String(employee?.joined_on || today()).slice(0, 10)} required /></label>
          <label>Gaji pokok<input name="basicSalary" inputMode="numeric" value={basicSalary} onChange={e => setBasicSalary(e.target.value)} onBlur={() => setBasicSalary(rupiah(parseMoney(basicSalary)))} /></label>
          <label>Tarif lembur/jam<input name="overtimeHourlyRate" inputMode="numeric" value={overtimeRate} onChange={e => setOvertimeRate(e.target.value)} onBlur={() => setOvertimeRate(rupiah(parseMoney(overtimeRate)))} /></label>
          <label>Nomor telepon<input name="phone" defaultValue={employee?.phone || ''} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <Check size={16} />} Simpan</button>
        </div>
      </form>
    </Modal>
  )
}

export function EmployeesPage({ notify }: { notify: (text: string, error?: boolean) => void }) {
  const { data, loading, error, reload } = useLoad(() => api<Employee[]>('/employees'), [])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)

  const del = async (id: string) => {
    if (!confirm('Nonaktifkan karyawan ini?')) return
    try {
      await remove(`/employees/${id}`)
      notify('Karyawan dinonaktifkan.')
      await reload()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Gagal menghapus.', true)
    }
  }

  return (
    <>
      <PageHeading
        title="Data karyawan"
        subtitle="Kelola profil, akun, dan komponen gaji karyawan."
        action={<button className="button primary" onClick={() => { setEditing(null); setOpen(true) }}><Plus size={18} /> Tambah karyawan</button>}
      />
      {loading ? <Busy /> : error ? <ErrorBox message={error} retry={reload} /> : (
        <Card>
          {!data?.length ? (
            <>
              <EmptyState icon={<Users />} title="Data karyawan masih kosong" text="Tambahkan karyawan untuk membuat akun, absensi, roster, dan payroll." />
              <div className="empty-actions">
                <button className="button primary" onClick={() => { setEditing(null); setOpen(true) }}><Plus size={17} /> Tambah pertama</button>
              </div>
            </>
          ) : (
            <>
              <div className="toolbar">
                <label><Search size={17} /><input placeholder="Cari karyawan..." /></label>
                <button className="button secondary" onClick={() => downloadCsv('karyawan.csv', data)}><Download size={16} /> Ekspor CSV</button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>KARYAWAN</th><th>DIVISI</th><th>ROLE</th><th>TIPE</th><th>BERGABUNG</th><th>GAJI POKOK</th><th /></tr></thead>
                  <tbody>
                    {data.map(e => (
                      <tr key={e.id}>
                        <td><div className="person"><Avatar small initials={initials(e.full_name)} /><span><strong>{e.full_name}</strong><small>{e.account_username ? `@${e.account_username}` : e.email || e.job_title}</small></span></div></td>
                        <td>{e.department}</td>
                        <td><Badge tone={e.must_change_password ? 'orange' : 'blue'}>{e.account_role || 'employee'}</Badge></td>
                        <td>{e.employment_type.replace('_', ' ')}</td>
                        <td>{dateText(e.joined_on)}</td>
                        <td>{rupiah(e.basic_salary)}</td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-button subtle" aria-label={`Edit ${e.full_name}`} onClick={() => { setEditing(e); setOpen(true) }}><Edit3 size={16} /></button>
                            <button className="icon-button subtle danger" aria-label={`Hapus ${e.full_name}`} onClick={() => del(e.id)}><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
      {open && <EmployeeForm employee={editing || undefined} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); notify(editing ? 'Karyawan berhasil diperbarui.' : 'Karyawan berhasil ditambahkan.'); void reload() }} />}
    </>
  )
}
