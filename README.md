# Agenda Planner

Aplikasi web sederhana untuk membuat, mengubah, dan mengelola jadwal agenda masa mendatang. Data tersimpan secara permanen di database SQLite lokal (`agenda.db`), sehingga tetap ada saat browser ditutup.

## Cara menjalankan

Jalankan server lokal dari folder aplikasi:

```bash
python server.py
```

Buka http://127.0.0.1:8000. Python 3 sudah menyediakan semua yang dibutuhkan; database dan tabel akan dibuat otomatis saat pertama kali server dijalankan. Jangan membuka `index.html` langsung karena aplikasi memerlukan API server untuk menyimpan data.

## Fitur

- **Buat agenda**: judul, tanggal, waktu, kategori, prioritas, lokasi, catatan
- **Status agenda**: belum dikerjakan, sedang dikerjakan, atau selesai
- **Kategori**: Khusus Praktikum, Matakuliah, atau Agenda Pertemuan
- **Ubah dan hapus** agenda kapan saja
- **Tandai selesai** dengan checkbox
- **Agenda berulang** (harian, mingguan, bulanan): saat diselesaikan, agenda berikutnya dibuat otomatis
- **Pengingat**: toast di halaman dan notifikasi browser (klik tombol 🔔 Pengingat untuk memberi izin). Pengingat hanya berjalan saat halaman terbuka.
- **Filter dan pencarian**: akan datang, hari ini, 7 hari, bulan ini, terlewat, selesai; juga kategori dan prioritas
- **Ringkasan statistik** di bagian atas daftar
- **Ekspor / Impor JSON** untuk cadangan atau pindah perangkat
- Tampilan responsif dan mendukung mode gelap

## Struktur

| File | Fungsi |
|------|--------|
| `index.html` | Kerangka halaman dan form |
| `style.css` | Tampilan |
| `app.js` | Logika CRUD, filter, pengingat, ekspor/impor dan komunikasi API |
| `server.py` | Server web/API lokal dan operasi database SQLite |
| `schema.sql` | Struktur tabel dan indeks database |
| `agenda.db` | Database SQLite yang dibuat otomatis; berisi semua agenda |

## Catatan

Database `agenda.db` tersimpan di folder aplikasi dan tidak terhapus saat server atau browser ditutup. Data lama di `localStorage` akan dipindahkan otomatis saat aplikasi pertama kali dibuka dengan database kosong. Kategori agenda lama tetap dipertahankan dan ditandai "Lama" agar data sebelumnya tidak berubah. Gunakan Ekspor secara berkala sebagai cadangan. Untuk memindahkan seluruh data, hentikan server lalu salin file `agenda.db`.
