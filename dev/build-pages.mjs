// Membuat halaman GitHub Pages di docs/ dari template + Styles.html + Shared.html, supaya tampilan
// github.io selalu sama dengan halaman di Apps Script. Jalankan: npm run pages
// Dengan --check: hanya memeriksa apakah docs/ sudah sesuai sumbernya (dipakai uji).
import { readFileSync, writeFileSync } from "node:fs";

const at = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(at(p), "utf8");
const { appUrl } = JSON.parse(read("pages.config.json"));
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(appUrl)) throw new Error("appUrl di pages.config.json bukan URL web app /exec");

const fill = (tpl) =>
  tpl
    .replace("{{STYLES}}", () => read("Styles.html").trim())
    .replace("{{SHARED}}", () => read("Shared.html").trim())
    .replaceAll("{{APP_URL}}", appUrl);

const outputs = {
  "docs/index.html": fill(read("dev/pages-template.html")),
  "docs/admin/index.html": fill(read("dev/pages-admin-template.html")),
};

const stale = Object.entries(outputs).filter(([p, html]) => read(p) !== html).map(([p]) => p);
if (process.argv.includes("--check")) {
  if (stale.length) {
    console.error(`Belum diperbarui: ${stale.join(", ")}. Jalankan npm run pages.`);
    process.exitCode = 1;
  }
} else {
  for (const [p, html] of Object.entries(outputs)) writeFileSync(at(p), html);
  console.log(stale.length ? `Diperbarui: ${stale.join(", ")}` : "docs/ sudah sesuai.");
}
