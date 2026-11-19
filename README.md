# Hadzmi Hub · iOS 26 Light

Personal assistant hub (To-Do, Mind Dump, Bookmarks, Countdown, Music, Kontak WA, Upload log, Cash Ledger, Focus & Sleep) dengan desain ulang ala iOS, kunci sandi, notifikasi, dan **Kirim ke Gmail**.

> Struktur data di Firebase (`hadzmi_assistant_data`) dan key `localStorage` **sama persis** dengan versi lama, jadi data yang sudah ada langsung terbaca. Tidak perlu migrasi.

## Struktur folder

```
public/                 ← isi website yang di-deploy
  index.html            ← FILE FINAL (hasil build; juga bisa ditempel ke Blogspot)
  sw.js                 ← service worker (Web Push + klik notifikasi)
  manifest.webmanifest, icons/  ← PWA (bisa "Tambah ke Layar Utama")
worker/index.js         ← Cloudflare Worker: API /api/*, verifikasi login Firebase, cron kirim push
wrangler.jsonc          ← konfigurasi Cloudflare
src/                    ← kode sumber UI (styles.css, index.html, js/01..11)
build.mjs               ← gabungkan src/ → public/index.html   (npm run build)
database.rules.json     ← aturan keamanan Firebase (WAJIB)
```

Setelah mengedit file di `src/`, jalankan `npm run build` (atau `node build.mjs`) lalu commit `public/index.html`.

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

Semua bisa dinyalakan/dimatikan di **Settings → Notifikasi**. Dengan hosting Cloudflare + **Push** aktif, notifikasi tetap masuk walau website ditutup (lihat bagian Deploy ke Cloudflare). Di Blogspot, notifikasi hanya berjalan selama website terbuka.

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
| Hosting website | **Cloudflare Workers + Static Assets** ✅ (sudah disiapkan) | Gratis, HTTPS, custom domain, auto-deploy dari GitHub, mendukung *service worker* → PWA + push sungguhan. Blogspot tidak bisa. |
| API sendiri (proxy, kunci disembunyikan dari browser, cron) | **Cloudflare Workers** | Gratis 100rb request/hari, ada *cron trigger* (mis. email ringkasan jam 07:00 walau website tertutup), penyimpanan D1 (SQLite) & KV |
| Email otomatis (tanpa tap tombol) | **Google Apps Script** (gratis, kirim dari Gmail-mu) atau **Resend** | Bisa dipanggil dari Worker atau terjadwal |
| Push notification saat app tertutup | **Web Push (VAPID) + cron Cloudflare Worker** ✅ (sudah dibuat) | Gratis, standar web, tanpa FCM |
| Upload file sungguhan (bukan cuma log) | **Cloudflare R2** (10 GB gratis) atau Cloudinary | Firebase Storage baru sekarang butuh paket Blaze (bayar sesuai pemakaian) |

Catatan:
- **Supabase** juga bagus (Postgres + realtime + auth), tapi project gratis akan *di-pause* jika tidak aktif 1 minggu, jadi kurang cocok untuk "pasang lalu lupa".
- Cloud Functions Firebase butuh paket Blaze. Karena itu Cloudflare Workers lebih cocok untuk lapisan API-mu.

---

## ☁️ Deploy ke Cloudflare (website + push server, gratis)

Website, API, dan cron push berjalan dalam **satu project Cloudflare Workers** (Workers + Static Assets). Cloudflare Pages tidak mendukung cron, padahal cron dibutuhkan untuk push saat website tertutup. Paket gratisnya sama.

### Sekali setup (±10 menit)
1. Selesaikan dulu **Setup WAJIB Firebase** di atas (catat **UID**-mu).
2. Daftar/login di **dash.cloudflare.com** (gratis).
3. **Workers & Pages → Create → Import a repository** → hubungkan GitHub → pilih repo `Hadzmi-Website`.
   - Production branch: `main` (setelah Pull Request di-merge)
   - Build command: `npm run build` · Deploy command: `npx wrangler deploy` (default)
   - Klik **Deploy**. KV namespace dibuat otomatis.
4. Buka Worker **hadzmi-website-utama** → **Settings → Variables and Secrets** → tambah 2 variabel (tipe *Text*):
   - `OWNER_UID` = UID Firebase-mu
   - `VAPID_SUBJECT` = `mailto:emailkamu@gmail.com`
   Lalu **Deploy** ulang (atau push commit apa saja).
5. Firebase Console → Authentication → Settings → **Authorized domains** → tambahkan `hadzmi-website-utama.<akunmu>.workers.dev` (atau custom domain-mu).
6. Buka website di domain baru → login → **Settings → Notifikasi → Push saat website tertutup → Aktifkan**. Lakukan di **setiap perangkat**.
   - **iPhone/iPad** (iOS 16.4+): buka di Safari → Share → **Tambah ke Layar Utama** → buka dari ikon → baru aktifkan Push.
   - Tekan **Tes Push dari Server**, lalu tutup website. Notifikasi harus tetap masuk.

Setelah itu setiap `git push` ke `main` otomatis ter-deploy.

### Cara kerja push
1. Saat website terbuka, daftar pengingat 35 hari ke depan dikirim ke server. Pengirimannya hanya terjadi jika ada perubahan (aman untuk kuota KV gratis).
2. **Cron tiap menit** di Cloudflare mengecek pengingat yang jatuh tempo, lalu mengirim **Web Push** (standar VAPID, tanpa Firebase Cloud Messaging) ke semua perangkat yang aktif.
3. Service worker mengambil isi notifikasi dari server lalu menampilkannya. Klik notifikasi akan membuka menu yang tepat.
4. Semua API diamankan dengan token login Firebase, dan hanya `OWNER_UID` yang diterima.

Batasan: pengingat yang dibuat/diubah baru masuk ke server setelah website dibuka minimal sekali sesudah perubahan itu (otomatis di perangkat mana pun). Ringkasan "tugas terlambat" dan "sesi hampir habis" hanya muncul in-app.

### Biaya
Paket gratis: 100.000 request/hari, cron, KV 1.000 tulis & 100.000 baca/hari. Pemakaian Hadzmi Hub hanya sekitar 1.500 baca dan puluhan tulis per hari, jadi tetap **Rp 0**.

### Tetap di Blogspot (tanpa push)
Tempel **seluruh** isi `public/index.html` ke postingan (mode HTML), sama seperti sebelumnya. Semua fitur jalan kecuali Push saat website tertutup.
