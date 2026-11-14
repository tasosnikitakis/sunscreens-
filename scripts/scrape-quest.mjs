#!/usr/bin/env node
// scripts/scrape-quest.mjs
// Quest Vitamins (Quest Vitamins Ltd, Ηνωμένο Βασίλειο) = www.qnutrapharma.com — επίσημο site του ομίλου Quest Nutra Pharma,
// WordPress/WooCommerce, **αγγλικά** (δεν υπάρχει ελληνικό site· το questvitamins.com είναι άλλη, καναδική εταιρία).
// Λίστα: WooCommerce Store API /wp-json/wc/store/v1/products (όνομα, permalink, εικόνες, κατηγορίες, attributes).
// Σελίδα (samples/quest-sample.html): tabs .woocommerce-Tabs-panel--description / --features / --directions /
// --ingredients / --suitable_for + εικόνα «Nutritional Information» (.nii-image). Χωρίς EAN και χωρίς μέγεθος συσκευασίας.
// Κλειδί: "QV-<slug>". Τιμές με js/quest-manual-matches.json. Ελληνική απόδοση: js/quest-translations.json (match-quest.mjs).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-quest.mjs [--limit=5] [--delay=700]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/quest-site.json");
const BASE = "https://www.qnutrapharma.com";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "700"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n").replace(/<\/t[dh]>/gi, " · "))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const RANGE = /Range$|^Q Melt|^Kyolic/i;

export function extractQuestDetails(html, p) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = oneLine(p.name).replace(/\s+/g, " ").trim();
  const panel = k => (html.match(new RegExp(`<div class="woocommerce-Tabs-panel woocommerce-Tabs-panel--${k}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>\\s*(?=<div class="woocommerce-Tabs-panel|<\\/div>)`)) || [])[1];
  const strip = s => String(s || "").replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, "");
  const desc = text(strip(panel("description"))) || text(p.description);
  if (desc) d.tabs["Περιγραφή"] = desc;
  const feat = strip(panel("features"));
  if (feat) { d.advantages = [...feat.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => oneLine(m[1])).filter(Boolean); d.tabs["Οφέλη"] = d.advantages.length ? d.advantages.join("\n") : text(feat); if (!d.tabs["Οφέλη"]) delete d.tabs["Οφέλη"]; }
  const dir = text(strip(panel("directions"))); if (dir) d.tabs["Χρήση"] = dir;
  const ing = text(strip(panel("ingredients"))); if (ing) d.tabs["Συστατικά"] = ing;
  const suit = (p.attributes || []).find(a => /Suitable/i.test(a.name));
  d.keyFacts = suit ? suit.terms.map(t => decodeAll(t.name)) : [...(strip(panel("suitable_for")) || "").matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map(m => oneLine(m[1]));
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  const cats = (p.categories || []).map(c => decodeAll(c.name)).filter(c => !/^(Categories|Health Needs|Product Ranges)$/.test(c));
  d.categories = cats; d.category = cats.join(" | ") || null;
  d.line = cats.find(c => RANGE.test(c)) || null;
  if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
  if (d.category) d.attributes["Κατηγορίες qnutrapharma.com"] = d.category;
  for (const im of p.images || []) { const u = String(im.src || "").split("?")[0]; if (u && !d.images.includes(u)) d.images.push(u); }
  const nii = (html.match(/class="nii-image"[^>]*data-zoom-image="([^"]+)"/) || html.match(/data-zoom-image="([^"]+Nutri[^"]*)"/i) || [])[1];
  if (nii) d.nutritionImage = nii;
  d.imageLarge = d.images[0] || null;
  d.subtitle = oneLine(p.short_description) || null;
  d.description = desc.replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = p.slug;
  const key = String(p.slug).replace(/[^A-Za-z0-9]/g, "").slice(0, 70);
  d.gtin = "QV-" + (key.length >= 4 ? key : key + "item"); d.eans = [d.gtin];
  d.size = null; d.sizes = [];
  return d;
}

// Μεγέθη συσκευασίας της ελληνικής αγοράς (js/quest-sizes.json, από τον τιμοκατάλογο): >1 μέγεθος → variants QV-<slug>V<πλήθος>
export function applySizes(entries, sizes) {
  for (const e of entries) {
    const d = e.details, sz = sizes[d.handle]; if (!Array.isArray(sz) || !sz.length) continue;
    if (sz.length === 1) { d.size = sz[0].size; d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; d.variants = []; d.eans = [d.gtin]; continue; }
    d.variants = sz.map(x => ({ ean: `${d.gtin}V${x.count}`, size: x.size }));
    d.eans = d.variants.map(v => v.ean); d.sizes = sz.map(x => x.size); d.size = d.sizes[0];
    d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", ");
  }
  return entries;
}

async function main() {
  const all = [];
  for (let pg = 1; pg < 10; pg++) { const a = JSON.parse(await fetchText(`${BASE}/wp-json/wc/store/v1/products?per_page=100&page=${pg}`)); all.push(...a); if (a.length < 100) break; }
  console.log(`qnutrapharma.com: ${all.length} προϊόντα`);
  const out = []; let err = 0; const cap = Math.min(all.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const p = all[i]; const url = p.permalink;
    try {
      const html = await fetchText(url);
      const d = extractQuestDetails(html, p);
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.line || "-").slice(0, 22).padEnd(22)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  try { applySizes(out, JSON.parse(await fs.readFile(path.join(ROOT, "js/quest-sizes.json"), "utf8"))); } catch {}
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
