import { Download, FileBarChart } from 'lucide-react'
import { Card } from '../components'
import { PageHeading } from '../components/ui'
import { api, downloadCsv } from '../api'
import type { PayrollData } from '../types'
import { addDays, monday, monthNow, today } from '../utils/format'

export function ReportsPage({ notify }: { notify: (text: string, error?: boolean) => void }) {
  const reports = [
    { title: 'Data karyawan', text: 'Profil dan komponen pekerjaan seluruh karyawan.', path: '/employees', file: 'karyawan.csv' },
    { title: 'Absensi hari ini', text: 'Status dan waktu kehadiran aktual.', path: `/attendance?date=${today()}`, file: `absensi-${today()}.csv` },
    { title: 'Payroll bulan ini', text: 'Rincian perhitungan gaji bulan berjalan.', path: `/payroll?month=${monthNow()}`, file: `payroll-${monthNow()}.csv` },
    { title: 'Roster minggu ini', text: 'Jadwal shift minggu berjalan.', path: `/rosters?from=${monday()}&to=${addDays(monday(), 6)}`, file: 'roster.csv' },
  ]
  const download = async (report: typeof reports[number]) => {
    try { const data = await api<unknown>(report.path); const rows = Array.isArray(data) ? data : (data as PayrollData).items || []; downloadCsv(report.file, rows as Record<string, unknown>[]) }
    catch (e) { notify(e instanceof Error ? e.message : 'Ekspor gagal.', true) }
  }
  return (
    <>
      <PageHeading title="Laporan" subtitle="Ekspor data aktual ke CSV yang kompatibel dengan Excel." />
      <div className="report-grid">
        {reports.map((report, i) => (
          <Card className="report-card" key={report.title}>
            <span className={`report-icon ri-${i}`}><FileBarChart /></span>
            <h3>{report.title}</h3><p>{report.text}</p>
            <div><button className="button secondary full-button" onClick={() => download(report)}><Download size={16} /> Unduh CSV</button></div>
          </Card>
        ))}
      </div>
    </>
  )
}
