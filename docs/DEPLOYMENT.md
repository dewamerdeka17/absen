# Deployment Vercel + Neon

## 1. Buat project Vercel

Push folder ini ke GitHub/GitLab/Bitbucket, lalu pilih **Add New → Project** di Vercel dan import repository. Framework akan terdeteksi sebagai Vite; konfigurasi produksi sudah tersedia di `vercel.json`.

## 2. Tambahkan database gratis

Di dashboard project Vercel:

1. Buka **Storage** atau **Marketplace**.
2. Pilih integrasi **Neon Postgres**.
3. Buat database dan hubungkan ke project untuk Production, Preview, dan Development sesuai kebutuhan.
4. Pastikan environment variable `DATABASE_URL` muncul di project.

Referensi resmi: [Vercel Marketplace](https://vercel.com/marketplace) dan [Neon–Vercel integration](https://neon.com/docs/guides/vercel).

API menjalankan `CREATE TABLE IF NOT EXISTS` secara terkunci pada koneksi pertama. Database baru tidak berisi seed atau akun contoh.

## 3. Tambahkan rahasia autentikasi

Generate secret lokal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Tambahkan hasilnya sebagai `JWT_SECRET` pada **Project Settings → Environment Variables** untuk Production dan Preview. Jangan memakai nilai dari `.env.example`.

## 4. Deploy

Klik **Deploy** atau push commit baru. Build yang benar menghasilkan folder `dist` dan Vercel Function di `/api/*`.

Tes setelah deployment:

```text
https://nama-proyek.vercel.app/api/status
```

Respons pertama harus menunjukkan `database: connected` dan `configured: false`. Buka halaman utama untuk membuat organisasi dan administrator pertama. Setelah akun pertama dibuat, endpoint setup otomatis terkunci.

## 5. Hubungkan Android

Buat file `.env.production.local` yang tidak di-commit:

```env
VITE_API_URL=https://nama-proyek.vercel.app
```

Build ulang:

```bash
npm run android:apk
```

Jika APK sudah terpasang sebelum URL diketahui, URL Vercel juga dapat dimasukkan lewat panel **Server aplikasi** pada halaman login.

## 6. Production hardening

- Gunakan domain HTTPS sendiri bila tersedia.
- Pisahkan database Preview dan Production.
- Rotasi `JWT_SECRET` bila bocor; semua sesi lama akan otomatis tidak berlaku.
- Gunakan APK/AAB release dengan keystore organisasi sebelum distribusi publik.
- Buat kebijakan retensi lokasi dan persetujuan biometrik sesuai regulasi perusahaan.
- Foto wajah tidak disimpan oleh implementasi ini; database hanya menerima hash bukti foto dan metadata perangkat.

