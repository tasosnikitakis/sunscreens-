#!/usr/bin/env node
// scripts/scrape-helenvita.mjs
// Helenvita (Pharmex) = www.helenvita.com, WordPress με custom post type «product» (όχι WooCommerce, χωρίς EAN/τιμές).
// Λίστα: /wp-json/wp/v2/product (187 δημοσιευμένα) + /wp-json/wp/v2/product_category (Προϊόντα › Πρόσωπο › Ακμή, Brands › Acnormal …).
// Σελίδα (samples/helenvita-sample.html):
//   h1.product_title, div.product-ml (μέγεθος: «200ml & 400ml»), περιγραφή στο div.font-light αμέσως μετά το <hr>,
//   tabs #specifications (Προδιαγραφές), #ingredients (Συστατικά), #usage-tips (Χρήση/Συμβουλές),
//   εικόνες .product-images-carousel img (wp-content/uploads).
// Κλειδί (χωρίς EAN): "HV-<slug>". Τα συμπληρώματα διατροφής σημειώνονται (κατηγορία) και εξαιρούνται στο build
// μέσω js/helenvita-exclusions.json — θα μπουν σε ξεχωριστό κατάλογο συμπληρωμάτων.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-helenvita.mjs [--limit=10] [--delay=600]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/helenvita-site.json");
const BASE = "https://www.helenvita.com";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "600"));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(s)).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const fetchJson = async url => JSON.parse(await fetchText(url));
const sizeNorm = s => { const m = String(s || "").replace(/(\d),(\d)/g, "$1.$2").match(/(\d{1,4}(?:\.\d+)?)\s?(ml|gr|g|l|kg)\b/i); return m ? (+m[1]) + m[2].toLowerCase().replace("gr", "g") : null; };

export function extractHelenvitaDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = oneLine((html.match(/<h1 class="product_title">([\s\S]*?)<\/h1>/i) || [])[1] || "") || null;
  const ml = oneLine((html.match(/<div class="product-ml">([\s\S]*?)<\/div>/i) || [])[1] || "");
  if (ml) d.attributes["Μέγεθος"] = ml;
  const desc = (html.match(/<div class="product-ml">[\s\S]*?<\/div>\s*<hr>\s*<div class="font-light[^"]*">([\s\S]*?)<\/div>\s*<div class="product-tabs">/i) ||
                html.match(/<h1 class="product_title">[\s\S]*?<hr>\s*<div class="font-light[^"]*">([\s\S]*?)<\/div>\s*<div class="product-tabs">/i) || [])[1];
  if (desc) d.tabs["Περιγραφή"] = text(desc);
  const NAMES = { specifications: "Χαρακτηριστικά", ingredients: "Συστατικά", "usage-tips": "Χρήση" };
  for (const m of html.matchAll(/<div class="tab-pane[^"]*" id="([\w-]+)"[^>]*>\s*<div class="font-light[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const v = text(m[2]); if (!v) continue;
    d.tabs[NAMES[m[1]] || m[1]] = v;
  }
  // Μερικές σελίδες (κρέμες χεριών) έχουν κενή περιγραφή και το κείμενο στις «Προδιαγραφές» → περιγραφή = οι πρόζες γραμμές
  if (!d.tabs["Περιγραφή"] && d.tabs["Χαρακτηριστικά"]) {
    const prose = d.tabs["Χαρακτηριστικά"].split("\n").filter(l => l.length > 60);
    if (prose.length) { d.tabs["Περιγραφή"] = prose.join("\n"); d.tabs["Χαρακτηριστικά"] = d.tabs["Χαρακτηριστικά"].split("\n").filter(l => l.length <= 60).join("\n"); if (!d.tabs["Χαρακτηριστικά"]) delete d.tabs["Χαρακτηριστικά"]; }
  }
  if (d.tabs["Χαρακτηριστικά"]) d.keyFacts = d.tabs["Χαρακτηριστικά"].split("\n").map(s => s.trim()).filter(Boolean).slice(0, 10);
  if (d.tabs["Συστατικά"] && /aqua|water|glycerin|parfum/i.test(d.tabs["Συστατικά"])) d.inci = d.tabs["Συστατικά"].replace(/\s+/g, " ");
  const car = (html.match(/<div class="product-images-carousel[^"]*">([\s\S]*?)<\/div>\s*<\/div>/i) || [])[1] || "";
  for (const m of car.matchAll(/<img[^>]*src="([^"]+)"/g)) { const u = m[1].split("?")[0]; if (!d.images.includes(u)) d.images.push(u); }
  if (!d.images.length) { const og = (html.match(/property="og:image" content="([^"]+)"/) || [])[1]; if (og) d.images.push(og.split("?")[0]); }
  d.imageLarge = d.images[0] || null;
  d.size = sizeNorm(ml) || sizeNorm(d.title);
  d.sizes = [...new Set((ml.match(/\d{1,4}(?:[.,]\d+)?\s?(?:ml|gr|g|l|kg)\b/gi) || []).map(sizeNorm).filter(Boolean))];
  if (d.sizes.length > 1) d.attributes["Διαθέσιμα μεγέθη"] = ml;
  const first = (d.tabs["Περιγραφή"] || "").split("\n")[0];
  d.subtitle = first && first.length <= 140 ? first.replace(/\.$/, "") : null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  const slug = decodeURIComponent(String(url).replace(/\/+$/, "").split("/").pop());
  const key = slug.replace(/[^A-Za-z0-9]/g, "").slice(0, 80);
  d.gtin = "HV-" + (key.length >= 4 ? key : key + "item");
  d.eans = [d.gtin]; d.handle = slug;
  return d;
}

async function main() {
  const cats = [];
  for (let pg = 1; pg < 5; pg++) { const a = await fetchJson(`${BASE}/wp-json/wp/v2/product_category?per_page=100&page=${pg}&_fields=id,parent,name,slug`).catch(() => []); cats.push(...a); if (a.length < 100) break; }
  const cat = new Map(cats.map(c => [c.id, { ...c, name: decodeAll(c.name) }]));
  const pathOf = id => { const out = []; let c = cat.get(id); while (c) { out.unshift(c.name); c = cat.get(c.parent); } return out; };
  const items = [];
  for (let pg = 1; pg < 10; pg++) { const a = await fetchJson(`${BASE}/wp-json/wp/v2/product?per_page=100&page=${pg}&_fields=id,slug,link,title,product_category`).catch(() => []); items.push(...a); if (a.length < 100) break; }
  const list = items.filter(p => oneLine(p.title?.rendered || "") && /\/product\//.test(p.link));
  console.log(`helenvita: ${items.length} από REST, ${list.length} με τίτλο/σελίδα, ${cats.length} κατηγορίες`);
  const out = []; let err = 0; const cap = Math.min(list.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const it = list[i]; const url = it.link;
    try {
      const html = await fetchText(url);
      const d = extractHelenvitaDetails(html, url);
      if (!d.title) { console.log(`[${i + 1}/${cap}] skip ${url}`); continue; }
      const paths = (it.product_category || []).map(pathOf).filter(p => p.length);
      const prod = paths.filter(p => p[0] !== "Brands").sort((a, b) => b.length - a.length);
      const brandLine = paths.filter(p => p[0] === "Brands" && p.length > 1).map(p => p[1]);
      d.breadcrumbs = prod[0] || paths[0] || [];
      d.category = [...new Set(paths.map(p => p.join(" › ")))].join(" | ") || null;
      d.line = brandLine[0] || null;
      if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
      if (d.category) d.attributes["Κατηγορία helenvita.com"] = d.category;
      if (/Συμπληρώματα Διατροφής/.test(d.category || "")) d.isSupplement = true;
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").padEnd(6)} ${(d.line || "-").padEnd(12)} ${d.isSupplement ? "SUPPL " : ""}| ${d.title.slice(0, 55)}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
