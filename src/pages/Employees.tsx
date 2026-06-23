import { useState, useMemo, type FormEvent } from 'react'
import { Check, Download, LoaderCircle, Plus, Search, Trash2, Users } from 'lucide-react'
import { Avatar, Badge, Card, EmptyState } from '../components'
import { Busy, ErrorBox, Modal, PageHeading } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api, downloadCsv, post, remove } from '../api'
import type { Employee } from '../types'
import { dateText, initials, rupiah, today } from '../utils/format'

function EmployeeForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const password = useMemo(() => `Hr!${crypto.randomUUID().slice(0, 8)}9`, [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const values = Object.fromEntries(new FormData(e.currentTarget))
    try {
      await post('/employees', {
        ...values,
        basicSalary: Number(values.basicSalary),
        overtimeHourlyRate: Number(values.overtimeHourlyRate),
        temporaryPassword: values.email ? values.temporaryPassword : undefined,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Tambah karyawan" icon={<Users />} onClose={onClose}>
      <form className="live-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Nama lengkap<input name="fullName" required /></label>
          <label>Nomor karyawan<input name="employeeNumber" required placeholder="EMP-001" /></label>
          <label>Email akun<input name="email" type="email" placeholder="Opsional" /></label>
          <label>Password sementara<input name="temporaryPassword" defaultValue={password} /></label>
          <label>Divisi<input name="department" required /></label>
          <label>Jabatan<input name="jobTitle" required /></label>
          <label>Tipe kerja
            <select name="employmentType">
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Kontrak</option>
              <option value="intern">Magang</option>
            </select>
          </label>
          <label>Tanggal bergabung<input name="joinedOn" type="date" defaultValue={today()} required /></label>
          <label>Gaji pokok<input name="basicSalary" type="number" min="0" defaultValue="0" required /></label>
          <label>Tarif lembur/jam<input name="overtimeHourlyRate" type="number" min="0" defaultValue="0" /></label>
          <label>Nomor telepon<input name="phone" /></label>
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
        action={<button className="button primary" onClick={() => setOpen(true)}><Plus size={18} /> Tambah karyawan</button>}
      />
      {loading ? <Busy /> : error ? <ErrorBox message={error} retry={reload} /> : (
        <Card>
          {!data?.length ? (
            <>
              <EmptyState icon={<Users />} title="Data karyawan masih kosong" text="Tambahkan karyawan untuk membuat akun, absensi, roster, dan payroll." />
              <div className="empty-actions">
                <button className="button primary" onClick={() => setOpen(true)}><Plus size={17} /> Tambah pertama</button>
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
                  <thead><tr><th>KARYAWAN</th><th>DIVISI</th><th>TIPE</th><th>BERGABUNG</th><th>GAJI POKOK</th><th /></tr></thead>
                  <tbody>
                    {data.map(e => (
                      <tr key={e.id}>
                        <td><div className="person"><Avatar small initials={initials(e.full_name)} /><span><strong>{e.full_name}</strong><small>{e.email || e.job_title}</small></span></div></td>
                        <td>{e.department}</td>
                        <td>{e.employment_type.replace('_', ' ')}</td>
                        <td>{dateText(e.joined_on)}</td>
                        <td>{rupiah(e.basic_salary)}</td>
                        <td><button className="icon-button subtle danger" onClick={() => del(e.id)}><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
      {open && <EmployeeForm onClose={() => setOpen(false)} onSaved={() => { setOpen(false); notify('Karyawan berhasil ditambahkan.'); void reload() }} />}
    </>
  )
}
