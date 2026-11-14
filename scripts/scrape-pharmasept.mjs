#!/usr/bin/env node
// scripts/scrape-pharmasept.mjs
// Pharmasept (ελληνική εταιρία) = pharmasept.gr/el — WordPress + WooCommerce + Elementor, ελληνικά, χωρίς EAN/SKU.
// Λίστα + βασικά: WooCommerce Store API /wp-json/wc/store/v1/products (όνομα, permalink, description, short_description,
//   εικόνες, κατηγορίες, attribute «Μέγεθος» με variations). ΕΚΤΟΣ: προσφορές / promo / gift sets / mini essentials / «A + B».
// Σελίδα (samples/pharmasept-sample.html): accordion Elementor (.elementor-tab-title → .elementor-tab-content):
//   «Περιγραφή» (δράσεις με τίτλους → Οφέλη), «Οδηγίες χρήσης» (→ Χρήση), «Συστατικά», «Προσοχή» (→ Προφυλάξεις)·
//   data-product_variations: εικόνα ανά μέγεθος.
// Κλειδί: "PS-<slug>" (απλό) ή "PS-<slug><μέγεθος>" ανά μέγεθος. Τιμές με js/pharmasept-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-pharmasept.mjs [--limit=5] [--delay=800]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/pharmasept-site.json");
const BASE = "https://pharmasept.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "800"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
export const IS_OFFER = p => (p.categories || []).some(c => /Προσφορές/i.test(decodeAll(c.name)))
  || /promo|offer|gift|mini essentials|\bpack\b|\s\+\s|\bx\s?2\b/i.test(decodeAll(p.name))
  || /\d+\s?(ml|l|lt)\s*&/i.test(decodeAll(p.name));   // «Kids Soft Hair Shampoo 400ml & … Conditioner» = διπλό πακέτο
const sizeKey = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function extractPharmaseptDetails(p, html) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = decodeAll(p.name).replace(/Ι(?=ntense)/g, "I").replace(/\s+/g, " ").trim();   // «Ιntense» με ελληνικό Ι
  const desc = text(p.description);
  if (desc) d.tabs["Περιγραφή"] = desc;
  d.subtitle = oneLine(p.short_description) || null;
  for (const m of (html || "").matchAll(/<a class="elementor-accordion-title"[^>]*>([\s\S]*?)<\/a>\s*<\/div>\s*<div id="elementor-tab-content-\d+" class="elementor-tab-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const k = oneLine(m[1]); const v = text(m[2].replace(/<p>\s*&nbsp;\s*<\/p>/g, "")); if (!k || !v) continue;
    const key = /^Περιγραφή/i.test(k) ? "Οφέλη" : /Οδηγίες|Χρήση/i.test(k) ? "Χρήση" : /Συστατικά/i.test(k) ? "Συστατικά" : /Προσοχή|Προφυλάξ|Προειδοπ/i.test(k) ? "Προφυλάξεις" : k;
    d.tabs[key] = [d.tabs[key], v].filter(Boolean).join("\n\n");
  }
  // «0% SULFATES, …», «ΔΕΡΜΑΤΟΛΟΓΙΚΑ ΕΛΕΓΜΕΝΟ…» μέσα στα οφέλη → χαρακτηριστικά
  if (d.tabs["Οφέλη"]) {
    const keep = [];
    for (const l of d.tabs["Οφέλη"].split("\n")) {
      if (/^0\s?%/.test(l) && l.length < 160) d.keyFacts.push("Χωρίς: " + l.replace(/^0\s?%\s*/, "").toLowerCase());
      else if (/^ΔΕΡΜΑΤΟΛΟΓΙΚΑ ΕΛΕΓΜΕΝΟ|^ΚΛΙΝΙΚΑ ΕΛΕΓΜΕΝΟ|^ΚΑΤΑΛΛΗΛΟ/i.test(l) && l.length < 120) d.keyFacts.push(l[0] + l.slice(1).toLowerCase());
      else keep.push(l);
    }
    d.tabs["Οφέλη"] = keep.join("\n").trim(); if (!d.tabs["Οφέλη"]) delete d.tabs["Οφέλη"];
  }
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  const cats = (p.categories || []).map(c => decodeAll(c.name)).filter(c => !/^Home - /.test(c));
  d.categories = cats; d.category = cats.join(" | ") || null;
  const LINES = /^(Baby Care|Baby|Kids|Hygienic|Derma Balance|Heliodor|Aid|AID|Flogo|Mama’s|Mama's|Scalp Biome|Bite Free|Lip Treatment|SOS|Antiseptic)/;
  d.line = (d.title.match(LINES) || [])[1] || null; if (d.line) d.line = d.line.replace(/^AID$/, "Aid").replace("Mama's", "Mama’s").replace(/^Baby$/, "Baby Care");
  if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
  if (d.category) d.attributes["Κατηγορίες pharmasept.gr"] = d.category;
  for (const im of p.images || []) { const u = String(im.src || "").split("?")[0]; if (u && !d.images.includes(u)) d.images.push(u); }
  d.handle = decodeURIComponent(String(p.permalink).replace(/\/+$/, "").split("/").pop());
  const slug = d.title.replace(/&/g, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 60).toLowerCase() || d.handle.replace(/[^A-Za-z0-9]/g, "");
  // μεγέθη (variations) με εικόνα ανά μέγεθος από το data-product_variations της σελίδας
  let pv = [];
  try { pv = JSON.parse(decodeAll((html || "").match(/data-product_variations="([^"]*)"/)?.[1] || "[]")); } catch {}
  const sizeAttr = (p.attributes || []).find(a => a.has_variations);
  if (sizeAttr && (p.variations || []).length > 1) {
    for (const v of p.variations) {
      const size = (v.attributes || []).map(a => a.value).join(" ");
      const img = (pv.find(x => Object.values(x.attributes || {}).includes(size)) || {}).image;
      d.variants.push({ ean: `PS-${slug}${sizeKey(size)}`, size: size.replace(/^1000ml$/, "1L"), packshot: img?.full_src || img?.url || null });
    }
    d.sizes = d.variants.map(v => v.size); d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", ");
  } else {
    const t = (sizeAttr || (p.attributes || []).find(a => /Μέγεθος|Συσκευασ/i.test(a.name)));
    const sz = t ? (t.terms || []).map(x => decodeAll(x.name)).join(", ") : null;
    d.sizes = sz ? [sz] : [];
  }
  d.size = d.sizes[0] || null; if (d.size && !d.variants.length) d.attributes["Συσκευασία"] = d.size;
  d.imageLarge = d.images[0] || null;
  d.gtin = d.variants[0] ? d.variants[0].ean : `PS-${slug}`;
  d.eans = d.variants.length ? d.variants.map(v => v.ean) : [d.gtin];
  d.description = desc.replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  return d;
}

async function main() {
  const all = [];
  for (let pg = 1; pg < 10; pg++) { const a = JSON.parse(await fetchText(`${BASE}/wp-json/wc/store/v1/products?per_page=100&page=${pg}`)); all.push(...a); if (a.length < 100) break; }
  const list = all.filter(p => !IS_OFFER(p));
  console.log(`pharmasept.gr: ${all.length} εγγραφές, ${list.length} βασικά προϊόντα (εκτός ${all.length - list.length} προσφορές/promo/σετ)`);
  const out = []; let err = 0; const cap = Math.min(list.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const p = list[i]; let html = null;
    try { html = await fetchText(p.permalink); } catch (e) { err++; console.log(`  ! ${p.permalink}: ${e.message}`); }
    const d = extractPharmaseptDetails(p, html);
    out.push({ url: p.permalink, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${String(d.eans.length).padStart(2)}sz ${(d.size || "-").padEnd(10)} ${(d.line || "-").padEnd(14)} | ${d.title}`);
    await sleep(DELAY_MS);
  }
  // Διπλή σελίδα: «Baby Mild Bath 500ml» (mild-bath-2) = το μέγεθος 500ml της σελίδας «Baby Mild Bath» (500ml/1L)
  for (const p of out) if (p.details.handle === "mild-bath-2" && out.some(o => o.details.handle === "baby-mild-bath")) { p.details.duplicateOf = "baby-mild-bath"; p.gtin = p.details.gtin = "PS-babymildbathpage500"; p.details.eans = [p.gtin]; }
  // Ίδιο όνομα σε δύο σελίδες (Aid Cryo Power Gel 100ml / 250ml): μέγεθος από το όνομα αρχείου της εικόνας
  const byName = {}; for (const p of out) (byName[p.name.toLowerCase()] ||= []).push(p);
  for (const g of Object.values(byName)) if (g.length > 1) for (const p of g) {
    const sz = ((p.details.images[0] || "").split("/").pop().match(/(\d{2,4})\s?(ml|lt)/i) || [])[0];
    if (!sz) continue;
    p.details.size = sz.replace(/lt$/i, "L"); p.details.sizes = [p.details.size]; p.details.attributes["Συσκευασία"] = p.details.size;
    p.details.fullTitle = `${p.name} ${p.details.size}`; p.gtin = p.details.gtin = p.gtin + sz.toLowerCase(); p.details.eans = [p.gtin];
  }
  // ίδιο κλειδί που απέμεινε → αριθμός
  const seen = {}; for (const p of out) { if (seen[p.gtin]) { p.gtin = p.details.gtin = p.gtin + "x" + (++seen[p.gtin]); p.details.eans = [p.gtin]; } else seen[p.gtin] = 1; }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
