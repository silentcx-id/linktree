// Uji lokal linktree: logika server (Code.gs di atas tiruan Apps Script) dan kedua halaman di browser headless.
// Tidak menyentuh Google sama sekali. Jalankan: npm test
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createGas } from "./gas-mock.mjs";

const OUT = new URL("./out/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const file = (name) => new URL(name, OUT).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${info ? ` — ${info}` : ""}`);
};
const throws = (fn) => {
  try {
    fn();
    return "";
  } catch (e) {
    return e.message;
  }
};

// ---------- Server ----------
const env = createGas({ pinPrompts: ["1234", "1234"] });
const { gas, sheets, props } = env;
gas.setup();
check("setup membuat PIN dan tab data tersembunyi", Boolean(props.get("PIN_HASH")) && ["_data", "_log", "_harian", "_login"].every((n) => sheets.get(n)?.hidden));
check("setup memasang pemicu arsip harian", env.triggers.length === 1);
check("PIN tidak tersimpan apa adanya", !JSON.stringify([...props.values()]).includes("1234"));

const wrong = gas.adminLogin("0000");
check("PIN salah ditolak dengan sisa percobaan", !wrong.ok && /Sisa 4/.test(wrong.error), wrong.error);
for (let i = 0; i < 3; i++) gas.adminLogin("0000");
const locked = gas.adminLogin("0000");
check("5 kali salah → dikunci 15 menit", !locked.ok && typeof locked.locked === "number" && /15 menit/.test(locked.error), locked.error);
check("PIN benar pun ditolak saat terkunci", !gas.adminLogin("1234").ok);
props.set("LOCK_UNTIL", "0");
for (let i = 0; i < 5; i++) gas.adminLogin("0000");
check("kunci kedua lebih lama (1 jam)", /1 jam/.test(gas.adminLogin("1234").error ?? "") || props.get("LOCK_LEVEL") === "2");
props.set("LOCK_LEVEL", "3");
props.set("LOCK_UNTIL", "0");
for (let i = 0; i < 5; i++) gas.adminLogin("0000");
check("setelah kunci 24 jam, berikutnya terkunci penuh", gas.adminLogin("1234").locked === "permanent");
env.alerts.length = 0;
const pinPrompts = ["5678", "5678"];
const ui = gas.SpreadsheetApp.getUi;
gas.SpreadsheetApp.getUi = () => ({ ...ui(), prompt: () => { const v = pinPrompts.shift(); return { getSelectedButton: () => "OK", getResponseText: () => v }; } });
gas.resetPin();
gas.SpreadsheetApp.getUi = ui;
const login = gas.adminLogin("5678");
check("atur ulang PIN dari Sheet membuka kunci", login.ok && login.token.length > 40);
const token = login.token;

check("token palsu ditolak", throws(() => gas.adminLoad("palsu")) === "SESI_HABIS");
const loaded = gas.adminLoad(token);
check("panel memuat 5 tautan awal", loaded.config.links.length === 5);

const bad = structuredClone(loaded.config);
bad.links[0].url = "javascript:alert(1)";
check("alamat javascript: ditolak", /tidak valid/.test(throws(() => gas.adminSave(token, bad))));
const big = structuredClone(loaded.config);
big.profile.avatar = "data:image/png;base64," + "A".repeat(70000);
check("gambar profil terlalu besar ditolak", /terlalu besar/.test(throws(() => gas.adminSave(token, big))));

const cfg = structuredClone(loaded.config);
cfg.profile.name = "SilentCX </script><b>x";
cfg.links[3].on = false;
cfg.links[4].start = "2099-01-01";
cfg.links.push({ id: "baru0001", on: true, highlight: false, title: { id: "Jadwal lewat", en: "" }, desc: { id: "", en: "" }, url: "https://silentcx.id/lama", icon: "star", start: "", end: "2020-01-01" });
cfg.announcement = { on: true, text: { id: "Promo Insight −20%", en: "Insight promo −20%" }, url: "https://silentcx.id/#paket", until: "" };
gas.adminSave(token, cfg);
const pub = gas.publicConfig_();
check("halaman publik hanya memuat tautan aktif yang jadwalnya berlaku", pub.links.length === 3, pub.links.map((l) => l.title.id).join(", "));
check("UTM ditambahkan untuk silentcx.id saja", /utm_source=instagram/.test(pub.links[1].url) && !/utm_/.test(pub.links[0].url), pub.links[1].url);
check("UTM menjaga #anchor", /\?utm_source=instagram&utm_medium=bio&utm_campaign=linktree#paket$/.test(pub.links[1].url));
const html = gas.doGet({ parameter: {} }).getContent();
check("nama berisi </script> tidak memecah halaman", !html.includes("</script><b>x") && html.includes("\\u003c/script>"));

gas.track({ t: "v", d: "m", l: "id" });
gas.track({ t: "c", id: pub.links[0].id, d: "m", l: "id" });
gas.track({ t: "c", id: "tidakada", d: "m" });
gas.track({ t: "x" });
check("hanya klik ke tautan yang ada yang dicatat", sheets.get("_log").getLastRow() === 3);
gas.doPost({ postData: { contents: "bukan json" } });
check("data rusak lewat doPost diabaikan", sheets.get("_log").getLastRow() === 3);
const off = structuredClone(gas.adminLoad(token).config);
off.settings.tracking = false;
gas.adminSave(token, off);
gas.track({ t: "v", d: "d" });
check("pencatatan bisa dimatikan", sheets.get("_log").getLastRow() === 3);
off.settings.tracking = true;
gas.adminSave(token, off);

// Data contoh 40 hari: sebagian berumur > 90 hari untuk menguji arsip.
const log = sheets.get("_log");
const linkIds = pub.links.map((l) => [l.id, l.title.id]);
for (let day = 120; day >= 0; day -= day > 40 ? 20 : 1) {
  const when = new Date(Date.now() - day * 86400000);
  const views = 20 + ((day * 7) % 30);
  for (let v = 0; v < views; v++) log.appendRow([when, "v", "", "", v % 3 ? "m" : "d", v % 5 ? "id" : "en"]);
  for (let c = 0; c < Math.round(views * 0.4); c++) {
    const [id, title] = linkIds[c % 3 === 0 ? 1 : c % 2];
    log.appendRow([when, "c", id, title, "m", "id"]);
  }
}
log.rows.splice(1, log.rows.length - 1, ...log.rows.slice(1).sort((a, b) => new Date(a[0]) - new Date(b[0])));
const before = gas.adminStats(token, 0);
gas.archiveDaily();
const after = gas.adminStats(token, 0);
check("arsip harian meringkas baris > 90 hari tanpa mengubah total", sheets.get("_harian").getLastRow() > 1 && before.totals.views === after.totals.views && before.totals.clicks === after.totals.clicks, `${after.totals.views} kunjungan, ${after.totals.clicks} klik`);
check("baris mentah yang tersisa ≤ 90 hari", log.rows.slice(1).every((r) => Date.now() - new Date(r[0]) <= 91 * 86400000));
const s30 = gas.adminStats(token, 30);
check("statistik 30 hari punya 30 titik", s30.series.length === 30 && s30.totals.views < after.totals.views);
check("CSV statistik terbentuk", gas.adminExportCsv(token, 7).startsWith("Tanggal,Kunjungan,Klik"));
check("ganti PIN dengan PIN lama salah ditolak", !gas.adminChangePin(token, "0000", "1111").ok);

// PIN lewat Apps Script → Project Settings → Script Properties.
props.set("PIN_BARU", "12a4");
check("PIN_BARU yang bukan 4 angka ditolak dengan pesan jelas", /harus tepat 4 angka/.test(gas.adminLogin("1234").error ?? "") && props.has("PIN_BARU"));
props.set("LOCK_LEVEL", "4");
props.set("PIN_BARU", " 5678 ");
gas.doGet({ parameter: { admin: "" } });
check("PIN_BARU dipakai saat panel dibuka lalu dihapus", !props.has("PIN_BARU") && props.get("LOCK_LEVEL") === "0");
check("PIN_BARU mengeluarkan sesi lama", throws(() => gas.adminLoad(token)) === "SESI_HABIS");
check("login dengan PIN dari Script Properties berhasil", gas.adminLogin("5678").ok);
check("riwayat login mencatat sumber PIN", sheets.get("_login").rows.some((r) => r[1] === "PIN diatur ulang dari Script Properties"));

// ---------- Browser ----------
const ORIGIN = "https://lt.test";
const browser = await chromium.launch();
async function open(path, viewport, { gasBridge = false, jsonDown = false, ctx: reuse } = {}) {
  if (reuse) {
    const page = await reuse.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path, { waitUntil: "networkidle" });
    return { ctx: reuse, page, errors };
  }
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, userAgent: viewport.width < 600 ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile" : undefined });
  ctx.jsonDown = jsonDown;
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ctx.route(`${ORIGIN}/**`, (route) => {
    const u = new URL(route.request().url());
    const res = gas.doGet({ parameter: Object.fromEntries(u.searchParams) });
    route.fulfill({ contentType: "text/html", body: res.getContent() });
  });
  await ctx.route(`${env.URL_EXEC}**`, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      gas.doPost({ postData: { contents: req.postData() } });
      return route.fulfill({ body: "ok" });
    }
    const params = Object.fromEntries(new URL(req.url()).searchParams);
    // Jalur data JSON; Google menyajikannya dengan Access-Control-Allow-Origin: *.
    if (params.format === "json") {
      if (ctx.jsonDown) return route.abort();
      const res = gas.doGet({ parameter: params });
      return route.fulfill({ contentType: res.mime, body: res.getContent(), headers: { "Access-Control-Allow-Origin": "*" } });
    }
    // Halaman dari doGet; tanpa ALLOWALL, Google mengirim X-Frame-Options yang menolak bingkai.
    const res = gas.doGet({ parameter: params });
    route.fulfill({ contentType: "text/html", body: res.getContent(), headers: res.frame === "ALLOWALL" ? {} : { "X-Frame-Options": "SAMEORIGIN" } });
  });
  // Halaman GitHub Pages (docs/index.html) dengan APP_URL diarahkan ke web app tiruan.
  await ctx.route("https://silentcx-id.github.io/linktree/**", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith("/linktree/assets/")) return route.fulfill({ path: fileURLToPath(new URL(`../docs${u.pathname.slice(9)}`, import.meta.url)) });
    const doc = /^\/linktree\/admin\/?$/.test(u.pathname) ? "../docs/admin/index.html" : "../docs/index.html";
    const page = readFileSync(new URL(doc, import.meta.url), "utf8").replace(/https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/g, env.URL_EXEC);
    route.fulfill({ contentType: "text/html", body: page });
  });
  await ctx.route(/wa\.me|silentcx\.id|instagram\.com/, (route) => route.fulfill({ contentType: "text/html", body: "<p>tujuan</p>" }));
  if (gasBridge) {
    await page.exposeFunction("__gs", (name, args) => {
      try {
        return JSON.stringify({ v: gas[name](...JSON.parse(args)) ?? null });
      } catch (e) {
        return JSON.stringify({ err: e.message });
      }
    });
    await page.addInitScript(() => {
      const runner = (ok, fail) =>
        new Proxy({}, {
          get: (_, k) => {
            if (k === "withSuccessHandler") return (h) => runner(h, fail);
            if (k === "withFailureHandler") return (h) => runner(ok, h);
            return (...a) => window.__gs(k, JSON.stringify(a)).then((r) => {
              const o = JSON.parse(r);
              if (o.err) fail?.(new Error(o.err));
              else ok?.(o.v);
            });
          },
        });
      window.google = { script: { get run() { return runner(); } } };
    });
  }
  await page.goto(path.startsWith("http") ? path : ORIGIN + path, { waitUntil: "networkidle" });
  return { ctx, page, errors };
}

const mobile = { width: 390, height: 844 };
const desktop = { width: 1280, height: 900 };
try {
  {
    const rows = log.getLastRow();
    const { ctx, page, errors } = await open("/", mobile, { gasBridge: true });
    check("halaman publik tampil dengan 3 tautan", (await page.locator(".lt-link").count()) === 3);
    check("tautan pertama disorot emas", await page.locator(".lt-link").first().evaluate((a) => a.classList.contains("hl")));
    check("pengumuman tampil", (await page.textContent(".lt-news"))?.includes("Promo Insight"));
    await page.screenshot({ path: file("publik-hp.png"), fullPage: true });
    await page.getByRole("button", { name: "EN" }).click();
    check("tombol EN mengganti bahasa", (await page.textContent(".lt-links"))?.includes("Free consultation on WhatsApp"));
    check("judul tanpa versi Inggris memakai versi Indonesia", (await page.textContent(".lt-links"))?.includes("Lihat paket") || (await page.textContent(".lt-links"))?.includes("Packages"));
    await page.screenshot({ path: file("publik-hp-en.png"), fullPage: true });
    await page.locator(".lt-link").first().click();
    await page.waitForTimeout(500);
    const last = log.rows.at(-1);
    check("kunjungan (google.script.run) dan klik (beacon) tercatat", log.getLastRow() === rows + 2 && last[1] === "c" && last[4] === "m" && last[5] === "en", JSON.stringify(last.slice(1)));
    check("halaman publik tanpa error JavaScript", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
  {
    const GH = "https://silentcx-id.github.io/linktree/";
    const rows = log.getLastRow();
    const { ctx, page, errors } = await open(GH, mobile);
    await page.locator(".lt-link").first().waitFor();
    check("github.io: linktree digambar langsung, tanpa bingkai", (await page.locator(".lt-link").count()) === 3 && (await page.locator("iframe").count()) === 0);
    check("github.io: pengumuman dan media sosial tampil", (await page.locator(".lt-news").count()) === 1 && (await page.locator(".lt-social a").count()) === 3);
    check("github.io: pratinjau link memakai judul dan logo SilentCX", (await page.getAttribute('meta[property="og:image"]', "content"))?.endsWith("/assets/preview.png"));
    await page.screenshot({ path: file("github-io-hp.png"), fullPage: true });
    check("github.io: kunjungan tercatat ke Sheet lewat beacon", log.getLastRow() === rows + 1 && log.rows.at(-1)[1] === "v");
    await page.locator(".lt-link").first().click();
    await page.waitForURL(/wa\.me/);
    check("github.io: tautan membuka tujuan di tab yang sama", page.url().includes("wa.me"));
    check("github.io: klik tercatat ke Sheet", log.getLastRow() === rows + 2 && log.rows.at(-1)[1] === "c");
    check("github.io: tanpa error JavaScript", errors.length === 0, errors.join(" | "));

    // Kunjungan berikutnya saat Google tidak bisa dihubungi: isi simpanan tetap tampil.
    ctx.jsonDown = true;
    const again = await open(GH + "?lang=en", mobile, { ctx });
    check("github.io: saat Google gagal, isi simpanan tetap tampil", (await again.page.locator(".lt-link").count()) === 3 && (await again.page.textContent(".lt-links"))?.includes("Free consultation"));
    await again.page.close();
    await page.goto("https://silentcx-id.github.io/linktree/?admin", { waitUntil: "networkidle" });
    check("github.io: ?admin langsung ke panel Google (tidak dibingkai)", page.url().startsWith(env.URL_EXEC) && page.url().endsWith("?admin"));
    for (const path of ["admin", "admin/"]) {
      await page.goto(`https://silentcx-id.github.io/linktree/${path}`, { waitUntil: "networkidle" });
      check(`github.io: /linktree/${path} membuka layar PIN`, page.url() === `${env.URL_EXEC}?admin` && (await page.locator("#pad").isVisible()));
    }
    check("panel admin menolak dibingkai, halaman publik boleh", gas.doGet({ parameter: { admin: "" } }).frame !== "ALLOWALL" && gas.doGet({ parameter: {} }).frame === "ALLOWALL");
    await ctx.close();
  }
  {
    // Pengunjung baru saat Google tidak bisa dihubungi: diteruskan ke halaman Google sebagai cadangan.
    const { ctx, page } = await open("https://silentcx-id.github.io/linktree/", mobile, { jsonDown: true });
    await page.waitForURL(`${env.URL_EXEC}`);
    check("github.io: pengunjung baru diteruskan ke halaman Google kalau data gagal dimuat", page.url() === env.URL_EXEC);
    await ctx.close();
  }
  {
    const json = gas.doGet({ parameter: { format: "json" } });
    const data = JSON.parse(json.getContent());
    check("jalur JSON hanya berisi tautan publik yang aktif", json.mime === "application/json" && data.links.length === 3 && !("settings" in data) && !JSON.stringify(data).includes("utmDomain"));
  }
  {
    const { ctx, page } = await open("/", desktop, { gasBridge: true });
    await page.screenshot({ path: file("publik-desktop.png"), fullPage: true });
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open("/?admin", mobile, { gasBridge: true });
    await page.screenshot({ path: file("admin-pin.png") });
    for (const d of "1111") await page.locator("#pad button", { hasText: new RegExp(`^${d}$`) }).click();
    await page.getByText(/PIN salah/).waitFor();
    check("panel: PIN salah menampilkan pesan", true);
    for (const d of "5678") await page.keyboard.press(d);
    await page.getByRole("tab", { name: "Tampilan" }).waitFor();
    check("panel: PIN benar lewat keyboard membuka panel", true);
    await page.screenshot({ path: file("admin-tampilan-hp.png"), fullPage: true });
    await page.fill('[data-path="profile.name"]', "SilentCX Indonesia");
    check("panel: perubahan memunculkan tombol Simpan", await page.locator("#savebar").isVisible());
    await page.locator("#savebar").getByRole("button", { name: "Pratinjau" }).click();
    check("panel: pratinjau di HP memakai nama baru", (await page.textContent("#preview-root .lt-name")) === "SilentCX Indonesia");
    await page.screenshot({ path: file("admin-pratinjau-hp.png") });
    await page.getByRole("button", { name: "Tutup" }).click();
    await page.evaluate(() => { document.getElementById("toast").className = "toast hidden"; });
    await page.click("#save");
    await page.locator("#toast", { hasText: "Tersimpan" }).waitFor();
    check("panel: simpan menulis ke Sheet", gas.readStored_().profile.name === "SilentCX Indonesia");

    await page.getByRole("tab", { name: "Tautan" }).click();
    await page.getByRole("button", { name: "+ Tambah tautan" }).click();
    await page.fill('[data-path="links.6.title.id"]', "Jadwalkan konsultasi");
    await page.evaluate(() => { document.getElementById("toast").className = "toast hidden"; });
    await page.click("#save");
    await page.getByText(/Alamat tautan tidak valid/).waitFor();
    check("panel: alamat kosong ditolak dengan pesan jelas", true);
    await page.fill('[data-path="links.6.url"]', "https://calendly.com/silentcx");
    await page.locator('[data-act="icon"][data-i="6"][data-icon="calendar"]').click();
    await page.screenshot({ path: file("admin-tautan-hp.png"), fullPage: true });
    await page.evaluate(() => { document.getElementById("toast").className = "toast hidden"; });
    await page.click("#save");
    await page.locator("#toast", { hasText: "Tersimpan" }).waitFor();
    const savedLinks = gas.readStored_().links;
    check("panel: tautan baru tersimpan dengan ikon", savedLinks.at(-1).title.id === "Jadwalkan konsultasi" && savedLinks.at(-1).icon === "calendar");
    await page.locator('[data-act="up"][data-i="6"]').click();
    await page.evaluate(() => { document.getElementById("toast").className = "toast hidden"; });
    await page.click("#save");
    await page.locator("#toast", { hasText: "Tersimpan" }).waitFor();
    check("panel: urutan tautan bisa digeser", gas.readStored_().links[5].title.id === "Jadwalkan konsultasi");

    await page.getByRole("tab", { name: "Statistik" }).click();
    await page.locator("#chart svg").waitFor();
    check("panel: statistik menampilkan angka", /\d/.test((await page.textContent(".kpis")) ?? ""));
    await page.locator("#chart svg").hover({ position: { x: 200, y: 100 } });
    check("panel: grafik menampilkan tooltip", await page.locator("#tip").isVisible());
    await page.screenshot({ path: file("admin-statistik-hp.png"), fullPage: true });

    await page.getByRole("tab", { name: "Pengaturan" }).click();
    await page.locator("#logins table").waitFor();
    check("panel: riwayat login tampil", (await page.textContent("#logins"))?.includes("Berhasil"));
    await page.screenshot({ path: file("admin-pengaturan-hp.png"), fullPage: true });
    check("panel HP tanpa error JavaScript", errors.length === 0, errors.join(" | "));
    check("panel HP tanpa scroll ke samping", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await open("/?admin", desktop, { gasBridge: true });
    for (const d of "5678") await page.keyboard.press(d);
    await page.getByRole("tab", { name: "Tautan" }).click();
    await page.locator('[data-act="edit"]').first().click();
    await page.screenshot({ path: file("admin-tautan-desktop.png"), fullPage: true });
    await page.getByRole("tab", { name: "Statistik" }).click();
    await page.locator("#chart svg").waitFor();
    await page.screenshot({ path: file("admin-statistik-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "Keluar" }).click();
    check("panel: keluar kembali ke layar PIN", await page.locator("#pin").isVisible());
    check("panel desktop tanpa error JavaScript", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} lolos · gambar di dev/out/`);
process.exitCode = failed ? 1 : 0;
