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

Lalu membuat tab `KonfigKursi` dan `Pengaturan` beserta nilai bawaannya, **dan
memasang pemicu antrean sekali untuk selamanya.**

Anda tidak perlu mengurus pemicu itu lagi. Ia berjalan tiap 5 menit, tetapi
langsung berhenti tanpa mengerjakan apa pun selama `pemilihan_aktif` bernilai
`FALSE`. Jadi **satu-satunya saklar adalah sel `pemilihan_aktif`** di tab
`Pengaturan`:

- `TRUE` → pemilihan terbuka, antrean berjalan.
- `FALSE` → pemilihan tertutup, siswa melihat pesan `pesan_belum_dibuka`.

Menjalankan menu ini berulang kali aman — pemicunya tidak akan menumpuk.

---

## Langkah 4 — Isi kolom `Gender`

Isi `L` atau `P` untuk **setiap** siswa.

Tanpa ini, pembatasan zona kursi putra/putri tidak berfungsi sama sekali —
siswa mana pun bisa mengambil kursi mana pun.

---

## Langkah 5 — Bendahara mengisi `TglLunas`  ⚠ paling penting

Kolom ini **sepenuhnya tanggung jawab bendahara**. Skrip tidak pernah
mengisinya sendiri, dan tidak pernah menebak. Ia hanya mengurutkan antrean
berdasarkan tanggal yang bendahara masukkan.

Aturannya sederhana:

- **Ada `TglLunas` → masuk antrean**, urut menurut tanggal itu.
- **`TglLunas` kosong → tidak masuk antrean sama sekali**, walaupun sudah lunas.

Siswa yang tanggalnya belum diisi bukan ditolak — ia hanya belum ikut. Begitu
bendahara mengisi tanggalnya, ia langsung mendapat nomor pada permintaan
berikutnya.

Format bebas asal dikenali Google Sheets sebagai tanggal, misalnya
`2026-08-14 10:30` atau `14/08/2026 10:30`. Pastikan selnya benar-benar
berformat tanggal, bukan teks bebas — pemeriksa kesiapan akan menyebutkan
nomor barisnya bila ada yang tidak terbaca.

### Satu hal yang perlu diperhatikan bendahara

Penerbitan nomor bersifat **menambah**: nomor yang sudah keluar tidak pernah
berubah. Jadi kalau bendahara baru mengisi tanggal seorang siswa **belakangan**,
padahal siswa itu melunasi lebih awal, ia tetap mendapat nomor di ekor antrean.

Karena itu urutannya: **bendahara selesaikan dulu semua pengisian tanggal**,
baru jalankan sekali menu **Field Trip → Susun ulang SEMUA nomor antrean**.
Menu itu menghapus seluruh nomor lalu menerbitkannya ulang murni menurut
`TglLunas`, sehingga urutannya pasti benar.

Jangan jalankan menu itu setelah pemilihan dibuka — nomor orang lain ikut
berubah di tengah jalan. Skrip akan memperingatkan bila sudah ada yang memilih.

Jalankan lagi **Periksa kesiapan spreadsheet** untuk melihat berapa siswa yang
sudah siap masuk antrean dan berapa yang tanggalnya masih kosong.

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
| `link_grup_wa` | link undangan grup | dipakai tombol **Gabung Grup WA** dan setelah siswa menyimpan ukuran jaket |
| `pemilihan_aktif` | `FALSE` | **satu-satunya saklar.** Biarkan FALSE dulu |
| `kuota_pilih_mandiri` | `50` | jumlah kursi pilih-sendiri |
| `durasi_giliran_menit` | `0` | `0` = tanpa batas waktu (lihat catatan di bawah) |
| `lebar_jendela` | `1` | **biarkan 1** — giliran ketat satu per satu |
| `pesan_belum_dibuka` | kalimat pengumuman | tampil selama fitur belum dibuka |

`link_grup_wa` penting: begitu diisi, link grup dikirim dari server dan tidak
lagi perlu tertulis di HTML publik.

Tombol **Gabung Grup WA** di halaman web meminta NIS dan PIN lebih dulu, lalu
mengambil tautan dari sel ini. Syaratnya hanya terdaftar di `DataSiswa` —
tidak perlu lunas — karena grup dipakai untuk semua pengumuman keberangkatan.
Kalau suatu saat link grup diganti, cukup ubah sel ini; tombolnya langsung
memakai link baru tanpa perlu deploy ulang.

### Tentang `durasi_giliran_menit = 0`

Dengan nilai `0`, **tidak ada batas waktu**. Siswa memilih sesuai kecepatannya
sendiri, dan giliran berpindah **hanya** setelah pemegangnya benar-benar
mengunci kursi. Halaman web tidak menampilkan penghitung mundur sama sekali.

Konsekuensinya harus disadari: **satu siswa yang tidak kunjung membuka halaman
akan menahan seluruh antrean di belakangnya tanpa batas.** Sakit, ganti nomor
HP, atau batal ikut — semuanya menghentikan antrean sampai panitia turun
tangan.

Penggantinya adalah menu **Field Trip → Lewati giliran sekarang**. Menu itu
menampilkan siapa yang sedang memegang giliran, menandainya terlewat setelah
Anda konfirmasi, lalu memindahkan giliran ke nomor berikutnya. Pantau kolom
`NoAntrean` dan `WaktuPilih` selama acara; bila satu nomor tidak bergerak
dalam waktu wajar, hubungi siswanya, lalu lewati bila perlu.

Bila suatu saat Anda ingin batas waktu otomatis kembali, cukup isi kolom ini
dengan angka menit (misalnya `15`). Halaman web langsung menampilkan
penghitung mundurnya lagi tanpa perlu diubah atau di-deploy ulang.

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

Cukup satu tindakan: ubah `pemilihan_aktif` di tab `Pengaturan` menjadi
`TRUE`, lalu umumkan ke siswa.

Untuk menutup kembali, ubah menjadi `FALSE`. Tidak ada yang lain yang perlu
dinyalakan atau dimatikan.

Sementara menunggu giliran, siswa melihat **nomor antrean dan nama siswa yang
sedang memilih** beserta sisa waktunya, dan berapa orang lagi di depan mereka.
Layar itu memperbarui diri tiap 20 detik.

Selama berjalan, pantau kolom `NoAntrean` dan `Terlewat`.

Dengan `lebar_jendela = 1`, giliran benar-benar ketat: selama nomor 1 belum
memilih, nomor 2 sampai terakhir tidak bisa memilih sama sekali — tombol
kursinya mati dan permintaan langsung dari luar halaman pun ditolak server
dengan kode `BUKAN_GILIRAN`.

**Yang perlu dipantau:** karena tidak ada batas waktu, antrean berhenti total
bila pemegang giliran tidak kunjung memilih. Kalau satu nomor tidak bergerak
dalam waktu wajar, hubungi siswanya. Bila tetap tidak ada kabar, jalankan
**Field Trip → Lewati giliran sekarang**.

Tuas darurat lain, berlaku seketika tanpa deploy ulang:

- **`durasi_giliran_menit`** diisi angka menit untuk menyalakan kembali batas
  waktu otomatis.
- **`lebar_jendela`** dinaikkan menjadi `3` atau `5`. Prioritas urutan tetap
  terjaga, tetapi beberapa nomor bisa memilih bersamaan — jadi ini **melanggar
  aturan giliran ketat satu per satu**. Pakai hanya sebagai jalan darurat.

---

## Langkah 11 — Mencetak hasil pemilihan

Menu **Field Trip → Cetak denah kursi**.

Muncul jendela berisi denah ketiga bus lengkap dengan nama pengisi tiap kursi,
diikuti daftar nama per bus untuk absensi. Tekan tombol **Cetak / Simpan PDF**
di pojok kanan atas. Tiap bus otomatis jatuh ke halaman sendiri, dan tombolnya
tidak ikut tercetak.

Bisa dijalankan kapan saja, termasuk di tengah pemilihan — isinya selalu
keadaan terbaru saat menu ditekan.

**Kenapa lewat spreadsheet, bukan tombol di halaman web:** halaman web itu
publik dan seluruh isinya tersimpan di perangkat siswa saat dibuka. Tombol apa
pun di sana bisa ditemukan siswa yang membuka Inspect Element, dan
menyembunyikannya lewat parameter URL rahasia hanya bertahan sampai satu orang
membagikan tautannya. Menu spreadsheet aman dengan sendirinya karena hanya bisa
dijalankan oleh pemilik akses edit spreadsheet — yaitu panitia. Siswa tidak
pernah melihat menunya, tombolnya, maupun hasilnya.

---

## Langkah 12 — Kamar dan pendamping

Dikerjakan **setelah pemilihan kursi selesai**, karena kamar diturunkan dari
nomor kursi.

### Aturan kamarnya

Satu kamar menampung **empat siswa**, dan pembagiannya dua lapis.

**Lapis pertama — baris dipecah per gender.** Satu baris kursi adalah empat
kursi melintasi lorong (1, 2, 3, 4 lalu 5, 6, 7, 8 dan seterusnya sampai 41–44).
Baris yang seluruhnya putra atau seluruhnya putri langsung menjadi satu kamar.

**Lapis kedua — pecahan digabungkan.** Baris yang tidak penuh satu gender
menghasilkan pecahan. Pecahan sejenis dari bus yang sama lalu digabung sampai
kamar terisi empat:

```
baris 1   1  2  |  3  4      ← 2 putra + 2 putri
baris 2   5  6  |  7  8      ← 2 putra + 2 putri

hasilnya:  kursi 1, 2, 5, 6  → satu kamar putra
           kursi 3, 4, 7, 8  → satu kamar putri
```

Aturan yang sama menangani bus yang jarang terisi. Bila bus 3 hanya punya dua
murid per baris, baris 1 dan baris 2 digabung menjadi satu kamar, baris 3 dan
4 menjadi kamar berikutnya, dan seterusnya.

Kode kamarnya memuat bus dan gender: `B1-L01`, `B1-L02`, `B1-P01`, dan
seterusnya. `L` untuk kamar putra, `P` untuk kamar putri.

**Zona gender di `KonfigKursi` boleh diatur bebas** — kiri–kanan maupun per
baris mendatar, keduanya sama-sama menghasilkan kamar yang bersih satu gender.

**Kursi 45–50 di baris belakang tidak diberi kamar otomatis.** Jumlahnya enam
dan tidak membentuk baris utuh, jadi kolom `Kamar` untuk mereka Anda isi
sendiri. Skrip tidak pernah menimpa isian manual itu, dan tetap membagikan
pendamping untuk kamar yang Anda buat sendiri.

**Kamar yang tidak penuh itu wajar** bila jumlah siswa segender dalam satu bus
bukan kelipatan empat. Sisanya menjadi satu kamar berisi dua atau tiga orang,
dan laporannya menyebutkan kamar mana saja.

### Isi tab `Pendamping`

| Nama | Gender | Bus | NoHP |
|---|---|---|---|
| Pak Adi | `L` | 1 | 0812... |
| Bu Rina | `P` | 1 | 0813... |
| Pak Budi | `L` | 2 | 0814... |

Satu baris per pendamping. `Bus` menentukan bus mana yang ditemani — pendamping
**hanya** menerima kamar dari busnya sendiri, tidak pernah lintas bus.

Pastikan tiap bus punya pendamping putra **dan** putri, karena kamar putra
hanya diberikan ke pendamping putra dan sebaliknya. Bus yang tidak punya
pendamping putri akan membuat semua kamar putrinya tidak terisi pendamping, dan
itu dilaporkan sebagai peringatan.

### Jalankan

Menu **Field Trip → Susun kamar & pendamping**.

Skrip mengisi kolom `Kamar` dan `Pendamping` di tab `DataSiswa`, lalu
menampilkan laporan: jumlah kamar terbentuk, jatah tiap pendamping, kamar
campur gender bila ada, kamar tanpa pendamping, dan jumlah siswa baris belakang
yang kamarnya masih kosong.

Pembagiannya bergilir, jadi **selisih jumlah kamar antar pendamping paling
banyak satu**. Aman dijalankan berulang kali — hasilnya selalu dihitung ulang
dari keadaan terbaru.

Setelah ini, menu **Cetak denah kursi** ikut menampilkan kolom Kamar dan
Pendamping pada daftar nama tiap bus, sehingga satu lembar cetak bisa dipakai
untuk absensi bus sekaligus pembagian kamar hotel.

### Melihat hasilnya: Cetak denah kamar

Menu **Field Trip → Cetak denah kamar**.

Bentuknya sama seperti denah kursi, tetapi tiap kursi diwarnai menurut
kamarnya dan diberi kode kamar. **Warna yang sama berarti satu kamar** —
sehingga kamar hasil gabungan antarbaris langsung terlihat: kode dan warna
yang sama muncul di dua baris berbeda.

Di bawah denah ada daftar kamar lengkap: kode, putra/putri, jumlah isi, nama
penghuni beserta nomor kursinya, dan pendampingnya. Siswa yang sudah punya
kursi tetapi belum punya kamar ditandai merah supaya mudah ditemukan.

Tiap bus jatuh ke halaman sendiri saat dicetak, dan tombol cetaknya tidak ikut
tercetak.

---

## Ringkasan yang wajib diisi manual

| Hal | Di mana | Akibat bila dilewat |
|---|---|---|
| Kolom `Gender` | tab `DataSiswa` | zona putra/putri tidak berfungsi |
| Kolom `TglLunas` | tab `DataSiswa` | siswa tidak masuk antrean sama sekali |
| Susun ulang nomor antrean | menu Field Trip | urutan salah bila ada tanggal yang diisi belakangan |
| Tab Pendamping | tab Pendamping | kamar tidak dapat pendamping |
| Kamar kursi 45-50 | tab DataSiswa | siswa baris belakang tanpa kamar |
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
