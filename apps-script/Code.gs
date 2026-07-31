/**
 * Field Trip 2026 — SMA Gunung Madu
 * Backend Google Apps Script untuk halaman https://azizalassad23.github.io/FT2026/
 *
 * Menangani lima aksi:
 *   check_payment   — verifikasi NIS + PIN, cek syarat klaim jaket
 *   save_jacket     — simpan ukuran jaket
 *   get_seat_state  — keadaan antrean + denah tiga bus
 *   claim_seat      — kunci satu kursi
 *   (tanpa action)  — form konfirmasi lama
 *
 * Cara pasang:
 *   1. Buka spreadsheet, menu Extensions > Apps Script.
 *   2. Tempel seluruh isi berkas ini menggantikan Code.gs yang lama.
 *   3. Simpan, lalu muat ulang spreadsheet. Menu "Field Trip" akan muncul.
 *   4. Jalankan menu Field Trip > Siapkan tab yang belum ada.
 *   5. Deploy > New deployment > Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 *      Salin URL-nya ke APPS_SCRIPT_WEB_APP_URL di index.html bila berubah.
 *
 * PENTING: setiap kali kode diubah, deployment harus diperbarui
 * (Deploy > Manage deployments > edit > Version: New version). Tanpa itu
 * URL lama masih menjalankan kode lama.
 */

const TAB_SISWA = 'Siswa';
const TAB_KONFIG_KURSI = 'KonfigKursi';
const TAB_PENGATURAN = 'Pengaturan';
const TAB_ANGKET = 'Angket';

const JUMLAH_BUS = 3;
const KURSI_PER_BUS = 50;
const UKURAN_JAKET_SAH = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

// Nilai bawaan bila baris terkait belum ada di tab Pengaturan.
const PENGATURAN_BAWAAN = {
  total_biaya: 2450000,
  syarat_jaket_persen: 70,
  link_grup_wa: '',
  pemilihan_aktif: 'FALSE',
  kuota_pilih_mandiri: 50,
  durasi_giliran_menit: 15,
  lebar_jendela: 1,
  antrean_sekarang: 0,
  antrean_mulai: '',
  fase: 'antrean',
  pesan_belum_dibuka: 'Pemilihan kursi belum dibuka. Tunggu pengumuman dari panitia.'
};

/* ==========================================================================
 *  TITIK MASUK
 * ========================================================================== */

function doPost(e) {
  _cachePengaturan = null;

  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return kirim({ status: 'error', message: 'Format permintaan tidak dikenali.' });
  }

  try {
    switch (req.action) {
      case 'check_payment':  return kirim(checkPayment(req));
      case 'save_jacket':    return kirim(saveJacket(req));
      case 'get_seat_state': return kirim(getSeatState(req));
      case 'claim_seat':     return kirim(claimSeat(req));
      default:               return kirim(simpanAngket(req));
    }
  } catch (err) {
    // Pesan error dikembalikan apa adanya karena semuanya buatan sendiri
    // dan berguna saat menyiapkan spreadsheet.
    return kirim({ status: 'error', message: 'Kesalahan server: ' + err.message });
  }
}

function doGet() {
  return ContentService.createTextOutput(
    'Backend Field Trip 2026 aktif. Endpoint ini hanya menerima POST.'
  );
}

function kirim(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================================
 *  UTILITAS SPREADSHEET
 * ========================================================================== */

function bukaSheet(nama) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nama);
  if (!sh) throw new Error('Tab "' + nama + '" tidak ditemukan. Jalankan menu Field Trip > Siapkan tab yang belum ada.');
  return sh;
}

/**
 * Membaca satu tab menjadi objek yang dipetakan berdasarkan nama kolom,
 * bukan nomor kolom, supaya urutan kolom di spreadsheet bebas diubah.
 */
function bacaTabel(nama) {
  const sheet = bukaSheet(nama);
  const nilai = sheet.getDataRange().getValues();
  if (!nilai.length) throw new Error('Tab "' + nama + '" masih kosong, baris judul kolom belum ada.');

  const header = nilai.shift().map(h => String(h).trim());
  const kolom = {};
  header.forEach((h, i) => { if (h) kolom[h] = i; });

  return { sheet, header, kolom, baris: nilai };
}

function kolomWajib(tabel, nama) {
  if (!(nama in tabel.kolom)) {
    throw new Error('Kolom "' + nama + '" tidak ditemukan. Periksa baris judul di spreadsheet.');
  }
  return tabel.kolom[nama];
}

/** Kolom opsional: mengembalikan -1 bila tidak ada, bukan melempar error. */
function kolomOpsional(tabel, nama) {
  return (nama in tabel.kolom) ? tabel.kolom[nama] : -1;
}

function tulisSel(tabel, barisSheet, namaKolom, nilai) {
  tabel.sheet.getRange(barisSheet, kolomWajib(tabel, namaKolom) + 1).setValue(nilai);
}

function angka(v) {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function benar(v) {
  return String(v).trim().toUpperCase() === 'TRUE' || v === true;
}

function kosong(v) {
  return String(v == null ? '' : v).trim() === '';
}

/* ==========================================================================
 *  PENGATURAN
 * ========================================================================== */

let _cachePengaturan = null;

function pengaturan(kunci, bawaan) {
  if (!_cachePengaturan) {
    _cachePengaturan = {};
    const t = bacaTabel(TAB_PENGATURAN);
    const cK = kolomWajib(t, 'Kunci');
    const cV = kolomWajib(t, 'Nilai');
    t.baris.forEach(b => {
      const k = String(b[cK]).trim();
      if (k) _cachePengaturan[k] = b[cV];
    });
  }
  // Sel kosong dianggap "belum diatur" sehingga jatuh ke nilai bawaan.
  if (kunci in _cachePengaturan && !kosong(_cachePengaturan[kunci])) return _cachePengaturan[kunci];
  if (bawaan !== undefined) return bawaan;
  return PENGATURAN_BAWAAN[kunci];
}

function setPengaturan(kunci, nilai) {
  const t = bacaTabel(TAB_PENGATURAN);
  const cK = kolomWajib(t, 'Kunci');
  const cV = kolomWajib(t, 'Nilai');
  for (let i = 0; i < t.baris.length; i++) {
    if (String(t.baris[i][cK]).trim() === kunci) {
      t.sheet.getRange(i + 2, cV + 1).setValue(nilai);
      if (_cachePengaturan) _cachePengaturan[kunci] = nilai;
      return;
    }
  }
  t.sheet.appendRow([kunci, nilai]);
  if (_cachePengaturan) _cachePengaturan[kunci] = nilai;
}

/* ==========================================================================
 *  IDENTITAS SISWA
 * ========================================================================== */

/**
 * PIN sering tersimpan sebagai angka di spreadsheet sehingga nol di depan
 * hilang: "0789" menjadi 789. Kedua sisi dinormalkan ke empat digit supaya
 * siswa dengan PIN berawalan nol tetap bisa masuk.
 */
function normalPin(v) {
  const s = String(v == null ? '' : v).replace(/\D/g, '');
  if (!s) return '';
  return s.length >= 4 ? s.slice(-4) : ('0000' + s).slice(-4);
}

function samaNis(a, b) {
  const x = String(a == null ? '' : a).trim();
  const y = String(b == null ? '' : b).trim();
  if (!x || !y) return false;
  if (x === y) return true;
  // Toleransi bila NIS tersimpan sebagai angka sehingga nol di depan hilang.
  return x.replace(/^0+/, '') === y.replace(/^0+/, '');
}

/**
 * Mengembalikan { indeks, barisSheet, data } bila NIS dan PIN cocok.
 * Mengembalikan null bila NIS tidak ada ATAU PIN salah — sengaja tidak
 * dibedakan supaya tidak bisa dipakai menebak NIS mana yang terdaftar.
 */
function cariSiswa(t, nis, pin) {
  const cNIS = kolomWajib(t, 'NIS');
  const cPIN = kolomWajib(t, 'PIN');
  const pinMasuk = normalPin(pin);
  if (!pinMasuk) return null;

  for (let i = 0; i < t.baris.length; i++) {
    if (!samaNis(t.baris[i][cNIS], nis)) continue;
    if (normalPin(t.baris[i][cPIN]) !== pinMasuk) return null;
    return { indeks: i, barisSheet: i + 2, data: t.baris[i] };
  }
  return null;
}

const PESAN_TIDAK_COCOK = 'NIS atau PIN tidak cocok. Periksa kembali, atau hubungi panitia bila data Anda belum terdaftar.';

/** "Rani Putri Lestari" -> "Rani P." */
function namaPendek(nama) {
  const p = String(nama == null ? '' : nama).trim().split(/\s+/);
  if (!p[0]) return '';
  if (p.length === 1) return p[0];
  return p[0] + ' ' + p[1].charAt(0).toUpperCase() + '.';
}

/* ==========================================================================
 *  AKSI: check_payment
 * ========================================================================== */

function hitungPersenBayar(t, siswa) {
  const total = angka(pengaturan('total_biaya'));
  const bayar = angka(siswa.data[kolomWajib(t, 'TotalBayar')]);
  if (total <= 0) return 0;
  return (bayar / total) * 100;
}

function checkPayment(req) {
  const t = bacaTabel(TAB_SISWA);
  const siswa = cariSiswa(t, req.nis, req.pin);
  if (!siswa) return { status: 'error', message: PESAN_TIDAK_COCOK };

  const persen = hitungPersenBayar(t, siswa);
  const syarat = angka(pengaturan('syarat_jaket_persen'));

  // Toleransi kecil supaya pembulatan tidak menolak yang sebenarnya pas.
  if (persen + 0.01 < syarat) {
    return {
      status: 'success',
      eligible: false,
      message: 'Pembayaran Anda baru ' + Math.floor(persen) + '%. Klaim ukuran jaket dibuka setelah mencapai ' + syarat + '%.'
    };
  }

  return {
    status: 'success',
    eligible: true,
    nama: String(siswa.data[kolomWajib(t, 'Nama')])
  };
}

/* ==========================================================================
 *  AKSI: save_jacket
 * ========================================================================== */

function saveJacket(req) {
  const ukuran = String(req.ukuran == null ? '' : req.ukuran).trim().toUpperCase();
  if (UKURAN_JAKET_SAH.indexOf(ukuran) === -1) {
    return { status: 'error', message: 'Ukuran jaket tidak dikenali.' };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { status: 'error', message: 'Server sedang sibuk, silakan coba lagi sebentar.' };
  }

  try {
    const t = bacaTabel(TAB_SISWA);

    // PIN diverifikasi ulang di sini. Tanpa ini siapa pun yang tahu NIS
    // temannya bisa mengubah ukuran jaket orang tersebut.
    const siswa = cariSiswa(t, req.nis, req.pin);
    if (!siswa) return { status: 'error', message: PESAN_TIDAK_COCOK };

    // Syarat pembayaran dicek ulang di server; keadaan bisa berubah antara
    // verifikasi dan penyimpanan, dan klien tidak boleh dipercaya.
    const persen = hitungPersenBayar(t, siswa);
    const syarat = angka(pengaturan('syarat_jaket_persen'));
    if (persen + 0.01 < syarat) {
      return { status: 'error', message: 'Pembayaran Anda belum mencapai ' + syarat + '%.' };
    }

    tulisSel(t, siswa.barisSheet, 'UkuranJaket', ukuran);
    if (kolomOpsional(t, 'WaktuJaket') !== -1) {
      tulisSel(t, siswa.barisSheet, 'WaktuJaket', new Date());
    }

    return {
      status: 'success',
      // Link grup dikirim dari sini supaya tidak perlu tertulis di HTML publik.
      groupLink: String(pengaturan('link_grup_wa') || '')
    };
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
 *  ANTREAN KURSI
 * ========================================================================== */

/**
 * Memberi nomor antrean kepada siswa lunas yang belum punya nomor, urut
 * menurut TglLunas, melanjutkan dari nomor terbesar yang sudah ada.
 * Nomor yang sudah terbit tidak pernah berubah supaya antrean yang sedang
 * berjalan tidak kacau ketika ada siswa baru melunasi.
 */
function terbitkanNomorAntrean(t) {
  const cLunas = kolomWajib(t, 'Lunas');
  const cTgl = kolomWajib(t, 'TglLunas');
  const cAntre = kolomWajib(t, 'NoAntrean');

  let maksimal = 0;
  const belum = [];

  t.baris.forEach((b, i) => {
    const n = angka(b[cAntre]);
    if (n > maksimal) maksimal = n;
    if (n > 0) return;
    if (!benar(b[cLunas])) return;
    const tgl = b[cTgl] instanceof Date ? b[cTgl].getTime() : new Date(b[cTgl]).getTime();
    belum.push({ indeks: i, waktu: isNaN(tgl) ? Number.MAX_SAFE_INTEGER : tgl });
  });

  if (!belum.length) return false;

  belum.sort((a, b) => a.waktu - b.waktu);
  belum.forEach(item => {
    maksimal += 1;
    t.baris[item.indeks][cAntre] = maksimal;
    t.sheet.getRange(item.indeks + 2, cAntre + 1).setValue(maksimal);
  });
  return true;
}

/**
 * Membaca keadaan antrean tanpa menulis apa pun. Aman dipanggil di luar kunci.
 */
function keadaanAntrean(t) {
  const cWaktuPilih = kolomWajib(t, 'WaktuPilih');

  // Hanya kursi yang diambil lewat halaman web yang memakan kuota.
  // Penempatan manual oleh panitia tidak mengisi WaktuPilih.
  let terpakai = 0;
  t.baris.forEach(b => { if (!kosong(b[cWaktuPilih])) terpakai += 1; });

  const kuota = angka(pengaturan('kuota_pilih_mandiri'));
  const durasiMs = angka(pengaturan('durasi_giliran_menit')) * 60000;

  let fase = String(pengaturan('fase'));
  if (terpakai >= kuota) fase = 'selesai';

  const nilaiMulai = pengaturan('antrean_mulai');
  let mulai = nilaiMulai instanceof Date ? nilaiMulai : new Date(nilaiMulai);
  if (isNaN(mulai.getTime())) mulai = null;

  return {
    aktif: benar(pengaturan('pemilihan_aktif')),
    fase,
    kuota,
    terpakai,
    sekarang: angka(pengaturan('antrean_sekarang')),
    mulai,
    durasiMs
  };
}

/**
 * Memajukan antrean. Menulis, jadi wajib dipanggil di dalam kunci.
 *
 * Nomor giliran diturunkan dari data, bukan disimpan terpisah: yang berjalan
 * selalu nomor terkecil yang belum memilih dan belum ditandai terlewat.
 * `antrean_sekarang` hanya disimpan untuk mendeteksi pergantian giliran
 * sehingga jendela waktunya bisa dimulai ulang.
 */
function majukanAntrean(t) {
  const aktif = benar(pengaturan('pemilihan_aktif'));
  const kuota = angka(pengaturan('kuota_pilih_mandiri'));
  const durasiMs = angka(pengaturan('durasi_giliran_menit')) * 60000;

  const cAntre = kolomWajib(t, 'NoAntrean');
  const cWaktuPilih = kolomWajib(t, 'WaktuPilih');
  const cTerlewat = kolomWajib(t, 'Terlewat');

  // Hanya kursi yang diambil lewat halaman web yang memakan kuota.
  // Penempatan manual oleh panitia tidak mengisi WaktuPilih.
  let terpakai = 0;
  t.baris.forEach(b => { if (!kosong(b[cWaktuPilih])) terpakai += 1; });

  if (!aktif) {
    return { aktif: false, fase: 'nonaktif', kuota, terpakai, sekarang: 0, mulai: null, durasiMs };
  }

  if (terpakai >= kuota) {
    if (String(pengaturan('fase')) !== 'selesai') setPengaturan('fase', 'selesai');
    return { aktif: true, fase: 'selesai', kuota, terpakai, sekarang: 0, mulai: null, durasiMs };
  }

  const kandidatSekarang = () => {
    let min = 0;
    t.baris.forEach(b => {
      const n = angka(b[cAntre]);
      if (n <= 0) return;
      if (!kosong(b[cWaktuPilih])) return;
      if (benar(b[cTerlewat])) return;
      if (min === 0 || n < min) min = n;
    });
    return min;
  };

  let sekarang = angka(pengaturan('antrean_sekarang'));
  let mulaiNilai = pengaturan('antrean_mulai');
  let mulai = mulaiNilai instanceof Date ? mulaiNilai : new Date(mulaiNilai);
  if (isNaN(mulai.getTime())) mulai = new Date();

  const now = Date.now();
  const perluTulis = [];
  let ubahSekarang = false;
  let ubahMulai = false;
  let fase = String(pengaturan('fase'));

  for (let guard = 0; guard < 1000; guard++) {
    const kandidat = kandidatSekarang();

    if (kandidat === 0) {
      fase = 'selesai';
      break;
    }

    if (kandidat !== sekarang) {
      // Pemegang giliran sebelumnya sudah memilih. Jendela baru mulai sekarang.
      sekarang = kandidat;
      mulai = new Date(now);
      ubahSekarang = true;
      ubahMulai = true;
      break;
    }

    if (now - mulai.getTime() > durasiMs) {
      // Jendela habis. Tandai terlewat, lalu geser titik mulai memakai akhir
      // jendela sebelumnya — bukan waktu sekarang — supaya antrean tidak
      // molor sedikit demi sedikit setiap kali dikejar.
      t.baris.forEach((b, i) => {
        if (angka(b[cAntre]) !== kandidat) return;
        if (!kosong(b[cWaktuPilih])) return;
        b[cTerlewat] = 'TRUE';
        perluTulis.push(i);
      });
      mulai = new Date(mulai.getTime() + durasiMs);
      ubahMulai = true;

      // `sekarang` HARUS ikut digeser di sini. Bila tidak, iterasi berikutnya
      // melihat kandidat != sekarang dan salah menyimpulkan bahwa giliran
      // sebelumnya sudah memilih, lalu mereset jam ke waktu sekarang —
      // pengejaran berhenti setelah satu langkah.
      const berikut = kandidatSekarang();
      if (berikut === 0) {
        fase = 'selesai';
        sekarang = 0;
        ubahSekarang = true;
        break;
      }
      sekarang = berikut;
      ubahSekarang = true;
      continue;
    }

    break;
  }

  perluTulis.forEach(i => {
    t.sheet.getRange(i + 2, cTerlewat + 1).setValue('TRUE');
  });
  if (ubahSekarang) setPengaturan('antrean_sekarang', sekarang);
  if (ubahMulai) setPengaturan('antrean_mulai', mulai);
  if (fase !== String(pengaturan('fase'))) setPengaturan('fase', fase);

  return { aktif: true, fase, kuota, terpakai, sekarang, mulai, durasiMs };
}

/* ==========================================================================
 *  DENAH BUS
 * ========================================================================== */

function bangunDenah(tSiswa) {
  const tK = bacaTabel(TAB_KONFIG_KURSI);
  const cBus = kolomWajib(tK, 'Bus');
  const cKursi = kolomWajib(tK, 'Kursi');
  const cTipe = kolomWajib(tK, 'Tipe');
  const cLabel = kolomOpsional(tK, 'Label');

  const denah = {};
  for (let i = 1; i <= JUMLAH_BUS; i++) denah[i] = {};

  tK.baris.forEach(b => {
    const bus = angka(b[cBus]);
    const kursi = angka(b[cKursi]);
    if (!denah[bus] || kursi < 1 || kursi > KURSI_PER_BUS) return;
    const tipe = String(b[cTipe]).trim().toUpperCase() || 'BEBAS';
    const item = { tipe };
    if (cLabel !== -1 && !kosong(b[cLabel])) item.label = String(b[cLabel]).trim();
    denah[bus][String(kursi)] = item;
  });

  const cSBus = kolomWajib(tSiswa, 'Bus');
  const cSKursi = kolomWajib(tSiswa, 'Kursi');
  const cNama = kolomWajib(tSiswa, 'Nama');

  tSiswa.baris.forEach(b => {
    const bus = angka(b[cSBus]);
    const kursi = angka(b[cSKursi]);
    if (!denah[bus] || kursi < 1 || kursi > KURSI_PER_BUS) return;
    const item = denah[bus][String(kursi)] || { tipe: 'BEBAS' };
    item.oleh = namaPendek(b[cNama]);
    denah[bus][String(kursi)] = item;
  });

  const hasil = [];
  for (let i = 1; i <= JUMLAH_BUS; i++) {
    hasil.push({ id: i, nama: 'Bus ' + i, kursi: denah[i] });
  }
  return hasil;
}

/* ==========================================================================
 *  AKSI: get_seat_state
 * ========================================================================== */

/**
 * Memeriksa dengan murah apakah antrean perlu digerakkan, tanpa menulis
 * apa pun. Dipakai supaya aksi baca tidak selalu merebut kunci.
 */
function perluMajukan(t) {
  const cLunas = kolomWajib(t, 'Lunas');
  const cAntre = kolomWajib(t, 'NoAntrean');
  const cWaktuPilih = kolomWajib(t, 'WaktuPilih');
  const cTerlewat = kolomWajib(t, 'Terlewat');

  // Ada siswa lunas yang belum punya nomor antrean.
  for (let i = 0; i < t.baris.length; i++) {
    if (benar(t.baris[i][cLunas]) && angka(t.baris[i][cAntre]) <= 0) return true;
  }

  if (String(pengaturan('fase')) === 'selesai') return false;

  let kandidat = 0;
  t.baris.forEach(b => {
    const n = angka(b[cAntre]);
    if (n <= 0 || !kosong(b[cWaktuPilih]) || benar(b[cTerlewat])) return;
    if (kandidat === 0 || n < kandidat) kandidat = n;
  });

  // Giliran berpindah karena pemegang sebelumnya sudah memilih.
  if (kandidat !== angka(pengaturan('antrean_sekarang'))) return true;

  // Jendela waktu giliran yang sedang berjalan sudah habis.
  const nilaiMulai = pengaturan('antrean_mulai');
  const mulai = nilaiMulai instanceof Date ? nilaiMulai : new Date(nilaiMulai);
  if (isNaN(mulai.getTime())) return true;
  const durasiMs = angka(pengaturan('durasi_giliran_menit')) * 60000;
  return (Date.now() - mulai.getTime()) > durasiMs;
}

function getSeatState(req) {
  // Aksi ini dipanggil tiap 20 detik oleh setiap siswa yang sedang menunggu.
  // Bila selalu merebut kunci skrip, permintaan akan mengantre satu per satu
  // dan halaman terasa macet. Jadi jalur bacanya dibuat bebas kunci, dan
  // kunci hanya diambil ketika antrean memang perlu digerakkan.
  let t = bacaTabel(TAB_SISWA);
  const siswa = cariSiswa(t, req.nis, req.pin);
  if (!siswa) return { status: 'error', message: PESAN_TIDAK_COCOK };

  if (!benar(pengaturan('pemilihan_aktif'))) {
    return {
      status: 'error',
      kode: 'BELUM_DIBUKA',
      message: String(pengaturan('pesan_belum_dibuka'))
    };
  }

  if (perluMajukan(t)) {
    const lock = LockService.getScriptLock();
    if (lock.tryLock(15000)) {
      try {
        // Baca ulang di dalam kunci; keadaan bisa sudah berubah sejak
        // pemeriksaan murah di atas.
        _cachePengaturan = null;
        t = bacaTabel(TAB_SISWA);
        terbitkanNomorAntrean(t);
        majukanAntrean(t);
      } finally {
        lock.releaseLock();
      }
    }
    // Bila kunci tidak didapat, permintaan diteruskan dengan data apa adanya.
    // Permintaan berikutnya 20 detik lagi akan mengejar ketertinggalannya.
  }

  {
    const q = keadaanAntrean(t);
    const baris = t.baris[siswa.indeks];

    const noAntrean = angka(baris[kolomWajib(t, 'NoAntrean')]);
    const lebar = Math.max(1, angka(pengaturan('lebar_jendela')));
    const sudahPilih = !kosong(baris[kolomWajib(t, 'Kursi')]);
    const terlewat = benar(baris[kolomWajib(t, 'Terlewat')]);

    const giliranSaya = q.fase === 'antrean'
      && !sudahPilih
      && !terlewat
      && noAntrean > 0
      && noAntrean >= q.sekarang
      && noAntrean < q.sekarang + lebar;

    const dapatPrivilege = !terlewat
      && noAntrean > 0
      && q.fase !== 'selesai'
      && q.terpakai < q.kuota;

    let detikTersisa = 0;
    if (giliranSaya && q.mulai) {
      detikTersisa = Math.max(0, Math.round((q.mulai.getTime() + q.durasiMs - Date.now()) / 1000));
    }

    return {
      status: 'success',
      siswa: {
        nama: String(baris[kolomWajib(t, 'Nama')]),
        gender: String(baris[kolomWajib(t, 'Gender')]).trim().toUpperCase(),
        lunas: benar(baris[kolomWajib(t, 'Lunas')]),
        noAntrean: noAntrean || null,
        dapatPrivilege: dapatPrivilege || sudahPilih,
        busTerpilih: sudahPilih ? angka(baris[kolomWajib(t, 'Bus')]) : null,
        kursiTerpilih: sudahPilih ? angka(baris[kolomWajib(t, 'Kursi')]) : null
      },
      antrean: {
        fase: q.fase,
        sekarang: q.sekarang,
        lebarJendela: lebar,
        giliranSaya,
        detikTersisa,
        kuota: q.kuota,
        terpakai: q.terpakai
      },
      bus: bangunDenah(t)
    };
  }
}

/* ==========================================================================
 *  AKSI: claim_seat
 * ========================================================================== */

function claimSeat(req) {
  const bus = angka(req.bus);
  const kursi = angka(req.kursi);
  if (bus < 1 || bus > JUMLAH_BUS || kursi < 1 || kursi > KURSI_PER_BUS) {
    return { status: 'error', kode: 'KURSI_GURU', message: 'Nomor kursi tidak dikenali.' };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { status: 'error', kode: 'SIBUK', message: 'Server sedang sibuk, silakan coba lagi sebentar.' };
  }

  try {
    // Seluruh pembacaan di bawah ini terjadi SETELAH kunci didapat. Data yang
    // dibaca sebelum kunci sudah tidak bisa dipercaya karena permintaan lain
    // mungkin sudah mengubahnya.
    const t = bacaTabel(TAB_SISWA);
    const siswa = cariSiswa(t, req.nis, req.pin);
    if (!siswa) return { status: 'error', message: PESAN_TIDAK_COCOK };

    if (!benar(pengaturan('pemilihan_aktif'))) {
      return { status: 'error', kode: 'BELUM_DIBUKA', message: String(pengaturan('pesan_belum_dibuka')) };
    }

    const baris = siswa.data;

    if (!benar(baris[kolomWajib(t, 'Lunas')])) {
      return { status: 'error', kode: 'BELUM_LUNAS', message: 'Hak memilih kursi hanya untuk siswa yang sudah lunas.' };
    }

    if (!kosong(baris[kolomWajib(t, 'Kursi')])) {
      return {
        status: 'error',
        kode: 'SUDAH_MEMILIH',
        message: 'Anda sudah punya kursi: Bus ' + angka(baris[kolomWajib(t, 'Bus')]) + ' kursi ' + angka(baris[kolomWajib(t, 'Kursi')]) + '.'
      };
    }

    const q = majukanAntrean(t);

    if (q.terpakai >= q.kuota || q.fase === 'selesai') {
      return { status: 'error', kode: 'KUOTA_HABIS', message: 'Kuota 50 kursi pilih-sendiri sudah terpenuhi. Penempatan Anda akan diatur panitia.' };
    }

    const noAntrean = angka(baris[kolomWajib(t, 'NoAntrean')]);
    const lebar = Math.max(1, angka(pengaturan('lebar_jendela')));
    if (benar(baris[kolomWajib(t, 'Terlewat')]) || noAntrean <= 0
        || noAntrean < q.sekarang || noAntrean >= q.sekarang + lebar) {
      return { status: 'error', kode: 'BUKAN_GILIRAN', message: 'Saat ini bukan giliran Anda, atau waktu giliran Anda sudah habis.' };
    }

    // Cek keadaan kursi yang diminta.
    const denah = bangunDenah(t);
    const dataBus = denah[bus - 1];
    const info = dataBus.kursi[String(kursi)] || { tipe: 'BEBAS' };

    if (info.oleh) {
      return { status: 'error', kode: 'KURSI_TERISI', message: 'Kursi ' + kursi + ' baru saja diambil siswa lain. Silakan pilih kursi lain.' };
    }

    if (info.tipe === 'GURU' || info.tipe === 'PANITIA' || info.tipe === 'BLOK') {
      return { status: 'error', kode: 'KURSI_GURU', message: 'Kursi ' + kursi + ' tidak tersedia untuk dipilih.' };
    }

    const gender = String(baris[kolomWajib(t, 'Gender')]).trim().toUpperCase();
    if ((info.tipe === 'L' || info.tipe === 'P') && gender && gender !== info.tipe) {
      return {
        status: 'error',
        kode: 'GENDER_TIDAK_COCOK',
        message: 'Kursi ' + kursi + ' khusus siswa ' + (info.tipe === 'L' ? 'putra' : 'putri') + '.'
      };
    }

    tulisSel(t, siswa.barisSheet, 'Bus', bus);
    tulisSel(t, siswa.barisSheet, 'Kursi', kursi);
    tulisSel(t, siswa.barisSheet, 'WaktuPilih', new Date());

    // Perbarui salinan lokal supaya pemajuan antrean di bawah melihat
    // kursi ini sudah terisi.
    baris[kolomWajib(t, 'Bus')] = bus;
    baris[kolomWajib(t, 'Kursi')] = kursi;
    baris[kolomWajib(t, 'WaktuPilih')] = new Date();

    majukanAntrean(t);

    return { status: 'success', bus, kursi };
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
 *  AKSI: form konfirmasi lama (tanpa action)
 * ========================================================================== */

function simpanAngket(req) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_ANGKET)
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet(TAB_ANGKET);

  if (sh.getLastRow() === 0) {
    sh.appendRow(['Timestamp', 'Nama', 'Kelas', 'Status', 'HP Siswa', 'HP Ortu', 'Alasan', 'Pertanyaan', 'Sumber']);
  }

  sh.appendRow([
    req.timestamp || new Date(),
    req.studentName || '',
    req.studentClass || '',
    req.decision || '',
    req.studentPhone || '',
    req.parentPhone || '',
    req.studentReason || '',
    req.studentQuestion || '',
    req.source || ''
  ]);

  return { status: 'success' };
}

/* ==========================================================================
 *  PEMICU WAKTU
 * ========================================================================== */

/**
 * Dipanggil pemicu waktu tiap 5 menit supaya antrean tetap berjalan walau
 * tidak ada siswa yang sedang membuka halaman. Pasang lewat menu
 * Field Trip > Pasang pemicu antrean.
 */
function pemicuMajukanAntrean() {
  _cachePengaturan = null;
  if (!benar(pengaturan('pemilihan_aktif'))) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const t = bacaTabel(TAB_SISWA);
    terbitkanNomorAntrean(t);
    majukanAntrean(bacaTabel(TAB_SISWA));
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
 *  MENU BANTUAN DI SPREADSHEET
 * ========================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Field Trip')
    .addItem('Siapkan tab yang belum ada', 'siapkanTab')
    .addItem('Hitung ulang nomor antrean', 'menuHitungAntrean')
    .addSeparator()
    .addItem('Pasang pemicu antrean (tiap 5 menit)', 'pasangPemicu')
    .addItem('Lepas pemicu antrean', 'lepasPemicu')
    .addSeparator()
    .addItem('Kosongkan SEMUA pilihan kursi', 'menuResetKursi')
    .addToUi();
}

function siapkanTab() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const catatan = [];

  const pastikan = (nama, header) => {
    let sh = ss.getSheetByName(nama);
    if (!sh) {
      sh = ss.insertSheet(nama);
      sh.appendRow(header);
      sh.setFrozenRows(1);
      catatan.push('Tab "' + nama + '" dibuat.');
      return sh;
    }
    const adaSekarang = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
      .map(h => String(h).trim());
    const kurang = header.filter(h => adaSekarang.indexOf(h) === -1);
    if (kurang.length) {
      sh.getRange(1, sh.getLastColumn() + 1, 1, kurang.length).setValues([kurang]);
      catatan.push('Tab "' + nama + '": kolom ' + kurang.join(', ') + ' ditambahkan.');
    }
    return sh;
  };

  pastikan(TAB_SISWA, [
    'NIS', 'Nama', 'PIN', 'Kelas', 'Gender', 'TotalBayar', 'Lunas', 'TglLunas',
    'NoAntrean', 'Bus', 'Kursi', 'WaktuPilih', 'Terlewat', 'UkuranJaket', 'WaktuJaket'
  ]);
  pastikan(TAB_KONFIG_KURSI, ['Bus', 'Kursi', 'Tipe', 'Label']);
  const shSet = pastikan(TAB_PENGATURAN, ['Kunci', 'Nilai']);

  // Isi nilai bawaan untuk kunci yang belum ada.
  const adaKunci = shSet.getLastRow() > 1
    ? shSet.getRange(2, 1, shSet.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim())
    : [];
  Object.keys(PENGATURAN_BAWAAN).forEach(k => {
    if (adaKunci.indexOf(k) === -1) {
      shSet.appendRow([k, PENGATURAN_BAWAAN[k]]);
      catatan.push('Pengaturan "' + k + '" diisi nilai bawaan.');
    }
  });

  SpreadsheetApp.getUi().alert(
    catatan.length ? catatan.join('\n') : 'Semua tab dan kolom sudah lengkap.'
  );
}

function menuHitungAntrean() {
  _cachePengaturan = null;
  const t = bacaTabel(TAB_SISWA);
  const ada = terbitkanNomorAntrean(t);
  SpreadsheetApp.getUi().alert(ada
    ? 'Nomor antrean baru sudah diterbitkan untuk siswa yang lunas.'
    : 'Tidak ada siswa lunas yang belum punya nomor antrean.');
}

function pasangPemicu() {
  lepasPemicu();
  ScriptApp.newTrigger('pemicuMajukanAntrean').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('Pemicu antrean dipasang, berjalan tiap 5 menit.');
}

function lepasPemicu() {
  ScriptApp.getProjectTriggers().forEach(tr => {
    if (tr.getHandlerFunction() === 'pemicuMajukanAntrean') ScriptApp.deleteTrigger(tr);
  });
}

function menuResetKursi() {
  const ui = SpreadsheetApp.getUi();
  const jawab = ui.alert(
    'Kosongkan semua pilihan kursi?',
    'Kolom Bus, Kursi, WaktuPilih, dan Terlewat akan dikosongkan untuk SEMUA siswa, ' +
    'dan antrean dimulai dari awal. Tindakan ini tidak bisa dibatalkan.',
    ui.ButtonSet.YES_NO
  );
  if (jawab !== ui.Button.YES) return;

  _cachePengaturan = null;
  const t = bacaTabel(TAB_SISWA);
  ['Bus', 'Kursi', 'WaktuPilih', 'Terlewat'].forEach(nama => {
    const c = kolomWajib(t, nama) + 1;
    if (t.baris.length) t.sheet.getRange(2, c, t.baris.length, 1).clearContent();
  });
  setPengaturan('antrean_sekarang', 0);
  setPengaturan('antrean_mulai', '');
  setPengaturan('fase', 'antrean');
  ui.alert('Semua pilihan kursi sudah dikosongkan.');
}
