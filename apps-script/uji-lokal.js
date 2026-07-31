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

const HEADER_SISWA = ['NIS', 'Nama', 'PIN', 'Kelas', 'Gender', 'TotalBayar', 'Lunas', 'TglLunas',
  'NoAntrean', 'Bus', 'Kursi', 'WaktuPilih', 'Terlewat', 'UkuranJaket', 'WaktuJaket'];

function buatSpreadsheet(jumlahSiswa) {
  const siswa = [HEADER_SISWA.slice()];
  for (let i = 1; i <= jumlahSiswa; i++) {
    const lunas = i <= 60;
    siswa.push([
      10000 + i, 'Siswa ' + i, String(1000 + i), 'XA',
      i % 2 === 0 ? 'P' : 'L',
      lunas ? 2450000 : 1000000,
      lunas ? 'TRUE' : 'FALSE',
      lunas ? new Date('2026-08-01T00:00:00Z').getTime() + i * 3600000 : '',
      '', '', '', '', '', '', ''
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
    ['durasi_giliran_menit', 15], ['lebar_jendela', 1],
    ['antrean_sekarang', 0], ['antrean_mulai', ''], ['fase', 'antrean'],
    ['pesan_belum_dibuka', 'Belum dibuka.']];
  return {
    Siswa: new Sheet('Siswa', siswa),
    KonfigKursi: new Sheet('KonfigKursi', konfig),
    Pengaturan: new Sheet('Pengaturan', set)
  };
}

function jalankan(sheets) {
  const sandbox = {
    console,
    Date: class extends Date {
      constructor(...a) { if (a.length === 0) super(JAM); else super(...a); }
      static now() { return JAM; }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => (sheets[n] = new Sheet(n, []))
      }),
      getUi: () => ({ alert: () => {}, createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } })
    },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'Code.gs'), 'utf8'), sandbox);
  return (payload) => JSON.parse(
    sandbox.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent()
  );
}

/* ------------------------------- SKENARIO ------------------------------- */
const sheets = buatSpreadsheet(80);
const post = jalankan(sheets);
const nis = i => String(10000 + i);
const pin = i => String(1000 + i);
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

console.log('\n=== 2. Antrean & giliran ===');
r = post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
ok('nomor antrean terbit otomatis', r.siswa.noAntrean === 1);
ok('giliran nomor 1 langsung aktif', r.antrean.giliranSaya === true);
ok('sisa waktu ~15 menit', r.antrean.detikTersisa > 890 && r.antrean.detikTersisa <= 900);
ok('denah berisi 3 bus', r.bus.length === 3);
ok('kursi guru terbaca', r.bus[0].kursi['1'].tipe === 'GURU' && r.bus[0].kursi['1'].label === 'Pak Fikar');

r = post({ action: 'get_seat_state', nis: nis(2), pin: pin(2) });
ok('nomor 2 belum gilirannya', r.siswa.noAntrean === 2 && r.antrean.giliranSaya === false);

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
const tS = sheets.Siswa;
const kBus = HEADER_SISWA.indexOf('Bus') + 1, kKursi = HEADER_SISWA.indexOf('Kursi') + 1;
tS.set(63, kBus, 3); tS.set(63, kKursi, 44);   // baris 63 = siswa 62
const manual = post({ action: 'get_seat_state', nis: nis(62), pin: pin(62) });
ok('penempatan manual tampil sebagai kursi siswa', manual.siswa.busTerpilih === 3 && manual.siswa.kursiTerpilih === 44);
ok('penempatan manual TIDAK memakan kuota', manual.antrean.terpakai === 50);

console.log('\n=== 10. Fitur dimatikan ===');
const tSet = sheets.Pengaturan;
tSet.data.find(r2 => r2[0] === 'pemilihan_aktif')[1] = 'FALSE';
r = post({ action: 'get_seat_state', nis: nis(1), pin: pin(1) });
ok('mengembalikan BELUM_DIBUKA', r.kode === 'BELUM_DIBUKA' && r.message === 'Belum dibuka.');
