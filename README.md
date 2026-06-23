# Hadirin AI

Aplikasi attendance dan HR berbasis React, Vercel Functions, Neon PostgreSQL, dan Capacitor Android. Data demo telah dihapus; deployment baru selalu dimulai dari onboarding administrator dan database kosong.

## Fitur aktif

- Onboarding admin pertama dan autentikasi JWT
- Karyawan dan akun employee
- Absensi kamera depan, bukti hash foto, dan koordinat GPS
- Tipe shift dan auto-roster
- Live location selama karyawan mengirim pembaruan
- Payroll berdasarkan hari kerja/kehadiran aktual
- Ekspor CSV; Android menggunakan native share sheet
- Dashboard admin dan navigasi employee yang responsif
- Audit log untuk operasi penting

## Jalankan frontend

```bash
npm install
npm run dev
```

API membutuhkan `DATABASE_URL` dan `JWT_SECRET`. Salin `.env.example` menjadi `.env.local` untuk pengembangan yang terhubung database.

```bash
npm run build
npm run check:api
```

## Test browser

Playwright sudah dikonfigurasi untuk smoke test production. Browser Chromium bisa disiapkan dengan:

```bash
npx playwright install chromium
npm run test:e2e
```

Default test memakai `https://absen-bice-phi.vercel.app`. Untuk URL lain di PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL="https://url-anda.vercel.app"; npm run test:e2e
```

## Login Google

GitHub login tidak digunakan. Untuk mengaktifkan Google login, buat OAuth Client di Google Cloud dengan redirect URI:

```text
https://domain-anda.vercel.app/api/auth/google/callback
```

Lalu set environment variable Vercel Production:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://domain-anda.vercel.app/api/auth/google/callback
APP_ORIGIN=https://domain-anda.vercel.app
```

Google login hanya menerima email yang sudah terdaftar sebagai user di Hadirin AI.

## Deploy Vercel

Panduan lengkap tersedia di [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Ringkasnya:

1. Import repository ke Vercel.
2. Tambahkan database Neon dari Vercel Marketplace.
3. Tambahkan `JWT_SECRET` minimal 32 karakter.
4. Deploy dan buka URL aplikasi.
5. Form pertama akan membuat organisasi serta administrator pertama.

Tabel database dibuat otomatis saat API pertama kali diakses. Tidak ada seed atau data contoh.

## Build Android

Isi URL Vercel pada `.env.production.local`:

```env
VITE_API_URL=https://nama-proyek.vercel.app
```

Kemudian:

```bash
npm run android:apk
```

APK berada di `android/app/build/outputs/apk/debug/app-debug.apk`. Kamera, GPS, penyimpanan cache, dan share sheet sudah memakai plugin native Capacitor.

## Struktur

- `api/[...route].ts` — seluruh REST API Vercel
- `src/LiveApp.tsx` — aplikasi web/Android live
- `src/api.ts` — client API dan ekspor native
- `android/` — proyek Android Studio
- `database/schema.sql` — skema referensi PostgreSQL lengkap
- `docs/api-spec.md` — kontrak API tingkat produk
