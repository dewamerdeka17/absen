import { useState, useMemo, type FormEvent } from 'react'
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3, LoaderCircle, Plus, Sparkles, TimerReset,
} from 'lucide-react'
import { Avatar, Card, EmptyState } from '../components'
import { Busy, ErrorBox, Modal, PageHeading } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api, post } from '../api'
import type { RosterRow, ShiftType } from '../types'
import { addDays, dateText, initials, monday } from '../utils/format'

function ShiftForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('')
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const v = Object.fromEntries(new FormData(e.currentTarget))
    try {
      await post('/shift-types', { ...v, graceMinutes: Number(v.graceMinutes) })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan shift.')
    }
  }
  return (
    <Modal title="Tipe shift baru" icon={<Clock3 />} onClose={onClose}>
      <form className="live-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Nama<input name="name" required placeholder="Shift Pagi" /></label>
          <label>Kode<input name="code" required placeholder="PAGI" /></label>
          <label>Mulai<input type="time" name="startTime" required /></label>
          <label>Selesai<input type="time" name="endTime" required /></label>
          <label>Toleransi (menit)<input type="number" name="graceMinutes" min="0" defaultValue="10" /></label>
          <label>Warna<input type="color" name="color" defaultValue="#12aeb2" /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button className="button primary">Simpan shift</button>
        </div>
      </form>
    </Modal>
  )
}

export function RosterPage({ notify }: { notify: (text: string, error?: boolean) => void }) {
  const [start, setStart] = useState(monday())
  const [shiftOpen, setShiftOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const end = addDays(start, 6)

  const shifts = useLoad(() => api<ShiftType[]>('/shift-types'), [])
  const roster = useLoad(() => api<RosterRow[]>(`/rosters?from=${start}&to=${end}`), [start])

  const generate = async () => {
    setGenerating(true)
    try {
      await post('/rosters/generate', { periodStart: start, periodEnd: end })
      notify('Roster otomatis berhasil dibuat.')
      await roster.reload()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Gagal membuat roster.', true)
    } finally {
      setGenerating(false)
    }
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; rows: Map<string, RosterRow> }>()
    for (const row of roster.data || []) {
      if (!map.has(row.employee_id)) map.set(row.employee_id, { name: row.full_name, rows: new Map() })
      map.get(row.employee_id)!.rows.set(row.shift_date.slice(0, 10), row)
    }
    return [...map.values()]
  }, [roster.data])

  return (
    <>
      <PageHeading
        title="Jadwal & shift"
        subtitle={`Periode ${dateText(start)} – ${dateText(end)}`}
        action={<>
          <button className="button secondary" onClick={() => setShiftOpen(true)}><Plus size={17} /> Tipe shift</button>
          <button className="button ai-button" disabled={generating} onClick={generate}>
            {generating ? <LoaderCircle className="spin" /> : <Sparkles size={17} />} Buat otomatis
          </button>
        </>}
      />

      <div className="roster-summary">
        <Card><span className="tone-blue"><CalendarDays /></span><div><p>Periode jadwal</p><strong>{dateText(start)} – {dateText(end)}</strong></div></Card>
        <Card><span className="tone-purple"><TimerReset /></span><div><p>Tipe shift aktif</p><strong>{shifts.data?.length || 0} tipe shift</strong></div><button onClick={() => setShiftOpen(true)}>Kelola</button></Card>
      </div>

      {roster.loading ? <Busy /> : roster.error ? <ErrorBox message={roster.error} retry={roster.reload} /> : (
        <Card>
          <div className="roster-head">
            <button className="icon-button" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={18} /></button>
            <strong>{dateText(start)}</strong>
            <button className="icon-button" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={18} /></button>
            <span />
            <button className="button secondary" onClick={() => setStart(monday())}>Minggu ini</button>
          </div>
          {!grouped.length ? (
            <EmptyState icon={<CalendarDays />} title="Roster belum dibuat" text={!shifts.data?.length ? 'Tambahkan tipe shift terlebih dahulu, lalu buat roster otomatis.' : 'Klik "Buat otomatis" untuk menyusun jadwal seluruh karyawan.'} />
          ) : (
            <div className="table-scroll">
              <table className="roster-table">
                <thead>
                  <tr>
                    <th>KARYAWAN</th>
                    {days.map(day => <th key={day}>{new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00`))}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(person => (
                    <tr key={person.name}>
                      <td><div className="person"><Avatar small initials={initials(person.name)} /><strong>{person.name}</strong></div></td>
                      {days.map(day => {
                        const row = person.rows.get(day)
                        return (
                          <td key={day}>
                            {row ? (
                              <span className="shift" style={{ background: `${row.color}18`, color: row.color }}>
                                {row.shift_name}<small>{row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}</small>
                              </span>
                            ) : <span className="shift shift-libur">Libur</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {shiftOpen && <ShiftForm onClose={() => setShiftOpen(false)} onSaved={() => { setShiftOpen(false); notify('Tipe shift disimpan.'); void shifts.reload() }} />}
    </>
  )
}
