import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera'
import { Camera as CameraIcon, Fingerprint, LoaderCircle, ShieldCheck } from 'lucide-react'
import { Avatar, Badge } from '../components'
import { Busy, ErrorBox, Modal, PageHeading } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api, post } from '../api'
import type { AttendanceRow, Employee, Session } from '../types'
import { initials, time, today } from '../utils/format'
import { hashImage, locate } from '../utils/device'

export function CaptureModal({ employees, user, onClose, onDone }: { employees: Employee[]; user: Session; onClose: () => void; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null)
  const [employeeId, setEmployeeId] = useState(user.employeeId || employees[0]?.id || '')
  const [photo, setPhoto] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [eventType, setEventType] = useState<'check_in' | 'check_out'>('check_in')

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    void navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(s => { stream.current = s; if (video.current) video.current.srcObject = s })
      .catch(() => setError('Kamera tidak tersedia. Pastikan izin kamera diberikan.'))
    return () => stream.current?.getTracks().forEach(t => t.stop())
  }, [])

  const capture = async () => {
    setError('')
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await Camera.getPhoto({ quality: 55, resultType: CameraResultType.DataUrl, source: CameraSource.Camera, direction: CameraDirection.Front, correctOrientation: true })
        if (result.dataUrl) setPhoto(result.dataUrl)
      } else {
        const v = video.current; if (!v || !v.videoWidth) throw new Error('Kamera belum siap.')
        const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = Math.round(480 * v.videoHeight / v.videoWidth)
        canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height); setPhoto(canvas.toDataURL('image/jpeg', .55))
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal mengambil foto.') }
  }

  const submit = async () => {
    if (!photo) return setError('Ambil foto wajah terlebih dahulu.')
    if (!employeeId) return setError('Pilih karyawan.')
    setBusy(true); setError('')
    try {
      const position = await locate()
      await post('/attendance/check', { eventType, employeeId, ...position, faceProofHash: await hashImage(photo), deviceInfo: `${Capacitor.getPlatform()} • ${navigator.userAgent.slice(0, 120)}` })
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'Absensi gagal.') } finally { setBusy(false) }
  }

  return (
    <Modal title="Absensi kamera & lokasi" icon={<CameraIcon />} onClose={onClose}>
      <div className="capture-controls">
        {user.role === 'admin' && <label>Karyawan<select value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">Pilih karyawan</option>{employees.map(e => <option value={e.id} key={e.id}>{e.full_name}</option>)}</select></label>}
        <div className="segmented">
          <button className={eventType === 'check_in' ? 'active' : ''} onClick={() => setEventType('check_in')}>Check-in</button>
          <button className={eventType === 'check_out' ? 'active' : ''} onClick={() => setEventType('check_out')}>Check-out</button>
        </div>
      </div>
      <div className="native-camera">
        {photo ? <img src={photo} alt="Foto verifikasi" /> : Capacitor.isNativePlatform() ? <div className="camera-placeholder"><CameraIcon /><p>Gunakan kamera depan untuk verifikasi kehadiran.</p></div> : <video ref={video} autoPlay playsInline muted />}
        <div className="camera-corners" />
      </div>
      {error && <p className="form-error">{error}</p>}
      <p className="privacy-note"><ShieldCheck size={15} /> Foto tidak disimpan; hanya hash bukti verifikasi yang dikirim bersama koordinat lokasi.</p>
      <div className="modal-actions">
        <button className="button secondary" onClick={capture}><CameraIcon size={16} /> {photo ? 'Ambil ulang' : 'Ambil foto'}</button>
        <button className="button primary" disabled={busy || !photo} onClick={submit}>{busy ? <LoaderCircle className="spin" /> : <Fingerprint size={17} />} Simpan absensi</button>
      </div>
    </Modal>
  )
}

export function AttendancePage({ openScan, refreshKey }: { openScan: () => void; refreshKey: number }) {
  const { data, loading, error, reload } = useLoad(() => api<AttendanceRow[]>(`/attendance?date=${today()}`), [refreshKey])
  return (
    <>
      <PageHeading title="Absensi" subtitle="Kehadiran hari ini berdasarkan kamera dan lokasi perangkat." action={<button className="button primary" onClick={openScan}><CameraIcon size={18} /> Check-in/out</button>} />
      {loading ? <Busy /> : error ? <ErrorBox message={error} retry={reload} /> : (
        <section className="card">
          {!data?.length ? <div className="empty-state"><span><Fingerprint /></span><h3>Belum ada karyawan</h3><p>Tambahkan karyawan sebelum menggunakan absensi.</p></div> : (
            <div className="table-scroll"><table>
              <thead><tr><th>KARYAWAN</th><th>DIVISI</th><th>WAKTU TERAKHIR</th><th>AKTIVITAS</th><th>STATUS</th></tr></thead>
              <tbody>{data.map(e => (
                <tr key={e.employee_id}>
                  <td><div className="person"><Avatar small initials={initials(e.full_name)} /><span><strong>{e.full_name}</strong><small>{e.job_title}</small></span></div></td>
                  <td>{e.department}</td><td>{time(e.captured_at)} {e.captured_at && 'WIB'}</td>
                  <td>{e.event_type ? e.event_type.replace('_', '-') : 'Belum hadir'}</td>
                  <td><Badge tone={!e.status ? 'blue' : e.status === 'late' ? 'orange' : 'green'}>{!e.status ? 'Belum hadir' : e.status === 'late' ? 'Terlambat' : 'Hadir'}</Badge></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      )}
    </>
  )
}
