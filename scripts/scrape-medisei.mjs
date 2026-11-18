#!/usr/bin/env node
// scripts/scrape-medisei.mjs
// Medisei (ελληνική εταιρία/διανομέας: Panthenol Extra, Time Eraser, Summerline, Winter Herbs, X-Med, Kaiser, Dills,
// Medi-Mask, Microbe-End, Primo Test, Dalee …) = www.medisei.gr — PrestaShop (iqit theme).
// Λίστα: 1_el_0_sitemap.xml → «φύλλα» (URLs που δεν είναι πρόθεμα άλλων). ΕΚΤΟΣ: /set-dora/ (κοσμήματα, κεριά, σετ δώρων), βερνίκια νυχιών Dalee,
// σετ/πακέτα (URL ή όνομα «σετ/set»), /content/.
// Σελίδα: JSON-LD Product (όνομα, gtin13 = EAN, sku, brand, category, τιμή, εικόνες) · .product-miligram (συσκευασία) ·
//   .product-extra-attribute (βασικά συστατικά) · .product-extra-list-attribute li (χαρακτηριστικά) ·
//   καρτέλες #description (περιγραφή, «Κύρια Συστατικά:», «Οφέλη:») και #extra-N με ετικέτες «Χρήση» / «Συστατικά»
//   («Προφυλάξεις:» → Προφυλάξεις· «Μεταφορικά» παραλείπεται).
// Κλειδί: το EAN (gtin13) → ακριβές match με τη Medica· αλλιώς "MD-<sku>".
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-medisei.mjs [--delay=1500] [--limit=N]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/medisei-site.json");
const BASE = "https://www.medisei.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "1500"));
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const toLines = h => decodeAll(String(h || "").replace(/<(br|\/?p|\/?div|\/?li|\/?ul|\/?h\d)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "))
  .replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").trim()).filter(Boolean);
const eanOk = s => { if (!/^\d{13}$/.test(s)) return false; const d = s.split("").map(Number); return (10 - d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0) % 10) % 10 === d[12]; };
const EXCLUDE_URL = /\/(set-dora|content)\/|\/set-|\/σετ-/i;
const EXCLUDE_NAME = /\bσετ\b|\bset\b|\bπακέτο\b|δώρο|gift/i;
const EXCLUDE_POLISH = /Gel Effect|Top Coat/i;   // βερνίκια νυχιών Dalee: εκτός καταλόγου (απόφαση χρήστη)

export function extractMediseiDetails(url, raw) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const html = String(raw || "");
  let ld = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); if (j && j["@type"] === "Product") { ld = j; break; } } catch {}
  }
  ld = ld || {};
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "");
  d.title = decodeAll(ld.name || toLines((body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]).join(" ")).trim();
  d.brand = decodeAll((ld.brand && ld.brand.name) || "").trim() || null;
  d.category = decodeAll(ld.category || "").trim() || null;
  d.sku = String(ld.sku || "").trim() || null;
  const gtin = String(ld.gtin13 || (ld.offers && ld.offers.gtin13) || "").trim();
  d.ean = eanOk(gtin) ? gtin : null;
  const price = parseFloat((ld.offers && ld.offers.price) || "");
  if (price > 0) d.retailPrice = price;
  d.subtitle = decodeAll(ld.description || "").trim() || null;
  const size = toLines((body.match(/<div class="product-miligram">([\s\S]*?)<\/div>/) || [])[1]).join(" ");
  if (size) { d.size = size.replace(/\s+/g, ""); d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; } else d.sizes = [];
  const actives = [...body.matchAll(/<div class="product-extra-attribute">([\s\S]*?)<\/div>/g)].map(m => toLines(m[1]).join(" ")).filter(Boolean);
  if (actives.length) d.attributes["Βασικά συστατικά"] = actives.join(" · ");   // ΚΕΦΑΛΑΙΑ όπως στο site (χωρίς τόνους)
  d.keyFacts = [...(body.match(/<ul class="product-extra-list-attribute">([\s\S]*?)<\/ul>/) || ["", ""])[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => toLines(m[1]).join(" ")).filter(Boolean);
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  // καρτέλες
  const labels = Object.fromEntries([...body.matchAll(/<a[^>]*href="#((?:description|extra-\d+))"[^>]*>([^<]+)<\/a>/g)].map(m => [m[1], decodeAll(m[2]).trim()]));
  const paneOf = id => { const i = body.indexOf(`id="${id}"`); if (i < 0) return ""; const j = body.indexOf('class="rte-content"', i); if (j < 0) return ""; const s = body.indexOf(">", j) + 1; let depth = 1, k = s; const re = /<(\/?)div\b[^>]*>/g; re.lastIndex = s; let m; while ((m = re.exec(body))) { depth += m[1] ? -1 : 1; if (depth === 0) { k = m.index; break; } } return body.slice(s, k); };
  // περιγραφή: χωρίς τον τίτλο h2· «Κύρια Συστατικά:» / «Οφέλη:» → ενότητες
  let key = null; const desc = [];
  for (const l of toLines(paneOf("description").replace(/<h2[\s\S]*?<\/h2>/, ""))) {
    const h = l.match(/^(Κύρια Συστατικά|Βασικά Συστατικά|Δραστικά Συστατικά|Οφέλη|Ενδείξεις|Χαρακτηριστικά|Πλεονεκτήματα)\s*:?\s*(.*)$/i);
    if (h) { key = /Συστατικ/i.test(h[1]) ? "Βασικά συστατικά" : /Ενδείξ/i.test(h[1]) ? "Ενδείξεις" : "Οφέλη"; if (h[2]) d.tabs[key] = [d.tabs[key], h[2]].filter(Boolean).join("\n"); continue; }
    if (key) d.tabs[key] = [d.tabs[key], l].filter(Boolean).join("\n"); else desc.push(l);
  }
  d.description = desc.join("\n") || d.subtitle || null;
  for (const [id, label] of Object.entries(labels)) {
    if (id === "description" || /Μεταφορικ|Αποστολ/i.test(label)) continue;
    const k = /Χρήση|Οδηγίες|Δοσολογ/i.test(label) ? "Χρήση" : /Συστατικ|Σύνθεση/i.test(label) ? "Συστατικά" : label;
    for (const l of toLines(paneOf(id))) {
      const pr = l.match(/^(Προφυλάξεις|Προσοχή|Αντενδείξεις)\s*:\s*(.*)$/i);
      if (pr) { d.tabs["Προφυλάξεις"] = [d.tabs["Προφυλάξεις"], pr[2]].filter(Boolean).join("\n"); continue; }
      d.tabs[k] = [d.tabs[k], l].filter(Boolean).join("\n");
    }
  }
  if (d.brand) { d.line = d.brand; d.series = d.brand; d.attributes["Μάρκα"] = d.brand; }
  if (d.category) d.attributes["Κατηγορία medisei.gr"] = d.category;
  const imgs = [].concat((ld.offers && ld.offers.image) || [], ld.image || []).map(u => decodeAll(String(u)).replace(/-(home|large|medium|small)_default\//, "-thickbox_default/"));
  for (const u of imgs) if (u && !d.images.includes(u)) d.images.push(u);
  d.handle = decodeURIComponent(url.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop());
  d.imageLarge = d.images[0] || null;
  d.gtin = d.ean || `MD-${(d.sku || d.handle).replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  d.isMedicine = /Φαρμακευτικό προϊόν|ΜΗ\.?ΣΥ\.?ΦΑ|Συνταγογραφούμενο/i.test(decodeAll(body.replace(/<[^>]+>/g, " ")));
  return d;
}

async function main() {
  const sm = await fetchText(`${BASE}/1_el_0_sitemap.xml`);
  const locs = [...sm.matchAll(/<loc><!\[CDATA\[([^\]]+)\]\]><\/loc>/g)].map(m => m[1].trim());
  const paths = locs.map(u => decodeURIComponent(u).replace(/\/+$/, "")).filter(u => /\/el\/[^/]+\/[^/]+/.test(u));
  const leaves = paths.filter(u => !paths.some(o => o.startsWith(u + "/")));
  const list = leaves.filter(u => !EXCLUDE_URL.test(u.replace(BASE, "")));
  console.log(`medisei.gr: ${locs.length} URLs, ${leaves.length} προϊόντα, ${list.length} μετά τον αποκλεισμό σετ/δώρων`);
  const out = []; let err = 0, n = 0; const skipped = [];
  for (const u of list) {
    if (n++ >= LIMIT) break;
    let html = null;
    try { html = await fetchText(encodeURI(u)); } catch (e) { err++; console.log(`  ! ${u}: ${e.message}`); continue; }
    await sleep(DELAY_MS);
    const d = extractMediseiDetails(u, html);
    if (!d.title || (!d.ean && !d.sku)) { skipped.push(`χωρίς προϊόν (σελίδα κατηγορίας): ${u}`); continue; }
    if (EXCLUDE_NAME.test(d.title)) { skipped.push(`σετ/δώρο: ${d.title}`); continue; }
    if (/Dalee/i.test(d.brand || "") && EXCLUDE_POLISH.test(d.title)) { skipped.push(`βερνίκι νυχιών: ${d.title}`); continue; }
    if (d.isMedicine) { skipped.push(`φάρμακο: ${d.title}`); continue; }
    if (out.some(o => o.gtin === d.gtin)) { skipped.push(`διπλό ${d.gtin}: ${d.title}`); continue; }
    out.push({ url: u, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`  ${d.images.length ? "img+" : "img-"} ${(d.ean ? "EAN" : "---")} ${(d.brand || "-").padEnd(16)} ${(d.size || "-").padEnd(8)} ${String(d.gtin).padEnd(14)} | ${d.title}`);
  }
  console.log(`\nΕκτός (${skipped.length}):\n  ` + skipped.join("\n  "));
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
