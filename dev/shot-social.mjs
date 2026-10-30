// Tangkapan layar halaman publik dengan semua ikon media sosial (tiruan Apps Script, tanpa Google).
// Jalankan: node dev/shot-social.mjs dev/out/sosial.png
import { chromium } from "playwright";
import { createGas } from "./gas-mock.mjs";

const out = process.argv[2];
const env = createGas({ pinPrompts: ["1234", "1234"] });
env.gas.setup();
const token = env.gas.adminLogin("1234").token;
const cfg = env.gas.adminLoad(token).config;
cfg.social = ["instagram", "tiktok", "facebook", "threads", "x", "linkedin", "youtube", "whatsapp"].map((type) => ({ type, url: `https://contoh.id/${type}` }));
env.gas.adminSave(token, cfg);
const html = env.gas.doGet({ parameter: {} }).getContent();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.setContent(html, { waitUntil: "load" });
await page.locator(".lt-social").waitFor();
const labels = await page.locator(".lt-social a").evaluateAll((a) => a.map((x) => x.getAttribute("aria-label")));
console.log(labels.join(", "));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
