import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export async function locate() {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions()
    if (permission.location === 'denied') throw new Error('Izin lokasi ditolak.')
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 })
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }
  }
  if (!navigator.geolocation) throw new Error('Browser ini tidak mendukung geolokasi.')
  return new Promise<{ latitude: number; longitude: number; accuracy: number }>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      error => {
        if (error.code === error.PERMISSION_DENIED) reject(new Error('Izin lokasi ditolak. Aktifkan izin lokasi untuk menguji live tracking.'))
        else if (error.code === error.TIMEOUT) reject(new Error('Pengambilan lokasi terlalu lama. Coba lagi.'))
        else reject(new Error('Lokasi tidak dapat diakses.'))
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    ),
  )
}

export async function hashImage(data: string) {
  const bytes = new TextEncoder().encode(data)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('')
}
