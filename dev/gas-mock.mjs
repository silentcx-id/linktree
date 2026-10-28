// Tiruan layanan Google Apps Script yang dipakai Code.gs, supaya server linktree bisa diuji di Node.
// Hanya meniru bagian yang dipakai; bukan pengganti uji di Apps Script sungguhan.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const DIR = new URL("../", import.meta.url);

function formatDate(date, tz, pattern) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(date))
      .map((p) => [p.type, p.value]),
  );
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(parts.month) - 1];
  return pattern
    .replace("yyyy", parts.year)
    .replace("MMM", mon)
    .replace("MM", parts.month)
    .replace("dd", parts.day)
    .replace("HH", parts.hour)
    .replace("mm", parts.minute)
    .replace("ss", parts.second);
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.hidden = false;
    this.protections = [];
  }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  ensure(r, c) {
    while (this.rows.length < r) this.rows.push([]);
    const row = this.rows[r - 1];
    while (row.length < c) row.push("");
  }
  getRange(r, c, nr = 1, nc = 1) {
    if (typeof r === "string") {
      const m = /^([A-Z])(\d+)(?::([A-Z])(\d+))?$/.exec(r);
      const col = (s) => s.charCodeAt(0) - 64;
      return this.getRange(Number(m[2]), col(m[1]), m[4] ? Number(m[4]) - Number(m[2]) + 1 : 1, m[3] ? col(m[3]) - col(m[1]) + 1 : 1);
    }
    const range = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => this.rows[r - 1 + i]?.[c - 1 + j] ?? "")),
      setValues: (values) => {
        values.forEach((row, i) => row.forEach((v, j) => { this.ensure(r + i, c + j); this.rows[r - 1 + i][c - 1 + j] = v; }));
        return range;
      },
      setFontWeight: () => range,
      setFontSize: () => range,
    };
    return range;
  }
  appendRow(row) { this.rows.push([...row]); }
  deleteRows(start, n) { this.rows.splice(start - 1, n); }
  setFrozenRows() {}
  setColumnWidth() {}
  clear() { this.rows = []; }
  hideSheet() { this.hidden = true; }
  protect() {
    const p = { setDescription: () => p, setWarningOnly: () => p };
    this.protections.push(p);
    return p;
  }
  getProtections() { return this.protections; }
}

export function createGas({ pinPrompts = [] } = {}) {
  const sheets = new Map();
  const props = new Map();
  const cache = new Map();
  const alerts = [];
  const prompts = [...pinPrompts];
  const triggers = [];
  const ss = {
    getId: () => "SHEET-1",
    getSheetByName: (n) => sheets.get(n) ?? null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.set(n, s); return s; },
  };
  const URL_EXEC = "https://script.google.com/macros/s/TEST/exec";

  const ctx = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      ProtectionType: { SHEET: "SHEET" },
      getUi: () => ({
        Button: { OK: "OK", CANCEL: "CANCEL" },
        ButtonSet: { OK_CANCEL: "OK_CANCEL" },
        alert: (m) => alerts.push(m),
        prompt: () => { const v = prompts.shift(); return { getSelectedButton: () => (v == null ? "CANCEL" : "OK"), getResponseText: () => v ?? "" }; },
        createMenu: () => { const m = { addItem: () => m, addToUi: () => m }; return m; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, String(v)),
        deleteProperty: (k) => props.delete(k),
        setProperties: (o) => Object.entries(o).forEach(([k, v]) => props.set(k, String(v))),
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k) ?? null,
        put: (k, v) => { if (String(v).length > 100000) throw new Error("Argument too large: value"); cache.set(k, v); },
        removeAll: (ks) => ks.forEach((k) => cache.delete(k)),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (_alg, text) => [...createHash("sha256").update(String(text), "utf8").digest()].map((b) => (b > 127 ? b - 256 : b)),
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => (b < 0 ? b + 256 : b))).toString("base64"),
      getUuid: () => randomUUID(),
      formatDate,
      sleep: () => {},
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => URL_EXEC }),
      getProjectTriggers: () => triggers,
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => {
        const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, inTimezone: () => b, create: () => { triggers.push({ getHandlerFunction: () => fn }); } };
        return b;
      },
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL", DEFAULT: "DEFAULT" },
      createHtmlOutputFromFile: (name) => ({ getContent: () => readFileSync(new URL(`${name}.html`, DIR), "utf8") }),
      createTemplateFromFile: (name) => {
        const t = {
          evaluate: () => {
            const html = readFileSync(new URL(`${name}.html`, DIR), "utf8")
              .replace(/<\?!=\s*include\('(\w+)'\);?\s*\?>/g, (_, n) => ctx.include(n))
              .replace(/<\?!=\s*boot\s*\?>/g, () => t.boot);
            const out = { title: "", frame: "DEFAULT", setTitle: (v) => { out.title = v; return out; }, addMetaTag: () => out, setXFrameOptionsMode: (m) => { out.frame = m; return out; }, getContent: () => html };
            return out;
          },
        };
        return t;
      },
    },
    ContentService: { createTextOutput: (t) => ({ getContent: () => t }) },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("Code.gs", DIR), "utf8"), ctx, { filename: "Code.gs" });
  return { gas: ctx, sheets, props, cache, alerts, triggers, URL_EXEC };
}
