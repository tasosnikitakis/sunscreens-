#!/usr/bin/env node
// scripts/scrape-froika.mjs
// Froika (ελληνική εταιρία) = froika.com — WordPress + WooCommerce + Elementor, ελληνικά (/en/ = αγγλικά, εκτός), SKU = EAN.
// Το Store API είναι κλειστό (403) → λίστα από /product-sitemap.xml (μόνο /product/…, όχι /en/product/…).
// Σελίδα (samples/froika-sample.html): h1.product_title, .woocommerce-product-details__short-description (h5 υπότιτλος,
//   κείμενο, «Διαθέσιμο μέγεθος:»), .product_meta .sku (EAN), κατηγορίες (σειρά = «Σειρές προϊόντων › …»),
//   tabs WooCommerce: ΕΝΔΕΙΞΕΙΣ / ΙΔΙΟΤΗΤΕΣ / ΣΥΝΘΕΣΗ (ενεργά) / ΣΥΣΤΑΤΙΚΑ (INCI) / ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ / ΠΡΟΦΥΛΑΞΕΙΣ,
//   εικόνα og:image / woocommerce-product-gallery· variable products: data-product_variations (sku + μέγεθος + εικόνα).
// ΕΚΤΟΣ: σετ / promo / δώρα.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-froika.mjs [--limit=5] [--delay=800]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/froika-site.json");
const BASE = "https://froika.com";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "800"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<noscript[\s\S]*?<\/noscript>/gi, "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
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
const TAB = [[/ΕΝΔΕΙΞ/i, "Ενδείξεις"], [/ΙΔΙΟΤΗΤ|ΔΡΑΣΗ|ΟΦΕΛ/i, "Οφέλη"], [/ΣΥΝΘΕΣΗ|ΕΝΕΡΓΑ|ΔΡΑΣΤΙΚ/i, "Ενεργά συστατικά"], [/ΣΥΣΤΑΤΙΚ|INGREDIENTS|INCI/i, "Συστατικά"], [/ΟΔΗΓΙΕΣ|ΧΡΗΣΗ|ΕΦΑΡΜΟΓ/i, "Χρήση"], [/ΠΡΟΦΥΛΑΞ|ΠΡΟΣΟΧΗ|ΠΡΟΕΙΔΟΠ/i, "Προφυλάξεις"]];
const SET_RE = /\b(set|σετ|promo|kit|κιτ|gift|δώρο|δωρο|bundle|πακέτο|1\s*\+\s*1)\b/i;
const eanOf = s => (String(s || "").match(/\b\d{13}\b/) || [])[0] || null;

export function extractFroikaDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = oneLine((html.match(/<h1 class="product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "") || null;
  const sdHtml = (html.match(/woocommerce-product-details__short-description">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/) || [])[1] || "";
  d.subtitle = oneLine((sdHtml.match(/<h5[^>]*>([\s\S]*?)<\/h5>/) || [])[1] || "") || null;
  let sd = text(sdHtml.replace(/<h5[^>]*>[\s\S]*?<\/h5>/, ""));
  const sz = (sd.match(/Διαθέσιμ\S* μέγεθ\S*\s*:?\s*([^\n]+)/i) || [])[1];
  if (sz) { d.size = sz.trim().replace(/\.$/, ""); sd = sd.replace(/\n?Διαθέσιμ\S* μέγεθ\S*\s*:?[^\n]*/i, "").trim(); }
  if (sd) d.tabs["Περιγραφή"] = sd;
  const skuEan = eanOf((html.match(/<span class="sku">([\s\S]*?)<\/span>/) || [])[1]) || eanOf((html.match(/product:retailer_item_id" content="([^"]+)"/) || [])[1]);
  // tabs
  const titles = Object.fromEntries([...html.matchAll(/<li role="presentation" class="[^"]*" id="tab-title-([^"]+)">\s*<a [^>]*>([\s\S]*?)<\/a>/g)].map(m => [m[1], oneLine(m[2])]));
  for (const m of html.matchAll(/<div class="woocommerce-Tabs-panel woocommerce-Tabs-panel--([^ "]+)[^"]*" id="tab-[^"]+"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="woocommerce-Tabs-panel|<\/div>)/g)) {
    const t = titles[m[1]] || m[1]; const key = (TAB.find(([re]) => re.test(t)) || [])[1] || (t[0] + t.slice(1).toLowerCase());
    const v = text(m[2].replace(/<h2[^>]*>[\s\S]*?<\/h2>/, "")); if (!v) continue;
    d.tabs[key] = [d.tabs[key], v].filter(Boolean).join("\n\n");
  }
  if (d.tabs["Οφέλη"]) d.advantages = d.tabs["Οφέλη"].split("\n").filter(l => l.length > 6);
  for (const l of [...(d.tabs["Οφέλη"] || "").split("\n"), ...sd.split("\n")]) if (/(δεν περιέχει|χωρίς) (parabens|άρωμα|αρώματα)|υποαλλεργικ|μη φαγεσωρογόν|ανθεκτικό στο νερό|δερματολογικά ελεγμένο/i.test(l) && l.length < 100) d.keyFacts.push(l.replace(/\.$/, ""));
  d.keyFacts = [...new Map(d.keyFacts.map(k => [k.toLowerCase(), k])).values()];
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  // κατηγορίες: «Σειρές προϊόντων › X» = σειρά
  const catHtml = (html.match(/<span class="posted_in[^"]*">([\s\S]*?)<\/span><\/span>/) || [])[1] || "";
  const cats = [...catHtml.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({ url: m[1], name: oneLine(m[2]) }));
  d.categories = cats.map(c => c.name); d.category = d.categories.join(" | ") || null;
  d.line = (cats.find(c => /seires-proionton/.test(c.url)) || {}).name || null;
  if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
  if (d.category) d.attributes["Κατηγορίες froika.com"] = d.category;
  d.isSet = SET_RE.test(d.title || "") || cats.some(c => /set|σετ|promo|prosfor|offers|dor/i.test(c.url + " " + c.name));
  // εικόνες: gallery (data-large_image) / og:image
  for (const m of html.matchAll(/data-large_image="([^"]+)"/g)) { const u = decodeAll(m[1]); if (!d.images.includes(u)) d.images.push(u); }
  const og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1]; if (og && !d.images.length) d.images.push(decodeAll(og));
  d.imageLarge = d.images[0] || null;
  // variations
  let pv = []; try { pv = JSON.parse(decodeAll((html.match(/data-product_variations="([^"]*)"/) || [])[1] || "[]")); } catch {}
  if (Array.isArray(pv) && pv.length > 1) {
    for (const v of pv) { const e = eanOf(v.sku); if (!e || d.variants.some(x => x.ean === e)) continue; const size = Object.values(v.attributes || {}).join(" ").replace(/-/g, " ").trim(); d.variants.push({ ean: e, size, packshot: v.image && (v.image.full_src || v.image.url) || null }); }
  }
  if (d.variants.length > 1) { d.sizes = d.variants.map(v => v.size); d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", "); d.gtin = d.variants[0].ean; d.eans = d.variants.map(v => v.ean); }
  else { d.variants = []; d.gtin = skuEan || (pv[0] && eanOf(pv[0].sku)) || null; d.eans = d.gtin ? [d.gtin] : []; d.sizes = d.size ? [d.size] : []; if (d.size) d.attributes["Συσκευασία"] = d.size; }
  d.size = d.size || d.sizes[0] || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = decodeURIComponent(String(url).replace(/\/+$/, "").split("/").pop());
  return d;
}

async function main() {
  const sm = await fetchText(BASE + "/product-sitemap.xml");
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(u => /^https:\/\/froika\.com\/product\/[^/]+\/?$/.test(u)))];
  console.log(`froika.com: ${urls.length} ελληνικές σελίδες προϊόντων`);
  const out = []; let err = 0, sets = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      const html = await fetchText(url);
      const d = extractFroikaDetails(html, url);
      if (!d.title) { err++; console.log(`[${i + 1}/${cap}] χωρίς τίτλο ${url}`); await sleep(DELAY_MS); continue; }
      if (d.isSet) { sets++; console.log(`[${i + 1}/${cap}] set  | ${d.title}`); await sleep(DELAY_MS); continue; }
      if (!d.gtin) { d.gtin = "FR-" + d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 60); d.eans = [d.gtin]; }
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${String(d.eans.length).padStart(2)}sz ${d.gtin.padEnd(14)} ${(d.size || "-").slice(0, 12).padEnd(12)} ${(d.line || "-").slice(0, 18).padEnd(18)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  const seen = new Set(); const kept = [];
  for (const p of out) { const fresh = p.details.eans.filter(e => !seen.has(e)); if (!fresh.length) { console.log(`  διπλό EAN ${p.gtin} → εκτός: ${p.name}`); continue; } fresh.forEach(e => seen.add(e)); kept.push(p); }
  const byName = {}; for (const p of kept) (byName[p.name.toLowerCase()] ||= []).push(p);
  for (const g of Object.values(byName)) if (g.length > 1) for (const p of g) if (p.details.size) p.details.fullTitle = `${p.name} ${p.details.size}`;
  await fs.writeFile(OUT_FILE, JSON.stringify(kept, null, 2), "utf8");
  console.log(`\nDone. products=${kept.length} sets=${sets} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
