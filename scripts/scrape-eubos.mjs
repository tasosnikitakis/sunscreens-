#!/usr/bin/env node
// scripts/scrape-eubos.mjs
// Eubos Ελλάδα = www.eubos.gr — WordPress (δικό τους theme), post type «product» στο REST (χωρίς content), ελληνικά, χωρίς EAN.
// Λίστα: /wp-json/wp/v2/product (+ product_categories). Σελίδα (samples/eubos-sample.html): .product__category, .product__title,
//   .product__very-short-desc (υπότιτλος), .product__short-desc (περιγραφή + «Οι κύριοι ενεργοί παράγοντες»), .product__extra-field-aroma
//   (μέγεθος), tabs #description (Προδιαγραφές → Χαρακτηριστικά), #usage (Χρήση), #ingredients (Συστατικά), swiper εικόνες.
// Κλειδί: "EU-<slug>". Τιμές με js/eubos-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-eubos.mjs [--delay=800]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/eubos-site.json");
const BASE = "https://www.eubos.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "800"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  for (let t = 0; t < 3; t++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(60000) });
    if (res.status === 429 || res.status >= 500) { await sleep(5000 * (t + 1)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  throw new Error("HTTP retry limit");
}
const div = (html, cls) => (html.match(new RegExp(`<div class="${cls}">([\\s\\S]*?)<\\/div>\\s*(?=<div class="product__|<\\/div>)`)) || [])[1] || "";
const pane = (html, id) => (html.match(new RegExp(`<div class="tab-pane[^"]*" id="${id}"[^>]*>([\\s\\S]*?)<\\/div>\\s*(?=<div class="tab-pane|<\\/div>)`)) || [])[1] || "";
// «UREA 10% FOOT CREAM» → «Urea 10% Foot Cream» (συντομογραφίες κεφαλαία)
const tc = s => s.replace(/[A-Za-z][A-Za-z'’&-]*/g, w => /^(SPF|CC|DS|PH|F|ECTOIN)$/i.test(w) && w.length <= 3 ? w.toUpperCase() : /^ECTOIN$/i.test(w) ? "Ectoin" : w[0].toUpperCase() + w.slice(1).toLowerCase()).replace(/\bMl\b/g, "ml");

export function extractEubosDetails(html, p, catNames) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.rawTitle = oneLine(div(html, "product__title")) || decodeAll(p.title.rendered);
  d.title = tc(d.rawTitle.replace(/\s+\d+\s?ML$/i, ""));
  d.subtitle = oneLine(div(html, "product__very-short-desc")) || null;
  const sd = text(div(html, "product__short-desc").replace(/<p>\s*—\s*/g, "<p>• "));
  // «Οι κύριοι ενεργοί παράγοντες:» + «— …» → Ενεργά συστατικά
  const i = sd.search(/Οι κύριοι ενεργοί|Ενεργ(ά|οί) (συστατικά|παράγοντες)/i);
  if (i > 0) { d.tabs["Περιγραφή"] = sd.slice(0, i).trim(); d.tabs["Ενεργά συστατικά"] = sd.slice(i).split("\n").slice(1).map(l => l.replace(/^•\s*/, "")).join("\n").trim(); }
  else if (sd) d.tabs["Περιγραφή"] = sd;
  // σπασμένες γραμμές από <br> μέσα σε προτάσεις → ενωμένες
  for (const k of ["Περιγραφή", "Ενεργά συστατικά"]) if (d.tabs[k]) d.tabs[k] = d.tabs[k].replace(/([^.:!;\n])\n(?=[α-ωάέήίόύώa-z(])/g, "$1 ");
  if (d.tabs["Ενεργά συστατικά"]) d.advantages = d.tabs["Ενεργά συστατικά"].split("\n").filter(l => l.length > 6);
  const spec = [...pane(html, "description").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => oneLine(m[1])).filter(Boolean);
  if (spec.length) { d.keyFacts = spec; d.tabs["Χαρακτηριστικά"] = spec.join("\n"); } else { const t = text(pane(html, "description")); if (t) d.tabs["Χαρακτηριστικά"] = t; }
  const use = text(pane(html, "usage")); if (use) d.tabs["Χρήση"] = use;
  const inci = oneLine(pane(html, "ingredients")); if (inci) d.tabs["Συστατικά"] = inci;
  const size = oneLine(div(html, "product__extra-field-aroma")) || ((d.rawTitle.match(/(\d+)\s?ML$/i) || [])[1] ? d.rawTitle.match(/(\d+)\s?ML$/i)[1] + " ml" : null);
  const norm = z => z.replace(/(\d)\s*γρ\.?/g, "$1g").replace(/(\d)\s+(ml|g|gr)\b/gi, "$1$2").replace(/gr\b/, "g").trim();
  d.sizes = size ? size.split(/\s*(?:&|,|\bκαι\b)\s*/).map(norm).filter(z => /\d/.test(z)) : [];   // «75ml & 150ml» → δύο μεγέθη
  d.size = d.sizes[0] || null;
  if (d.sizes.length > 1) d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", "); else if (d.size) d.attributes["Συσκευασία"] = d.size;
  d.line = oneLine(div(html, "product__category")) || (catNames.get((p.product_categories || [])[0]) || null);
  if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
  d.categories = (p.product_categories || []).map(id => catNames.get(id)).filter(Boolean); d.category = d.categories.join(" | ") || d.line;
  for (const m of html.matchAll(/<div class="swiper-slide">\s*<img src="([^"]+)"/g)) if (!d.images.includes(m[1])) d.images.push(m[1]);
  if (!d.images.length) { const og = (html.match(/property="og:image" content="([^"]+)"/) || [])[1]; if (og) d.images.push(og); }
  d.imageLarge = d.images[0] || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = decodeURIComponent(p.slug);
  const key = d.handle.replace(/^eubos-/, "").normalize("NFD").replace(/[^A-Za-z0-9]/g, "").slice(0, 60) || String(p.id);
  d.gtin = "EU-" + (key.length >= 4 ? key : key + p.id); d.eans = [d.gtin];
  if (d.sizes.length > 1) { d.variants = d.sizes.map(z => ({ ean: d.gtin + z.replace(/[^0-9]/g, ""), size: z })); d.eans = d.variants.map(v => v.ean); d.gtin = d.eans[0]; }
  return d;
}

async function main() {
  const all = JSON.parse(await fetchText(`${BASE}/wp-json/wp/v2/product?per_page=100&_fields=id,slug,link,title,product_categories`));
  const cats = JSON.parse(await fetchText(`${BASE}/wp-json/wp/v2/product_categories?per_page=100&_fields=id,name`).catch(() => "[]"));
  const catNames = new Map(cats.map(c => [c.id, decodeAll(c.name)]));
  console.log(`eubos.gr: ${all.length} προϊόντα`);
  const out = []; let err = 0;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    try {
      const html = await fetchText(p.link);
      const d = extractEubosDetails(html, p, catNames);
      out.push({ url: p.link, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${all.length}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").padEnd(10)} ${(d.line || "-").slice(0, 16).padEnd(16)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${all.length}] ERR ${p.link} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  const seen = {}; for (const p of out) { if (seen[p.gtin]) { p.gtin = p.details.gtin = p.gtin + "x" + (++seen[p.gtin]); p.details.eans = [p.gtin]; } else seen[p.gtin] = 1; }
  const byName = {}; for (const p of out) (byName[p.name.toLowerCase()] ||= []).push(p);
  for (const g of Object.values(byName)) if (g.length > 1) for (const p of g) if (p.details.size) p.details.fullTitle = `${p.name} ${p.details.size}`;
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
