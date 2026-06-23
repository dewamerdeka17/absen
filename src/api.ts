import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export type ApiError = Error & { code?: string; fields?: Record<string, string[]>; status?: number }

const normalize = (value: string) => value.replace(/\/$/, '')

export function getApiBase() {
  const saved = localStorage.getItem('hadirin_api_url')
  const configured = import.meta.env.VITE_API_URL as string | undefined
  return normalize(saved || configured || '')
}

export function setApiBase(value: string) {
  const base = normalize(value.trim())
  if (base) localStorage.setItem('hadirin_api_url', base)
  else localStorage.removeItem('hadirin_api_url')
}

export function setToken(token?: string) {
  if (token) localStorage.setItem('hadirin_token', token)
  else localStorage.removeItem('hadirin_token')
}

export function hasToken() {
  return Boolean(localStorage.getItem('hadirin_token'))
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('hadirin_token')
  const response = await fetch(`${getApiBase()}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Permintaan gagal (${response.status})`) as ApiError
    error.code = payload?.error?.code
    error.fields = payload?.error?.fields
    error.status = response.status
    throw error
  }
  return payload.data as T
}

export function post<T>(path: string, data?: unknown) {
  return api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) })
}

export function patch<T>(path: string, data: unknown) {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(data) })
}

export function remove(path: string) {
  return api(path, { method: 'DELETE' })
}

export async function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) throw new Error('Belum ada data untuk diekspor.')
  const columns = Object.keys(rows[0])
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [columns.map(escape).join(','), ...rows.map(row => columns.map(column => escape(row[column])).join(','))].join('\n')
  if (Capacitor.isNativePlatform()) {
    const saved = await Filesystem.writeFile({ path: filename, data: `\ufeff${csv}`, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: filename, text: 'Laporan Hadirin AI', files: [saved.uri], dialogTitle: 'Bagikan laporan' })
    return
  }
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
