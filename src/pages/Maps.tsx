import { useEffect, useRef, useState } from 'react'
import { ChevronRight, LoaderCircle, LocateFixed, MapPin, RefreshCw } from 'lucide-react'
import { Avatar, Badge, Card } from '../components'
import { Busy, ErrorBox, PageHeading } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api, post } from '../api'
import type { Session } from '../types'
import { initials, time } from '../utils/format'
import { locate } from '../utils/device'

declare global {
  interface Window {
    google?: any
    __identimeGoogleMapsPromise?: Promise<any>
  }
}

type LocationEntry = {
  employee_id: string
  full_name: string
  job_title: string
  latitude: string
  longitude: string
  accuracy_meters: string
  recorded_at: string
  tracking_status: 'online' | 'stale' | 'offline'
  distance_meters?: string
  work_location_name?: string
}

const mapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim()
const defaultCenter = { lat: -6.2, lng: 106.816666 }
const missingKeyMessage = 'Google Maps API key belum dikonfigurasi. Tambahkan VITE_GOOGLE_MAPS_API_KEY di file environment.'
const deniedLocationMessage = 'Izin lokasi ditolak. Aktifkan izin lokasi browser untuk mengirim lokasi.'

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve(window.google)
  if (window.__identimeGoogleMapsPromise) return window.__identimeGoogleMapsPromise
  window.__identimeGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.google)
    script.onerror = () => reject(new Error('Google Maps gagal dimuat. Periksa API key dan akses jaringan.'))
    document.head.appendChild(script)
  })
  return window.__identimeGoogleMapsPromise
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] || char))

function markerContent(person: LocationEntry) {
  const distance = person.distance_meters ? `<p>Jarak: ${Math.round(Number(person.distance_meters))} m${person.work_location_name ? ` dari ${escapeHtml(person.work_location_name)}` : ''}</p>` : ''
  return `<div class="gm-info">
    <strong>${escapeHtml(person.full_name)}</strong>
    <p>Status: ${escapeHtml(person.tracking_status)}</p>
    <p>Update: ${escapeHtml(time(person.recorded_at))} WIB</p>
    <p>Akurasi: ${Math.round(Number(person.accuracy_meters || 0))} m</p>
    ${distance}
  </div>`
}

function GoogleTrackingMap({ people }: { people: LocationEntry[] }) {
  const mapNode = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const markers = useRef<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    markers.current.forEach(marker => marker.setMap(null))
    markers.current = []
    setError('')

    if (!mapsApiKey) return
    let cancelled = false
    void loadGoogleMaps(mapsApiKey)
      .then(google => {
        if (cancelled || !mapNode.current) return
        const points = people
          .map(person => ({ person, position: { lat: Number(person.latitude), lng: Number(person.longitude) } }))
          .filter(point => Number.isFinite(point.position.lat) && Number.isFinite(point.position.lng))

        if (!map.current) {
          map.current = new google.maps.Map(mapNode.current, {
            center: points[0]?.position || defaultCenter,
            zoom: points.length ? 16 : 11,
            mapTypeControl: false,
            fullscreenControl: true,
            streetViewControl: false,
          })
        }

        if (!points.length) {
          map.current.setCenter(defaultCenter)
          map.current.setZoom(11)
          return
        }

        const bounds = new google.maps.LatLngBounds()
        points.forEach(({ person, position }) => {
          bounds.extend(position)
          const marker = new google.maps.Marker({
            map: map.current,
            position,
            title: person.full_name,
            label: { text: initials(person.full_name).slice(0, 2), color: '#ffffff', fontWeight: '700' },
          })
          const info = new google.maps.InfoWindow({ content: markerContent(person) })
          marker.addListener('click', () => info.open({ anchor: marker, map: map.current }))
          markers.current.push(marker)
        })

        if (points.length === 1) {
          map.current.setCenter(points[0].position)
          map.current.setZoom(17)
        } else {
          map.current.fitBounds(bounds, 60)
        }
      })
      .catch(error => {
        if (!cancelled) setError(error instanceof Error ? error.message : 'Google Maps gagal dimuat.')
      })
    return () => { cancelled = true }
  }, [people])

  if (!mapsApiKey) {
    return <div className="map-message"><MapPin /><strong>{missingKeyMessage}</strong></div>
  }

  return (
    <div className="google-map-wrap">
      <div ref={mapNode} className="google-map" />
      {error && <div className="map-message map-message-overlay"><MapPin /><strong>{error}</strong></div>}
      {!people.length && !error && <div className="map-message map-message-overlay"><LocateFixed /><strong>Belum ada karyawan aktif yang mengirim lokasi.</strong></div>}
    </div>
  )
}

export function MapsPage({ user, notify }: { user: Session; notify: (text: string, error?: boolean) => void }) {
  const { data, loading, error, reload } = useLoad(() => api<LocationEntry[]>('/locations'), [user.role])
  const [sending, setSending] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => void reload(), 45000)
    return () => window.clearInterval(timer)
  }, [reload])
  const send = async () => {
    setSending(true)
    try { const position = await locate(); await post('/locations', position); notify('Lokasi kerja berhasil diperbarui.'); await reload() }
    catch (e) {
      const message = e instanceof Error && /izin lokasi ditolak/i.test(e.message) ? deniedLocationMessage : e instanceof Error ? e.message : 'Lokasi gagal dikirim.'
      notify(message, true)
    }
    finally { setSending(false) }
  }
  const people = data || []
  return (
    <>
      <PageHeading title="Live tracking" subtitle="Menampilkan karyawan yang masih check-in. Data diperbarui otomatis setiap 45 detik."
        action={<>
          <button className="button primary" onClick={send} disabled={sending}>{sending ? <LoaderCircle className="spin" /> : <LocateFixed size={17} />} Kirim lokasi saya</button>
          <button className="button secondary" onClick={reload}><RefreshCw size={16} /> Perbarui</button>
        </>} />
      {loading ? <Busy /> : error ? <ErrorBox message={error} retry={reload} /> : (
        <div className="map-layout">
          <Card className="map-panel"><GoogleTrackingMap people={people} /></Card>
          <Card className="online-list"><div className="card-heading"><div><h2>Lokasi terbaru</h2><p>{user.role === 'admin' ? 'Karyawan aktif yang sedang check-in' : 'Lokasi terakhir akun Anda'}</p></div>{people.length ? <span className="live"><i />LIVE</span> : null}</div>
            {people.length ? people.map(person => <a className="online-person person-link" href={`https://www.google.com/maps/search/?api=1&query=${person.latitude},${person.longitude}`} target="_blank" rel="noreferrer" key={person.employee_id}><Avatar initials={initials(person.full_name)} /><div><strong>{person.full_name}</strong><small>{person.job_title} • {time(person.recorded_at)} WIB • akurasi {Math.round(Number(person.accuracy_meters || 0))} m{person.distance_meters ? ` • ${Math.round(Number(person.distance_meters))} m dari ${person.work_location_name || 'lokasi kerja'}` : ''}</small></div><Badge tone={person.tracking_status === 'online' ? 'green' : person.tracking_status === 'stale' ? 'orange' : 'blue'}>{person.tracking_status}</Badge><ChevronRight size={17} /></a>) : <div className="map-list-empty">Belum ada karyawan aktif yang mengirim lokasi.</div>}
          </Card>
        </div>
      )}
    </>
  )
}
