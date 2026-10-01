/* Harness pengujian Code.gs di Node dengan tiruan API Apps Script. */
const fs = require('fs');
const vm = require('vm');

let JAM = new Date('2026-09-01T08:00:00+07:00').getTime();
const majuMenit = m => { JAM += m * 60000; };

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) row.push(this.sheet.cell(this.r + i, this.c + j));
      out.push(row);
    }
    return out;
  }
  setValue(v) { this.sheet.set(this.r, this.c, v); return this; }
  setValues(vals) {
    vals.forEach((row, i) => row.forEach((v, j) => this.sheet.set(this.r + i, this.c + j, v)));
    return this;
  }
  clearContent() {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.set(this.r + i, this.c + j, '');
    return this;
  }
}

class Sheet {
  constructor(name, data) { this.name = name; this.data = data; }
  lebar() { return Math.max(...this.data.map(r => r.length), 0); }
  cell(r, c) { const row = this.data[r - 1] || []; const v = row[c - 1]; return v === undefined ? '' : v; }
  set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v;
  }
  getDataRange() { return new Range(this, 1, 1, this.data.length, this.lebar()); }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc); }
  appendRow(row) { this.data.push(row.slice()); }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.lebar(); }
  setFrozenRows() {}
}

// Meniru struktur sheet asli: tab "DataSiswa", judul kolom apa adanya,
// tanpa kolom PIN (diambil dari No HP) dan tanpa kolom Lunas
// (dihitung dari Total Bayar).
const HEADER_SISWA = ['NIS', 'Nama Siswa', 'Kelas', 'Total Bayar', 'Ukuran Jaket', 'No HP',
  'Gender', 'TglLunas', 'NoAntrean', 'Bus', 'Kursi', 'WaktuPilih', 'Terlewat', 'WaktuJaket',
  'Kamar', 'Pendamping'];

function buatSpreadsheet(jumlahSiswa) {
  const siswa = [HEADER_SISWA.slice()];
  for (let i = 1; i <= jumlahSiswa; i++) {
    const lunas = i <= 60;
    siswa.push([
      10000 + i, 'Siswa ' + i, 'XA',
      lunas ? 2450000 : 1000000,
      '',
      '08123456' + String(1000 + i),          // PIN = empat digit terakhir
      i % 2 === 0 ? 'P' : 'L',
      lunas ? new Date('2026-08-01T00:00:00Z').getTime() + i * 3600000 : '',
      '', '', '', '', '', '', '', ''
    ]);
  }
  const konfig = [['Bus', 'Kursi', 'Tipe', 'Label'],
    [1, 1, 'GURU', 'Pak Fikar'], [1, 2, 'GURU', 'Ms Eka'],
    [1, 3, 'P', ''], [1, 4, 'P', ''], [1, 5, 'L', ''], [1, 6, 'L', ''],
    [1, 40, 'PANITIA', ''], [1, 45, 'BLOK', 'rusak'],
    [2, 1, 'GURU', 'Bu Sri'], [3, 1, 'GURU', 'Pak Doni']];
  const set = [['Kunci', 'Nilai'],
    ['total_biaya', 2450000], ['syarat_jaket_persen', 70],
    ['link_grup_wa', 'https://chat.whatsapp.com/CONTOH'],
    ['pemilihan_aktif', 'TRUE'], ['kuota_pilih_mandiri', 50],
    ['durasi_giliran_menit', 15], ['lebar_jendela', 1], // skenario 11 mengubahnya jadi 0
    ['antrean_sekarang', 0], ['antrean_mulai', ''], ['fase', 'antrean'],
    ['pesan_belum_dibuka', 'Belum dibuka.']];
  // Tata letak sama seperti catatan panitia: kolom A pendamping (hanya di
  // baris pertama blok), kolom B dst nama murid.
  const pend = [['Pendamping','Murid 1','Murid 2','Murid 3','Murid 4'],
    ['Pak Adi', 'Siswa 1', 'Siswa 2', 'Siswa 3', 'Siswa 4'],
    ['',        'Siswa 5', 'Siswa 6', 'Siswa 7', 'Siswa 8'],
    ['Bu Rina', 'Siswa 9', 'Siswa 10', 'Siswa 11', 'Siswa 12'],
    ['',        'Siswa 13', 'Siswa 14', 'Siswa 15', 'Siswa 16']];
  return {
    DataSiswa: new Sheet('DataSiswa', siswa),
    Kelompok: new Sheet('Kelompok', pend),
    KonfigKursi: new Sheet('KonfigKursi', konfig),
    Pengaturan: new Sheet('Pengaturan', set)
  };
}

let sandboxTerakhir = null;

function jalankan(sheets) {
  const sandbox = {
    console,
    Date: class extends Date {
      constructor(...a) { if (a.length === 0) super(JAM); else super(...a); }
      static now() { return JAM; }
    },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => (sheets[n] = new Sheet(n, []))
      }),
      getActiveSpreadsheet: () => ({
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => (sheets[n] = new Sheet(n, []))
      }),
      getUi: () => ({ alert: m => { sandbox.LAPORAN = m; }, prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => '' }), Button: { YES: 'YES', OK: 'OK' }, ButtonSet: { YES_NO: 1, OK_CANCEL: 2 }, createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } })
    },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
    Utilities: { formatDate: () => '12 September 2026, 09:30' },
    HtmlService: { createHtmlOutput: h => ({ _h: h, setWidth() { return this; }, setHeight() { return this; } }) }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'Code.gs'), 'utf8'), sandbox);
  sandboxTerakhir = sandbox;
  return (payload) => JSON.parse(
    sandbox.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent()
  );
}

/* ------------------------------- SKENARIO ------------------------------- */
const sheets = buatSpreadsheet(80);
const post = jalankan(sheets);
const nis = i => String(10000 + i);
const pin = i => String(1000 + i); // 4 digit terakhir No HP
const ok = (label, syarat) => console.log((syarat ? '  OK  ' : ' GAGAL') + ' | ' + label);

console.log('=== 1. Verifikasi & jaket ===');
let r = post({ action: 'check_payment', nis: nis(1), pin: pin(1) });
ok('siswa lunas boleh klaim jaket', r.eligible === true && r.nama === 'Siswa 1');
r = post({ action: 'check_payment', nis: nis(1), pin: '9999' });
ok('PIN salah ditolak', r.status === 'error');
r = post({ action: 'check_payment', nis: nis(70), pin: pin(70) });
ok('belum 70% ditolak dengan pesan', r.eligible === false && /baru 40%/.test(r.message));
r = post({ action: 'save_jacket', nis: nis(1), pin: pin(1), ukuran: 'XXXL' });
ok('simpan XXXL + kirim link grup', r.status === 'success' && /chat.whatsapp/.test(r.groupLink));
r = post({ action: 'save_jacket', nis: nis(1), pin: '0000', ukuran: 'M' });
ok('save_jacket menolak PIN salah', r.status === 'error');

console.log('\n=== 1b. Tautan grup WhatsApp ===');
r = post({ action: 'get_group_link', nis: nis(1), pin: pin(1) });
ok('siswa terdaftar menerima tautan grup',
  r.status === 'success' && r.groupLink === 'https://chat.whatsapp.com/CONTOH');
ok('nama dikembalikan untuk sapaan', r.nama === 'Siswa 1.');
r = post({ action: 'get_group_link', nis: nis(1), pin: '9999' });
ok('PIN salah tidak menerima tautan', r.status === 'error' && !r.groupLink);
r = post({ action: 'get_group_link', nis: '99999', pin: '1234' });
ok('NIS tak terdaftar tidak menerima tautan', r.status === 'error' && !r.groupLink);
// Syaratnya hanya terdaftar, bukan lunas: siswa 70 baru bayar 40%.
r = post({ action: 'get_group_link', nis: nis(70), pin: pin(70) });
ok('siswa belum lunas tetap boleh masuk grup', r.status === 'success' && !!r.groupLink);

console.log('\n=== 2. Antrean & giliran ===');
r = post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
ok('nomor antrean terbit otomatis', r.siswa.noAntrean === 1);
ok('giliran nomor 1 langsung aktif', r.antrean.giliranSaya === true);
ok('sisa waktu ~15 menit', r.antrean.detikTersisa > 890 && r.antrean.detikTersisa <= 900);
ok('denah berisi 3 bus', r.bus.length === 3);
ok('kursi guru terbaca', r.bus[0].kursi['1'].tipe === 'GURU' && r.bus[0].kursi['1'].label === 'Pak Fikar');

r = post({ action: 'get_seat_state', nis: nis(2), pin: pin(2) });
ok('nomor 2 belum gilirannya', r.siswa.noAntrean === 2 && r.antrean.giliranSaya === false);

console.log('\n=== 2b. Giliran ketat: hanya satu nomor yang terbuka ===');
{
  const terbuka = [];
  for (let i = 1; i <= 8; i++) {
    const s = post({ action: 'get_seat_state', nis: nis(i), pin: pin(i) });
    if (s.antrean.giliranSaya) terbuka.push(i);
  }
  ok('tepat satu nomor boleh memilih', terbuka.length === 1 && terbuka[0] === 1, terbuka.join(','));
  const ditolak = [2, 3, 4, 5].every(i =>
    post({ action: 'claim_seat', nis: nis(i), pin: pin(i), bus: 3, kursi: 10 + i }).kode === 'BUKAN_GILIRAN');
  ok('nomor 2-5 ditolak selama nomor 1 masih aktif', ditolak);
  ok('tidak ada kursi bocor terkunci',
    post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) }).antrean.terpakai === 0);

  // Yang menunggu harus tahu sedang giliran siapa, lengkap dengan sisa waktunya.
  const penunggu = post({ action: 'get_seat_state', nis: nis(5), pin: pin(5) });
  ok('penunggu melihat nomor giliran sekarang', penunggu.antrean.sekarang === 1);
  ok('penunggu melihat nama pemegang giliran', penunggu.antrean.namaSekarang === 'Siswa 1.');
  ok('penunggu melihat sisa waktu pemegang giliran',
    penunggu.antrean.detikTersisa > 0 && penunggu.antrean.giliranSaya === false);
}

console.log('\n=== 2c. TglLunas hanya dari bendahara ===');
{
  // Siswa 65 lunas tetapi TglLunas dikosongkan -> tidak boleh masuk antrean.
  const kTotal = HEADER_SISWA.indexOf('Total Bayar') + 1;
  const kTgl = HEADER_SISWA.indexOf('TglLunas') + 1;
  sheets.DataSiswa.set(66, kTotal, 2450000);
  sheets.DataSiswa.set(66, kTgl, '');
  const s = post({ action: 'get_seat_state', nis: nis(65), pin: pin(65) });
  ok('lunas tanpa TglLunas tidak dapat nomor antrean', s.siswa.lunas === true && s.siswa.noAntrean === null);
  ok('skrip tidak mengarang TglLunas', String(sheets.DataSiswa.cell(66, kTgl)).trim() === '');
  // Setelah bendahara mengisi, barulah dapat nomor.
  sheets.DataSiswa.set(66, kTgl, new Date('2026-08-20T00:00:00Z').getTime());
  const s2 = post({ action: 'get_seat_state', nis: nis(65), pin: pin(65) });
  ok('setelah diisi bendahara langsung dapat nomor', s2.siswa.noAntrean > 0);
}

console.log('\n=== 3. Mengunci kursi ===');
r = post({ action: 'claim_seat', nis: nis(2), pin: pin(2), bus: 1, kursi: 9 });
ok('bukan giliran ditolak', r.kode === 'BUKAN_GILIRAN');
r = post({ action: 'claim_seat', nis: nis(1), pin: pin(1), bus: 1, kursi: 3 });
ok('siswa putra ditolak di zona putri', r.kode === 'GENDER_TIDAK_COCOK');
r = post({ action: 'claim_seat', nis: nis(1), pin: pin(1), bus: 1, kursi: 1 });
ok('kursi guru ditolak', r.kode === 'KURSI_GURU');
r = post({ action: 'claim_seat', nis: nis(1), pin: pin(1), bus: 1, kursi: 40 });
ok('kursi panitia ditolak', r.kode === 'KURSI_GURU');
r = post({ action: 'claim_seat', nis: nis(1), pin: pin(1), bus: 1, kursi: 5 });
ok('siswa putra diterima di zona putra', r.status === 'success' && r.bus === 1 && r.kursi === 5);
r = post({ action: 'claim_seat', nis: nis(1), pin: pin(1), bus: 2, kursi: 10 });
ok('tidak bisa memilih dua kali', r.kode === 'SUDAH_MEMILIH');

console.log('\n=== 4. Giliran berpindah otomatis ===');
r = post({ action: 'get_seat_state', nis: nis(2), pin: pin(2) });
ok('giliran pindah ke nomor 2 tanpa menunggu', r.antrean.giliranSaya === true && r.antrean.sekarang === 2);
ok('jendela nomor 2 penuh lagi', r.antrean.detikTersisa > 890);
r = post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
ok('nomor 1 melihat kursinya', r.siswa.busTerpilih === 1 && r.siswa.kursiTerpilih === 5);
ok('nama tampil singkat di denah', r.bus[0].kursi['5'].oleh === 'Siswa 1.');

console.log('\n=== 5. Rebutan kursi yang sama ===');
r = post({ action: 'claim_seat', nis: nis(2), pin: pin(2), bus: 1, kursi: 12 });
ok('nomor 2 dapat kursi 12', r.status === 'success');
post({ action: 'get_seat_state', nis: nis(3), pin: pin(3) });
r = post({ action: 'claim_seat', nis: nis(3), pin: pin(3), bus: 1, kursi: 12 });
ok('nomor 3 ditolak, kursi sudah terisi', r.kode === 'KURSI_TERISI');

console.log('\n=== 6. Giliran habis waktu ===');
majuMenit(16);
r = post({ action: 'get_seat_state', nis: nis(4), pin: pin(4) });
ok('nomor 3 terlewat, giliran ke nomor 4', r.antrean.sekarang === 4 && r.antrean.giliranSaya === true);
r = post({ action: 'get_seat_state', nis: nis(3), pin: pin(3) });
ok('nomor 3 kehilangan hak pilih', r.siswa.dapatPrivilege === false);

console.log('\n=== 7. Mengejar banyak jendela sekaligus ===');
const sebelum = post({ action: 'get_seat_state', nis: nis(4), pin: pin(4) }).antrean.sekarang;
majuMenit(90);
r = post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
const lompat = r.antrean.sekarang - sebelum;
// 90 menit menumpuk di atas sisa jendela berjalan; enam jendela 15 menit terlewat.
ok('antrean melompat enam nomor sekaligus', lompat === 6, lompat);
const pemegang = post({ action: 'get_seat_state', nis: nis(r.antrean.sekarang), pin: pin(r.antrean.sekarang) });
ok('pemegang giliran baru punya jendela yang masih hidup',
  pemegang.antrean.giliranSaya === true && pemegang.antrean.detikTersisa > 0);
const terlewatSemua = [4, 5, 6, 7, 8, 9].every(n =>
  post({ action: 'get_seat_state', nis: nis(n), pin: pin(n) }).siswa.dapatPrivilege === false);
ok('semua nomor yang dilompati ditandai terlewat', terlewatSemua);
console.log('       antrean_sekarang =', r.antrean.sekarang, '| sisa detik pemegang =', pemegang.antrean.detikTersisa);

console.log('\n=== 8. Kuota habis ===');
// Kolam kursi bebas di bus 2 dan 3 (kursi 1 = guru, sisanya tanpa zona gender).
const kolam = [];
for (let b = 2; b <= 3; b++) for (let k = 2; k <= 50; k++) kolam.push({ bus: b, kursi: k });
let jaga = 0;
let st = post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
while (st.antrean.terpakai < 50 && jaga++ < 300) {
  const n = st.antrean.sekarang;
  if (!n) break;
  const s = post({ action: 'get_seat_state', nis: nis(n), pin: pin(n) });
  if (!s.antrean.giliranSaya) { majuMenit(16); st = post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) }); continue; }
  const kursi = kolam.shift();
  post({ action: 'claim_seat', nis: nis(n), pin: pin(n), bus: kursi.bus, kursi: kursi.kursi });
  st = post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
}
// Siswa 4 sudah lunas tapi gilirannya terlewat pada skenario 7, jadi dia
// belum punya kursi — kasus yang tepat untuk menguji penolakan kuota.
const akhir = post({ action: 'get_seat_state', nis: nis(4), pin: pin(4) });
ok('kuota berhenti di 50', akhir.antrean.terpakai === 50, akhir.antrean.terpakai);
ok('fase menjadi selesai', akhir.antrean.fase === 'selesai');
ok('siswa lunas tanpa kursi kehilangan hak pilih', akhir.siswa.dapatPrivilege === false);
ok('belum punya kursi', akhir.siswa.kursiTerpilih === null);
r = post({ action: 'claim_seat', nis: nis(4), pin: pin(4), bus: 3, kursi: 30 });
ok('claim setelah kuota habis ditolak', r.kode === 'KUOTA_HABIS', r.kode);
r = post({ action: 'claim_seat', nis: nis(61), pin: pin(61), bus: 3, kursi: 31 });
ok('siswa belum lunas ditolak lebih dulu', r.kode === 'BELUM_LUNAS');
console.log('       terpakai akhir =', akhir.antrean.terpakai, '| fase =', akhir.antrean.fase);

console.log('\n=== 9. Penempatan manual panitia ===');
const tS = sheets.DataSiswa;
const kBus = HEADER_SISWA.indexOf('Bus') + 1, kKursi = HEADER_SISWA.indexOf('Kursi') + 1;
tS.set(63, kBus, 3); tS.set(63, kKursi, 44);   // baris 63 = siswa 62
const manual = post({ action: 'get_seat_state', nis: nis(62), pin: pin(62) });
ok('penempatan manual tampil sebagai kursi siswa', manual.siswa.busTerpilih === 3 && manual.siswa.kursiTerpilih === 44);
ok('penempatan manual TIDAK memakan kuota', manual.antrean.terpakai === 50);

console.log('\n=== 10. Fitur dimatikan ===');
const tSet = sheets.Pengaturan;
tSet.data.find(r2 => r2[0] === 'pemilihan_aktif')[1] = 'FALSE';
r = post({ action: 'get_seat_state', nis: nis(4), pin: pin(4) });
ok('yang belum punya kursi melihat BELUM_DIBUKA',
  r.kode === 'BELUM_DIBUKA' && r.message === 'Belum dibuka.');
// Siswa 1 sudah mengunci kursi pada skenario 3; ia tetap boleh melihat denah.
r = post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
ok('yang sudah punya kursi tetap bisa melihat denah',
  r.status === 'success' && r.siswa.kursiTerpilih === 5 && r.bus.length === 3);
ok('mode lihat saja, bukan giliran siapa pun',
  r.antrean.giliranSaya === false && r.antrean.fase === 'selesai');

console.log('\n=== 10b. Cetak denah kursi ===');
{
  // Pakai lembar utama yang sudah terisi 50 kursi dari skenario 8.
  const sb = jalankan(sheets);
  void sb;
  const html = sandboxTerakhir.buatHtmlDenahCetak();
  // Simpan contohnya hanya bila diminta: SIMPAN_HTML=1 node uji-lokal.js
  if (process.env.SIMPAN_HTML) {
    require('fs').writeFileSync(require('path').join(__dirname, 'contoh-cetak.html'), html);
    console.log('       contoh disimpan: apps-script/contoh-cetak.html');
  }

  ok('menghasilkan halaman HTML utuh', /^<!DOCTYPE html>/.test(html) && /<\/html>$/.test(html));
  ok('memuat ketiga bus', (html.match(/<h2>Bus \d<\/h2>/g) || []).length === 3);
  ok('setiap bus punya 50 kotak kursi',
    (html.match(/class="k[ "]/g) || []).length === 150, (html.match(/class="k[ "]/g) || []).length);
  ok('tombol cetak disembunyikan saat mencetak', /@media print\{\.bar\{display:none\}/.test(html));
  ok('tiap bus dipisah jadi halaman sendiri', /page-break-after:always/.test(html));
  ok('memakai nama panjang, bukan singkatan', /Siswa 1</.test(html) && !/Siswa 1\.</.test(html));
  ok('kursi guru tampil beserta labelnya', /Pak Fikar/.test(html) && /Ms Eka/.test(html));
  ok('ada daftar nama untuk absensi', /<th>Kursi<\/th><th>Nama<\/th>/.test(html));

  // Nama yang mengandung karakter HTML tidak boleh merusak halaman.
  const kNama = HEADER_SISWA.indexOf('Nama Siswa') + 1;
  sheets.DataSiswa.set(2, kNama, 'Budi <script>x</script> & Co');
  const html2 = jalankan(sheets) && sandboxTerakhir.buatHtmlDenahCetak();
  ok('nama berisi karakter HTML di-escape',
    /Budi &lt;script&gt;x&lt;\/script&gt; &amp; Co/.test(html2) && !/<script>x<\/script>/.test(html2));
  sheets.DataSiswa.set(2, kNama, 'Siswa 1');
}

console.log('\n=== 11. Tanpa batas waktu (durasi_giliran_menit = 0) ===');
{
  // Lembar baru supaya bersih dari skenario sebelumnya.
  const s2 = buatSpreadsheet(20);
  s2.Pengaturan.data.find(x => x[0] === 'durasi_giliran_menit')[1] = 0;
  const post2 = jalankan(s2);

  let st = post2({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
  ok('server memberi tahu timer dimatikan', st.antrean.pakaiTimer === false);
  ok('sisa waktu dikirim null, bukan angka', st.antrean.detikTersisa === null);
  ok('nomor 1 langsung dapat giliran', st.antrean.giliranSaya === true);

  // Inti perubahannya: waktu berlalu jauh, giliran TIDAK boleh berpindah.
  majuMenit(600);
  st = post2({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
  ok('setelah 10 jam giliran tetap di nomor 1',
    st.antrean.sekarang === 1 && st.antrean.giliranSaya === true);
  const s3 = post2({ action: 'get_seat_state', nis: nis(3), pin: pin(3) });
  ok('nomor 3 masih terkunci, tidak kebagian gara-gara kedaluwarsa',
    s3.antrean.giliranSaya === false && s3.siswa.dapatPrivilege === true);
  ok('nomor 1 tidak ditandai terlewat',
    post2({ action: 'get_seat_state', nis: nis(1), pin: pin(1) }).siswa.dapatPrivilege === true);

  // Giliran berpindah hanya setelah pemegangnya benar-benar memilih.
  post2({ action: 'claim_seat', nis: nis(1), pin: pin(1), bus: 2, kursi: 10 });
  st = post2({ action: 'get_seat_state', nis: nis(2), pin: pin(2) });
  ok('setelah nomor 1 memilih, giliran pindah ke nomor 2',
    st.antrean.sekarang === 2 && st.antrean.giliranSaya === true);
  majuMenit(600);
  st = post2({ action: 'get_seat_state', nis: nis(2), pin: pin(2) });
  ok('nomor 2 pun tidak kedaluwarsa', st.antrean.giliranSaya === true);
}

console.log('\n=== 12. Impor kelompok manual ===');
{
  const s4 = buatSpreadsheet(30);
  s4.KonfigKursi.data = [['Bus','Kursi','Tipe','Label']];
  jalankan(s4);
  const sb = sandboxTerakhir;
  const kol = n => HEADER_SISWA.indexOf(n) + 1;
  const taruh = (siswa, bus, kursi, gender) => {
    s4.DataSiswa.set(siswa + 1, kol('Bus'), bus);
    s4.DataSiswa.set(siswa + 1, kol('Kursi'), kursi);
    s4.DataSiswa.set(siswa + 1, kol('Gender'), gender);
  };
  // Bus 2: kursi 1-12 putra, kursi 13-24 putri, 2 orang di baris belakang.
  for (let i = 1; i <= 12; i++) taruh(i, 2, i, 'L');
  for (let i = 13; i <= 24; i++) taruh(i, 2, i, 'P');
  taruh(25, 2, 45, 'L');
  taruh(26, 2, 46, 'L');

  sb.imporKelompok();
  const lap = sb.LAPORAN;
  const kamarDari = siswa => String(s4.DataSiswa.cell(siswa + 1, kol('Kamar'))).trim();
  const pendDari = siswa => String(s4.DataSiswa.cell(siswa + 1, kol('Pendamping'))).trim();

  ok('pendamping diambil apa adanya dari tab Kelompok',
    pendDari(1) === 'Pak Adi' && pendDari(9) === 'Bu Rina');
  ok('baris lanjutan tanpa nama di kolom A ikut blok di atasnya',
    pendDari(5) === 'Pak Adi' && pendDari(13) === 'Bu Rina');
  ok('siswa di luar tab Kelompok tidak diberi pendamping',
    pendDari(17) === '' && pendDari(24) === '');
  ok('yang belum masuk kelompok dilaporkan',
    /BELUM MASUK KELOMPOK/.test(lap));
  ok('jumlah murid per pendamping dilaporkan',
    /Pak Adi : 8 murid/.test(lap) && /Bu Rina : 8 murid/.test(lap));

  // Kamar tetap dihitung otomatis dari denah kursi, per gender.
  ok('kamar tetap terbentuk otomatis dari kursi',
    [1,2,3,4].every(i => kamarDari(i) === 'B2-L01') && kamarDari(13) === 'B2-P01');
  ok('baris belakang tetap tidak diberi kamar otomatis',
    kamarDari(25) === '' && kamarDari(26) === '');
  ok('kamar dengan satu pendamping tidak dicatat sebagai bercampur',
    !/kamar berisi murid dari pendamping berbeda/.test(lap));

  // Pindahkan Siswa 3 ke pendamping lain supaya kamar B2-L01 berisi dua
  // pendamping; kamar mengikuti kursi, kelompok disusun terpisah.
  s4.Kelompok.set(2, 4, '');
  s4.Kelompok.data.push(['Pak Zed', 'Siswa 3', '', '', '']);
  sb.imporKelompok();
  ok('kamar berisi pendamping berbeda dicatat sebagai catatan, bukan error',
    /kamar berisi murid dari pendamping berbeda/.test(sb.LAPORAN) &&
    /B2-L01/.test(sb.LAPORAN));
  ok('pemindahan antar blok terbaca',
    pendDari(3) === 'Pak Zed' && pendDari(1) === 'Pak Adi');
}

console.log('\n=== 12b. Pencocokan nama ===');
{
  const s7 = buatSpreadsheet(10);
  s7.KonfigKursi.data = [['Bus','Kursi','Tipe','Label']];
  // Nama panjang di DataSiswa, nama singkat di tab Kelompok.
  const kol = n => HEADER_SISWA.indexOf(n) + 1;
  s7.DataSiswa.set(2, kol('Nama Siswa'), 'Zahra Salsabila');
  s7.DataSiswa.set(3, kol('Nama Siswa'), 'Zahra Safira');
  s7.DataSiswa.set(4, kol('Nama Siswa'), 'Radiyyan Henry Saputra');
  s7.DataSiswa.set(5, kol('Nama Siswa'), 'Muhammad Wildan');
  s7.DataSiswa.set(6, kol('Nama Siswa'), 'Wildan Pratama');
  for (let i = 1; i <= 6; i++) {
    s7.DataSiswa.set(i + 1, kol('Bus'), 1);
    s7.DataSiswa.set(i + 1, kol('Kursi'), i);
    s7.DataSiswa.set(i + 1, kol('Gender'), 'L');
  }
  s7.Kelompok.data = [['Pendamping','Murid 1','Murid 2','Murid 3','Murid 4'],
    ['Bu Eka', 'Radiyyan Henry', 'M Wildan', 'Wildan', 'Zahra S'],
    ['',       'Siswa 6', 'Entah Siapa', '', '']];
  jalankan(s7);
  const sb7 = sandboxTerakhir;
  sb7.imporKelompok();
  const lap7 = sb7.LAPORAN;
  const pend7 = baris => String(s7.DataSiswa.cell(baris, kol('Pendamping'))).trim();

  ok('nama singkat cocok lewat awalan kata',
    pend7(4) === 'Bu Eka', 'Radiyyan Henry -> baris 4');
  ok('"M Wildan" dan "Wildan" dibedakan dengan benar',
    pend7(5) === 'Bu Eka' && pend7(6) === 'Bu Eka');
  ok('nama ambigu TIDAK ditebak, tetapi dilaporkan',
    pend7(2) === '' && pend7(3) === '' && /Cocok ke lebih dari satu siswa/.test(lap7));
  ok('calon untuk nama ambigu ikut disebut',
    /Zahra Salsabila/.test(lap7) && /Zahra Safira/.test(lap7));
  ok('nama yang tidak ada di DataSiswa dilaporkan',
    /Tidak ditemukan di DataSiswa/.test(lap7) && /Entah Siapa/.test(lap7));
}

console.log('\n=== 12c. Kelompok lintas bus ===');
{
  const s8 = buatSpreadsheet(10);
  s8.KonfigKursi.data = [['Bus','Kursi','Tipe','Label']];
  const kol = n => HEADER_SISWA.indexOf(n) + 1;
  // Siswa 1-2 di bus 1, siswa 3-4 di bus 2, tetapi satu pendamping.
  [[1,1],[2,1],[3,2],[4,2]].forEach(([i,bus]) => {
    s8.DataSiswa.set(i + 1, kol('Bus'), bus);
    s8.DataSiswa.set(i + 1, kol('Kursi'), i);
    s8.DataSiswa.set(i + 1, kol('Gender'), 'L');
  });
  s8.Kelompok.data = [['Pendamping','Murid 1','Murid 2','Murid 3','Murid 4'],
    ['Pak Lov', 'Siswa 1', 'Siswa 2', 'Siswa 3', 'Siswa 4']];
  jalankan(s8);
  const sb8 = sandboxTerakhir;
  sb8.imporKelompok();
  ok('kelompok yang tersebar di dua bus dilaporkan',
    /TERSEBAR DI LEBIH DARI SATU BUS/.test(sb8.LAPORAN) && /Pak Lov/.test(sb8.LAPORAN));

  // Satu siswa tercantum dua kali
  s8.Kelompok.data.push(['Bu Kinan', 'Siswa 1', '', '', '']);
  sb8.imporKelompok();
  ok('siswa yang tercantum di dua kelompok dilaporkan',
    /dipakai di/.test(sb8.LAPORAN));
}
console.log('\n=== 12d. Bus jarang isi: dua murid per baris ===');
{
  // Meniru bus 3 yang hanya terisi dua murid per baris.
  const s6 = buatSpreadsheet(30);
  s6.KonfigKursi.data = [['Bus','Kursi','Tipe','Label']];
  jalankan(s6);
  const sb6 = sandboxTerakhir;
  const kol = n => HEADER_SISWA.indexOf(n) + 1;
  const taruh6 = (siswa, kursi, gender) => {
    s6.DataSiswa.set(siswa + 1, kol('Bus'), 3);
    s6.DataSiswa.set(siswa + 1, kol('Kursi'), kursi);
    s6.DataSiswa.set(siswa + 1, kol('Gender'), gender);
  };
  // Enam baris, masing-masing hanya dua kursi terisi, semuanya putra.
  [1,2, 5,6, 9,10, 13,14, 17,18, 21,22].forEach((k,n) => taruh6(n+1, k, 'L'));
  sb6.imporKelompok();
  const kamar6 = siswa => String(s6.DataSiswa.cell(siswa + 1, kol('Kamar'))).trim();

  const unik = {};
  for (let i = 1; i <= 12; i++) unik[kamar6(i)] = (unik[kamar6(i)] || 0) + 1;
  const kode = Object.keys(unik);
  ok('12 siswa dua-per-baris jadi 3 kamar, bukan 6',
    kode.length === 3, kode.join(','));
  ok('setiap kamar terisi penuh empat orang',
    kode.every(k => unik[k] === 4), JSON.stringify(unik));
  ok('baris 1 dan baris 2 digabung',
    kamar6(1) === kamar6(2) && kamar6(1) === kamar6(3) && kamar6(1) === kamar6(4));
  ok('tidak ada kamar yang dilaporkan belum penuh',
    !/KAMAR BELUM PENUH/.test(sb6.LAPORAN));

  // Sisa ganjil: tambah satu baris berisi dua putra lagi -> 14 orang
  taruh6(13, 25, 'L');
  taruh6(14, 26, 'L');
  sb6.imporKelompok();
  const unik2 = {};
  for (let i = 1; i <= 14; i++) unik2[kamar6(i)] = (unik2[kamar6(i)] || 0) + 1;
  const sisa = Object.keys(unik2).filter(k => unik2[k] < 4);
  ok('sisa yang tidak genap jadi satu kamar belum penuh',
    sisa.length === 1 && unik2[sisa[0]] === 2, JSON.stringify(unik2));
  ok('kamar belum penuh dilaporkan', /KAMAR BELUM PENUH/.test(sb6.LAPORAN));
}
