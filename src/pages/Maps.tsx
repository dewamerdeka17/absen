import { useState } from 'react'
import { ChevronRight, LoaderCircle, LocateFixed, RefreshCw, UserRound } from 'lucide-react'
import { Avatar, Card } from '../components'
import { Busy, ErrorBox, PageHeading } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api, post } from '../api'
import type { Session } from '../types'
import { initials, time } from '../utils/format'
import { locate } from '../utils/device'

type LocationEntry = { employee_id: string; full_name: string; job_title: string; latitude: string; longitude: string; accuracy_meters: string; recorded_at: string }

export function MapsPage({ user, notify }: { user: Session; notify: (text: string, error?: boolean) => void }) {
  const { data, loading, error, reload } = useLoad(() => api<LocationEntry[]>('/locations'), [user.role])
  const [sending, setSending] = useState(false)
  const send = async () => {
    setSending(true)
    try { const position = await locate(); await post('/locations', position); notify('Lokasi kerja berhasil diperbarui.'); await reload() }
    catch (e) { notify(e instanceof Error ? e.message : 'Lokasi gagal dikirim.', true) }
    finally { setSending(false) }
  }
  return (
    <>
      <PageHeading title="Live tracking" subtitle="Lokasi hanya direkam saat pengguna mengirim pembaruan dari perangkatnya."
        action={<>
          <button className="button primary" onClick={send} disabled={sending}>{sending ? <LoaderCircle className="spin" /> : <LocateFixed size={17} />} Kirim lokasi saya</button>
          {user.role === 'admin' && <button className="button secondary" onClick={reload}><RefreshCw size={16} /> Perbarui</button>}
        </>} />
      {loading ? <Busy /> : error ? <ErrorBox message={error} retry={reload} /> : (
        <div className="map-layout">
          <Card className="map-panel"><div className="fake-map live-map"><div className="map-grid" /><div className="road r1" /><div className="road r2" /><div className="road r3" />
            {data?.map((person, i) => <a key={person.employee_id} className="map-pin" style={{ left: `${25 + (i * 19) % 55}%`, top: `${25 + (i * 23) % 50}%` }} href={`https://www.openstreetmap.org/?mlat=${person.latitude}&mlon=${person.longitude}#map=17/${person.latitude}/${person.longitude}`} target="_blank" rel="noreferrer"><UserRound size={15} /></a>)}
            {!data?.length && <div className="map-empty"><LocateFixed /><strong>Belum ada lokasi aktif</strong><span>Klik Kirim lokasi saya lalu izinkan akses lokasi dari browser.</span></div>}
          </div></Card>
          <Card className="online-list"><div className="card-heading"><div><h2>Lokasi terbaru</h2><p>{user.role === 'admin' ? 'Dalam 7 hari terakhir' : 'Lokasi terakhir akun Anda'}</p></div>{data?.length ? <span className="live"><i />LIVE</span> : null}</div>
            {data?.map(person => <a className="online-person person-link" href={`https://www.openstreetmap.org/?mlat=${person.latitude}&mlon=${person.longitude}`} target="_blank" rel="noreferrer" key={person.employee_id}><Avatar initials={initials(person.full_name)} /><div><strong>{person.full_name}</strong><small>{person.job_title} • {time(person.recorded_at)} WIB</small></div><ChevronRight size={17} /></a>)}
          </Card>
        </div>
      )}
    </>
  )
}
