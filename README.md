# SilentCX Linktree

Halaman tautan untuk bio Instagram SilentCX, dibuat dengan Google Apps Script. Data disimpan di satu Google Sheet, dan semua pengelolaannya lewat panel admin yang dikunci PIN 4 digit.

- **Link untuk bio Instagram:** https://silentcx-id.github.io/linktree/
- **Panel admin:** https://silentcx-id.github.io/linktree/admin (atau `?admin`), langsung diteruskan ke halaman Google
- **Web app Google (asli):** https://script.google.com/macros/s/AKfycbyvMYUW0EAmczwiUXJ7Z6mn-i4jBP8SI8r1XXKSalKvi2kYUzabO4B6bqRQOOveEn9TfA/exec

Link github.io hanyalah bingkai (`docs/index.html`) yang menampilkan web app Google di dalamnya. Gunanya supaya alamatnya pendek, dan pratinjau link di WhatsApp atau DM memakai judul dan logo SilentCX. Semua isi, panel, dan statistik tetap berjalan di Google.

Saat kode diperbarui, deploy sebagai versi baru dari deployment yang sama supaya link web app tidak berubah (lihat "Kalau kode diperbarui"). Kalau link web app terpaksa berubah, ganti alamatnya di `docs/index.html` dan `docs/admin/index.html`.

## Fitur

**Halaman publik**
- Logo, nama, bio, dan tombol ganti bahasa ID/EN.
- Banner pengumuman opsional yang hilang sendiri setelah tanggal berakhir.
- Tombol tautan dengan ikon dan keterangan kecil. Tautan utama bisa disorot emas.
- Ikon media sosial.
- Tema gelap emas-hitam SilentCX, dirancang untuk dibuka dari browser Instagram di HP.

**Panel admin** (PIN 4 digit, sesi berlaku 8 jam)
- **Tampilan:** foto profil (otomatis dikecilkan), nama, bio dua bahasa, pengumuman, dan media sosial.
- **Tautan:** tambah, ubah, hapus, geser urutan, aktif/nonaktif, sorot emas, pilih ikon, dan jadwal tampil (mulai/sampai).
- **Pratinjau langsung:** di samping form (desktop) atau lewat tombol Pratinjau (HP), sebelum disimpan.
- **Statistik:** kunjungan, klik, rasio klik, grafik harian, peringkat tautan, HP vs desktop, dan bahasa. Periode 7/30/90 hari atau semua, dan bisa diunduh sebagai CSV.
- **Pengaturan:** pencatatan statistik on/off, domain untuk penanda UTM, ganti PIN, dan riwayat login.

**Keamanan**
- PIN disimpan dalam bentuk hash di Script Properties, tidak di Sheet.
- Setiap 5 kali PIN salah, login dikunci: 15 menit, lalu 1 jam, lalu 24 jam. Setelah itu login terkunci penuh sampai PIN diatur ulang.
- Setiap perubahan diperiksa ulang di server. Hanya alamat `https://`, `mailto:`, dan `tel:` yang diterima.
- Statistik hanya mencatat waktu, tautan, jenis perangkat, dan bahasa. Tidak ada data pribadi pengunjung yang dicatat.
- Statistik yang lebih dari 90 hari diringkas otomatis per hari setiap malam, jadi Sheet tidak membengkak.

## File

| File di folder ini | Di Apps Script menjadi |
| --- | --- |
| `Code.gs` | Script `Code.gs` |
| `Index.html` | HTML `Index` |
| `Admin.html` | HTML `Admin` |
| `Shared.html` | HTML `Shared` |
| `Styles.html` | HTML `Styles` |
| `Logo.html` | HTML `Logo` (logo SilentCX, satu baris panjang) |
| `appsscript.json` | Manifest (lihat langkah 2) |

Folder `dev/` berisi uji lokal, dan folder `docs/` berisi halaman GitHub Pages. Keduanya tidak perlu disalin ke Apps Script.

## Cara pasang

1. **Buat Google Sheet baru** di Gmail yang akan memiliki linktree ini, misalnya dengan nama "SilentCX Linktree".
2. **Buka editor script dan salin file.**
   1. Di Sheet, buka **Extensions → Apps Script**.
   2. Buka **Project Settings** (ikon roda gigi) dan centang **Show "appsscript.json" manifest file in editor**.
   3. Kembali ke **Editor**. Ganti seluruh isi `appsscript.json` dengan isi file `appsscript.json` dari folder ini.
   4. Ganti seluruh isi `Code.gs` dengan isi `Code.gs` dari folder ini.
   5. Buat lima file HTML lewat **+ → HTML**, dengan nama persis `Index`, `Admin`, `Shared`, `Styles`, dan `Logo`, tanpa `.html`. Isi masing-masing dengan isi file yang sama namanya dari folder ini.
   6. Tekan **Save** (ikon disket).
3. **Siapkan sheet dan PIN.**
   1. Kembali ke tab Google Sheet, lalu muat ulang halamannya. Menu **SilentCX Linktree** akan muncul di atas.
   2. Pilih **SilentCX Linktree → 1. Siapkan sheet**.
   3. Google meminta izin. Pilih akunmu, lalu **Advanced → Go to … (unsafe)** → **Allow**. Peringatan ini wajar karena script buatan sendiri belum diverifikasi Google.
   4. Jalankan menu **1. Siapkan sheet** sekali lagi kalau tadi berhenti di layar izin. Masukkan **PIN 4 digit** dua kali.
4. **Deploy sebagai web app.**
   1. Di editor Apps Script, pilih **Deploy → New deployment**.
   2. Klik ikon roda gigi → **Web app**.
   3. Isi **Execute as: Me** dan **Who has access: Anyone**.
   4. Pilih **Deploy**, lalu salin **Web app URL** yang berakhiran `/exec`.
5. **Isi konten.**
   1. Buka `URL/exec?admin` dan masukkan PIN.
   2. Ganti nomor WhatsApp (`wa.me/6281200000000` masih contoh), email, dan alamat tautan lain.
   3. Tekan **Simpan**.
6. **Aktifkan GitHub Pages:** di repo GitHub, buka **Settings → Pages**. Pada **Build and deployment**, pilih **Source: Deploy from a branch**, **Branch: main**, folder **/docs**, lalu **Save**. Tunggu 1–2 menit sampai https://silentcx-id.github.io/linktree/ bisa dibuka.
7. **Pasang di Instagram:** Edit profile → Links → Add external link, lalu tempel `https://silentcx-id.github.io/linktree/`.

### Kalau kode diperbarui

Salin ulang file yang berubah. Lalu pilih **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. URL tetap sama, jadi link di Instagram tidak perlu diganti.

## Mengatur PIN admin

Ada tiga cara. Cara 2 dan 3 juga membuka kunci login, dan semua sesi admin lama ikut dikeluarkan.

1. **Ganti PIN (masih ingat PIN lama):** di panel admin, buka **Pengaturan → Ganti PIN**.
2. **Lewat Apps Script Settings:**
   1. Di editor Apps Script, buka **Project Settings** (ikon roda gigi).
   2. Di **Script Properties**, pilih **Add script property**.
   3. Isi Property `PIN_BARU` dan Value 4 angka, misalnya `4821`. Tekan **Save script properties**.
   4. Buka panel admin (`URL/exec?admin`). PIN baru langsung berlaku, dan property `PIN_BARU` otomatis dihapus supaya angkanya tidak tertinggal.
   5. Masuk dengan PIN baru.
3. **Lewat Google Sheet:** pilih menu **SilentCX Linktree → Atur ulang PIN admin**, lalu masukkan PIN baru dua kali.

Jangan ubah property lain di Script Properties (`PIN_HASH`, `PIN_SALT`, `SESSIONS`, dan seterusnya). PIN di sana tersimpan dalam bentuk acak, jadi mengetik angka langsung di `PIN_HASH` tidak akan berhasil.

Cara 2 juga bisa dipakai untuk membuat PIN pertama kali, kalau kotak isian PIN di langkah 3 cara pasang tadi terlewat.

## Perlu diketahui

- Karena dibuat dengan akun Gmail biasa, Google menampilkan banner abu-abu "This application was created by a Google Apps Script user" di atas halaman. Banner ini tidak bisa dihilangkan dari akun Gmail biasa.
- Banner Google tetap terlihat walau dibuka lewat link github.io, karena halamannya tetap dari Google.
- Nanti linktree bisa dipindah ke `silentcx.id/links` di website utama dengan membaca Sheet yang sama.
- Jangan mengubah tab tersembunyi di Sheet (`_data`, `_log`, `_harian`, `_login`). Semua perubahan lewat panel.
- Sesi admin disimpan di browser yang dipakai, selama 8 jam atau sampai kamu menekan **Keluar**.

## Uji lokal

Sekali saja, pasang Playwright dan browser-nya:

```bash
npm install
```

```bash
npx playwright install chromium
```

Lalu jalankan:

```bash
npm test
```

Uji ini menjalankan `Code.gs` di atas tiruan layanan Google, lalu membuka halaman publik dan panel admin di browser headless. Tangkapan layarnya disimpan di `dev/out/`. Uji ini tidak menyentuh Google sama sekali, jadi uji di Apps Script sungguhan (di bawah) tetap perlu dilakukan.

## Daftar uji setelah dipasang

- [ ] Buka https://silentcx-id.github.io/linktree/ dari HP. Logo, nama, bio, tiga tautan pertama, dan ikon media sosial tampil.
- [ ] Tombol **EN** mengganti teks ke bahasa Inggris.
- [ ] Ketuk satu tautan. Halaman tujuan terbuka.
- [ ] Buka `/exec?admin` lalu masukkan PIN salah sekali. Muncul "PIN salah. Sisa 4 percobaan".
- [ ] Masukkan PIN benar. Panel terbuka.
- [ ] Ubah bio, lalu **Simpan**. Muat ulang halaman publik; bio baru tampil.
- [ ] Tambah tautan bertanggal "Tampil mulai" besok. Tautan itu belum muncul di halaman publik.
- [ ] Tambah `PIN_BARU` di Script Properties, lalu buka `?admin`. PIN baru berlaku dan property-nya hilang dari daftar.
- [ ] Buka **Statistik**. Kunjungan dan klik dari langkah sebelumnya terhitung.
- [ ] Tekan **Unduh CSV**. File terunduh. Kalau browser menolak unduhan dari panel, beri tahu saya.
- [ ] Matikan **Catat kunjungan dan klik** di Pengaturan, lalu Simpan. Buka halaman publik; angka di Statistik tidak bertambah. Nyalakan lagi.
- [ ] Buka link halaman dari aplikasi Instagram, lewat bio atau DM ke diri sendiri. Halaman tampil normal di browser Instagram.
