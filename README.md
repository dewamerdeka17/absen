# IdenTime

Aplikasi attendance dan HR berbasis React, Vercel Functions, Neon PostgreSQL, dan Capacitor Android. Data demo telah dihapus; deployment baru dimulai dari onboarding perusahaan dan akun owner.

## Fitur aktif

- Onboarding owner pertama dan autentikasi JWT
- Login dengan email, nomor HP, username/nomor karyawan, atau nama unik
- Karyawan, role akun, reset password sementara, dan wajib ganti password pertama kali
- Absensi kamera depan, bukti hash foto, GPS, akurasi, timestamp, dan validasi radius lokasi kerja 50-100 meter
- Tipe shift dan generate roster otomatis berbasis aturan
- Live tracking karyawan yang sedang check-in dengan status online/stale/offline
- Payroll berdasarkan hari kerja/kehadiran aktual
- Ekspor laporan XLSX multi-sheet dengan format Rupiah
- Dashboard dan navigasi responsif untuk owner, admin, HRD, manager, dan karyawan
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

## Buat perusahaan dan akun owner

Cara utama adalah onboarding UI:

1. Deploy atau jalankan aplikasi.
2. Jika database masih kosong, halaman pertama menampilkan form `Siapkan ruang kerja`.
3. Isi nama organisasi, nama owner, email owner, dan password minimal 8 karakter.
4. User pertama otomatis menjadi `owner`.

Cara CLI/seed:

```powershell
$env:DATABASE_URL="postgresql://..."
$env:ORG_NAME="Nama Perusahaan"
$env:OWNER_NAME="Nama Owner"
$env:OWNER_EMAIL="owner@perusahaan.com"
$env:OWNER_PASSWORD="PasswordMinimal8"
npm run seed:admin
```

Opsional: set `ORG_SLUG` untuk menentukan slug organisasi.

## Role

- `owner`: akses penuh termasuk organisasi dan user management.
- `admin`: konfigurasi operasional dan user management.
- `hrd`: karyawan, absensi, payroll, laporan, reset password, dan lokasi kerja.
- `manager`: roster, absensi, live tracking, dan lokasi kerja operasional.
- `employee`: absensi, live tracking dirinya, roster/profil pribadi.

Owner/admin/HRD dapat mengedit akun karyawan dan role dari menu `Karyawan`. Password sementara disimpan sebagai hash dan akun baru wajib mengganti password setelah login pertama.

## Lokasi kerja dan absensi

Atur lokasi kerja dari `Pengaturan`:

- nama lokasi
- latitude
- longitude
- radius 50-100 meter
- status aktif/nonaktif

Check-in/check-out akan ditolak jika foto belum diambil, GPS/akurasi tidak tersedia, belum ada lokasi aktif, atau jarak perangkat di luar radius lokasi kerja. Jarak dihitung dengan rumus Haversine di backend.

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

## Deploy Vercel

Panduan lengkap tersedia di [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Ringkasnya:

1. Import repository ke Vercel.
2. Tambahkan database Neon dari Vercel Marketplace.
3. Tambahkan `JWT_SECRET` minimal 32 karakter.
4. Deploy dan buka URL aplikasi.
5. Form pertama akan membuat organisasi serta akun owner pertama.

Tabel dan migrasi ringan dibuat otomatis saat API pertama kali diakses. Update schema terbaru menambah `must_change_password`, role owner/admin/HRD/manager/employee, `work_locations`, dan metadata absensi lokasi. Tidak ada data contoh.

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
