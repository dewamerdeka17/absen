import { Download, FileBarChart } from 'lucide-react'
import { Card } from '../components'
import { PageHeading } from '../components/ui'
import { api } from '../api'
import type { AttendanceRow, Employee, Organization, PayrollData, RosterRow } from '../types'
import { addDays, monday, monthNow, rupiah, today } from '../utils/format'
import { downloadXlsx } from '../utils/xlsx'

export function ReportsPage({ notify, org }: { notify: (text: string, error?: boolean) => void; org: Organization }) {
  const reports = [
    { title: 'Workbook operasional', text: 'Ringkasan, absensi, payroll, dan roster dalam satu file Excel.' },
    { title: 'Detail absensi', text: 'Jam check-in/out, status, jarak lokasi, akurasi GPS, dan catatan.' },
    { title: 'Payroll Rupiah', text: 'Komponen gaji diformat Rupiah dan tetap bernilai angka.' },
    { title: 'Roster shift', text: 'Jadwal mingguan hasil generate otomatis berbasis aturan.' },
  ]
  const download = async () => {
    try {
      const [employees, attendance, payroll, roster] = await Promise.all([
        api<Employee[]>('/employees'),
        api<AttendanceRow[]>(`/attendance?date=${today()}`),
        api<PayrollData>(`/payroll?month=${monthNow()}`),
        api<RosterRow[]>(`/rosters?from=${monday()}&to=${addDays(monday(), 6)}`),
      ])
      const totalPayroll = payroll.items.reduce((sum, item) => sum + Number(item.net_salary || 0), 0)
      downloadXlsx(`laporan-identime-${today()}.xlsx`, [
        {
          name: 'Ringkasan',
          headerRow: 3,
          currencyColumns: [2],
          rows: [
            ['Ringkasan laporan IdenTime'],
            [],
            ['Metrik', 'Nilai'],
            ['Nama perusahaan', org.name],
            ['Periode laporan', `${today()} / ${monthNow()}`],
            ['Tanggal generate', new Date().toLocaleString('id-ID')],
            ['Total karyawan', employees.length],
            ['Total hadir', attendance.filter(row => row.status === 'present' || row.status === 'late').length],
            ['Total terlambat', attendance.filter(row => row.status === 'late').length],
            ['Total tidak hadir', attendance.filter(row => !row.status).length],
            ['Total payroll', totalPayroll],
          ],
        },
        {
          name: 'Detail Absensi',
          headerRow: 3,
          statusColumn: 7,
          rows: [
            ['Detail absensi'],
            [],
            ['Tanggal', 'Nama karyawan', 'Role/divisi/lokasi', 'Check-in/out', 'Status', 'Jarak dari lokasi', 'Akurasi GPS', 'Foto', 'Catatan'],
            ...attendance.map(row => [
              today(),
              row.full_name,
              `${row.job_title} / ${row.department} / ${row.work_location_name || '-'}`,
              row.captured_at || '-',
              row.status || 'absent',
              row.distance_meters ? `${Math.round(Number(row.distance_meters))} m` : '-',
              row.accuracy_meters ? `${Math.round(Number(row.accuracy_meters))} m` : '-',
              '-',
              row.event_type || 'Belum ada absensi',
            ]),
          ],
        },
        {
          name: 'Payroll',
          headerRow: 3,
          currencyColumns: [2, 3, 4, 5, 6],
          rows: [
            ['Payroll'],
            [],
            ['Nama karyawan', 'Gaji pokok', 'Tunjangan', 'Potongan', 'Lembur', 'Total gaji', 'Status approval'],
            ...payroll.items.map(item => [
              item.full_name,
              Number(item.basic_salary || 0),
              0,
              Number(item.late_deduction || 0) + Number(item.absence_deduction || 0),
              Number(item.overtime_amount || 0),
              Number(item.net_salary || 0),
              payroll.run?.status || 'draft',
            ]),
          ],
        },
        {
          name: 'Roster',
          headerRow: 3,
          rows: [
            ['Roster'],
            [],
            ['Tanggal', 'Shift', 'Lokasi', 'Nama karyawan', 'Jam mulai', 'Jam selesai'],
            ...roster.map(row => [row.shift_date, row.shift_name, '-', row.full_name, row.start_time, row.end_time]),
          ],
        },
      ])
      notify(`Laporan XLSX dibuat. Total payroll ${rupiah(totalPayroll)}.`)
    }
    catch (e) { notify(e instanceof Error ? e.message : 'Ekspor gagal.', true) }
  }
  return (
    <>
      <PageHeading title="Laporan" subtitle="Ekspor workbook XLSX rapi untuk absensi, payroll, dan roster." action={<button className="button primary" onClick={download}><Download size={17} /> Unduh XLSX</button>} />
      <div className="report-grid">
        {reports.map((report, i) => (
          <Card className="report-card" key={report.title}>
            <span className={`report-icon ri-${i}`}><FileBarChart /></span>
            <h3>{report.title}</h3><p>{report.text}</p>
            <div><button className="button secondary full-button" onClick={download}><Download size={16} /> Unduh XLSX</button></div>
          </Card>
        ))}
      </div>
    </>
  )
}
