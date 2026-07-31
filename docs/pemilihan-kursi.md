# Pemilihan Kursi Bus — Spesifikasi

Dokumen acuan untuk menggarap sisi Apps Script. Halaman web dibuat mengikuti
kontrak di bawah ini, jadi nama aksi dan nama field harus sama persis.

## Keputusan yang sudah diambil

| Hal | Keputusan |
|---|---|
| Siapa yang boleh memilih | 50 siswa yang lunas paling awal — sebagai hak istimewa |
| Sisanya | Ditempatkan manual oleh panitia, tidak lewat halaman web |
| Urutan memilih | Giliran ketat berdasarkan urutan pelunasan |
| Bus | Siswa memilih sendiri bus **dan** kursinya, dari ketiga bus |
| Kursi guru & zona gender | Diatur di tab konfigurasi Google Sheet |
| Batas waktu giliran | 15 menit per nomor (bisa diubah di Sheet) |
| Yang terlewat | Dilewati; jatahnya diteruskan ke nomor berikutnya |
| Nama di denah | Ditampilkan pada kursi yang sudah terisi |

Kuota 50 dihitung dari **jumlah kursi yang berhasil diambil**, bukan dari nomor
antrean. Jadi bila nomor 7 terlewat karena tidak membuka halaman, antrean tetap
berjalan sampai 50 kursi benar-benar terisi — hak istimewanya turun ke urutan
pelunasan berikutnya, tidak hangus.

## Tata letak kursi

Diambil dari `SEAT 50.pdf`. Ketiga bus dianggap identik.

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

Sebelas baris berformasi 2–2 (kursi 1–44), lalu baris belakang enam kursi
menyatu tanpa lorong (45–50). Total 50 kursi per bus, 150 kursi untuk tiga bus.

## Struktur Google Sheet

### Tab `Siswa` (tambahan pada tab yang sudah ada)

| Kolom | Isi |
|---|---|
| `NIS` | sudah ada |
| `Nama` | sudah ada |
| `PIN` | sudah ada — 4 digit terakhir nomor HP |
| `Gender` | `L` atau `P` |
| `Lunas` | `TRUE` bila pembayaran 100% |
| `TglLunas` | tanggal-waktu pelunasan, dasar urutan antrean |
| `NoAntrean` | diisi skrip, urut menaik berdasarkan `TglLunas` |
| `Bus` | `1`–`3`, diisi saat siswa memilih atau saat panitia menempatkan |
| `Kursi` | `1`–`50`, diisi saat siswa memilih atau saat panitia menempatkan |
| `WaktuPilih` | dicatat skrip |
| `Terlewat` | `TRUE` bila jendela gilirannya habis tanpa memilih |

Penempatan manual oleh panitia cukup diisikan langsung ke kolom `Bus` dan
`Kursi`. Halaman web membaca kolom yang sama, jadi kursi hasil penempatan
manual otomatis tampil terisi di denah.

### Tab `KonfigKursi`

Hanya kursi yang butuh perlakuan khusus yang perlu didaftarkan. Kursi yang
tidak terdaftar dianggap bebas untuk siapa saja.

| Bus | Kursi | Tipe | Label |
|---|---|---|---|
| 1 | 1 | `GURU` | Pak Fikar |
| 1 | 2 | `GURU` | Ms Eka |
| 1 | 3 | `P` | |
| 1 | 4 | `P` | |
| 2 | 45 | `BLOK` | rusak |
| 3 | 40 | `PANITIA` | |

Nilai `Tipe`:

- `GURU` — dipesan untuk guru/panitia, tidak bisa dipilih siswa. `Label` tampil di denah.
- `L` — hanya siswa laki-laki.
- `P` — hanya siswa perempuan.
- `PANITIA` — dicadangkan untuk penempatan manual, tidak muncul sebagai pilihan.
- `BLOK` — tidak dipakai sama sekali.

`PANITIA` berguna bila Anda ingin memagari sebagian kursi supaya tidak diambil
peserta yang memilih mandiri — misalnya menyisakan blok utuh untuk mengatur
siswa yang perlu duduk berdekatan.

### Tab `Pengaturan`

Dua kolom: `Kunci` dan `Nilai`.

| Kunci | Contoh | Arti |
|---|---|---|
| `pemilihan_aktif` | `TRUE` | saklar utama fitur |
| `kuota_pilih_mandiri` | `50` | berapa kursi yang boleh diambil sendiri |
| `durasi_giliran_menit` | `15` | panjang jendela tiap nomor antrean |
| `lebar_jendela` | `1` | berapa nomor boleh memilih bersamaan; naikkan bila antrean terlalu lambat |
| `antrean_sekarang` | `18` | nomor yang sedang berjalan, diperbarui skrip |
| `antrean_mulai` | timestamp | kapan jendela nomor tersebut dimulai |
| `fase` | `antrean` | `antrean` atau `selesai` |

`fase` menjadi `selesai` begitu kuota terpenuhi atau daftar antrean habis.

## Kontrak API

Semua permintaan `POST` ke Web App URL yang sama dengan fitur jaket,
`Content-Type: text/plain;charset=utf-8`, badan berupa JSON.

### `get_seat_state`

Dipanggil sekali setelah verifikasi, lalu diulang tiap 20 detik selama siswa
menunggu giliran.

Permintaan:

```json
{ "action": "get_seat_state", "nis": "12345", "pin": "7890" }
```

Balasan sukses:

```json
{
  "status": "success",
  "siswa": {
    "nama": "Rani Putri",
    "gender": "P",
    "lunas": true,
    "noAntrean": 23,
    "dapatPrivilege": true,
    "busTerpilih": null,
    "kursiTerpilih": null
  },
  "antrean": {
    "fase": "antrean",
    "sekarang": 18,
    "lebarJendela": 1,
    "giliranSaya": false,
    "detikTersisa": 540,
    "kuota": 50,
    "terpakai": 17
  },
  "bus": [
    {
      "id": 1,
      "nama": "Bus 1",
      "kursi": {
        "1": { "tipe": "GURU", "label": "Pak Fikar" },
        "3": { "tipe": "P" },
        "12": { "tipe": "BEBAS", "oleh": "Budi S." }
      }
    }
  ]
}
```

Aturan isi `kursi`: kursi bebas dan kosong boleh dihilangkan dari objek untuk
menghemat ukuran balasan — halaman web menganggap kursi yang tidak disebut
sebagai bebas dan kosong. Field `oleh` hanya diisi bila kursi sudah terisi.

`dapatPrivilege` bernilai `false` bila kuota sudah habis sebelum giliran siswa
tersebut tiba, atau bila `fase` sudah `selesai`. Halaman web memakai ini untuk
menampilkan pesan bahwa penempatannya akan diatur panitia — bukan pesan error.

`detikTersisa` dihitung server, bukan klien, supaya jam perangkat siswa yang
meleset tidak mengacaukan giliran.

### `claim_seat`

Permintaan:

```json
{ "action": "claim_seat", "nis": "12345", "pin": "7890", "bus": 2, "kursi": 17 }
```

Balasan sukses:

```json
{ "status": "success", "bus": 2, "kursi": 17 }
```

Balasan gagal — `kode` dipakai halaman web untuk memilih pesan dan tindakan:

```json
{ "status": "error", "kode": "KURSI_TERISI", "message": "Kursi 17 baru saja diambil siswa lain." }
```

| `kode` | Kapan | Tindakan halaman web |
|---|---|---|
| `BELUM_LUNAS` | pembayaran belum 100% | tampilkan pesan, hentikan |
| `KUOTA_HABIS` | 50 kursi sudah terambil | tampilkan pesan penempatan oleh panitia |
| `BUKAN_GILIRAN` | nomor antrean belum tiba atau sudah lewat | kembali ke layar tunggu |
| `KURSI_TERISI` | kursi sudah diambil orang lain | muat ulang denah, minta pilih lagi |
| `KURSI_GURU` | kursi bertipe `GURU`, `PANITIA`, atau `BLOK` | muat ulang denah |
| `GENDER_TIDAK_COCOK` | zona kursi tidak sesuai gender siswa | tampilkan pesan |
| `SUDAH_MEMILIH` | siswa sudah punya kursi | tampilkan kursinya, hentikan |
| `SIBUK` | kunci tidak didapat dalam 20 detik | minta coba lagi |

### Bila fitur belum dibuka

Selama `pemilihan_aktif` bernilai `FALSE`, kedua aksi membalas:

```json
{ "status": "error", "kode": "BELUM_DIBUKA", "message": "Pemilihan kursi dibuka mulai 1 September 2026 pukul 08.00." }
```

Halaman web menampilkan isi `message` apa adanya di layar verifikasi, jadi
kalimat itu bebas Anda ubah dari Sheet tanpa menyentuh kode.

## Yang wajib ada di sisi Apps Script

### 1. Kunci penulisan — ini tidak boleh dilewat

Tanpa ini, dua siswa bisa mengambil kursi yang sama dalam selisih milidetik dan
keduanya menerima balasan sukses.

```js
function claimSeat(req) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { status: 'error', kode: 'SIBUK', message: 'Server sedang sibuk, coba lagi.' };
  }
  try {
    // Baca ulang sheet DI DALAM kunci. Data yang dibaca sebelum kunci
    // didapat sudah tidak bisa dipercaya.
    // 1. cocokkan NIS + PIN
    // 2. cek Lunas
    // 3. cek kuota belum habis
    // 4. cek giliran
    // 5. cek kursi masih kosong, bukan GURU/PANITIA/BLOK, gender cocok
    // 6. tulis Bus + Kursi + WaktuPilih
    // 7. majukan antrean, perbarui hitungan terpakai
  } finally {
    lock.releaseLock();
  }
}
```

### 2. Verifikasi PIN di setiap aksi

`get_seat_state` dan `claim_seat` sama-sama menerima `pin` dan harus
memverifikasinya. Tanpa itu, siapa pun yang tahu NIS temannya bisa mengambil
alih kursi orang tersebut. Catatan yang sama berlaku untuk `save_jacket` yang
sudah lebih dulu mengirim `pin`.

### 3. Memajukan antrean

Dijalankan di awal `get_seat_state` dan `claim_seat`, di dalam kunci:

```
bila terpakai >= kuota_pilih_mandiri:
    fase = 'selesai'
    berhenti

selama (antrean_sekarang masih ada) dan (sekarang - antrean_mulai > durasi):
    tandai siswa bernomor antrean_sekarang sebagai Terlewat, kecuali dia sudah memilih
    antrean_sekarang += 1
    antrean_mulai = waktu berakhirnya jendela sebelumnya, bukan waktu sekarang
selesai

bila antrean_sekarang > nomor antrean terbesar:
    fase = 'selesai'
```

Perulangan ini penting: bila tidak ada yang membuka halaman selama satu jam,
sekali dipanggil skrip harus mengejar semua jendela yang sudah lewat.
Memakai waktu berakhir jendela sebelumnya sebagai `antrean_mulai` yang baru
mencegah antrean molor sedikit demi sedikit setiap kali dikejar.

Siswa yang memilih sebelum waktunya habis langsung memajukan antrean tanpa
menunggu sisa jendelanya.

Opsional tapi disarankan: pasang pemicu waktu (time-driven trigger) tiap 5
menit yang memanggil fungsi pemaju antrean, supaya antrean tetap berjalan
walau tidak ada yang sedang membuka halaman.

## Tampilan yang akan dibuat di halaman web

Satu modal baru, memakai verifikasi NIS + PIN yang sama dengan fitur jaket.
Setelah verifikasi, siswa melihat salah satu dari lima keadaan:

1. **Belum lunas** — pesan bahwa hak memilih hanya untuk yang sudah lunas.
2. **Menunggu giliran** — nomor antreannya, nomor yang sedang berjalan, sisa
   kuota, dan perkiraan waktu. Menyegarkan sendiri tiap 20 detik.
3. **Giliran tiba** — tiga denah bus dengan penghitung mundur jendela waktunya.
   Kursi guru, kursi terpagar, dan kursi yang tidak sesuai gender tampil tidak
   bisa diklik dengan alasan yang jelas.
4. **Sudah punya kursi** — menampilkan bus dan nomor kursinya.
5. **Kuota habis atau terlewat** — pesan bahwa penempatan diatur panitia.

## Catatan

- Ketiga bus dianggap punya tata letak sama persis. Bila ada bus dengan
  konfigurasi berbeda, beri tahu sebelum halaman web dibuat.
- Denah tetap bisa dibuka setelah `fase` menjadi `selesai`, dalam mode
  baca-saja, supaya semua siswa bisa melihat penempatan akhirnya.
