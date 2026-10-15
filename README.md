# RuangAbsen

Aplikasi absensi siswa berbasis QR code. Seluruh data siswa dan absensi disimpan di IndexedDB browser; aplikasi tidak memakai backend atau database server.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

## Data siswa

Tambahkan siswa dari halaman **Data Siswa**, atau impor file `.xlsx`, `.xls`, atau `.csv` dengan kolom `NIS`, `Nama`, dan `Kelas`. Tombol **Template** mengunduh contoh file. Setiap QR siswa memuat NIS dengan awalan `ABSENSI:`.

## Absensi

Buka **Scan QR**, izinkan akses kamera, lalu pindai QR siswa. Kamera memerlukan HTTPS (otomatis tersedia di Vercel) atau localhost. Absensi manual juga tersedia. Siswa hanya dapat dicatat hadir satu kali per tanggal.

## Penyimpanan dan deploy

Data tersimpan hanya di browser/perangkat yang digunakan dan tidak tersinkron antarperangkat. Menghapus data situs/browser dapat menghapus data aplikasi; lakukan ekspor berkala untuk membuat cadangan.

Deploy ke Vercel sebagai proyek Vite dengan build command `npm run build` dan output directory `dist`. `vercel.json` mengatur fallback routing SPA.
