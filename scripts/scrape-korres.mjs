#!/usr/bin/env node
// scripts/scrape-korres.mjs
// gr.korres.com είναι Shopify. Τρεις πηγές ανά προϊόν:
//   1. /el/products.json?limit=250&page=N   όλα τα προϊόντα (handle, αγγλικός τίτλος, body_html EN, tags, images, variants με sku/τιμή)
//   2. /el/products/<handle>.js              Ajax API: παραλλαγές με barcode (EAN), sku, τίτλο, τιμή
//   3. /el/products/<handle>                 HTML: ελληνικά κείμενα σε μπλοκ `var productLang = {"el (Greek)":{item_id, gr_item_full_title,
//                                            gr_description, gr_how_to, gr_benefits, gr_type, gr_need_title…}}` (item_id = sku της παραλλαγής),
//                                            + «Η Ανάγκη σου / Ο Τύπος σου / NN+% Περιεχόμενο Φυσικής Προέλευσης»
// Έξοδος: js/korres-site.json με την ίδια δομή που περιμένουν match-*/sync/fill (url, name, description,
// longDescription, subtitle, details{title, fullTitle, line, gtin, variants[], images, imageLarge, tabs, attributes…}, image, gtin).
//
// Χρήση (cloud session: NODE_USE_ENV_PROXY=1):
//   node scripts/scrape-korres.mjs                # όλα (~570 προϊόντα, ~15 λεπτά)
//   node scripts/scrape-korres.mjs --limit=20 --debug
//   node scripts/scrape-korres.mjs --handles=a,b  # συγκεκριμένα handles

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/korres-site.json");
const BASE = "https://gr.korres.com";

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = k => args.includes(`--${k}`);
const DEBUG = flag("debug");
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "700"));
const ONLY = opt("handles", null) ? opt("handles").split(",").map(s => s.trim()).filter(Boolean) : null;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,application/json;q=0.9,*/*;q=0.8", "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const fetchJson = async url => JSON.parse(await fetchText(url));

const clean = s => htmlToText(String(s || "")).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => clean(s).replace(/\s+/g, " ").trim();
const sizeOf = s => { const m = String(s || "").match(/\b(\d{1,4}(?:[.,]\d+)?)\s?(ml|gr|g|kg|l|τμχ|caps|tabs)\b/i); return m ? m[1].replace(",", ".") + m[2].toLowerCase().replace("gr", "g") : null; };
const absImg = u => !u ? null : u.startsWith("//") ? "https:" + u : u;
// Shopify CDN: μέγεθος εικόνας μέσω παραμέτρου width
const largeImg = u => { if (!u) return null; const a = absImg(u).replace(/&?width=\d+/g, ""); return a + (a.includes("?") ? "&" : "?") + "width=1200"; };

async function listProducts() {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const j = await fetchJson(`${BASE}/el/products.json?limit=250&page=${page}`);
    const ps = j.products || [];
    all.push(...ps);
    dbg(`products.json page ${page}: ${ps.length}`);
    if (ps.length < 250) break;
    await sleep(300);
  }
  return all;
}

function greekBlocks(html) {
  const out = new Map();   // item_id (sku) → data
  for (const m of html.matchAll(/var productLang = (\{[\s\S]*?\});\s*\n/g)) {
    try { const j = JSON.parse(m[1]); const el = j["el (Greek)"] || Object.values(j)[0]; if (el && el.item_id != null) out.set(String(el.item_id), el); } catch {}
  }
  return out;
}

function pageExtras(html) {
  const t = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const need = (t.match(/Η Ανάγκη σου:\s*([^€]{2,60}?)\s+(?:Ο Τύπος σου|\d+\+?%|€)/) || [])[1];
  const type = (t.match(/Ο Τύπος σου:\s*([^€]{2,60}?)\s+(?:\d+\+?%|€|Συνδέσου)/) || [])[1];
  // Ο αριθμός μπορεί να είναι σπασμένος σε spans ("9 6%") → ενώνουμε τα ψηφία
  const nm = t.match(/((?:\d\s?){1,3}\+?%)\s*Περιεχόμενο Φυσικής Προέλευσης/);
  const natural = nm ? nm[1].replace(/\s+/g, "") : undefined;
  return { need: need && need.trim(), type: type && type.trim(), natural };
}

function buildEntry(p, js, html) {
  const url = `${BASE}/el/products/${p.handle}`;
  const gr = greekBlocks(html);
  const extras = pageExtras(html);
  const variants = (js.variants || []).map(v => {
    const g = gr.get(String(v.sku));
    return { ean: String(v.barcode || "").replace(/\D/g, "") || null, sku: v.sku || null, title: v.title && v.title !== "Default Title" ? v.title : null,
      price: v.price != null ? Math.round(v.price) / 100 : null, size: sizeOf(v.title) || sizeOf(g && g.gr_item_full_title) || null,
      grTitle: g ? oneLine(g.gr_item_full_title) : null, available: v.available !== false };
  });
  // Ελληνικό μπλοκ του κύριου προϊόντος: της πρώτης παραλλαγής με ελληνικά, αλλιώς οποιοδήποτε
  const mainSku = String((js.variants || [])[0]?.sku ?? "");
  const g = gr.get(mainSku) || [...gr.values()].find(x => variants.some(v => String(v.sku) === String(x.item_id))) || null;
  const enBody = clean((p.body_html || "").replace(/<!--\s*split\s*-->/g, " "));
  const grDesc = g ? clean(g.gr_description) : "";
  const tabs = {};
  if (g && clean(g.gr_benefits)) tabs["Οφέλη"] = clean(g.gr_benefits);
  if (g && clean(g.gr_how_to)) tabs["Χρήση"] = clean(g.gr_how_to);
  if (g && clean(g.gr_formulation)) tabs["Σύνθεση"] = clean(g.gr_formulation);
  if (enBody) tabs["Περιγραφή (EN)"] = enBody;
  const attributes = {};
  if (extras.type || (g && g.gr_type)) attributes["Τύπος δέρματος"] = extras.type || g.gr_type;
  if (extras.need || (g && g.gr_need_title)) attributes["Ανάγκη"] = extras.need || g.gr_need_title;
  if (extras.natural) attributes["Φυσικής προέλευσης"] = extras.natural;
  const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];
  if (sizes.length) attributes["Διαθέσιμα μεγέθη"] = sizes.join(", ");
  // Σειρά εικόνων = σειρά Shopify (η πρώτη είναι το packshot· τα ονόματα αρχείων «quiz…» δεν σημαίνουν banner)
  const images = [...new Set((js.images || p.images.map(i => i.src) || []).map(largeImg).filter(Boolean))];
  const fullTitle = (g && oneLine(g.gr_item_full_title)) || oneLine(p.title);
  const line = (g && oneLine(g.gr_title)) || null;     // π.χ. "Αφρόλουτρο" (κατηγορία προϊόντος στα ελληνικά)
  const gtin = variants.find(v => v.ean)?.ean || null;
  const details = {
    title: oneLine(p.title), fullTitle, enTitle: oneLine(p.title), line, gtin,
    variants, sizes, size: sizes[0] || null,
    subtitle: null, shortDescription: grDesc ? grDesc.split(/\n|(?<=\.)\s/)[0].slice(0, 160) : null,
    advantages: [], keyFacts: [],
    description: grDesc || enBody || null, descriptionEn: enBody || null,
    tabs, attributes, images, imageLarge: images[0] || null,
    breadcrumbs: [], category: null, tags: p.tags || [], productType: p.product_type || null, handle: p.handle,
    // Σετ δώρου / web promo (1+1): μένουν εκτός καταλόγου στο build (βλ. build-brand-supplier set-flag)
    isSet: (p.tags || []).some(t => /^(GIFT SETS|PROMOS)$/i.test(String(t).trim())),
    greek: !!g
  };
  return {
    url, section: "p", name: fullTitle, description: (grDesc || enBody).replace(/\s+/g, " ").slice(0, 700),
    longDescription: grDesc || enBody || null, subtitle: null, details, image: images[0] || null, sku: mainSku || null, gtin
  };
}

async function main() {
  console.log("korres: λίστα προϊόντων από products.json…");
  let products = await listProducts();
  if (ONLY) products = products.filter(p => ONLY.includes(p.handle));
  console.log(`${products.length} προϊόντα. Κατεβάζω .js (barcodes) + σελίδα (ελληνικά) για το καθένα…\n`);
  const out = [];
  let err = 0, noGreek = 0;
  const cap = Math.min(products.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const p = products[i];
    try {
      const js = await fetchJson(`${BASE}/el/products/${p.handle}.js`);
      await sleep(150);
      const html = await fetchText(`${BASE}/el/products/${p.handle}`);
      const e = buildEntry(p, js, html);
      if (!e.details.greek) noGreek++;
      out.push(e);
      console.log(`[${i + 1}/${cap}] ${e.gtin ? "ean+" : "ean-"} ${e.details.greek ? "el+" : "el-"} v${e.details.variants.length} img${e.details.images.length} ${e.name.slice(0, 55)}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${p.handle} ${ex.message}`); }
    if (out.length % 20 === 0) await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}  errors=${err}  χωρίς ελληνικά=${noGreek}.  Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
  console.log("Επόμενο: node scripts/build-brand-supplier.mjs --brand=korres --xlsx=Korres.tsv --with-site && node scripts/match-korres.mjs");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
