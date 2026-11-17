#!/usr/bin/env node
// scripts/scrape-hydrovit.mjs
// Hydrovit (Target Pharma, ελληνική εταιρία) = targetpharma.gr — WordPress + WooCommerce (BeTheme), ελληνικά, χωρίς EAN/SKU.
// Ο διανομέας έχει και άλλες μάρκες/φάρμακα· κρατάμε μόνο την κατηγορία HYDROVIT και τα «HYDROVIT Intimcare Colpo-…»
// της κατηγορίας «Ιατροτεχνολογικά προϊόντα - Ενδοκολπική φροντίδα» (όχι φάρμακα).
// Λίστα + βασικά: WooCommerce Store API /wp-json/wc/store/v1/products (όνομα, permalink, short_description, εικόνες).
// Σελίδα: <div class="ml">50ml</div> (μέγεθος), accordion .question > .title / .answer:
//   «ΛΟΓΩ ΤΟΥ ΣΥΝΔΥΑΣΜΟΥ … ΠΡΟΤΕΙΝΕΤΑΙ» (→ Οφέλη), «Συστατικά» (κύρια + πλήρης INCI), «ΠΡΟΦΥΛΑΞΕΙΣ», «ΤΡΟΠΟΙ ΧΡΗΣΗΣ» (→ Χρήση)·
//   .characteristics: εικονίδια με τίτλο + κείμενο (→ Χαρακτηριστικά).
// Κλειδί: "HY-<όνομα>". Τιμές με js/hydrovit-manual-matches.json (barcode Medica → κλειδί).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-hydrovit.mjs [--limit=5] [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/hydrovit-site.json");
const BASE = "https://targetpharma.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "1000"));
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const isHydrovit = p => (p.categories || []).some(c => c.slug === "hydrovit") || /^HYDROVIT\b/i.test(decodeAll(p.name));
export const IS_OFFER = p => /promo|offer|gift|δώρο|\s\+\s|\bset\b|\bpack\b/i.test(decodeAll(p.name));

// Τα blocks του accordion: <div class="question"><div class="title">…</div><div class="answer">…</div></div>
function accordion(html) {
  const out = [];
  const parts = html.split(/<div class="question">/).slice(1);
  for (const part of parts) {
    const t = part.match(/<div class="title">([\s\S]*?)<\/div>/); if (!t) continue;
    const title = oneLine(t[1].replace(/<i[^>]*><\/i>/g, "")).replace(/\s*\d+$/, "");
    const a = part.indexOf('<div class="answer">'); if (a < 0) continue;
    out.push({ title, html: part.slice(a + 20) });
  }
  return out;
}

export function extractHydrovitDetails(p, html) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  html = html || "";
  d.title = decodeAll(p.name).replace(/^HYDROVIT\s+/i, "").replace(/\s+/g, " ").trim();
  d.size = oneLine((html.match(/<div class="ml">([\s\S]*?)<\/div>/) || [])[1] || "") || null;
  if (d.size) {
    d.size = d.size.replace(/\s+/g, " ").replace(/(\d)\s?gr\b/i, "$1g");
    const v = d.size.match(/^\D{4,}?(\d+\s?(ml|g))\b/i);   // «Σωληνάριο των 20ml με ρύγχος» → 20ml (+ περιγραφή συσκευασίας)
    if (v) { d.attributes["Περιέκτης"] = d.size; d.size = v[1].replace(/\s/g, ""); }
    d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size;
  } else d.sizes = [];
  const short = text(String(p.short_description || "").replace(/<p>\s*&nbsp;\s*<\/p>/g, ""));
  d.description = short.replace(/\s+/g, " ").trim() || null;
  d.subtitle = null;
  // accordion → ενότητες (χωρίς τις «Αξιολογήσεις»· το τελευταίο answer κόβεται πριν το disclaimer)
  const cut = h => h.split(/<div class="indication">|<div class="new_content"|<footer|id="Footer"/)[0];
  const acc = html.indexOf('class="accordion"');
  for (const { title, html: h } of accordion(acc < 0 ? "" : cut(html.slice(acc)))) {
    if (/Αξιολογ/i.test(title)) continue;
    let v = text(cut(h).replace(/<h3[^>]*class="ea-header"[\s\S]*?<\/h3>/g, "").replace(/<h3>\s*Συστατικά\s*<\/h3>/i, "").replace(/<p>\s*&nbsp;\s*<\/p>/g, ""));
    v = v.replace(/Διαβάστε Περισσότερα/g, "").replace(/\n{2,}/g, "\n").trim();
    if (!v) continue;
    const key = /ΠΡΟΤΕΙΝΕΤΑΙ|ΣΥΝΔΥΑΣΜΟΥ/i.test(title) ? "Οφέλη" : /Συστατικ/i.test(title) ? "Συστατικά" : /ΧΡΗΣΗ/i.test(title) ? "Χρήση" : /ΠΡΟΦΥΛΑΞ|ΠΡΟΕΙΔΟΠ/i.test(title) ? "Προφυλάξεις" : title[0] + title.slice(1).toLowerCase();
    d.tabs[key] = [d.tabs[key], v].filter(Boolean).join("\n\n");
  }
  // «ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ»: ζεύγη τίτλος (κεφαλαία) + κείμενο
  const ch = (html.match(/<div class="characteristics[^"]*">([\s\S]*?)(?:<div class="blog|ΙΣΤΟΡΙΕΣ ΑΠΟ ΤΟ BLOG|<section class="related)/) || [])[1] || "";
  const facts = [];
  // HTML με ανοιχτά divs → ανά στήλη: τίτλος = ως το div «text», κείμενο = υπόλοιπο της στήλης
  for (const col of ch.split(/<div class="column one-fourth">/).slice(1)) {
    const ti = col.search(/<div class="wpb_text_column wpb_content_element\s+title/); if (ti < 0) continue;
    const xi = col.search(/<div class="wpb_text_column wpb_content_element\s+text/);
    const t = oneLine(xi > ti ? col.slice(ti, xi) : col.slice(ti));
    const body = xi > ti ? oneLine(col.slice(xi)) : "";
    if (!t) continue;
    d.keyFacts.push(t);   // κεφαλαία όπως στο site (σωστή ορθογραφία χωρίς τόνους)
    facts.push(body ? `${t}: ${body}` : t);
  }
  if (facts.length) d.tabs["Χαρακτηριστικά"] = facts.join("\n");
  const cats = (p.categories || []).map(c => decodeAll(c.name));
  d.categories = cats; d.category = cats.join(" | ") || null;
  const n = d.title;
  d.line = /^Anti-Acne/i.test(n) ? "Anti-Acne" : /^Baby/i.test(n) ? "Baby" : /Sun|SPF/i.test(n) ? "Sun" : /Intim|Colpo/i.test(n) ? "Intimcare" : null;
  if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
  for (const im of p.images || []) { const u = String(im.src || "").split("?")[0]; if (u && !d.images.includes(u)) d.images.push(u); }
  d.handle = decodeURIComponent(String(p.permalink).replace(/\/+$/, "").split("/").pop());
  const slug = n.replace(/&/g, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 60).toLowerCase() || d.handle.replace(/[^A-Za-z0-9]/g, "");
  d.imageLarge = d.images[0] || null;
  d.gtin = `HY-${slug}`;
  d.eans = [d.gtin];
  d.shortDescription = null;   // η σύντομη περιγραφή του WooCommerce είναι ήδη η description
  return d;
}

async function main() {
  const all = [];
  for (let pg = 1; pg < 10; pg++) { const a = JSON.parse(await fetchText(`${BASE}/wp-json/wc/store/v1/products?per_page=100&page=${pg}`)); all.push(...a); if (a.length < 100) break; }
  const hv = all.filter(isHydrovit);
  const list = hv.filter(p => !IS_OFFER(p));
  console.log(`targetpharma.gr: ${all.length} εγγραφές, ${hv.length} Hydrovit, ${list.length} βασικά (εκτός ${hv.length - list.length} promo/σετ)`);
  const out = []; let err = 0; const cap = Math.min(list.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const p = list[i]; let html = null;
    try { html = await fetchText(p.permalink); } catch (e) { err++; console.log(`  ! ${p.permalink}: ${e.message}`); }
    const d = extractHydrovitDetails(p, html);
    out.push({ url: p.permalink, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(46)} ${(d.size || "-").padEnd(8)} | ${d.title}`);
    await sleep(DELAY_MS);
  }
  const seen = {}; for (const p of out) { if (seen[p.gtin]) { p.gtin = p.details.gtin = p.gtin + "x" + (++seen[p.gtin]); p.details.eans = [p.gtin]; } else seen[p.gtin] = 1; }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
