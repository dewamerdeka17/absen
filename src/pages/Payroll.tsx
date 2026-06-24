import { useState } from 'react'
import { Check, Download, Gauge, LoaderCircle, RefreshCw, WalletCards } from 'lucide-react'
import { Avatar, Badge, Card, EmptyState } from '../components'
import { Busy, ErrorBox, PageHeading } from '../components/ui'
import { useLoad } from '../hooks/useLoad'
import { api, post } from '../api'
import type { PayrollData } from '../types'
import { initials, monthNow, rupiah } from '../utils/format'
import { downloadXlsx } from '../utils/xlsx'

export function PayrollPage({ notify }: { notify: (text: string, error?: boolean) => void }) {
  const [month, setMonth] = useState(monthNow()), [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useLoad(() => api<PayrollData>(`/payroll?month=${month}`), [month])
  const generate = async () => { setBusy(true); try { await post('/payroll/generate', { month }); notify('Payroll berhasil dihitung.'); await reload() } catch (e) { notify(e instanceof Error ? e.message : 'Gagal menghitung payroll.', true) } finally { setBusy(false) } }
  const approve = async () => { if (!data?.run) return; setBusy(true); try { await post(`/payroll/${data.run.id}/approve`); notify('Payroll disetujui.'); await reload() } catch (e) { notify(e instanceof Error ? e.message : 'Gagal menyetujui.', true) } finally { setBusy(false) } }
  const exportPayroll = () => {
    if (!data?.items.length) return notify('Belum ada data payroll untuk diekspor.', true)
    downloadXlsx(`payroll-${month}.xlsx`, [{
      name: 'Payroll',
      headerRow: 3,
      currencyColumns: [2, 3, 4, 5],
      rows: [
        [`Payroll ${month}`],
        [],
        ['Nama karyawan', 'Gaji pokok', 'Terlambat', 'Absen', 'Gaji bersih', 'Status'],
        ...data.items.map(item => [item.full_name, Number(item.basic_salary), Number(item.late_deduction), Number(item.absence_deduction), Number(item.net_salary), data.run?.status || 'draft']),
      ],
    }])
  }
  const total = data?.items.reduce((sum, item) => sum + Number(item.net_salary), 0) || 0
  return (
    <>
      <PageHeading title="Penggajian" subtitle="Perhitungan otomatis berdasarkan kehadiran bulan berjalan." action={<input className="month-input" type="month" value={month} onChange={e => setMonth(e.target.value)} />} />
      {loading ? <Busy /> : error ? <ErrorBox message={error} retry={reload} /> : !data?.run ? (
        <Card><EmptyState icon={<WalletCards />} title="Payroll belum dihitung" text="Sistem akan menghitung gaji, potongan keterlambatan, dan ketidakhadiran dari data aktual." />
        <div className="empty-actions"><button className="button primary" disabled={busy} onClick={generate}>{busy ? <LoaderCircle className="spin" /> : <Gauge size={17} />} Hitung payroll {month}</button></div></Card>
      ) : (
        <>
          <div className="payroll-banner"><div><span><WalletCards /></span><div><p>Total penggajian • {month}</p><strong>{rupiah(total)}</strong><small>{data.items.length} karyawan • Status {data.run.status}</small></div></div>
          {data.run.status === 'review' && <button className="button light-button" disabled={busy} onClick={approve}><Check size={17} /> Setujui</button>}</div>
          <Card><div className="card-heading payroll-heading"><div><h2>Rincian penggajian</h2><p>Dihitung dari 22 hari kerja standar</p></div>
          <div className="inline-actions"><button className="button secondary" onClick={generate}><RefreshCw size={16} /> Hitung ulang</button><button className="button secondary" onClick={exportPayroll}><Download size={16} /> XLSX</button></div></div>
          <div className="table-scroll"><table>
            <thead><tr><th>KARYAWAN</th><th>GAJI POKOK</th><th>TERLAMBAT</th><th>ABSEN</th><th>GAJI BERSIH</th><th>STATUS</th></tr></thead>
            <tbody>{data.items.map(item => (
              <tr key={item.id}>
                <td><div className="person"><Avatar small initials={initials(item.full_name)} /><span><strong>{item.full_name}</strong><small>{item.job_title}</small></span></div></td>
                <td>{rupiah(item.basic_salary)}</td><td className="negative">-{rupiah(item.late_deduction)}</td><td className="negative">-{rupiah(item.absence_deduction)}</td>
                <td><strong>{rupiah(item.net_salary)}</strong></td><td><Badge tone={data.run!.status === 'approved' ? 'green' : 'blue'}>{data.run!.status}</Badge></td>
              </tr>
            ))}</tbody>
          </table></div></Card>
        </>
      )}
    </>
  )
}
