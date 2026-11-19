# Hadzmi Hub · iOS 26 Light

Personal assistant hub (To-Do, Mind Dump, Bookmarks, Countdown, Music, Kontak WA, Upload log, Cash Ledger, Focus & Sleep) dengan desain ulang ala iOS, kunci sandi, notifikasi, dan **Kirim ke Gmail**.

> Struktur data di Firebase (`hadzmi_assistant_data`) dan key `localStorage` **sama persis** dengan versi lama, jadi data yang sudah ada langsung terbaca. Tidak perlu migrasi.

## Struktur folder

```
index.html            ← FILE FINAL (tempel ke Blogspot / deploy ke hosting)
src/index.html        ← template markup
src/styles.css        ← design system iOS (light)
src/js/01-core.js     ← konfigurasi, state, sinkron Firebase, alert/sheet, navigasi
src/js/02-auth.js     ← lock screen + Firebase Auth + sesi harian
src/js/03..08         ← modul per menu (dashboard, music, todo, hub, workfin, settings)
src/js/09-notify.js   ← mesin notifikasi
src/js/10-share.js    ← Kirim ke Gmail
build.mjs             ← menggabungkan src/ → index.html  (jalankan: node build.mjs)
database.rules.json   ← aturan keamanan Firebase (WAJIB)
sw.js, manifest.webmanifest ← PWA (hanya aktif di hosting selain Blogspot)
```

Setelah mengedit file di `src/`, jalankan `node build.mjs` supaya `index.html` dibuat ulang.

---

## ⚠️ Setup WAJIB sebelum dipakai (login Firebase)

Sistem login sekarang memakai **Firebase Authentication**, jadi kuncinya benar-benar aman, bukan cuma layar penutup. Tanpa langkah ini website akan tetap terkunci.

1. **Aktifkan Email/Password**
   Firebase Console → project `web-hadzmi-new` → **Authentication** → *Sign-in method* → **Email/Password** → Enable.
2. **Buat akunmu**
   Authentication → *Users* → **Add user** → isi email + sandi (sandi ini yang kamu ketik di layar kunci).
   Salin **User UID** yang muncul.
3. **Matikan pendaftaran orang lain**
   Authentication → *Settings* → *User actions* → hilangkan centang **Enable create (sign-up)**.
4. **Kunci database** (paling penting!)
   Realtime Database → *Rules* → tempel isi `database.rules.json`, ganti `GANTI_DENGAN_UID_KAMU` dengan UID dari langkah 2 → **Publish**.
   Setelah ini hanya akunmu yang bisa membaca/menulis data. Orang lain yang tahu `apiKey` akan ditolak.
5. (Opsional) Di `src/js/01-core.js` isi `APP_AUTH.ownerEmail = 'emailkamu@gmail.com'` supaya layar kunci cukup minta sandi. Tanpa ini pun, email otomatis diingat setelah login pertama di tiap perangkat.

Darurat: `APP_AUTH.enabled = false` untuk mematikan kunci sementara (tidak disarankan).

### Cara kerja sesi
- Setiap perangkat/browser wajib login dengan sandi saat pertama kali dibuka.
- Setelah login, sesi berlaku **sampai pukul 00:00 WIB**. Dibuka lagi sore/malam di hari yang sama tidak diminta sandi.
- Lewat tengah malam, aplikasi terkunci sendiri (walaupun sedang terbuka) dan minta sandi sekali lagi.
- Kalau mau 24 jam bergulir sejak login: `APP_AUTH.sessionMode = 'rolling24h'`.
- Tombol **Kunci Sekarang** ada di Settings → Keamanan.

---

## Fitur yang ditambahkan

### 🔔 Notifikasi
Pusat notifikasi in-app (ikon lonceng) + banner gaya iOS + notifikasi sistem (setelah diizinkan):
| Pemicu | Kapan |
|---|---|
| To-Do dengan jam | X menit sebelum (10/30/60/120, bisa diatur) & tepat jam deadline |
| To-Do tanpa jam | Pagi hari deadline (≥07:00) & H-1 (≥19:00) |
| Tugas terlambat | 1 ringkasan per hari |
| Countdown | H-3, H-1, hari H, dan X menit sebelum jam event |
| Focus timer selesai | Langsung, dengan bunyi chime |
| Sleep timer musik | Saat musik dihentikan |
| Pengingat Cash Ledger | 20:00 jika hari ini belum ada entri (default mati) |
| Ringkasan pagi | 07:00–12:00, jumlah agenda hari ini |
| Sesi hampir habis | < 10 menit sebelum 00:00 |

Semua bisa dinyalakan/dimatikan di **Settings → Notifikasi**. Notifikasi berjalan selama website terbuka (termasuk di tab background). Di iPhone, notifikasi sistem baru aktif setelah **Tambah ke Layar Utama** dan website di-host di luar Blogspot (lihat rekomendasi di bawah).

### ✉️ Kirim ke Gmail
Tombol ✉️ membuka sheet iOS: **Gmail (web)**, **Aplikasi Gmail** (iPhone), **Aplikasi Email (mailto)**, **Bagikan…**, **Salin**.
Tersedia di: detail tugas, daftar tugas, ringkasan harian (Home), catatan, countdown, bookmark, laporan Cash Ledger (mengikuti filter periode), laporan Focus & Sleep, dan lagu.
Penerima default bisa diatur di Settings → Kirim ke Gmail.

### 🎵 Music (dikembangkan)
- **Now Playing** layar penuh (latar blur dari cover, swipe ke bawah untuk menutup)
- **Lirik tersinkron (LRC)**: tulis `[00:12.50] baris lirik`, maka lirik otomatis menyala & menggulir; tap baris untuk lompat ke bagian itu
- **Favorit ♥**, **Terakhir Diputar**, urutkan (terbaru / A–Z / artis)
- **Putar / Acak** semua lagu di tampilan sekarang (kategori/pencarian)
- Antrean: *Putar Berikutnya*, atur urutan ↑↓, hapus
- Sleep timer + **"Akhir lagu"**, tampilan sisa waktu
- Kecepatan putar 0.75×–1.5×
- Lanjutkan lagu terakhir dari posisi terakhir; volume diingat
- Kontrol di lock screen (Media Session): seek, maju/mundur 10 detik
- Spasi = play/pause

### ✅ To-Do (desain ulang, gaya iOS Reminders)
Smart list (To Do, Hari Ini, In Progress, Terlambat, Selesai, Semua), pengelompokan otomatis (Terlambat/Hari Ini/Besok/Mendatang/Tanpa Tanggal), lingkaran centang dengan animasi, geser baris ke kiri (Proses/Hapus), editor di *bottom sheet*, field **Prioritas** (field lama dari Quick Add, sekarang bisa diedit juga).

### Perbaikan lain
- Semua `confirm()` diganti alert iOS; penghapusan sekarang selalu minta konfirmasi (bookmark, kas, catatan, dll.)
- Edit Mind Dump sekarang **di tempat** (dulu catatan dihapus dulu lalu disimpan ulang, jadi bisa hilang)
- Focus timer berbasis timestamp, tetap akurat walau tab di background
- Status sinkron realtime (Sync / Offline / Ditolak) di pojok kiri atas
- Input pengguna di-escape (aman dari HTML rusak/XSS saat mengetik `<`, `"`, dll.)

---

## 💡 Rekomendasi platform (gratis, jangka panjang, siap API)

**Ringkasnya: tetap pakai Firebase untuk data, pindahkan hosting dari Blogspot.**

| Kebutuhan | Rekomendasi | Alasan |
|---|---|---|
| Database realtime + sinkron semua device | **Firebase Realtime DB (Spark, gratis)** ✅ tetap | Sudah dipakai, benar-benar realtime, bisa offline, gratis tanpa batas waktu (1 GB simpanan, 10 GB/bulan unduhan) |
| Login | **Firebase Auth** ✅ (sudah ditambahkan) | Gratis, langsung terhubung dengan rules database |
| Hosting website | **Cloudflare Pages** atau **Firebase Hosting** | Gratis, HTTPS, custom domain, mendukung *service worker* → PWA + push notification sungguhan. Blogspot tidak bisa. |
| API sendiri (proxy, kunci disembunyikan dari browser, cron) | **Cloudflare Workers** | Gratis 100rb request/hari, ada *cron trigger* (mis. email ringkasan jam 07:00 walau website tertutup), penyimpanan D1 (SQLite) & KV |
| Email otomatis (tanpa tap tombol) | **Google Apps Script** (gratis, kirim dari Gmail-mu) atau **Resend** | Bisa dipanggil dari Worker atau terjadwal |
| Push notification saat app tertutup | **Firebase Cloud Messaging** + cron Cloudflare Worker sebagai pengirim | FCM gratis; Worker yang mengecek deadline lalu mengirim push |
| Upload file sungguhan (bukan cuma log) | **Cloudflare R2** (10 GB gratis) atau Cloudinary | Firebase Storage baru sekarang butuh paket Blaze (bayar sesuai pemakaian) |

Catatan:
- **Supabase** juga bagus (Postgres + realtime + auth), tapi project gratis akan *di-pause* jika tidak aktif 1 minggu, jadi kurang cocok untuk "pasang lalu lupa".
- Cloud Functions Firebase butuh paket Blaze. Karena itu Cloudflare Workers lebih cocok untuk lapisan API-mu.

### Deploy ke Cloudflare Pages (paling mudah)
1. Push repo ini ke GitHub (sudah).
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → pilih repo ini.
3. Build command: *(kosongkan)* · Output directory: `/`
4. Tambahkan domain Pages (`xxx.pages.dev`) di Firebase → Authentication → Settings → **Authorized domains**.

### Tetap di Blogspot
Tempel **seluruh** isi `index.html` ke postingan (mode HTML), sama seperti sebelumnya.
