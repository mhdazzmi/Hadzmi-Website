# Hadzmi Assistant · iOS 26 Light

Asisten pribadi (Planner: Mind Dump, To-Do, Bookmarks, Countdown, Focus & Sleep, Wallet · Media: Music & Galeri · Kerja · Settings) dengan desain ala iOS 26, login PIN, notifikasi push, dan **ekspor PDF**.

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
2. **Buat akun khusus login PIN**
   Authentication → *Users* → **Add user**:
   - Email: `hadzmi-hub@example.com` (akun khusus, bukan email pribadi; sudah tertanam di `APP_AUTH.ownerEmail`)
   - Password: **PIN 8 angka**-mu (panjang PIN diatur di `APP_AUTH.pinLength`)
   Salin **User UID**-nya.
3. **Matikan pendaftaran orang lain**
   Authentication → *Settings* → *User actions* → hilangkan centang **Enable create (sign-up)**.
4. **Kunci database** (paling penting!)
   Realtime Database → *Rules* → tempel isi `database.rules.json`, ganti `GANTI_DENGAN_UID_KAMU` dengan UID dari langkah 2 → **Publish**.
   Setelah ini hanya akunmu yang bisa membaca/menulis data. Orang lain yang tahu `apiKey` akan ditolak.
5. Layar kunci memakai **keypad PIN 8 angka** (langsung terbuka di angka ke-6). PIN bisa diganti dari aplikasi: **Settings → Keamanan → Ganti PIN**, dan berlaku di semua perangkat. Kalau mau kembali ke email + sandi: `APP_AUTH.loginMode = 'password'`.
   Keamanan: Firebase otomatis memblokir sementara jika PIN salah berkali-kali (*too many requests*).

Darurat: `APP_AUTH.enabled = false` untuk mematikan kunci sementara (tidak disarankan).

### Cara kerja sesi
- Setiap perangkat/browser wajib memasukkan PIN saat pertama kali dibuka.
- Setelah login, sesi berlaku **sampai pukul 00:00 WIB**. Dibuka lagi sore/malam di hari yang sama tidak diminta sandi.
- Lewat tengah malam, aplikasi terkunci sendiri (walaupun sedang terbuka) dan minta sandi sekali lagi.
- Kalau mau 24 jam bergulir sejak login: `APP_AUTH.sessionMode = 'rolling24h'`.
- Tombol **Kunci Sekarang** ada di Settings → Keamanan.

---

## 🥗 Hadzmi Sehat — halaman baru `/sehat/` (kontrol makan)

Web terpisah (tidak mengubah tampilan Assistant), dibuka dari ikon **Sehat** di Menu Cepat atau langsung `https://<domainmu>/sehat/`. Bisa ditambahkan ke Layar Utama sebagai app sendiri. Login **memakai PIN & sesi yang sama** dengan Assistant (cukup login sekali).

| Menu | Isi |
|---|---|
| **Hari Ini** | Ring sisa kalori, panel **Asam Urat & Lemak** (purin, lemak jenuh, gula, lemak total) + protein, serat, karbo, natrium dengan label **Aman / Hampir batas / Berlebih (merah) / Kurang / Cukup**, air putih, makanan per **Sarapan / Makan Siang / Makan Malam / Camilan**, ringkasan AI harian. Otomatis ganti hari jam 00:00 WIB; panah ‹ › / kalender untuk lihat hari sebelumnya. |
| **+ Catat** | **Kamera** langsung di app (foto hanya di memori, tidak masuk galeri), **Galeri**, atau **ketik** (pisahkan koma). Analisis AI instan per item: porsi, gram, kcal, protein, karbo, lemak, lemak jenuh, gula, serat, natrium, **purin**; nilai 1–10, Baik/Batasi/Hindari, catatan asam urat & lemak visceral, saran & alternatif. Porsi bisa diubah ×½–×2. **Auto-suggest** dari riwayat; makanan yang pernah dicatat dihitung instan tanpa AI. |
| **Progres** | 7/30/90 hari: rata-rata kalori/purin/protein, hari sesuai target, streak, perubahan berat, grafik kalori/purin/protein/berat, analisis AI periode, riwayat harian. |
| **Tubuh** | Catat timbangan (tanggal & jam otomatis hari ini; opsional % lemak, lemak visceral, otot, pinggang) → riwayat + grafik + **catatan analisis AI**. Tab **Asam Urat** (mg/dL, target < 6). |
| **Panduan** | **Cek Makanan** (tanya AI boleh/tidak), daftar Aman/Batasi/Hindari untuk gout + lemak visceral. |
| **Pengaturan ⚙️** | Target kalori (bisa dihitung otomatis), protein, purin, gula, natrium, serat, % lemak; profil; peringatan berlebih & pengingat jam makan; AI; ekspor JSON. |

### Penyimpanan
| Data | Tempat | Catatan |
|---|---|---|
| Teks (makanan, gizi, timbangan, asam urat, pengaturan, kamus) | **Firebase RTDB**, node `hadzmi_sehat_data` | ±1 KB per makanan → 1 GB cukup untuk ratusan ribu catatan. Terpisah dari `hadzmi_assistant_data` supaya tidak saling menimpa. |
| Thumbnail 120 px | Firebase (±3 KB) | Agar daftar tampil cepat di semua perangkat |
| Foto makanan (900 px) | **Cloudflare R2** (10 GB gratis) | Sama dengan Galeri; bisa dimatikan di Pengaturan |
| Cache offline | localStorage perangkat | Otomatis dikirim saat online |

### ⚠️ Setup wajib (2 langkah)
1. **Firebase Rules**: tempel ulang `database.rules.json` (sekarang ada blok `hadzmi_sehat_data`), ganti `GANTI_DENGAN_UID_KAMU` (2 blok) → **Publish**. Tanpa ini status menjadi "Ditolak" dan data hanya tersimpan di perangkat.
2. **Kunci Gemini** (gratis): buat di **aistudio.google.com/apikey** → Cloudflare Worker → Settings → Variables and Secrets → tambah **Secret** `GEMINI_API_KEY` → deploy ulang. Opsional: variabel `GEMINI_MODEL` (default `gemini-flash-latest`, otomatis turun ke `gemini-2.5-flash`).
   Cadangan: kunci bisa diisi di Pengaturan → AI (tersimpan hanya di perangkat itu, dipakai jika server belum aktif).

Kode: `public/sehat/` (index.html, sehat.css, app.js, ai-core.js) dan `worker/sehat.js` (endpoint `POST /api/sehat/ai`). Tidak perlu build untuk halaman ini.

---

## Fitur yang ditambahkan

### 🏦 Menu Kerja (Work Space)
| Sub-menu | Isi |
|---|---|
| **Selisih Kas** | Catat kurang/lebih, nominal (otomatis berformat Rp), tanggal, **jam opsional**, keterangan; filter periode & laporan **PDF**. Data lama Cash Ledger tetap ada. |
| **Bukti Kas** (foto) | Foto KTP / buku tabungan / bukti kas langsung dari kamera atau galeri → dikompres → disimpan privat di Cloudflare. Tampilan galeri (grid), filter jenis, cari nama nasabah, pilih banyak → **Bagikan** (menu Bagikan iOS) / **Unduh** / Hapus. Opsi hapus otomatis 7–90 hari (Settings). |
| **Catatan** | Catatan khusus pekerjaan (terpisah dari Mind Dump). |
| **Gudang File** | Upload banyak file sekaligus (PDF, gambar, dokumen, teks; maks 25 MB/file) ke folder (mis. "Materi BRI"); pratinjau PDF/gambar/teks, buka, unduh, kirim, ganti nama, pindah folder. |
| **Upload Drive** | Uploader Google Drive dengan logika yang sama seperti uploader lama (Apps Script, multi-file, nama kustom `nama-1.ext`). |
| **Kontak** | Direktori WhatsApp. |

Semua file Kerja hanya bisa diakses setelah login PIN (server memeriksa token Firebase + `OWNER_UID`). Foto dimuat hanya di memori dan hilang dari perangkat saat aplikasi dikunci.

### 💾 Penyimpanan (Settings → Penyimpanan)
Menampilkan pemakaian Firebase (data aplikasi, per kategori) dan Cloudflare (foto & file), masing-masing dari kuota gratis 1 GB, plus cache perangkat.

### 🗄️ Penyimpanan File (Settings → Penyimpanan File)
| Penyimpanan | Kapasitas gratis | Dipakai untuk | Cara aktifkan |
|---|---|---|---|
| **Cloudflare R2** (utama) | 10 GB | Lagu, cover, Galeri, Bukti Kas, Gudang File | Aktifkan R2 (tambah metode pembayaran, paket Free) → hapus `//` di blok `r2_buckets` pada `wrangler.jsonc`. Peringatan push otomatis di **7 GB (70%)** dan **8,5 GB (85%)**; upload otomatis berhenti di **9 GB** agar tidak kena tagihan. |
| **Google Drive** | 15 GB (akun Google) | Sama, pilih "Google Drive" saat upload | Pasang `apps-script/Code.gs` di script.google.com (Script Property `SECRET`) → deploy Web App → isi `DRIVE_SCRIPT_URL` (Text) & `DRIVE_SECRET` (Secret) di Cloudflare. |
| Cloudflare KV (lama) | 1 GB | Cadangan otomatis bila R2 belum aktif | Sudah aktif |
| Direct link | — | Lagu (.mp3/.m4a). Link YouTube tidak didukung | — |

Firebase Realtime Database **hanya menyimpan teks** (judul, catatan, keterangan, lokasi, daftar file). Langkah lengkap juga ada di dalam aplikasi (tap baris R2 / Google Drive).

### 🎵 Music: upload & offline
- **+ Lagu → Upload File**: pilih MP3/M4A + cover dari perangkat, simpan ke R2/Drive. Diputar lewat link privat bertanda tangan (streaming + seek), cover di-cache.
- **Direct Link** tetap tersedia (tidak memakai kuota).
- **Lirik mengikuti nyanyian** (Lirik → Edit/Perbesar): **Cari Otomatis** mengambil lirik tersinkron dari LRCLIB (gratis), atau **Sinkron Tap** — putar lagu dan tap saat tiap baris mulai dinyanyikan; hasilnya format LRC.
- **Simpan Offline** (menu ⋯ lagu) → lagu tersimpan di perangkat; filter "Offline"; hapus per lagu atau semua di Settings → Pemakaian.

### 🖼️ Galeri (tab Media → Galeri)
Pustaka per bulan, **Album** (cover bisa diganti), **Tempat** (tag lokasi: otomatis dari GPS foto, lokasi saat ini, atau ketik manual; buka di Peta), **Favorit**, pencarian, pilih banyak (album/favorit/bagikan/hapus), viewer layar penuh (geser kiri/kanan, info, edit keterangan & lokasi). Kualitas Hemat/Asli, simpan ke R2 atau Google Drive.

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

### 📄 Ekspor PDF (pengganti Gmail)
Mind Dump, Catatan Kerja, Countdown, daftar To-Do, laporan Focus/Sleep, dan laporan Selisih Kas bisa dijadikan **PDF** (header navy, tabel rapi). PDF langsung tampil sebagai preview → **WhatsApp** / **Bagikan** / **Unduh**.

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

### 🆕 Update terbaru
| Fitur | Keterangan |
|---|---|
| **Wallet** (Planner → Wallet) | Kartu member/anggota/voucher tampil seperti kartu asli (foto depan/belakang atau warna). QR / CODE128 / EAN-13 dibuat ulang tajam di layar → **Mode Scan** layar putih penuh + layar tidak mati (Wake Lock). QR bisa dibaca otomatis dari foto kartu. |
| **Galeri Tersembunyi** | Tab Galeri → *Tersembunyi*. Sandi khusus dibuat saat pertama kali dibuka (tidak tersimpan di kode/server). Foto dienkripsi AES-256-GCM di perangkat sebelum upload; terkunci otomatis 5 menit / saat pindah menu. Sandi **tidak bisa dipulihkan**. |
| **Edit Foto** | Putar 90°, potong (bebas / 1:1 / 4:3 / 3:4 / 16:9 / 9:16). Pilih banyak → Sembunyikan / Hapus. |
| **Gudang File** | Pilih penyimpanan saat upload, kategori otomatis (nama mirip → grup sama), klik file = preview (PDF/gambar/audio/video/teks), tombol WhatsApp. |
| **Lirik karaoke** | Lirik kecil di Now Playing ikut timing tap-sync, baris aktif di tengah; mini player menampilkan baris yang sedang dinyanyikan. |
| **Streak** | Ikon 🔥 di samping notifikasi = berapa hari berturut-turut web dibuka. |
| Lainnya | Link di catatan otomatis biru & bisa diklik · Event Terdekat pindah ke bawah Menu Cepat bila ada · hapus riwayat focus/sleep per item · logo navy baru · tombol kecepatan & ubah nama menu dihapus. |

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
Paket gratis: 100.000 request/hari, cron, KV 1.000 tulis & 100.000 baca/hari. Pemakaian Hadzmi Assistant hanya sekitar 1.500 baca dan puluhan tulis per hari, jadi tetap **Rp 0**.

### Tetap di Blogspot (tanpa push)
Tempel **seluruh** isi `public/index.html` ke postingan (mode HTML), sama seperti sebelumnya. Semua fitur jalan kecuali Push saat website tertutup.
