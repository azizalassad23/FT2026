# Panduan Pemasangan — Yang Harus Dikerjakan Manual

Halaman web sudah tayang dan siap. Yang belum jalan ada di sisi Google
Spreadsheet dan Apps Script. Dokumen ini daftar langkahnya, urut.

Perkiraan waktu: 30–45 menit, ditambah pengisian data siswa.

---

## Langkah 1 — Pasang kode Apps Script

1. Buka spreadsheet, menu **Extensions → Apps Script**.
2. Hapus seluruh isi `Code.gs` yang lama, ganti dengan isi
   [`apps-script/Code.gs`](../apps-script/Code.gs).
3. Kalau proyek Apps Script Anda **berdiri sendiri** (dibuka dari
   script.google.com, bukan dari menu Extensions spreadsheet), isi baris
   `const SPREADSHEET_ID = '';` dengan ID spreadsheet Anda.
   Kalau dibuka lewat Extensions, biarkan kosong.
4. Simpan (Ctrl+S).
5. Kembali ke spreadsheet dan **muat ulang halamannya**. Menu **Field Trip**
   akan muncul di sebelah menu Help.

Bila menu tidak muncul, berarti skrip Anda standalone — menu hanya ada pada
skrip yang menempel di spreadsheet. Fitur webnya tetap jalan; fungsi menu bisa
dijalankan manual dari editor Apps Script lewat tombol Run.

---

## Langkah 2 — Periksa dulu, jangan langsung ubah

Menu **Field Trip → Periksa kesiapan spreadsheet**.

Fungsi ini **hanya membaca**, tidak mengubah apa pun. Hasilnya berupa laporan
seperti:

```
Tab siswa: "DataSiswa" (82 baris data)

KOLOM TERDETEKSI
  [kolom A] NIS -> judul: "NIS"
  [kolom B] Nama -> judul: "Nama Siswa"
  [kolom D] TotalBayar -> judul: "Total Bayar"
  [kolom F] NoHP -> judul: "No HP"
  Sumber PIN: 4 digit terakhir nomor HP
  Sumber status lunas: dihitung dari TotalBayar >= 2450000

KOLOM UNTUK FITUR KURSI
  [BELUM ADA] Gender
  [BELUM ADA] TglLunas
  ...
```

**Yang harus dipastikan:** empat kolom di bagian KOLOM TERDETEKSI semuanya
menunjuk ke huruf kolom yang benar. Bila ada yang tertulis `[BELUM ADA]`,
judul kolom di spreadsheet Anda belum dikenali. Perbaikannya cukup menambahkan
tulisan judul itu ke daftar `PADANAN_KOLOM` di bagian atas `Code.gs` — tidak
perlu mengubah spreadsheet dan tidak perlu menyentuh bagian kode lain.

Contoh, bila judul kolom Anda "Nm Siswa":

```js
Nama: ['Nama', 'Nama Siswa', 'Nm Siswa', 'NamaSiswa', 'Nama Lengkap'],
```

---

## Langkah 3 — Tambahkan kolom dan tab

Menu **Field Trip → Siapkan tab yang belum ada**.

Ini menambahkan ke tab `DataSiswa`: `Gender`, `TglLunas`, `NoAntrean`, `Bus`,
`Kursi`, `WaktuPilih`, `Terlewat`, `UkuranJaket`, `WaktuJaket` — hanya yang
belum ada padanannya. **Kolom dan judul yang sudah dipakai tidak pernah
disentuh atau ditimpa.**

Lalu membuat tab `KonfigKursi` dan `Pengaturan` beserta nilai bawaannya.

---

## Langkah 4 — Isi kolom `Gender`

Isi `L` atau `P` untuk **setiap** siswa.

Tanpa ini, pembatasan zona kursi putra/putri tidak berfungsi sama sekali —
siswa mana pun bisa mengambil kursi mana pun.

---

## Langkah 5 — Isi kolom `TglLunas`  ⚠ paling penting

Isi tanggal-waktu pelunasan untuk **setiap siswa yang sudah lunas sekarang**.

Kolom ini dasar urutan antrean. Bila dibiarkan kosong, skrip akan mencapnya
sendiri saat pertama kali mendeteksi siswa itu lunas — dan karena semuanya
terdeteksi pada saat yang sama, semuanya mendapat cap waktu yang sama pula.
Akibatnya **urutan antrean jatuh ke urutan baris di spreadsheet, bukan urutan
pelunasan.** Itu persis membatalkan aturan "yang lunas duluan memilih duluan".

Untuk siswa yang melunasi **setelah** fitur menyala, kolom ini terisi otomatis
dan urutannya benar. Yang perlu diisi manual hanya yang sudah lunas duluan.

Format bebas asal dikenali Google Sheets sebagai tanggal, misalnya
`2026-08-14 10:30` atau `14/08/2026 10:30`. Yang penting urutannya benar
antar siswa.

Jalankan lagi **Periksa kesiapan spreadsheet** — ia akan memberi tahu berapa
siswa yang masih lunas tanpa `TglLunas`.

---

## Langkah 6 — Tandai kursi guru dan zona gender

Buka tab `KonfigKursi`. Isi **hanya kursi yang butuh perlakuan khusus**; kursi
yang tidak didaftarkan otomatis dianggap bebas untuk siapa saja.

| Bus | Kursi | Tipe | Label |
|---|---|---|---|
| 1 | 1 | `GURU` | Pak Fikar |
| 1 | 2 | `GURU` | Ms Eka |
| 1 | 3 | `P` | |
| 1 | 4 | `P` | |
| 2 | 45 | `BLOK` | rusak |
| 3 | 40 | `PANITIA` | |

- `GURU` — dipesan untuk guru. Isi `Label` dengan namanya, akan tampil di denah.
- `L` — hanya siswa laki-laki.
- `P` — hanya siswa perempuan.
- `PANITIA` — dipagari untuk penempatan manual, tidak muncul sebagai pilihan.
- `BLOK` — tidak dipakai sama sekali.

Nomor kursi mengikuti denah `SEAT 50.pdf`:

```
[PINTU]              [TOUR LEADER]           [DRIVER]

  1   2                                       3   4
  5   6                                       7   8
  9  10                                      11  12
 13  14                                      15  16
 17  18            (lorong)                  19  20
 21  22                                      23  24
 25  26                                      27  28
 29  30                                      31  32
 33  34                                      35  36
 37  38                                      39  40
 41  42                                      43  44
 45  46      47        48        49  50
```

**Saran:** pagari satu blok utuh dengan `PANITIA` di salah satu bus. Lima puluh
pemilih mandiri akan menyebar acak di tiga bus dan menyisakan celah satu-satu
yang menyulitkan saat Anda menempatkan sisanya — apalagi bila ada siswa yang
harus duduk berdekatan.

---

## Langkah 7 — Isi tab `Pengaturan`

| Kunci | Isi dengan | Keterangan |
|---|---|---|
| `total_biaya` | `2450000` | dasar hitungan persentase |
| `syarat_jaket_persen` | `70` | ambang klaim jaket |
| `link_grup_wa` | link undangan grup | dikirim setelah siswa menyimpan ukuran |
| `pemilihan_aktif` | `FALSE` | **biarkan FALSE dulu** |
| `kuota_pilih_mandiri` | `50` | jumlah kursi pilih-sendiri |
| `durasi_giliran_menit` | `15` | jendela waktu tiap nomor antrean |
| `lebar_jendela` | `1` | berapa nomor boleh memilih bersamaan |
| `pesan_belum_dibuka` | kalimat pengumuman | tampil selama fitur belum dibuka |

`link_grup_wa` penting: begitu diisi, link grup dikirim dari server dan tidak
lagi perlu tertulis di HTML publik.

---

## Langkah 8 — Deploy ulang  ⚠ sering terlewat

Menu **Deploy → Manage deployments → ikon pensil → Version: New version → Deploy**.

**Bukan** "New deployment" — itu membuat URL baru dan halaman web masih menunjuk
URL yang lama.

Tanpa langkah ini, URL yang sudah ada tetap menjalankan kode lama, dan semua
perubahan di atas tidak berpengaruh apa-apa. Ini penyebab nomor satu ketika
"sudah diubah tapi kok tidak berubah".

Pastikan setelannya:
- Execute as: **Me**
- Who has access: **Anyone**

Bila URL Web App ternyata berubah, perbarui `APPS_SCRIPT_WEB_APP_URL` di
`index.html` baris ~1720, lalu commit dan push.

---

## Langkah 9 — Uji sebelum diumumkan

Lakukan dengan `pemilihan_aktif` masih `FALSE`:

1. Buka https://azizalassad23.github.io/FT2026/
2. **Klaim Ukuran Jaket** dengan NIS dan PIN asli milik Anda sendiri
   — pastikan nama yang muncul benar dan ukuran tersimpan ke kolom
   `UkuranJaket`, serta tombol grup WhatsApp mengarah ke link yang benar.
3. **Pilih Kursi Bus** — harus menampilkan pesan dari `pesan_belum_dibuka`.

Lalu uji antreannya:

4. Ubah `pemilihan_aktif` menjadi `TRUE`.
5. Buka **Pilih Kursi Bus** dengan akun uji. Periksa nomor antrean,
   denah, kursi guru, dan zona gender tampil sebagaimana mestinya.
6. Ambil satu kursi. Periksa kolom `Bus`, `Kursi`, dan `WaktuPilih`
   di spreadsheet ikut terisi.
7. Menu **Field Trip → Kosongkan SEMUA pilihan kursi** untuk membersihkan
   hasil uji coba.
8. Kembalikan `pemilihan_aktif` ke `FALSE` sampai waktunya dibuka.

---

## Langkah 10 — Saat hari pembukaan

1. Menu **Field Trip → Pasang pemicu antrean (tiap 5 menit)**.
   Tanpa ini, antrean hanya bergerak ketika ada yang membuka halaman.
2. Ubah `pemilihan_aktif` menjadi `TRUE`.
3. Umumkan ke siswa.

Selama berjalan, pantau kolom `NoAntrean` dan `Terlewat`. Bila antrean terasa
terlalu lambat, naikkan `lebar_jendela` menjadi `3` atau `5` — beberapa nomor
akan bisa memilih bersamaan tanpa mengubah urutan prioritas. Perubahan
langsung berlaku, tidak perlu deploy ulang.

---

## Ringkasan yang wajib diisi manual

| Hal | Di mana | Akibat bila dilewat |
|---|---|---|
| Kolom `Gender` | tab `DataSiswa` | zona putra/putri tidak berfungsi |
| Kolom `TglLunas` | tab `DataSiswa` | urutan antrean jadi urutan baris, bukan urutan pelunasan |
| Kursi guru & zona | tab `KonfigKursi` | siswa bisa mengambil kursi guru |
| `link_grup_wa` | tab `Pengaturan` | link grup tetap memakai cadangan di HTML |
| Deploy versi baru | editor Apps Script | semua perubahan tidak berpengaruh |

---

## Bila ada yang tidak beres

**"Kolom X tidak ditemukan"** — judul kolom belum dikenali. Tambahkan tulisan
judulnya ke `PADANAN_KOLOM` di bagian atas `Code.gs`, lalu deploy ulang.

**"Tab ... tidak ditemukan"** — jalankan Siapkan tab yang belum ada. Bila tab
siswa Anda bukan `DataSiswa`, ubah `const TAB_SISWA` di `Code.gs`.

**Semua siswa gagal verifikasi** — kemungkinan besar kolom nomor HP tidak
terdeteksi. Jalankan Periksa kesiapan spreadsheet dan lihat baris "Sumber PIN".

**Sudah diubah tapi tidak berubah** — belum deploy versi baru. Langkah 8.

**Ingin menguji logika tanpa menyentuh spreadsheet:**

```bash
cd apps-script && node uji-lokal.js
```

Menjalankan `Code.gs` di Node dengan spreadsheet tiruan dan jam yang bisa
dimajukan. 37 pernyataan: verifikasi PIN, syarat pembayaran, perpindahan
giliran, pengejaran jendela yang menumpuk, rebutan kursi, zona gender, batas
kuota, dan penempatan manual. Jalankan ulang setiap kali `Code.gs` diubah.
