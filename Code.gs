/**
 * SilentCX Linktree — halaman tautan untuk bio Instagram.
 *
 * Halaman publik : URL web app
 * Panel admin    : URL web app + ?admin
 *
 * Semua isi dikelola lewat panel admin (PIN 4 digit). Google Sheet hanya tempat penyimpanan:
 * tab datanya disembunyikan dan dikunci, jangan diubah manual.
 */

const TZ = 'Asia/Jakarta';
const SHEET = { info: 'Info', data: '_data', log: '_log', daily: '_harian', logins: '_login' };
const LOG_HEADER = ['Waktu', 'Jenis', 'ID tautan', 'Judul', 'Perangkat', 'Bahasa'];
const DAILY_HEADER = ['Tanggal', 'Jenis', 'ID tautan', 'Judul', 'Jumlah', 'HP', 'Desktop'];
const LOGIN_HEADER = ['Waktu', 'Hasil'];

const RAW_DAYS = 90; // baris mentah statistik disimpan 90 hari, lalu diringkas per hari
const SESSION_HOURS = 8;
const MAX_SESSIONS = 5;
const FAILS_PER_LOCK = 5;
const LOCK_STEPS_MIN = [15, 60, 24 * 60]; // setelah itu terkunci penuh sampai PIN diatur ulang dari Sheet
const CACHE_KEY = 'cfg-v1';
const CACHE_AVATAR = 'avatar-v1';

const ICONS = ['link', 'whatsapp', 'globe', 'tag', 'userplus', 'file', 'mail', 'phone', 'calendar', 'star', 'map', 'search', 'instagram', 'tiktok', 'linkedin', 'youtube'];
const SOCIALS = ['instagram', 'tiktok', 'linkedin', 'youtube', 'whatsapp', 'mail', 'globe'];

// ---------- Web app ----------

function doGet(e) {
  const isAdmin = e && e.parameter && Object.prototype.hasOwnProperty.call(e.parameter, 'admin');
  if (isAdmin) applyPendingPin_();
  const url = ScriptApp.getService().getUrl();
  const t = HtmlService.createTemplateFromFile(isAdmin ? 'Admin' : 'Index');
  const logo = include('Logo').trim();
  if (isAdmin) {
    t.boot = safeJson_({ url: url, logo: logo });
  } else {
    t.boot = safeJson_({ url: url, logo: logo, cfg: publicConfig_(), lang: e && e.parameter && e.parameter.lang === 'en' ? 'en' : '' });
  }
  const out = t
    .evaluate()
    .setTitle(isAdmin ? 'Admin · SilentCX Linktree' : (readConfig_().profile.name || 'SilentCX'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  // Halaman publik boleh dibingkai oleh silentcx-id.github.io/linktree (index.html di repo).
  // Panel admin tidak boleh dibingkai situs lain, supaya layar PIN tidak bisa ditiru di dalam bingkai.
  return isAdmin ? out : out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Pencatat statistik lewat navigator.sendBeacon (tetap terkirim walau pengunjung pindah halaman).
function doPost(e) {
  try {
    track(JSON.parse((e && e.postData && e.postData.contents) || '{}'));
  } catch (err) {
    // Data rusak diabaikan; pengunjung tidak perlu tahu.
  }
  return ContentService.createTextOutput('ok');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ---------- Menu di Google Sheet ----------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SilentCX Linktree')
    .addItem('1. Siapkan sheet', 'setup')
    .addItem('Atur ulang PIN admin', 'resetPin')
    .addItem('Tampilkan link halaman', 'showLinks')
    .addToUi();
}

function setup() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  props_().setProperty('SHEET_ID', ss.getId());

  sheet_(SHEET.data, ['Kunci', 'Isi']);
  sheet_(SHEET.log, LOG_HEADER);
  sheet_(SHEET.daily, DAILY_HEADER);
  sheet_(SHEET.logins, LOGIN_HEADER);
  if (!readStored_()) writeConfig_(defaultConfig_());

  const info = ss.getSheetByName(SHEET.info) || ss.insertSheet(SHEET.info, 0);
  info.clear();
  info.getRange('A1:A6').setValues([
    ['SilentCX Linktree'],
    ['Isi linktree dikelola lewat panel admin, bukan dari Sheet ini.'],
    ['Buka menu SilentCX Linktree → Tampilkan link halaman untuk melihat link halaman publik dan panel admin.'],
    ['Tab data (_data, _log, _harian, _login) disembunyikan dan dikunci. Jangan diubah manual.'],
    ['Lupa PIN? Menu SilentCX Linktree → Atur ulang PIN admin.'],
    ['Statistik lebih dari ' + RAW_DAYS + ' hari diringkas otomatis per hari setiap malam.'],
  ]);
  info.getRange('A1').setFontWeight('bold').setFontSize(14);
  info.setColumnWidth(1, 720);

  [SHEET.data, SHEET.log, SHEET.daily, SHEET.logins].forEach(function (n) {
    const s = ss.getSheetByName(n);
    s.hideSheet();
    if (!s.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
      s.protect().setDescription('Dikelola panel admin linktree').setWarningOnly(true);
    }
  });

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'archiveDaily') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('archiveDaily').timeBased().everyDays(1).atHour(3).inTimezone(TZ).create();
  clearCache_();

  if (!props_().getProperty('PIN_HASH')) {
    if (!askPin_('Buat PIN admin')) {
      ui.alert('Sheet sudah disiapkan, tapi PIN belum dibuat. Jalankan menu "Atur ulang PIN admin".');
      return;
    }
  }
  ui.alert('Selesai. Langkah berikutnya: Deploy → New deployment → Web app (lihat README).');
}

function resetPin() {
  if (askPin_('Atur ulang PIN admin')) {
    SpreadsheetApp.getUi().alert('PIN baru tersimpan. Semua sesi admin lama dikeluarkan dan kunci login dibuka.');
  }
}

function showLinks() {
  const url = ScriptApp.getService().getUrl();
  const ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert('Web app belum di-deploy. Ikuti langkah Deploy di README dulu.');
    return;
  }
  ui.alert('Halaman publik:\n' + url + '\n\nPanel admin:\n' + url + '?admin');
}

function askPin_(title) {
  const ui = SpreadsheetApp.getUi();
  const first = ui.prompt(title, 'Masukkan PIN 4 digit (angka saja):', ui.ButtonSet.OK_CANCEL);
  if (first.getSelectedButton() !== ui.Button.OK) return false;
  const pin = first.getResponseText().trim();
  if (!/^\d{4}$/.test(pin)) {
    ui.alert('PIN harus tepat 4 angka.');
    return false;
  }
  const again = ui.prompt(title, 'Ulangi PIN:', ui.ButtonSet.OK_CANCEL);
  if (again.getSelectedButton() !== ui.Button.OK) return false;
  if (again.getResponseText().trim() !== pin) {
    ui.alert('PIN tidak sama. Coba lagi.');
    return false;
  }
  setPin_(pin, 'Sheet');
  return true;
}

// ---------- Konfigurasi ----------

function defaultConfig_() {
  return {
    profile: {
      name: 'SilentCX',
      bio: { id: 'Mystery shopping & audit pengalaman pelanggan untuk bisnis Anda.', en: 'Mystery shopping & customer experience audits for your business.' },
      avatar: '',
    },
    announcement: { on: false, text: { id: '', en: '' }, url: '', until: '' },
    links: [
      link_('Konsultasi gratis via WhatsApp', 'Free consultation on WhatsApp', 'Balasan cepat di jam kerja', 'Quick replies during working hours', 'https://wa.me/6281200000000', 'whatsapp', true),
      link_('Lihat paket & harga', 'Packages & pricing', '', '', 'https://silentcx.id/#paket', 'tag', false),
      link_('Daftar jadi mystery shopper', 'Become a mystery shopper', '', '', 'https://silentcx.id/register?as=shopper', 'userplus', false),
      link_('Contoh laporan audit', 'Sample audit report', '', '', 'https://silentcx.id', 'file', false),
      link_('Email kami', 'Email us', '', '', 'mailto:halo@silentcx.id', 'mail', false),
    ],
    social: [
      { type: 'instagram', url: 'https://instagram.com/silentcx.id' },
      { type: 'whatsapp', url: 'https://wa.me/6281200000000' },
      { type: 'mail', url: 'mailto:halo@silentcx.id' },
    ],
    settings: { tracking: true, utmDomain: 'silentcx.id' },
  };
}

function link_(idTitle, enTitle, idDesc, enDesc, url, icon, highlight) {
  return { id: newId_(), on: true, highlight: highlight, title: { id: idTitle, en: enTitle }, desc: { id: idDesc, en: enDesc }, url: url, icon: icon, start: '', end: '' };
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

function readStored_() {
  const s = ss_().getSheetByName(SHEET.data);
  if (!s || s.getLastRow() < 2) return null;
  const rows = s.getRange(2, 1, s.getLastRow() - 1, 2).getValues();
  const out = {};
  rows.forEach(function (r) {
    if (r[0]) out[r[0]] = r[1];
  });
  if (!out.config) return null;
  const cfg = JSON.parse(out.config);
  cfg.profile.avatar = out.avatar || '';
  return cfg;
}

function readConfig_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) {
    const cfg = JSON.parse(hit);
    cfg.profile.avatar = cache.get(CACHE_AVATAR) || '';
    return cfg;
  }
  const cfg = readStored_() || defaultConfig_();
  const avatar = cfg.profile.avatar;
  const lean = JSON.parse(JSON.stringify(cfg));
  lean.profile.avatar = '';
  cache.put(CACHE_KEY, JSON.stringify(lean), 21600);
  if (avatar) cache.put(CACHE_AVATAR, avatar, 21600);
  return cfg;
}

function writeConfig_(cfg) {
  const s = sheet_(SHEET.data, ['Kunci', 'Isi']);
  const avatar = cfg.profile.avatar || '';
  const lean = JSON.parse(JSON.stringify(cfg));
  lean.profile.avatar = '';
  s.getRange(2, 1, 3, 2).setValues([
    ['config', JSON.stringify(lean)],
    ['avatar', avatar],
    ['diubah', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss')],
  ]);
  clearCache_();
}

function clearCache_() {
  CacheService.getScriptCache().removeAll([CACHE_KEY, CACHE_AVATAR]);
}

// Yang dikirim ke pengunjung: hanya tautan aktif yang jadwalnya berlaku hari ini (WIB).
function publicConfig_() {
  const cfg = readConfig_();
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const live = function (start, end) {
    return (!start || start <= today) && (!end || today <= end);
  };
  return {
    profile: cfg.profile,
    announcement: cfg.announcement.on && cfg.announcement.text.id && live('', cfg.announcement.until) ? cfg.announcement : null,
    links: cfg.links
      .filter(function (l) {
        return l.on && live(l.start, l.end);
      })
      .map(function (l) {
        return { id: l.id, highlight: l.highlight, title: l.title, desc: l.desc, icon: l.icon, url: withUtm_(l.url, cfg.settings.utmDomain) };
      }),
    social: cfg.social,
    tracking: cfg.settings.tracking,
  };
}

function withUtm_(url, domain) {
  if (!domain || !/^https:\/\//i.test(url) || /[?&]utm_/i.test(url)) return url;
  const host = url.replace(/^https:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
  const d = domain.toLowerCase();
  if (host !== d && host.slice(-(d.length + 1)) !== '.' + d) return url;
  const parts = url.split('#');
  const sep = parts[0].indexOf('?') >= 0 ? '&' : '?';
  return parts[0] + sep + 'utm_source=instagram&utm_medium=bio&utm_campaign=linktree' + (parts[1] !== undefined ? '#' + parts[1] : '');
}

// ---------- Validasi isi dari panel ----------

function cleanText_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function cleanPair_(v, max) {
  return { id: cleanText_(v && v.id, max), en: cleanText_(v && v.en, max) };
}

function cleanUrl_(v, required) {
  const url = cleanText_(v, 500);
  if (!url && !required) return '';
  if (!/^(https:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+|tel:\+?[\d\s-]{6,20})$/i.test(url)) {
    throw new Error('Alamat tautan tidak valid: "' + (url || '(kosong)') + '". Pakai https://, mailto:, atau tel:.');
  }
  return url;
}

function cleanDate_(v) {
  const d = cleanText_(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

function cleanConfig_(input) {
  const p = input.profile || {};
  const avatar = String(p.avatar || '');
  if (avatar && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) || avatar.length > 60000)) {
    throw new Error('Gambar profil tidak valid atau terlalu besar.');
  }
  const a = input.announcement || {};
  const links = (input.links || []).slice(0, 30).map(function (l) {
    const title = cleanPair_(l.title, 80);
    if (!title.id) throw new Error('Setiap tautan wajib punya judul (Indonesia).');
    return {
      id: /^[a-z0-9]{8}$/.test(l.id) ? l.id : newId_(),
      on: Boolean(l.on),
      highlight: Boolean(l.highlight),
      title: title,
      desc: cleanPair_(l.desc, 120),
      url: cleanUrl_(l.url, true),
      icon: ICONS.indexOf(l.icon) >= 0 ? l.icon : 'link',
      start: cleanDate_(l.start),
      end: cleanDate_(l.end),
    };
  });
  const social = (input.social || []).slice(0, 8).map(function (s) {
    if (SOCIALS.indexOf(s.type) < 0) throw new Error('Jenis media sosial tidak dikenal.');
    return { type: s.type, url: cleanUrl_(s.url, true) };
  });
  const st = input.settings || {};
  return {
    profile: { name: cleanText_(p.name, 60) || 'SilentCX', bio: cleanPair_(p.bio, 300), avatar: avatar },
    announcement: { on: Boolean(a.on), text: cleanPair_(a.text, 160), url: cleanUrl_(a.url, false), until: cleanDate_(a.until) },
    links: links,
    social: social,
    settings: { tracking: st.tracking !== false, utmDomain: cleanText_(st.utmDomain, 80).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') },
  };
}

// ---------- PIN dan sesi ----------

function props_() {
  return PropertiesService.getScriptProperties();
}

function hash_(text) {
  let out = text;
  for (let i = 0; i < 200; i++) {
    out = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, out, Utilities.Charset.UTF_8));
  }
  return out;
}

function setPin_(pin, source) {
  const salt = Utilities.getUuid();
  props_().setProperties({ PIN_SALT: salt, PIN_HASH: hash_(salt + pin), FAILS: '0', LOCK_LEVEL: '0', LOCK_UNTIL: '0', SESSIONS: '[]' });
  logLogin_('PIN diatur ulang dari ' + (source || 'Sheet'));
}

// PIN lewat Apps Script → Project Settings → Script Properties: isi property PIN_BARU dengan 4 angka.
// Dipakai saat panel admin dibuka berikutnya, lalu property-nya dihapus supaya angkanya tidak tertinggal.
// Mengembalikan pesan galat kalau isinya bukan 4 angka (property dibiarkan supaya bisa diperbaiki).
function applyPendingPin_() {
  const p = props_();
  const pending = p.getProperty('PIN_BARU');
  if (pending == null) return '';
  const pin = String(pending).trim();
  if (!/^\d{4}$/.test(pin)) return 'PIN_BARU di Script Properties harus tepat 4 angka. Perbaiki atau hapus property itu.';
  setPin_(pin, 'Script Properties');
  p.deleteProperty('PIN_BARU');
  return '';
}

function sessions_() {
  const now = Date.now();
  return JSON.parse(props_().getProperty('SESSIONS') || '[]').filter(function (s) {
    return s.exp > now;
  });
}

function requireSession_(token) {
  const h = token ? hash_('s:' + token) : '';
  const ok = h && sessions_().some(function (s) {
    return s.h === h;
  });
  if (!ok) throw new Error('SESI_HABIS');
}

function logLogin_(result) {
  const s = sheet_(SHEET.logins, LOGIN_HEADER);
  s.appendRow([new Date(), result]);
  if (s.getLastRow() > 501) s.deleteRows(2, s.getLastRow() - 501);
}

function adminLogin(pin) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const pendingError = applyPendingPin_();
    if (pendingError) return { ok: false, error: pendingError };
    const p = props_();
    const now = Date.now();
    if (!p.getProperty('PIN_HASH')) return { ok: false, error: 'PIN belum dibuat. Isi property PIN_BARU di Apps Script → Project Settings, atau jalankan menu "Atur ulang PIN admin" di Sheet.' };
    const level = Number(p.getProperty('LOCK_LEVEL') || 0);
    const until = Number(p.getProperty('LOCK_UNTIL') || 0);
    if (level > LOCK_STEPS_MIN.length) return { ok: false, locked: 'permanent', error: 'Login terkunci. Atur ulang PIN lewat PIN_BARU di Script Properties atau menu di Google Sheet.' };
    if (until > now) return { ok: false, locked: until, error: 'Terlalu banyak percobaan. Coba lagi nanti.' };

    pin = String(pin || '');
    if (/^\d{4}$/.test(pin) && hash_(p.getProperty('PIN_SALT') + pin) === p.getProperty('PIN_HASH')) {
      const token = Utilities.getUuid() + Utilities.getUuid();
      const list = sessions_().concat([{ h: hash_('s:' + token), exp: now + SESSION_HOURS * 3600 * 1000 }]).slice(-MAX_SESSIONS);
      p.setProperties({ SESSIONS: JSON.stringify(list), FAILS: '0', LOCK_LEVEL: '0', LOCK_UNTIL: '0' });
      logLogin_('Berhasil');
      return { ok: true, token: token, exp: list[list.length - 1].exp };
    }

    Utilities.sleep(800);
    const fails = Number(p.getProperty('FAILS') || 0) + 1;
    if (fails >= FAILS_PER_LOCK) {
      const next = level + 1;
      const mins = LOCK_STEPS_MIN[next - 1];
      p.setProperties({ FAILS: '0', LOCK_LEVEL: String(next), LOCK_UNTIL: String(mins ? now + mins * 60000 : 0) });
      logLogin_(mins ? 'Gagal — dikunci ' + mins + ' menit' : 'Gagal — dikunci penuh');
      return mins
        ? { ok: false, locked: now + mins * 60000, error: 'PIN salah ' + FAILS_PER_LOCK + ' kali. Login dikunci ' + (mins >= 60 ? mins / 60 + ' jam' : mins + ' menit') + '.' }
        : { ok: false, locked: 'permanent', error: 'Login terkunci. Atur ulang PIN dari menu di Google Sheet.' };
    }
    p.setProperty('FAILS', String(fails));
    logLogin_('Gagal');
    return { ok: false, error: 'PIN salah. Sisa ' + (FAILS_PER_LOCK - fails) + ' percobaan sebelum dikunci.' };
  } finally {
    lock.releaseLock();
  }
}

function adminLogout(token) {
  const h = hash_('s:' + token);
  props_().setProperty('SESSIONS', JSON.stringify(sessions_().filter(function (s) {
    return s.h !== h;
  })));
  return { ok: true };
}

function adminChangePin(token, oldPin, newPin) {
  requireSession_(token);
  const p = props_();
  if (hash_(p.getProperty('PIN_SALT') + String(oldPin)) !== p.getProperty('PIN_HASH')) return { ok: false, error: 'PIN lama salah.' };
  if (!/^\d{4}$/.test(String(newPin))) return { ok: false, error: 'PIN baru harus 4 angka.' };
  const salt = Utilities.getUuid();
  // Sesi lain dikeluarkan; sesi yang sedang dipakai tetap berlaku.
  const h = hash_('s:' + token);
  const keep = sessions_().filter(function (s) {
    return s.h === h;
  });
  p.setProperties({ PIN_SALT: salt, PIN_HASH: hash_(salt + newPin), SESSIONS: JSON.stringify(keep) });
  logLogin_('PIN diganti dari panel');
  return { ok: true };
}

// ---------- API panel admin ----------

function adminLoad(token) {
  requireSession_(token);
  return { config: readStored_() || defaultConfig_(), url: ScriptApp.getService().getUrl() };
}

function adminSave(token, input) {
  requireSession_(token);
  const cfg = cleanConfig_(input);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    writeConfig_(cfg);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, config: cfg };
}

function adminLogins(token) {
  requireSession_(token);
  const s = sheet_(SHEET.logins, LOGIN_HEADER);
  const n = Math.min(30, s.getLastRow() - 1);
  if (n < 1) return [];
  return s
    .getRange(s.getLastRow() - n + 1, 1, n, 2)
    .getValues()
    .reverse()
    .map(function (r) {
      return { at: Utilities.formatDate(new Date(r[0]), TZ, 'dd MMM yyyy HH:mm'), result: r[1] };
    });
}

// Statistik untuk `days` hari terakhir (0 = semua), dari baris mentah dan ringkasan harian.
function adminStats(token, days) {
  requireSession_(token);
  days = Number(days) || 0;
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const since = days ? Utilities.formatDate(new Date(Date.now() - (days - 1) * 86400000), TZ, 'yyyy-MM-dd') : '';
  const byDay = {};
  const byLink = {};
  const device = { m: 0, d: 0 };
  const lang = { id: 0, en: 0 };
  const add = function (date, type, id, title, count, m, d) {
    if (since && date < since) return;
    const day = byDay[date] || (byDay[date] = { date: date, views: 0, clicks: 0 });
    if (type === 'v') {
      day.views += count;
      device.m += m;
      device.d += d;
    } else {
      day.clicks += count;
      const l = byLink[id] || (byLink[id] = { id: id, title: title, clicks: 0 });
      l.clicks += count;
      if (title) l.title = title;
    }
  };

  const daily = sheet_(SHEET.daily, DAILY_HEADER);
  if (daily.getLastRow() > 1) {
    daily.getRange(2, 1, daily.getLastRow() - 1, 7).getValues().forEach(function (r) {
      add(dateKey_(r[0]), r[1], r[2], r[3], Number(r[4]), Number(r[5]), Number(r[6]));
    });
  }
  const log = sheet_(SHEET.log, LOG_HEADER);
  if (log.getLastRow() > 1) {
    log.getRange(2, 1, log.getLastRow() - 1, 6).getValues().forEach(function (r) {
      const date = dateKey_(r[0]);
      add(date, r[1], r[2], r[3], 1, r[4] === 'm' ? 1 : 0, r[4] === 'm' ? 0 : 1);
      if (r[1] === 'v' && (!since || date >= since)) lang[r[5] === 'en' ? 'en' : 'id']++;
    });
  }

  // Hari tanpa data tetap ditampilkan supaya grafik tidak melompat.
  const first = since || Object.keys(byDay).sort()[0] || today;
  const series = [];
  for (let t = new Date(first + 'T00:00:00+07:00').getTime(); ; t += 86400000) {
    const key = Utilities.formatDate(new Date(t), TZ, 'yyyy-MM-dd');
    if (key > today) break;
    series.push(byDay[key] || { date: key, views: 0, clicks: 0 });
  }
  const totals = series.reduce(
    function (acc, d) {
      acc.views += d.views;
      acc.clicks += d.clicks;
      return acc;
    },
    { views: 0, clicks: 0 },
  );
  const current = readConfig_().links;
  const links = Object.keys(byLink)
    .map(function (id) {
      const now = current.filter(function (l) {
        return l.id === id;
      })[0];
      return { id: id, title: now ? now.title.id : byLink[id].title, removed: !now, clicks: byLink[id].clicks };
    })
    .sort(function (a, b) {
      return b.clicks - a.clicks;
    });
  return { days: days, series: series, totals: totals, links: links, device: device, lang: lang, rawRows: Math.max(0, log.getLastRow() - 1), tracking: readConfig_().settings.tracking };
}

function adminExportCsv(token, days) {
  const s = adminStats(token, days);
  const rows = [['Tanggal', 'Kunjungan', 'Klik']].concat(
    s.series.map(function (d) {
      return [d.date, d.views, d.clicks];
    }),
  );
  rows.push([]);
  rows.push(['Tautan', 'Klik', 'Status']);
  s.links.forEach(function (l) {
    rows.push([l.title, l.clicks, l.removed ? 'dihapus' : 'ada']);
  });
  return rows
    .map(function (r) {
      return r
        .map(function (v) {
          const t = String(v == null ? '' : v);
          return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
        })
        .join(',');
    })
    .join('\n');
}

function dateKey_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v).slice(0, 10);
}

// ---------- Statistik publik ----------

// Dipanggil pengunjung (lewat doPost atau google.script.run). Hanya menerima ID tautan yang ada.
function track(ev) {
  ev = ev || {};
  const type = ev.t === 'c' ? 'c' : ev.t === 'v' ? 'v' : '';
  if (!type) return;
  const cfg = readConfig_();
  if (!cfg.settings.tracking) return;
  let id = '';
  let title = '';
  if (type === 'c') {
    const link = cfg.links.filter(function (l) {
      return l.id === ev.id;
    })[0];
    if (!link) return;
    id = link.id;
    title = link.title.id;
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    sheet_(SHEET.log, LOG_HEADER).appendRow([new Date(), type, id, title, ev.d === 'm' ? 'm' : 'd', ev.l === 'en' ? 'en' : 'id']);
  } finally {
    lock.releaseLock();
  }
}

// Pemicu harian: baris mentah lebih lama dari RAW_DAYS diringkas per hari ke _harian, lalu dihapus.
function archiveDaily() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const log = sheet_(SHEET.log, LOG_HEADER);
    const n = log.getLastRow() - 1;
    if (n < 1) return;
    const cutoff = Utilities.formatDate(new Date(Date.now() - RAW_DAYS * 86400000), TZ, 'yyyy-MM-dd');
    const rows = log.getRange(2, 1, n, 6).getValues();
    let old = 0;
    while (old < rows.length && dateKey_(rows[old][0]) < cutoff) old++;
    if (!old) return;
    const groups = {};
    rows.slice(0, old).forEach(function (r) {
      const key = [dateKey_(r[0]), r[1], r[2]].join('|');
      const g = groups[key] || (groups[key] = [dateKey_(r[0]), r[1], r[2], r[3], 0, 0, 0]);
      g[4]++;
      if (r[4] === 'm') g[5]++;
      else g[6]++;
    });
    const out = Object.keys(groups).map(function (k) {
      return groups[k];
    });
    const daily = sheet_(SHEET.daily, DAILY_HEADER);
    daily.getRange(daily.getLastRow() + 1, 1, out.length, 7).setValues(out);
    log.deleteRows(2, old);
  } finally {
    lock.releaseLock();
  }
}

// ---------- Util ----------

function ss_() {
  const id = props_().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name, header) {
  const ss = ss_();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

// JSON yang aman ditempel di dalam <script>.
function safeJson_(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
