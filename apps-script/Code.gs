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

/**
 * ID spreadsheet. Dikosongkan berarti memakai spreadsheet tempat skrip ini
 * terpasang — cukup untuk skrip yang dibuka lewat Extensions > Apps Script.
 *
 * Bila skrip Anda berdiri sendiri (standalone), isi ID-nya LANGSUNG DI EDITOR
 * APPS SCRIPT, jangan di berkas ini: repo ini publik, dan ID spreadsheet yang
 * setelan berbaginya "siapa saja yang memiliki link" bisa dibuka orang luar
 * hanya dengan ID tersebut.
 */
const SPREADSHEET_ID = '';

const TAB_SISWA = 'DataSiswa';
const TAB_KONFIG_KURSI = 'KonfigKursi';
const TAB_PENGATURAN = 'Pengaturan';
const TAB_ANGKET = 'Angket';

/**
 * Nama kolom dikenali lewat daftar padanan di bawah, jadi judul kolom di
 * spreadsheet tidak perlu diubah. Yang di depan dicoba lebih dulu.
 *
 * Bila ada judul kolom yang tidak terdeteksi, tambahkan saja tulisannya
 * ke daftar yang sesuai — tidak perlu mengubah bagian lain.
 */
const PADANAN_KOLOM = {
  NIS:         ['NIS', 'Nis', 'NISN', 'No Induk', 'Nomor Induk'],
  Nama:        ['Nama', 'Nama Siswa', 'NamaSiswa', 'Nama Lengkap'],
  NoHP:        ['NoHP', 'No HP', 'No. HP', 'Nomor HP', 'HP', 'No Telepon', 'Telepon', 'WA', 'No WA'],
  PIN:         ['PIN', 'Pin'],
  Kelas:       ['Kelas'],
  Gender:      ['Gender', 'JK', 'Jenis Kelamin', 'L/P', 'LP'],
  TotalBayar:  ['TotalBayar', 'Total Bayar', 'Total Pembayaran', 'Jumlah Bayar', 'Total', 'Pembayaran'],
  Lunas:       ['Lunas', 'Status Lunas'],
  TglLunas:    ['TglLunas', 'Tgl Lunas', 'Tanggal Lunas', 'Waktu Lunas'],
  NoAntrean:   ['NoAntrean', 'No Antrean', 'Nomor Antrean'],
  Bus:         ['Bus', 'No Bus', 'Nomor Bus'],
  Kursi:       ['Kursi', 'No Kursi', 'Nomor Kursi'],
  WaktuPilih:  ['WaktuPilih', 'Waktu Pilih'],
  Terlewat:    ['Terlewat'],
  UkuranJaket: ['UkuranJaket', 'Ukuran Jaket', 'Ukuran', 'Jaket'],
  WaktuJaket:  ['WaktuJaket', 'Waktu Jaket']
};

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
  // 0 berarti tanpa batas waktu: giliran berpindah hanya setelah pemegangnya
  // benar-benar memilih, atau setelah panitia melewatinya secara manual.
  durasi_giliran_menit: 0,
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
      // Form konfirmasi lama: halaman web mengirim tanpa field action,
      // tetapi 'submit_mission' ikut diterima demi kompatibilitas.
      case 'submit_mission':
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

function bukaSpreadsheet() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const aktif = SpreadsheetApp.getActiveSpreadsheet();
  if (!aktif) throw new Error('SPREADSHEET_ID masih kosong dan skrip ini tidak terpasang pada spreadsheet mana pun.');
  return aktif;
}

function bukaSheet(nama) {
  const sh = bukaSpreadsheet().getSheetByName(nama);
  if (!sh) throw new Error('Tab "' + nama + '" tidak ditemukan. Jalankan menu Field Trip > Siapkan tab yang belum ada.');
  return sh;
}

/**
 * Membaca satu tab menjadi objek yang dipetakan berdasarkan nama kolom,
 * bukan nomor kolom, supaya urutan kolom di spreadsheet bebas diubah dan
 * judul kolom yang sudah ada tidak perlu ditulis ulang.
 */
function bacaTabel(nama) {
  const sheet = bukaSheet(nama);
  const nilai = sheet.getDataRange().getValues();
  if (!nilai.length) throw new Error('Tab "' + nama + '" masih kosong, baris judul kolom belum ada.');

  const header = nilai.shift().map(h => String(h).trim());
  const kolom = {};

  // Judul apa adanya.
  header.forEach((h, i) => { if (h) kolom[h] = i; });

  // Lalu nama baku lewat daftar padanan, tanpa menimpa yang sudah cocok persis.
  const rapi = s => String(s).trim().toLowerCase().replace(/[\s._-]+/g, '');
  Object.keys(PADANAN_KOLOM).forEach(baku => {
    if (baku in kolom) return;
    for (const alias of PADANAN_KOLOM[baku]) {
      const idx = header.findIndex(h => h && rapi(h) === rapi(alias));
      if (idx !== -1) { kolom[baku] = idx; return; }
    }
  });

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
/**
 * PIN siswa. Bila ada kolom PIN khusus, itu yang dipakai. Bila tidak, PIN
 * diambil dari empat digit terakhir nomor HP — sama seperti skrip lama.
 */
function pinSiswa(t, baris) {
  const cPIN = kolomOpsional(t, 'PIN');
  if (cPIN !== -1 && !kosong(baris[cPIN])) return normalPin(baris[cPIN]);
  const cHP = kolomOpsional(t, 'NoHP');
  if (cHP !== -1) return normalPin(baris[cHP]);
  throw new Error('Tidak ada kolom PIN maupun kolom nomor HP di tab ' + TAB_SISWA + '.');
}

/**
 * Status lunas. Memakai kolom Lunas bila ada isinya; bila tidak, dihitung
 * dari TotalBayar terhadap total_biaya.
 */
function siswaLunas(t, baris) {
  const cL = kolomOpsional(t, 'Lunas');
  if (cL !== -1 && !kosong(baris[cL])) return benar(baris[cL]);
  const total = angka(pengaturan('total_biaya'));
  return total > 0 && angka(baris[kolomWajib(t, 'TotalBayar')]) >= total;
}

function cariSiswa(t, nis, pin) {
  const cNIS = kolomWajib(t, 'NIS');
  const pinMasuk = normalPin(pin);
  if (!pinMasuk) return null;

  for (let i = 0; i < t.baris.length; i++) {
    if (!samaNis(t.baris[i][cNIS], nis)) continue;
    if (pinSiswa(t, t.baris[i]) !== pinMasuk) return null;
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
  const cTgl = kolomWajib(t, 'TglLunas');
  const cAntre = kolomWajib(t, 'NoAntrean');

  let maksimal = 0;
  const belum = [];

  t.baris.forEach((b, i) => {
    const n = angka(b[cAntre]);
    if (n > maksimal) maksimal = n;
    if (n > 0) return;
    if (!siswaLunas(t, b)) return;

    // TglLunas HANYA diisi bendahara. Skrip tidak pernah mengarangnya sendiri:
    // tanggal yang dikarang akan membuat urutan antrean mengikuti urutan baris
    // di spreadsheet, bukan urutan pelunasan yang sebenarnya. Siswa yang
    // tanggalnya belum diisi tidak masuk antrean sampai bendahara mengisinya.
    if (kosong(b[cTgl])) return;

    const tgl = b[cTgl] instanceof Date ? b[cTgl].getTime() : new Date(b[cTgl]).getTime();
    if (isNaN(tgl)) return; // tanggal tidak terbaca, lewati daripada salah urut

    belum.push({ indeks: i, waktu: tgl });
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
    durasiMs,
    pakaiTimer: durasiMs > 0
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

    // durasiMs 0 berarti tanpa batas waktu: giliran tidak pernah kedaluwarsa
    // sendiri. Perpindahan hanya terjadi lewat cabang di atas, yaitu ketika
    // pemegang giliran sudah memilih, atau lewat menu "Lewati giliran sekarang".
    if (durasiMs > 0 && now - mulai.getTime() > durasiMs) {
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
  const cAntre = kolomWajib(t, 'NoAntrean');
  const cWaktuPilih = kolomWajib(t, 'WaktuPilih');
  const cTerlewat = kolomWajib(t, 'Terlewat');

  // Ada siswa lunas ber-TglLunas yang belum punya nomor antrean.
  // Syarat TglLunas penting: tanpa itu, siswa lunas yang tanggalnya belum
  // diisi bendahara akan membuat pemeriksaan ini selalu bernilai benar,
  // sehingga setiap polling ikut merebut kunci tanpa ada yang bisa dikerjakan.
  const cTgl = kolomWajib(t, 'TglLunas');
  for (let i = 0; i < t.baris.length; i++) {
    if (kosong(t.baris[i][cTgl])) continue;
    if (siswaLunas(t, t.baris[i]) && angka(t.baris[i][cAntre]) <= 0) return true;
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
  // Tanpa batas waktu, tidak ada lagi yang perlu digerakkan.
  const durasiMs = angka(pengaturan('durasi_giliran_menit')) * 60000;
  if (durasiMs <= 0) return false;

  const nilaiMulai = pengaturan('antrean_mulai');
  const mulai = nilaiMulai instanceof Date ? nilaiMulai : new Date(nilaiMulai);
  if (isNaN(mulai.getTime())) return true;
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

  // Pemilihan tertutup. Siswa yang sudah punya kursi tetap boleh masuk untuk
  // melihat kursinya dan denah akhir; sisanya melihat pesan pengumuman.
  if (!benar(pengaturan('pemilihan_aktif'))) {
    if (kosong(siswa.data[kolomWajib(t, 'Kursi')])) {
      return {
        status: 'error',
        kode: 'BELUM_DIBUKA',
        message: String(pengaturan('pesan_belum_dibuka'))
      };
    }
    const brs = siswa.data;
    return {
      status: 'success',
      siswa: {
        nama: String(brs[kolomWajib(t, 'Nama')]),
        gender: String(brs[kolomWajib(t, 'Gender')]).trim().toUpperCase(),
        lunas: siswaLunas(t, brs),
        noAntrean: angka(brs[kolomWajib(t, 'NoAntrean')]) || null,
        dapatPrivilege: true,
        busTerpilih: angka(brs[kolomWajib(t, 'Bus')]),
        kursiTerpilih: angka(brs[kolomWajib(t, 'Kursi')])
      },
      antrean: {
        fase: 'selesai', sekarang: 0, namaSekarang: '', lebarJendela: 1,
        giliranSaya: false, pakaiTimer: false, detikTersisa: null,
        kuota: angka(pengaturan('kuota_pilih_mandiri')), terpakai: 0
      },
      bus: bangunDenah(t)
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

    // Sisa waktu hanya berarti bila batas waktu giliran memang dipakai.
    // Dengan durasi_giliran_menit = 0, nilainya null dan halaman web tidak
    // menampilkan penghitung mundur sama sekali.
    let detikTersisa = null;
    if (q.pakaiTimer && q.mulai && q.fase === 'antrean') {
      detikTersisa = Math.max(0, Math.round((q.mulai.getTime() + q.durasiMs - Date.now()) / 1000));
    }

    // Nama pemegang giliran saat ini, untuk ditampilkan di layar tunggu.
    let namaSekarang = '';
    if (q.sekarang > 0) {
      const cAntreKol = kolomWajib(t, 'NoAntrean');
      const cNamaKol = kolomWajib(t, 'Nama');
      for (let i = 0; i < t.baris.length; i++) {
        if (angka(t.baris[i][cAntreKol]) === q.sekarang) {
          namaSekarang = namaPendek(t.baris[i][cNamaKol]);
          break;
        }
      }
    }

    return {
      status: 'success',
      siswa: {
        nama: String(baris[kolomWajib(t, 'Nama')]),
        gender: String(baris[kolomWajib(t, 'Gender')]).trim().toUpperCase(),
        lunas: siswaLunas(t, baris),
        noAntrean: noAntrean || null,
        dapatPrivilege: dapatPrivilege || sudahPilih,
        busTerpilih: sudahPilih ? angka(baris[kolomWajib(t, 'Bus')]) : null,
        kursiTerpilih: sudahPilih ? angka(baris[kolomWajib(t, 'Kursi')]) : null
      },
      antrean: {
        fase: q.fase,
        sekarang: q.sekarang,
        namaSekarang,
        lebarJendela: lebar,
        giliranSaya,
        pakaiTimer: q.pakaiTimer,
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

    if (!siswaLunas(t, baris)) {
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
  const ss = bukaSpreadsheet();
  const sh = ss.getSheetByName(TAB_ANGKET) || ss.insertSheet(TAB_ANGKET);

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
 * Memastikan pemicu waktu terpasang, tepat satu buah. Dipanggil otomatis dari
 * siapkanTab() sehingga tidak perlu diurus sendiri.
 *
 * Pemicunya sengaja dibiarkan terpasang terus. Fungsi yang dijalankannya
 * berhenti seketika bila pemilihan_aktif bernilai FALSE, jadi satu-satunya
 * saklar yang perlu Anda sentuh tetap sel TRUE/FALSE itu.
 */
function pastikanPemicu() {
  const adaSekarang = ScriptApp.getProjectTriggers()
    .filter(tr => tr.getHandlerFunction() === 'pemicuMajukanAntrean');

  // Sisakan tepat satu; pemasangan berulang bisa meninggalkan duplikat.
  adaSekarang.slice(1).forEach(tr => ScriptApp.deleteTrigger(tr));
  if (adaSekarang.length) return false;

  ScriptApp.newTrigger('pemicuMajukanAntrean').timeBased().everyMinutes(5).create();
  return true;
}

/**
 * Dipanggil pemicu waktu tiap 5 menit supaya antrean tetap berjalan walau
 * tidak ada siswa yang sedang membuka halaman. Tidak melakukan apa-apa
 * selama pemilihan_aktif bernilai FALSE.
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
    .addItem('Periksa kesiapan spreadsheet', 'periksaKesiapan')
    .addItem('Periksa status satu siswa', 'periksaSiswa')
    .addItem('Siapkan tab yang belum ada', 'siapkanTab')
    .addItem('Terbitkan nomor antrean baru', 'menuHitungAntrean')
    .addItem('Lewati giliran sekarang', 'menuLewatiGiliran')
    .addItem('Susun ulang SEMUA nomor antrean', 'menuSusunUlangAntrean')
    .addSeparator()
    .addItem('Kosongkan SEMUA pilihan kursi', 'menuResetKursi')
    .addToUi();
}

function siapkanTab() {
  const ss = bukaSpreadsheet();
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
    // Kolom hanya ditambahkan bila belum ada padanannya. Judul kolom yang
    // sudah dipakai tidak pernah diubah atau ditimpa.
    const t = bacaTabel(nama);
    const kurang = header.filter(h => !(h in t.kolom));
    if (kurang.length) {
      sh.getRange(1, sh.getLastColumn() + 1, 1, kurang.length).setValues([kurang]);
      catatan.push('Tab "' + nama + '": kolom ' + kurang.join(', ') + ' ditambahkan.');
    }
    return sh;
  };

  // PIN sengaja tidak dibuat: bila tidak ada, PIN diambil dari empat digit
  // terakhir kolom nomor HP, sama seperti skrip lama.
  pastikan(TAB_SISWA, [
    'Gender', 'TglLunas', 'NoAntrean', 'Bus', 'Kursi', 'WaktuPilih',
    'Terlewat', 'UkuranJaket', 'WaktuJaket'
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

  // Pemicu dipasang di sini supaya tidak ada langkah terpisah yang harus
  // diingat. Setelah ini, satu-satunya saklar adalah pemilihan_aktif.
  try {
    if (pastikanPemicu()) catatan.push('Pemicu antrean dipasang (tiap 5 menit).');
    else catatan.push('Pemicu antrean sudah terpasang.');
  } catch (err) {
    catatan.push('Pemicu antrean GAGAL dipasang: ' + err.message);
  }

  catatan.push('');
  catatan.push('Selesai. Untuk membuka atau menutup pemilihan, cukup ubah');
  catatan.push('pemilihan_aktif di tab Pengaturan menjadi TRUE atau FALSE.');

  SpreadsheetApp.getUi().alert(catatan.join('\n'));
}

/**
 * Melaporkan apa saja yang masih kurang sebelum fitur dinyalakan.
 * Hanya membaca, tidak mengubah apa pun.
 */
function periksaKesiapan() {
  _cachePengaturan = null;
  const baris = [];

  let t;
  try {
    t = bacaTabel(TAB_SISWA);
  } catch (err) {
    SpreadsheetApp.getUi().alert('Tab siswa belum bisa dibaca:\n\n' + err.message);
    return;
  }

  baris.push('Tab siswa: "' + TAB_SISWA + '" (' + t.baris.length + ' baris data)');
  baris.push('');
  baris.push('KOLOM TERDETEKSI');
  const wajib = ['NIS', 'Nama', 'TotalBayar'];
  const perluKursi = ['Gender', 'TglLunas', 'NoAntrean', 'Bus', 'Kursi', 'WaktuPilih', 'Terlewat'];
  const hurufKolom = i => {
    let s = '', n = i + 1;
    while (n > 0) { const sisa = (n - 1) % 26; s = String.fromCharCode(65 + sisa) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };

  const laporkan = nama => {
    const idx = kolomOpsional(t, nama);
    baris.push('  ' + (idx === -1 ? '[BELUM ADA] ' : '[kolom ' + hurufKolom(idx) + '] ') + nama
      + (idx === -1 ? '' : ' -> judul: "' + t.header[idx] + '"'));
    return idx;
  };

  wajib.forEach(laporkan);
  const adaPin = kolomOpsional(t, 'PIN') !== -1;
  const adaHp = kolomOpsional(t, 'NoHP') !== -1;
  laporkan(adaPin ? 'PIN' : 'NoHP');
  baris.push('  Sumber PIN: ' + (adaPin ? 'kolom PIN' : (adaHp ? '4 digit terakhir nomor HP' : 'TIDAK ADA — fitur tidak akan jalan')));
  baris.push('  Sumber status lunas: ' + (kolomOpsional(t, 'Lunas') !== -1
    ? 'kolom Lunas' : 'dihitung dari TotalBayar >= ' + angka(pengaturan('total_biaya'))));
  baris.push('');
  baris.push('KOLOM UNTUK FITUR KURSI');
  const kurang = perluKursi.filter(n => laporkan(n) === -1);

  baris.push('');
  if (kurang.length) {
    baris.push('Jalankan "Siapkan tab yang belum ada" untuk menambahkan: ' + kurang.join(', '));
  }

  // TglLunas diisi bendahara dan tidak pernah dikarang skrip. Siswa lunas yang
  // tanggalnya kosong tidak masuk antrean sama sekali.
  const cTgl = kolomOpsional(t, 'TglLunas');
  if (cTgl !== -1) {
    let lunasTanpaTgl = 0;
    let siapAntre = 0;
    const tglTakTerbaca = [];
    t.baris.forEach((b, i) => {
      let l = false;
      try { l = siswaLunas(t, b); } catch (err) { l = false; }
      if (!l) return;
      if (kosong(b[cTgl])) { lunasTanpaTgl += 1; return; }
      const tgl = b[cTgl] instanceof Date ? b[cTgl].getTime() : new Date(b[cTgl]).getTime();
      if (isNaN(tgl)) { tglTakTerbaca.push('baris ' + (i + 2)); return; }
      siapAntre += 1;
    });

    baris.push('ANTREAN');
    baris.push('  Siswa siap masuk antrean: ' + siapAntre);
    if (lunasTanpaTgl) {
      baris.push('  BELUM BISA IKUT: ' + lunasTanpaTgl + ' siswa sudah lunas tetapi TglLunas kosong.');
      baris.push('  Mereka tidak akan mendapat nomor antrean sampai bendahara mengisi');
      baris.push('  tanggalnya. Skrip sengaja tidak mengarang tanggal sendiri.');
    }
    if (tglTakTerbaca.length) {
      baris.push('  TANGGAL TIDAK TERBACA di ' + tglTakTerbaca.slice(0, 8).join(', ')
        + (tglTakTerbaca.length > 8 ? ', dan ' + (tglTakTerbaca.length - 8) + ' lainnya' : ''));
      baris.push('  Pastikan selnya berformat tanggal, bukan teks bebas.');
    }
  }

  const lebar = angka(pengaturan('lebar_jendela'));
  if (lebar !== 1) {
    baris.push('');
    baris.push('PERHATIAN: lebar_jendela = ' + lebar + ', artinya ' + lebar + ' nomor antrean');
    baris.push('bisa memilih bersamaan. Untuk giliran ketat satu per satu, isi 1.');
  }

  ['KonfigKursi', 'Pengaturan'].forEach(nama => {
    if (!bukaSpreadsheet().getSheetByName(nama)) baris.push('Tab "' + nama + '" belum ada.');
  });

  baris.push('');
  baris.push('SAKLAR');
  baris.push('  pemilihan_aktif = ' + String(pengaturan('pemilihan_aktif')).toUpperCase()
    + (benar(pengaturan('pemilihan_aktif')) ? '  (pemilihan TERBUKA)' : '  (pemilihan tertutup)'));
  try {
    const jumlahPemicu = ScriptApp.getProjectTriggers()
      .filter(tr => tr.getHandlerFunction() === 'pemicuMajukanAntrean').length;
    baris.push('  Pemicu antrean: ' + (jumlahPemicu
      ? 'terpasang, jalan tiap 5 menit'
      : 'BELUM ADA — jalankan "Siapkan tab yang belum ada"'));
  } catch (err) {
    baris.push('  Pemicu antrean: tidak bisa diperiksa (' + err.message + ')');
  }

  SpreadsheetApp.getUi().alert(baris.join('\n'));
}

/**
 * Menjawab pertanyaan "kenapa siswa ini tidak bisa memilih?" untuk satu NIS.
 * Hanya membaca. Menampilkan keadaan siswa, keadaan antrean, dan kesimpulan
 * layar mana yang akan dilihatnya beserta alasannya.
 */
function periksaSiswa() {
  const ui = SpreadsheetApp.getUi();
  const tanya = ui.prompt('Periksa status siswa', 'Masukkan NIS:', ui.ButtonSet.OK_CANCEL);
  if (tanya.getSelectedButton() !== ui.Button.OK) return;
  const nis = tanya.getResponseText().trim();
  if (!nis) return;

  _cachePengaturan = null;
  const t = bacaTabel(TAB_SISWA);
  const cNIS = kolomWajib(t, 'NIS');

  let idx = -1;
  for (let i = 0; i < t.baris.length; i++) {
    if (samaNis(t.baris[i][cNIS], nis)) { idx = i; break; }
  }
  if (idx === -1) { ui.alert('NIS ' + nis + ' tidak ditemukan di tab ' + TAB_SISWA + '.'); return; }

  const b = t.baris[idx];
  const q = keadaanAntrean(t);
  const lebar = Math.max(1, angka(pengaturan('lebar_jendela')));
  const noAntrean = angka(b[kolomWajib(t, 'NoAntrean')]);
  const terlewat = benar(b[kolomWajib(t, 'Terlewat')]);
  const sudahPilih = !kosong(b[kolomWajib(t, 'Kursi')]);
  const lunas = siswaLunas(t, b);
  const tglLunas = b[kolomWajib(t, 'TglLunas')];

  const L = [];
  L.push('SISWA  (baris ' + (idx + 2) + ')');
  L.push('  Nama       : ' + b[kolomWajib(t, 'Nama')]);
  L.push('  PIN dipakai: ' + pinSiswa(t, b));
  L.push('  Lunas      : ' + (lunas ? 'YA' : 'BELUM') + '  (bayar ' + angka(b[kolomWajib(t, 'TotalBayar')]) + ')');
  L.push('  TglLunas   : ' + (kosong(tglLunas) ? '(KOSONG)' : tglLunas));
  L.push('  NoAntrean  : ' + (noAntrean || '(BELUM ADA)'));
  L.push('  Terlewat   : ' + (terlewat ? 'YA' : 'tidak'));
  L.push('  Kursi      : ' + (sudahPilih
    ? 'Bus ' + angka(b[kolomWajib(t, 'Bus')]) + ' kursi ' + angka(b[kolomWajib(t, 'Kursi')])
    : '(belum memilih)'));
  L.push('');
  L.push('ANTREAN');
  L.push('  pemilihan_aktif : ' + String(pengaturan('pemilihan_aktif')).toUpperCase());
  L.push('  fase            : ' + q.fase);
  L.push('  antrean_sekarang: ' + q.sekarang);
  L.push('  antrean_mulai   : ' + (q.mulai ? q.mulai : '(kosong)'));
  L.push('  kuota terpakai  : ' + q.terpakai + ' dari ' + q.kuota);
  L.push('');
  L.push('KESIMPULAN');

  if (!benar(pengaturan('pemilihan_aktif'))) {
    L.push('  Melihat pesan "belum dibuka" karena pemilihan_aktif = FALSE.');
  } else if (sudahPilih) {
    L.push('  Melihat kursinya sendiri. Sudah selesai memilih.');
  } else if (!lunas) {
    L.push('  Melihat "Belum Lunas". Isi pembayarannya dulu.');
  } else if (kosong(tglLunas)) {
    L.push('  Melihat "Penempatan Diatur Panitia".');
    L.push('  SEBAB: TglLunas kosong, jadi tidak pernah masuk antrean.');
    L.push('  PERBAIKAN: isi TglLunas, lalu jalankan "Susun ulang SEMUA nomor antrean".');
  } else if (!noAntrean) {
    L.push('  Melihat "Penempatan Diatur Panitia".');
    L.push('  SEBAB: TglLunas terisi tetapi nomor antrean belum terbit.');
    L.push('  PERBAIKAN: jalankan "Terbitkan nomor antrean baru".');
  } else if (terlewat) {
    L.push('  Melihat "Penempatan Diatur Panitia".');
    L.push('  SEBAB: Terlewat = TRUE, jendela gilirannya pernah habis.');
    L.push('  PERBAIKAN uji coba: "Kosongkan SEMUA pilihan kursi".');
    L.push('  PERBAIKAN satuan: kosongkan sel Terlewat siswa ini.');
  } else if (q.terpakai >= q.kuota || q.fase === 'selesai') {
    L.push('  Melihat "Penempatan Diatur Panitia".');
    L.push('  SEBAB: kuota habis (' + q.terpakai + '/' + q.kuota + ') atau fase = selesai.');
    L.push('  PERBAIKAN: bila ini sisa uji coba, jalankan "Kosongkan SEMUA pilihan kursi".');
  } else if (noAntrean >= q.sekarang && noAntrean < q.sekarang + lebar) {
    L.push('  SEKARANG GILIRANNYA. Bisa memilih kursi.');
  } else if (noAntrean < q.sekarang) {
    L.push('  Melihat layar tunggu, tetapi nomornya sudah terlewati antrean.');
    L.push('  SEBAB: antrean_sekarang (' + q.sekarang + ') sudah melewati nomornya (' + noAntrean + ').');
  } else {
    L.push('  Menunggu giliran. Masih ada ' + (noAntrean - q.sekarang) + ' orang di depannya.');
  }

  ui.alert(L.join('\n'));
}

function menuHitungAntrean() {
  _cachePengaturan = null;
  const t = bacaTabel(TAB_SISWA);
  const ada = terbitkanNomorAntrean(t);
  SpreadsheetApp.getUi().alert(ada
    ? 'Nomor antrean baru sudah diterbitkan, melanjutkan dari nomor terakhir.'
    : 'Tidak ada siswa lunas ber-TglLunas yang belum punya nomor antrean.');
}

/**
 * Melewati pemegang giliran saat ini secara manual.
 *
 * Ini pengganti batas waktu otomatis. Tanpa timer, satu siswa yang tidak
 * kunjung membuka halaman — sakit, ganti nomor, atau batal ikut — akan
 * menahan seluruh antrean di belakangnya tanpa batas. Menu ini yang
 * membukanya kembali.
 */
function menuLewatiGiliran() {
  const ui = SpreadsheetApp.getUi();
  _cachePengaturan = null;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) { ui.alert('Server sedang sibuk, coba lagi sebentar.'); return; }

  try {
    const t = bacaTabel(TAB_SISWA);
    const q = keadaanAntrean(t);

    if (!q.sekarang) { ui.alert('Belum ada giliran yang sedang berjalan.'); return; }

    const cAntre = kolomWajib(t, 'NoAntrean');
    const cKursi = kolomWajib(t, 'Kursi');
    const cTerlewat = kolomWajib(t, 'Terlewat');
    const cNama = kolomWajib(t, 'Nama');

    let idx = -1;
    for (let i = 0; i < t.baris.length; i++) {
      if (angka(t.baris[i][cAntre]) === q.sekarang) { idx = i; break; }
    }
    if (idx === -1) { ui.alert('Siswa bernomor antrean ' + q.sekarang + ' tidak ditemukan.'); return; }

    if (!kosong(t.baris[idx][cKursi])) {
      ui.alert('Nomor ' + q.sekarang + ' sudah memilih kursi. Antrean akan berpindah sendiri.');
      return;
    }

    const nama = t.baris[idx][cNama];
    const jawab = ui.alert(
      'Lewati giliran nomor ' + q.sekarang + '?',
      nama + ' akan ditandai terlewat dan kehilangan hak memilih sendiri. ' +
      'Penempatannya menjadi tanggung jawab panitia. Giliran berpindah ke nomor berikutnya.',
      ui.ButtonSet.YES_NO
    );
    if (jawab !== ui.Button.YES) return;

    t.sheet.getRange(idx + 2, cTerlewat + 1).setValue('TRUE');
    t.baris[idx][cTerlewat] = 'TRUE';

    majukanAntrean(t);
    const baru = keadaanAntrean(t);
    ui.alert('Nomor ' + q.sekarang + ' (' + nama + ') dilewati.\n' +
      (baru.sekarang ? 'Sekarang giliran nomor ' + baru.sekarang + '.' : 'Antrean sudah selesai.'));
  } finally {
    lock.releaseLock();
  }
}

/**
 * Menghapus semua nomor antrean lalu menerbitkannya ulang murni menurut
 * TglLunas. Dipakai sekali sebelum pemilihan dibuka, setelah bendahara
 * selesai mengisi seluruh tanggal pelunasan.
 *
 * Diperlukan karena penerbitan biasa bersifat menambah: siswa yang tanggalnya
 * baru diisi belakangan akan mendapat nomor di ekor antrean meski ia melunasi
 * lebih dulu. Menyusun ulang memperbaiki urutan itu.
 */
function menuSusunUlangAntrean() {
  const ui = SpreadsheetApp.getUi();
  _cachePengaturan = null;

  const t = bacaTabel(TAB_SISWA);
  const cAntre = kolomWajib(t, 'NoAntrean');
  const cKursi = kolomWajib(t, 'Kursi');

  const sudahAdaYangMemilih = t.baris.some(b => !kosong(b[cKursi]));
  const peringatan = sudahAdaYangMemilih
    ? '\n\nPERHATIAN: sudah ada siswa yang memilih kursi. Menyusun ulang di ' +
      'tengah pemilihan akan mengubah nomor antrean orang lain dan mengacaukan ' +
      'giliran yang sedang berjalan. Sebaiknya JANGAN dilanjutkan.'
    : '';

  const jawab = ui.alert(
    'Susun ulang semua nomor antrean?',
    'Seluruh NoAntrean dihapus lalu diterbitkan ulang murni menurut TglLunas. ' +
    'Jalankan ini sekali saja, setelah bendahara selesai mengisi semua tanggal ' +
    'dan sebelum pemilihan dibuka.' + peringatan,
    ui.ButtonSet.YES_NO
  );
  if (jawab !== ui.Button.YES) return;

  if (t.baris.length) t.sheet.getRange(2, cAntre + 1, t.baris.length, 1).clearContent();
  t.baris.forEach(b => { b[cAntre] = ''; });

  terbitkanNomorAntrean(t);
  setPengaturan('antrean_sekarang', 0);
  setPengaturan('antrean_mulai', '');
  setPengaturan('fase', 'antrean');

  const jumlah = t.baris.filter(b => angka(b[cAntre]) > 0).length;
  ui.alert(jumlah + ' siswa mendapat nomor antrean, urut menurut TglLunas.');
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
