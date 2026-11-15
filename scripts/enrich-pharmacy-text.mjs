#!/usr/bin/env node
// scripts/enrich-pharmacy-text.mjs
// Για brands ΧΩΡΙΣ ελληνικό επίσημο site (π.χ. Corega): το fill-brand-missing.mjs κρατά μόνο og:title/og:description από τη σελίδα
// του φαρμακείου. Εδώ ξαναδιαβάζουμε τις σελίδες pharm24.gr του js/<brand>-supplemental.js και προσθέτουμε τις καρτέλες τους
// «Περιγραφή / Οδηγίες - Χρήσης / Συστατικά» ως sections (εμφανίζονται στη σελίδα προϊόντος όπως οι ενότητες του επίσημου site).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/enrich-pharmacy-text.mjs --brand=corega
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BRAND = ((process.argv.find(a => a.startsWith("--brand=")) || "").slice(8) || "").toLowerCase();
if (!BRAND) { console.error("Usage: node scripts/enrich-pharmacy-text.mjs --brand=<key>"); process.exit(1); }
const FILE = path.join(ROOT, `js/${BRAND}-supplemental.js`);
const VAR = `window.${BRAND.toUpperCase()}_SUPPLEMENTAL = `;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "\n• ").replace(/<\/(p|li|div|h\d|ul)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
// pharm24: <div class="p-desc-content" id="p-desc-content|p-odigies-content|products-systatika-content">
const PANELS = [["p-desc-content", "Περιγραφή"], ["p-odigies-content", "Χρήση"], ["products-systatika-content", "Συστατικά"]];
const panel = (h, id) => { const i = h.indexOf(`id="${id}"`); if (i < 0) return ""; const rest = h.slice(h.indexOf(">", i) + 1); const j = rest.search(/<div class="tabs-panel|<div class="p-desc-content"|<\/div>\s*<\/div>\s*<div class="tabs-panel/); return rest.slice(0, j > 0 ? j : 20000); };

const src = await fs.readFile(FILE, "utf8");
const head = src.slice(0, src.indexOf(VAR));
const data = JSON.parse(src.slice(src.indexOf(VAR) + VAR.length).trim().replace(/;$/, ""));
let n = 0;
for (const [bc, s] of Object.entries(data)) {
  if (!/pharm24\.gr/.test(s.url || "")) continue;
  const r = await fetch(s.url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) { console.log(bc, "HTTP", r.status); continue; }
  const h = (await r.text()).replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/g, "");
  const sections = {};
  for (const [id, label] of PANELS) {
    const t = text(panel(h, id)).split("\n").filter(l => l && !/^(Αποστολή|Δείτε επίσης|Κωδικός)/i.test(l)).join("\n").trim();
    if (t && t.length > 15) sections[label] = t;
  }
  if (sections["Περιγραφή"]) {
    const lines = sections["Περιγραφή"].split("\n");
    s.subtitle = s.subtitle || (lines[0].length < 200 ? lines[0] : null);   // πρώτη γραμμή = τίτλος με σύντομη περιγραφή
    if (s.subtitle) sections["Περιγραφή"] = lines.slice(1).join("\n").trim() || sections["Περιγραφή"];
    s.description = sections["Περιγραφή"].replace(/\s+/g, " ").slice(0, 700);
  }
  s.sections = sections;
  n++;
  console.log(`${bc} ${Object.keys(sections).join(",")} | ${s.name}`);
  await sleep(1000);
}
await fs.writeFile(FILE, head + VAR + JSON.stringify(data, null, 2) + ";\n", "utf8");
console.log(`\nΕμπλουτίστηκαν ${n} προϊόντα στο ${path.relative(ROOT, FILE)}.`);
