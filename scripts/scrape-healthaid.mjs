#!/usr/bin/env node
// scripts/scrape-healthaid.mjs
// HealthAid = www.healthaid.co.uk (επίσημο site της μάρκας, Shopify, αγγλικά — δεν υπάρχει ελληνικό site· το healthaid.gr δεν υπάρχει).
// Λίστα: /products.json (τίτλος, body_html, tags, εικόνες, variants με SKU/μέγεθος). Χωρίς EAN (barcode null).
// Σελίδα (samples/healthaid-sample.html): «Product Benefits» (<ul>), ενότητες <details> με h2: Description /
// Nutritional Information (πίνακας) / Ingredients / Recommended Daily Intake / Free From.
// Κάθε variant (μέγεθος) = κλειδί "HA-<SKU>" (ο τιμοκατάλογος έχει τιμή ανά μέγεθος· manual matches → κλειδί).
// Εκτός: καλλυντικά/αρωματοθεραπεία/αξεσουάρ (tags Body Care, Aromatherapy, Essential Oil…) — κρατάμε τα συμπληρώματα.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-healthaid.mjs [--limit=5] [--delay=700]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/healthaid-site.json");
const BASE = "https://www.healthaid.co.uk";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "700"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n").replace(/<\/t[dh]>/gi, " · "))).replace(/[ \t ]+/g, " ").replace(/ · \n/g, "\n").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
export const NON_SUPPLEMENT = /^(Body Care|Aromatherapy|Essential Oils?|Carrier Oils?|Skin Care|Hair Care Kits?|Nail Care|Accessories|Merchandise)$/i;
const fixMojibake = s => String(s || "").replace(/Ã¢â‚¬â„¢/g, "’").replace(/â€™/g, "’").replace(/Â®/g, "®").replace(/â„¢/g, "™").replace(/Âµ/g, "µ");

export function extractHealthaidDetails(html, p) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = fixMojibake(p.title).trim();
  const tags = (p.tags || []).map(fixMojibake);
  d.tags = tags;
  const desc = text(p.body_html || "");
  if (desc) d.tabs["Περιγραφή"] = desc;
  const ben = (html.match(/Product Benefits:?\s*<\/strong>\s*<\/h6>\s*<div class="metafield-rich_text_field">([\s\S]*?)<\/div>/i) || [])[1];
  if (ben) { d.advantages = [...ben.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => oneLine(m[1])).filter(Boolean); if (d.advantages.length) d.tabs["Οφέλη"] = d.advantages.join("\n"); }
  const NAMES = { "Nutritional Information": "Διατροφικές πληροφορίες", "Ingredients": "Συστατικά", "Recommended Daily Intake": "Χρήση", "Directions": "Χρήση", "Free From": "Χωρίς", "Warnings": "Προφυλάξεις", "Caution": "Προφυλάξεις" };
  for (const m of html.matchAll(/<summary class="accordion-details__summary[^"]*">[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<\/summary>\s*<div class="accordion-details__content[^"]*">([\s\S]*?)<\/div>\s*<\/details>/g)) {
    const k = oneLine(m[1]); const key = NAMES[k] || (/^Description$/i.test(k) ? null : k);
    if (!key || /Shipping|Return|Review/i.test(k) || d.tabs[key]) continue;
    let v = text(m[2]).replace(/^Ingredients\s+/i, "").replace(/^·\s*/gm, "").replace(/\s*·\s*$/gm, ""); if (!v) continue;
    d.tabs[key] = v;
  }
  if (d.tabs["Διατροφικές πληροφορίες"]) d.tabs["Συστατικά"] = [d.tabs["Συστατικά"], "Διατροφικές πληροφορίες:\n" + d.tabs["Διατροφικές πληροφορίες"]].filter(Boolean).join("\n\n");
  delete d.tabs["Διατροφικές πληροφορίες"];
  d.keyFacts = tags.filter(t => /free$|^vegan$|^vegetarian$|^no (preservatives|flavourings)$/i.test(t)).map(t => t[0].toUpperCase() + t.slice(1));
  d.keyFacts = [...new Map(d.keyFacts.map(k => [k.toLowerCase(), k])).values()];
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  const cats = tags.filter(t => !/free$|^vegan$|^vegetarian$|^no |^[A-Z]$/i.test(t));
  d.categories = cats; d.category = cats.join(" | ") || null; d.line = cats[0] || null;
  if (d.category) d.attributes["Κατηγορίες healthaid.co.uk"] = d.category;
  for (const im of p.images || []) { const u = String(im.src || "").split("?")[0]; if (u && !d.images.includes(u)) d.images.push(u); }
  d.imageLarge = d.images[0] || null;
  const sizeInTitle = (d.title.match(/(?<![\d-]\s?)(\d{2,4})\s*(Tablets|Capsules|Vegicaps|Softgels|Chewables?|Gummies|Sachets|Lozenges|Effervescent Tablets)\b/i) || [])[0];
  const vs = (p.variants || []).filter(v => v.sku);
  d.variants = vs.map(v => ({ ean: "HA-" + String(v.sku).replace(/[^A-Za-z0-9]/g, ""), sku: v.sku, size: v.title && v.title !== "Default Title" ? v.title : (sizeInTitle || "") }));
  d.handle = p.handle;
  d.gtin = d.variants[0] ? d.variants[0].ean : "HA-" + p.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 60);
  d.eans = d.variants.length ? d.variants.map(v => v.ean) : [d.gtin];
  if (d.variants.length <= 1) d.variants = [];                    // ένα μέγεθος: χωρίς variants (όνομα χωρίς μέγεθος)
  d.sizes = d.variants.map(v => v.size).filter(Boolean); d.size = d.sizes[0] || sizeInTitle || null;
  if (d.sizes.length > 1) d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", ");
  d.attributes["SKU"] = vs.map(v => v.sku).join(", ");
  d.subtitle = (desc.split("\n").find(l => l.length > 30) || "").slice(0, 200) || null;
  d.description = desc.replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  return d;
}

async function main() {
  const all = [];
  for (let pg = 1; pg < 10; pg++) { const j = JSON.parse(await fetchText(`${BASE}/products.json?limit=250&page=${pg}`)); all.push(...j.products); if (j.products.length < 250) break; }
  const list = all.filter(p => !(p.tags || []).map(fixMojibake).some(t => NON_SUPPLEMENT.test(t)) && !/buffer|kit$|gift|voucher|bundle/i.test(p.title + " " + p.product_type));
  console.log(`healthaid.co.uk: ${all.length} προϊόντα, ${list.length} συμπληρώματα (εκτός ${all.length - list.length} καλλυντικά/αρωματοθεραπεία/αξεσουάρ)`);
  const out = []; let err = 0; const cap = Math.min(list.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const p = list[i]; const url = `${BASE}/products/${p.handle}`;
    try {
      const html = await fetchText(url);
      const d = extractHealthaidDetails(html, p);
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${String(d.eans.length).padStart(2)}sz ${(d.line || "-").slice(0, 22).padEnd(22)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
