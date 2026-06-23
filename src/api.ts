import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export type ApiError = Error & { code?: string; fields?: Record<string, string[]>; status?: number }

const normalize = (value: string) => value.replace(/\/$/, '')
const tokenKey = 'hadirin_token'

export function getApiBase() {
  localStorage.removeItem('hadirin_api_url')
  const configured = import.meta.env.VITE_API_URL as string | undefined
  return normalize(configured || '')
}

function getToken() {
  return localStorage.getItem(tokenKey) || sessionStorage.getItem(tokenKey)
}

export function setToken(token?: string, remember = true) {
  localStorage.removeItem(tokenKey)
  sessionStorage.removeItem(tokenKey)
  if (!token) return
  if (remember) localStorage.setItem(tokenKey, token)
  else sessionStorage.setItem(tokenKey, token)
}

export function hasToken() {
  return Boolean(getToken())
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
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
    await Share.share({ title: filename, text: 'Laporan IdenTime', files: [saved.uri], dialogTitle: 'Bagikan laporan' })
    return
  }
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
