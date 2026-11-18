#!/usr/bin/env node
// scripts/scrape-isdin.mjs
// ISDIN (ισπανική, διανομή ΥΓΕΙΑΣΗ Α.Ε.) = isdin.gr — WordPress + WooCommerce (Woodmart), χωρίς EAN και χωρίς τιμές.
// Λίστα: Store API /wp-json/wc/store/v1/products (σειρά = «brand» του Woo: Fotoprotector, Ureadin, Acniben …).
// Σελίδα: .woocommerce-product-details__short-description (περιγραφή) · ul.mysite-feature-list με εικονίδια:
//   icon-ml = «50 mL - Αντηλιακό προσώπου.» (συσκευασία + τύπος) · icon-sun = SPF · icon-human = τύπος δέρματος ·
//   icon-shield = υφή/χαρακτηριστικά · icon-heart = ενδείξεις · icon-ingredients = βασικά συστατικά ·
//   modals: «Πλήρης Σύνθεση (INCI)» → Συστατικά, «Προφυλάξεις», «Τρόπος Χρήσης» (Πρόσθετες πληροφορίες) → Χρήση.
// Κλειδί: "IS-<slug>". Τιμές Medica με js/isdin-manual-matches.json (barcode → κλειδί).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-isdin.mjs [--delay=1500]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/isdin-site.json");
const BASE = "https://isdin.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "1500"));
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const toLines = h => decodeAll(String(h || "").replace(/<(br|\/?p|\/?div|\/?li|\/?ul|\/?h\d)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "))
  .replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").trim()).filter(Boolean);
const oneLine = h => toLines(h).join(" ").trim();

// «FUSION WATER MAGIC SPF50» → «Fusion Water Magic SPF50» (κρατά SPF/PA/CC+/A.G.E./K-OX/AK-NMSC/24H κεφαλαία)
const KEEP = /^(SPF\d*\+?|PA\+*|CC\+?|A\.G\.E\.|K-OX|AK-NMSC|24H|UV[AB]?|II|III|4)$/;
export function prettyName(s) {
  return String(s).replace(/®/g, "").split(/\s+/).filter(Boolean).map(w => KEEP.test(w) || /\d/.test(w) && /^[A-Z0-9+.-]+$/.test(w) && /SPF|\d+H/.test(w) ? w
    : w.toLowerCase().replace(/(^|[-(&/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())).join(" ").replace(/\bIn\b/g, "in").replace(/\bTo\b/g, "to").replace(/\bBy\b/g, "by");
}

export function extractIsdinDetails(p, raw) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const html = String(raw || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "");
  const line = decodeAll(((p.brands || [])[0] || {}).name || "").replace(/®/g, "").replace(/\s+100$/, "").trim();
  d.line = line ? prettyName(line).replace(/^Isdin Coverage$/, "Coverage").replace(/^Fotoultra$/, "Foto Ultra") : null;
  const base = prettyName(decodeAll(p.name).replace(/^CAVERAGE/, "COVERAGE"));
  if (d.line === "Derma") d.line = null;   // «DERMA» = κατηγορία, όχι σειρά (Micellar Solution 4 in 1)
  d.title = d.line && !base.toLowerCase().startsWith(d.line.toLowerCase().split(" ")[0]) ? `${d.line} ${base}` : base;
  d.series = d.line; if (d.line) d.attributes["Σειρά"] = d.line;
  d.description = toLines(p.short_description).join("\n") || null;
  // λίστα χαρακτηριστικών με εικονίδια
  const fl = (html.match(/<ul class="mysite-feature-list">([\s\S]*?)<\/ul>/) || [])[1] || "";
  for (const m of fl.matchAll(/<li class="mysite-feature-list__item">([\s\S]*?)<\/li>/g)) {
    const icon = (m[1].match(/data-src="[^"]*\/icon-([a-z]+)[^"]*"/) || [])[1] || "";
    const txt = oneLine(m[1].replace(/<a[^>]*js-open-popup[^>]*>[\s\S]*?<\/a>/g, "")).replace(/\s+\.$/, ".");
    if (!txt) continue;
    if (icon === "ml") {
      const sz = txt.match(/^([\d.,]+\s*(?:mL|ml|g|gr|τεμ\.?|τεμάχια|x\s*[\d.,]+\s*ml)(?:\s*(?:\/|και|&|-)\s*[\d.,]+\s*(?:mL|ml|g))*)\s*[-–]?\s*(.*)$/i);
      const amp = txt.match(/^([\d.,]+)\s*mL\s+ανά αμπούλα\s*[-–]?\s*(.*)$/i);
      if (amp) { d.size = `αμπούλες × ${amp[1]}ml`; d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; if (amp[2]) d.attributes["Τύπος"] = amp[2].replace(/\.$/, ""); }
      else if (sz) { d.size = sz[1].replace(/\s*mL/gi, "ml").replace(/\s+/g, " ").replace(/(\d) (ml|g)/g, "$1$2"); d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; if (sz[2]) d.attributes["Τύπος"] = sz[2].replace(/\.$/, ""); }
      else d.attributes["Τύπος"] = txt.replace(/\.$/, "");
    } else if (icon === "sun" && /^SPF|UV[AB]/.test(txt)) d.attributes["Αντηλιακή προστασία"] = txt.replace(/\.$/, "");
    else if (icon === "human") d.tabs["Κατάλληλο για"] = txt;
    else if (icon === "heart") d.tabs["Ενδείξεις"] = txt;
    else if (icon === "ingredients") d.tabs["Βασικά συστατικά"] = txt.replace(/\s*Σύνθεση Προϊόντος\s*$/, "");
    else d.tabs["Χαρακτηριστικά"] = [d.tabs["Χαρακτηριστικά"], txt].filter(Boolean).join("\n");
    d.keyFacts.push(txt);
  }
  // modals
  for (const m of html.matchAll(/<h3 id="mysite-modal-[^"]+-title">([\s\S]*?)<\/h3>\s*<div class="mysite-modal__content">([\s\S]*?)<\/div><\/div><\/div>/g)) {
    const t = oneLine(m[1]); const body = toLines(m[2]).join("\n"); if (!body) continue;
    const k = /INCI|Σύνθεση/i.test(t) ? "Συστατικά" : /Προφυλ|Προσοχ/i.test(t) ? "Προφυλάξεις" : /Χρήση|Χρήσης|Οδηγίες/i.test(t) ? "Χρήση" : null;
    if (!k) continue;   // π.χ. δοκιμαστικό modal «Pele Title»
    d.tabs[k] = [d.tabs[k], body].filter(Boolean).join("\n");
  }
  // σύντομη περιγραφή → + ενδείξεις/χαρακτηριστικά
  if ((d.description || "").length < 120) d.description = [d.description, d.tabs["Ενδείξεις"], d.tabs["Χαρακτηριστικά"]].filter(Boolean).join("\n") || null;
  const cats = (p.categories || []).map(c => decodeAll(c.name));
  d.category = cats[0] || null; d.categories = cats;
  if (/MEDICAL DEVICE|Ιατροτεχνολογικ/i.test(p.name + " " + (d.description || ""))) d.attributes["Κατηγορία"] = "Ιατροτεχνολογικό προϊόν";
  // εικόνες: η 1η του Store API είναι συνήθως η κύρια (packshot/υφή)
  for (const im of p.images || []) { const u = String(im.src || "").split("?")[0]; if (u && !d.images.includes(u)) d.images.push(u); }
  d.handle = p.slug;
  d.imageLarge = d.images[0] || null;
  d.gtin = `IS-${p.slug.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

async function main() {
  const all = [];
  for (let pg = 1; pg < 10; pg++) { const a = JSON.parse(await fetchText(`${BASE}/wp-json/wc/store/v1/products?per_page=100&page=${pg}`)); all.push(...a); if (a.length < 100) break; }
  console.log(`isdin.gr: ${all.length} προϊόντα`);
  const out = []; let err = 0;
  for (const p of all) {
    const name = decodeAll(p.name);
    if (/\bset\b|σετ|δώρο|gift|promo|kit\b/i.test(name)) { console.log(`  - σετ/promo, εκτός: ${name}`); continue; }
    if (/^CC\+ CREAMS$/i.test(name)) { console.log(`  - σελίδα οικογένειας (οι αποχρώσεις υπάρχουν χωριστά), εκτός: ${name}`); continue; }
    let html = null;
    try { html = await fetchText(p.permalink); } catch (e) { err++; console.log(`  ! ${p.permalink}: ${e.message}`); continue; }
    await sleep(DELAY_MS);
    const d = extractIsdinDetails(p, html);
    out.push({ url: p.permalink, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: null, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`  ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(60)} ${(d.size || "-").padEnd(12)} ${d.gtin.padEnd(28)} | ${d.title}`);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
