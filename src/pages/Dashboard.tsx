import {
  AlarmClock, Bot, BriefcaseBusiness, Camera as CameraIcon, ChevronRight,
  CircleDollarSign, Clock3, FileBarChart, Fingerprint, Plus, ShieldCheck, UserCheck, Users,
} from 'lucide-react'
import { Avatar, Badge, MetricCard } from '../components'
import { BrandLogo } from '../components/BrandLogo'
import { Busy, ErrorBox, PageHeading } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api } from '../api'
import type { DashboardData, NavId } from '../types'
import { initials, time } from '../utils/format'

export function Dashboard({ go, scan }: { go: (id: NavId) => void; scan: () => void }) {
  const { data, loading, error, reload } = useLoad(() => api<DashboardData>('/dashboard'), [])
  if (loading) return <Busy />
  if (error || !data) return <ErrorBox message={error} retry={reload} />
  const m = data.metrics
  const presentRate = m.employees ? Math.round((m.present / m.employees) * 100) : 0
  return (
    <>
      <PageHeading
        title="Ringkasan hari ini"
        subtitle={`${new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())} • Data diperbarui langsung`}
        action={<button className="button primary" onClick={() => go('employees')}><Plus size={18} /> Tambah karyawan</button>}
      />
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <Badge tone="blue"><ShieldCheck size={12} /> Authentic Presence</Badge>
          <h2>Kehadiran tervalidasi dalam satu ruang kontrol.</h2>
          <p>{m.employees} karyawan aktif, {m.present} sudah tercatat hadir, dan {m.absent} masih perlu dipantau hari ini.</p>
        </div>
        <div className="presence-score-card">
          <BrandLogo markOnly />
          <div>
            <strong>{presentRate}%</strong>
            <span>terverifikasi hari ini</span>
          </div>
        </div>
        <div className="dashboard-hero-actions">
          <button className="button primary" onClick={scan}><Fingerprint size={17} /> Scan absensi</button>
          <button className="button secondary" onClick={() => go('roster')}><Bot size={17} /> Susun roster</button>
        </div>
      </section>
      <div className="metrics-grid">
        <MetricCard icon={<Users />} label="Total karyawan" value={String(m.employees)} note="Aktif" />
        <MetricCard icon={<UserCheck />} label="Hadir hari ini" value={String(m.present)} note={m.employees ? `${Math.round(m.present / m.employees * 100)}%` : '0%'} tone="green" />
        <MetricCard icon={<AlarmClock />} label="Terlambat" value={String(m.late)} note="Hari ini" tone="orange" />
        <MetricCard icon={<BriefcaseBusiness />} label="Belum hadir" value={String(m.absent)} note="Hari ini" tone="purple" />
      </div>
      {m.employees === 0 ? (
        <section className="card">
          <div className="empty-state"><span><Users /></span><h3>Belum ada karyawan</h3><p>Tambahkan karyawan pertama untuk mulai menggunakan absensi, roster, dan payroll.</p></div>
          <div className="empty-actions"><button className="button primary" onClick={() => go('employees')}><Plus size={17} /> Tambah karyawan</button></div>
        </section>
      ) : (
        <div className="lower-grid">
          <section className="card activity-card">
            <div className="card-heading">
              <div><h2>Aktivitas terbaru</h2><p>Check-in dan check-out tersimpan langsung</p></div>
              <button className="text-button" onClick={() => go('attendance')}>Lihat semua <ChevronRight size={15} /></button>
            </div>
            {data.recent.length ? (
              <div className="activity-list">
                {data.recent.map(item => (
                  <div className="activity-item" key={item.id}>
                    <Avatar initials={initials(item.full_name)} />
                    <div><strong>{item.full_name}</strong><p>{item.event_type === 'check_in' ? 'Melakukan check-in' : 'Melakukan check-out'} • {item.job_title}</p></div>
                    <span><b>{time(item.captured_at)} WIB</b><Badge tone={item.status === 'late' ? 'orange' : 'green'}>{item.status === 'late' ? 'Terlambat' : 'Berhasil'}</Badge></span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state"><span><Clock3 /></span><h3>Belum ada aktivitas</h3><p>Aktivitas absensi hari ini akan muncul di sini.</p></div>
            )}
          </section>
          <section className="card quick-card">
            <div className="card-heading"><div><h2>Aksi cepat</h2><p>Operasional yang sering digunakan</p></div></div>
            <div className="quick-grid">
              <button onClick={scan}><span className="tone-blue"><CameraIcon /></span><b>Scan wajah</b><small>Check-in/out</small></button>
              <button onClick={() => go('roster')}><span className="tone-purple"><Bot /></span><b>Buat roster</b><small>Otomatis</small></button>
              <button onClick={() => go('payroll')}><span className="tone-green"><CircleDollarSign /></span><b>Proses gaji</b><small>Bulan ini</small></button>
              <button onClick={() => go('reports')}><span className="tone-orange"><FileBarChart /></span><b>Ekspor data</b><small>CSV</small></button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
