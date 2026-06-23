import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export async function locate() {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions()
    if (permission.location === 'denied') throw new Error('Izin lokasi ditolak.')
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 })
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }
  }
  return new Promise<{ latitude: number; longitude: number; accuracy: number }>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => reject(new Error('Lokasi tidak dapat diakses.')),
      { enableHighAccuracy: true, timeout: 12000 },
    ),
  )
}

export async function hashImage(data: string) {
  const bytes = new TextEncoder().encode(data)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('')
}
