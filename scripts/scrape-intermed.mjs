#!/usr/bin/env node
// scripts/scrape-intermed.mjs
// intermed.com.gr (Rails, eproductions). Χωρίς JSON-LD/EAN. Δομή σελίδας προϊόντος (samples/intermed-sample.html):
//   <ul class='breadcrumb'> <li>Λοιπά Προϊόντα</li><li>Δερμοκαλλυντική Φροντίδα</li><li>Σώμα</li><li><a>Εντομοαπωθητική φροντίδα</a></li><li>Όνομα</li>
//   <div class='product-details'> <h3>Τίτλος</h3> <div class='subtitle'>…</div>
//   <ul class='product-tabs'> <li><a href="#tab1">Περιγραφή</a></li> … (Ενδείξεις, Οδηγίες χρήσης, Σύνθεση, Σχετικά άρθρα)
//   <div class='tab-content'> <div class='tab-pane' id='tab1'>…</div> …
//   Εικόνες: /system/uploads/image/image/<id>/<file>.png (στήλη col-sm-5 + thumbnails)
// Brand (σειρά): οι σελίδες /el/brands/<slug> απαριθμούν τα προϊόντα τους → χάρτης προϊόν → brand.
// Λίστα προϊόντων: sitemap.xml.gz (http://intermed.com.gr/products/<slug> → https://intermed.com.gr/el/products/<slug>).
// Κλειδί προϊόντος (χωρίς EAN): "IM-<slug>". Οι τιμές/barcodes μπαίνουν από τον τιμοκατάλογο με manual matches.
//
// Χρήση (cloud: NODE_USE_ENV_PROXY=1):  node scripts/scrape-intermed.mjs [--limit=20] [--delay=800]

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/intermed-site.json");
const BASE = "https://intermed.com.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "800"));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(s)).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();

async function fetchBuf(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
const fetchText = async url => (await fetchBuf(url)).toString("utf8");
const sizeOf = s => { const m = String(s || "").match(/(\d{1,4}(?:[.,]\d+)?)\s?(ml|gr|g|kg|l|lt|τμχ|τεμ\.?|caps|tabs|δισκία|κάψουλες|φακελάκια|sachets|amp)\b/i); return m ? (m[1].replace(",", ".") + " " + m[2].toLowerCase()).replace(/\s(ml|g|gr|l|lt|kg)$/, (x, u) => ({ gr: "g", lt: "l" }[u] || u)).replace(/^(\S+) (ml|g|l|kg)$/, "$1$2") : null; };

export function extractIntermedDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const bc = html.match(/<ul class='breadcrumb'>([\s\S]*?)<\/ul>/i);
  if (bc) d.breadcrumbs = [...bc[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => oneLine(m[1])).filter(Boolean);
  const det = html.match(/<div class='product-details'>([\s\S]*?)<ul class='product-tabs'>/i);
  d.title = det ? oneLine((det[1].match(/<h3>([\s\S]*?)<\/h3>/i) || [])[1] || "") : null;
  d.subtitle = det ? oneLine((det[1].match(/<div class='subtitle'>([\s\S]*?)<\/div>/i) || [])[1] || "") || null : null;
  d.fullTitle = d.title;
  const crumbs = (d.breadcrumbs || []).slice(0, -1);   // χωρίς το ίδιο το προϊόν
  d.category = crumbs.join(" › ") || null;
  d.rootCategory = crumbs[0] || null;
  d.line = crumbs[crumbs.length - 1] || null;
  // Tabs: ονόματα από product-tabs, περιεχόμενο από tab-pane με το ίδιο id
  const names = {}; for (const m of html.matchAll(/<a data-toggle="tab" href="#(tab\d+)">([\s\S]*?)<\/a>/g)) names[m[1]] = oneLine(m[2]);
  for (const m of html.matchAll(/<div class='tab-pane[^']*' id='(tab\d+)'>([\s\S]*?)<\/div>\s*(?=<div class='tab-pane|<\/div>\s*<\/div>)/g)) {
    const name = names[m[1]]; if (!name || /Σχετικά άρθρα/i.test(name)) continue;
    const body = text(m[2]); if (body) d.tabs[name === "Ενδείξεις" ? "Οφέλη" : name] = body;
  }
  // Εικόνες (στήλη + thumbnails), πρωτότυπα αρχεία (χωρίς medium_/thumb_)
  for (const m of html.matchAll(/src="(\/system\/uploads\/image\/image\/[^"]+)"/g)) { const u = BASE + m[1].replace(/\/(medium|thumb|small|large)_/, "/"); if (!d.images.includes(u)) d.images.push(u); }
  d.imageLarge = d.images[0] || null;
  const desc = d.tabs["Περιγραφή"] || "";
  const pack = (desc.match(/Συσκευασί[αες]+\s*:?\s*([^\n]+)/i) || [])[1];
  if (pack) d.attributes["Συσκευασία"] = oneLine(pack);
  d.size = sizeOf(pack || d.title || desc) || null;
  d.sizes = d.size ? [d.size] : [];
  d.advantages = (d.tabs["Οφέλη"] || "").split("\n").map(s => s.trim()).filter(Boolean).slice(0, 8);
  d.description = desc.replace(/Συσκευασί[αες]+\s*:?[^\n]*/gi, "").replace(/\s+/g, " ").trim() || d.subtitle || null;
  d.shortDescription = d.subtitle || (d.description || "").split(/(?<=\.)\s/)[0] || null;
  if (d.category) d.attributes["Κατηγορία intermed.com.gr"] = d.category;
  const slug = String(url).replace(/\/+$/, "").split("/").pop();
  d.gtin = "IM-" + slug.replace(/[^A-Za-z0-9]/g, "").slice(0, 80);
  d.eans = [d.gtin];
  d.handle = slug;
  return d;
}

async function main() {
  console.log("intermed: sitemap…");
  const sm = zlib.gunzipSync(await fetchBuf(BASE + "/sitemap.xml.gz")).toString("utf8");
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const products = [...new Set(locs.filter(u => /\/products\/[^/]+$/.test(u)).map(u => BASE + "/el/products/" + u.split("/").pop()))];
  const brands = [...new Set(locs.filter(u => /\/brands\/[^/]+$/.test(u)).map(u => BASE + "/el/brands/" + u.split("/").pop()))];
  console.log(`${products.length} προϊόντα, ${brands.length} brands. Χάρτης προϊόν → brand…`);
  const brandOf = new Map();
  for (const b of brands) {
    try {
      const h = await fetchText(b);
      const name = oneLine((h.match(/<title>([^<|]+)/) || [])[1] || b.split("/").pop());
      for (const m of h.matchAll(/href="\/el\/products\/([^"#?]+)"/g)) if (!brandOf.has(m[1])) brandOf.set(m[1], name);
    } catch (e) { console.log(`  ! ${b}: ${e.message}`); }
    await sleep(300);
  }
  console.log(`  ${brandOf.size} προϊόντα με brand.\n`);
  const out = []; let err = 0;
  const cap = Math.min(products.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = products[i];
    try {
      const html = await fetchText(url);
      const d = extractIntermedDetails(html, url);
      if (!d.title) { console.log(`[${i + 1}/${cap}] skip (χωρίς τίτλο) ${url}`); continue; }
      const brand = brandOf.get(d.handle) || null;
      if (brand) { d.brand = brand; d.attributes["Brand"] = brand; }
      const e = { url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin };
      out.push(e);
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(brand || "-").slice(0, 16).padEnd(16)} ${d.rootCategory || "-"} | ${d.title.slice(0, 50)}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    if (out.length % 25 === 0) await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
