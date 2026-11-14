#!/usr/bin/env node
// scripts/scrape-bioderma.mjs
// Bioderma Ελλάδα = www.bioderma.gr — Drupal Commerce (NAOS), ελληνικά, με EAN ανά μέγεθος.
// Λίστα: /sitemap.xml → /ta-proionta-mas/<σειρά>/<προϊόν>. Σελίδα (samples/bioderma-sample.html):
//   meta itemprop=name, h1.title-1--product, p.skin (τύπος δέρματος), .product__description h2 (περιγραφή), .product__effiency
//   (claim), .product__doctor (χαρακτηριστικό), select … attribute_capacity <option data-ean> (μεγέθη/συσκευασίες),
//   .product__details (Detailed description + tab «Οφέλη»), #biological-mode-of-action («Τι συμβαίνει στο δέρμα σου»),
//   #advice-wrapper #tab1 (Οδηγίες χρήσης), #efficiency (Αποδεδειγμένη αποτελεσματικότητα, accordion),
//   #composition (ενεργά συστατικά accordion + λίστα συστατικών INCI), εικόνες fancybox.
// Κλειδί = EAN. Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-bioderma.mjs [--limit=5] [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/bioderma-site.json");
const BASE = "https://www.bioderma.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "1000"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => String(s || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<picture[\s\S]*?<\/picture>/gi, "")
  .replace(/<div class="modal[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/gi, "").replace(/<a [^>]*>\s*Δες τις πηγές\s*<\/a>/gi, "");
const text = s => htmlToText(decodeAll(strip(s).replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d|button)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
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
// τμήμα HTML από ένα σημείο μέχρι το επόμενο <section class="section (ή τέλος)
const sectionFrom = (html, marker) => { const i = html.indexOf(marker); if (i < 0) return ""; const j = html.indexOf('<section class="section', i + marker.length); return html.slice(i, j > 0 ? j : i + 60000); };
const cards = blk => [...blk.matchAll(/<button[^>]*data-toggle=["']collapse["'][^>]*>([\s\S]*?)<\/button>\s*<div[^>]*class=["']collapse[^"']*["'][^>]*>\s*<div class=["']card-body["']>([\s\S]*?)<\/div>\s*<\/div>/g)]
  .map(m => ({ t: oneLine(m[1]), b: text(m[2]) })).filter(c => c.t && c.b);
const sizeOf = s => { const m = String(s || "").replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(ml|g|gr|γρ|τεμ)/i); return m ? (+m[1]) + (/ml/i.test(m[2]) ? "ml" : /τεμ/i.test(m[2]) ? " τεμ." : "g") : null; };

export function extractBiodermaDetails(html, url) {
  // modals «Δες τις πηγές» (υποσημειώσεις μελετών) μέσα σε κείμενα/accordion → έξω, αλλιώς σπάνε τα nested divs
  html = html.replace(/<div>\s*<a href="#" class="underline"[^>]*>\s*Δες τις πηγές\s*<\/a>\s*<div class="modal[\s\S]*?<div class="modal-body">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g, "");
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const main = html.slice(html.indexOf('itemtype="http://schema.org/Product"'), html.indexOf("</main>"));
  d.title = oneLine((main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "") || oneLine([...main.matchAll(/<meta itemprop="name" content="([^"]+)"/g)].map(m => m[1]).filter(n => !/^Bioderma$/i.test(n))[0] || "") || null;
  d.line = ((main.match(/<section class="row product ([a-z0-9-]+)/) || [])[1] || "").replace(/-/g, " ") || null;
  if (d.line) { d.line = d.line[0].toUpperCase() + d.line.slice(1); d.series = d.line; d.attributes["Σειρά"] = d.line; }
  const skin = oneLine((main.match(/<p class="skin[^"]*">([\s\S]*?)<\/p>/) || [])[1] || "");
  if (skin) d.attributes["Τύπος δέρματος"] = skin;
  const desc = text((main.match(/class="[^"]*product__description[^"]*">\s*<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || "");
  const claim = oneLine((main.match(/product__effiency[^"]*">\s*<div class="text">([\s\S]*?)<\/div>/) || [])[1] || "");
  const doctor = [...main.matchAll(/product__doctor[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g)].flatMap(m => [...m[1].matchAll(/<span class="text">([\s\S]*?)<\/span>/g)].map(x => oneLine(x[1]))).filter(Boolean);
  d.keyFacts.push(...doctor);
  // Detailed description: «Detailed description» + tab «Οφέλη»
  const det = (main.match(/product__details[^"]*">([\s\S]*?)<\/section>/) || [])[1] || "";
  const tab = (det.match(/<div class="tab-content">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/) || [])[1] || "";
  const intro = text(det.split('<div class="reveal product__tabs')[0].replace(/<h3[^>]*>[\s\S]*?<\/h3>/, ""));
  d.tabs["Περιγραφή"] = [desc, claim, intro.split("\n").filter(l => l && l.toUpperCase() !== l || /\p{Ll}/u.test(l)).join("\n")].filter(Boolean).join("\n");
  const ben = text(tab).split("\n").filter(l => !/^(ΝΕΑ ΣΥΝΘΕΣΗ|πηγές|×|&times;)$/i.test(l)).join("\n"); if (ben) { d.tabs["Οφέλη"] = ben; d.advantages = ben.split("\n").filter(l => l.length > 6); }
  const bio = sectionFrom(html, 'id="biological-mode-of-action"'); const act = text(bio.slice(bio.indexOf(">") + 1));
  if (act) d.tabs["Δράση"] = act;
  const adv = sectionFrom(html, 'id="advice-wrapper"');
  const tab1 = (adv.match(/id="tab1"[^>]*>([\s\S]*?)<div class="tab-pane/) || [])[1] || "";
  const use = text(tab1.replace(/<strong>\s*(Βήμα \d+)\s*<\/strong>/g, "$1: ")); if (use) d.tabs["Χρήση"] = use;
  const eff = sectionFrom(html, 'id="efficiency-wrapper"');
  const effPane = (eff.match(/id="efficiency"[^>]*>([\s\S]*?)id="composition"/) || [])[1] || "";
  const effCards = cards(effPane); if (effCards.length) d.tabs["Αποτελεσματικότητα"] = effCards.map(c => `${c.t}\n${c.b}`).join("\n\n");
  const comp = (eff.match(/id="composition"[^>]*>([\s\S]*)/) || [])[1] || "";
  const actCards = cards(comp); if (actCards.length) d.tabs["Ενεργά συστατικά"] = actCards.map(c => `${c.t}: ${c.b.replace(/\n/g, " ")}`).join("\n");
  const inci = [...((comp.match(/variation_field_productingredientslist[^>]*>([\s\S]*?)<\/span>/) || [])[1] || "").matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => oneLine(m[1]).replace(/\b((?:[A-Z] ){2,}[A-Z])\b/g, x => x.replace(/ /g, "")).trim()).filter(Boolean);
  if (inci.length) d.tabs["Συστατικά"] = inci.join(", ");
  d.keyFacts = [...new Map(d.keyFacts.map(k => [k.toLowerCase(), k])).values()];
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  // μεγέθη/συσκευασίες
  const opts = [...main.matchAll(/<option data-ean="(\d{8,14})"[^>]*>([\s\S]*?)<\/option>/g)].map(m => ({ ean: m[1], label: oneLine(m[2]) }));
  for (const o of opts) if (!d.variants.some(v => v.ean === o.ean)) d.variants.push({ ean: o.ean, size: o.label, vol: sizeOf(o.label) });
  const mainEan = (main.match(/<meta itemprop="gtin" content="(\d{8,14})"/) || [])[1] || (main.match(/data-main-ean="(\d{8,14})"/) || [])[1];
  if (!d.variants.length && mainEan) d.variants.push({ ean: mainEan, size: "", vol: null });
  // όνομα μεγέθους: «Μπουκάλι με αντλία 500 ml» → «500ml»· αν δύο ίδιες ποσότητες με άλλη συσκευασία → κρατάμε όλη την ετικέτα
  for (const v of d.variants) { const dup = d.variants.filter(x => x.vol && x.vol === v.vol).length > 1; v.short = v.vol && !dup ? v.vol : v.size; }
  d.gtin = d.variants[0] ? d.variants[0].ean : mainEan || null; d.eans = d.variants.map(v => v.ean);
  d.sizes = d.variants.map(v => v.short).filter(Boolean); d.size = d.sizes[0] || null;
  if (d.variants.length > 1) d.attributes["Διαθέσιμα μεγέθη"] = d.variants.map(v => v.size).join(", ");
  else if (d.variants[0] && d.variants[0].size) d.attributes["Συσκευασία"] = d.variants[0].size;
  // εικόνες (fancybox 2000px)
  for (const m of main.matchAll(/class="product-fancybox"[^>]*href="([^"]+)"/g)) { const u = decodeAll(m[1]); if (!d.images.includes(u)) d.images.push(u); }
  if (!d.images.length) { const u = (main.match(/<meta itemprop="image" content="([^"]+)"/) || [])[1]; if (u) d.images.push(decodeAll(u)); }
  d.imageLarge = d.images[0] || null;
  const crumbs = url.split("/ta-proionta-mas/")[1] || "";
  d.category = d.line; d.categories = d.line ? [d.line] : []; d.handle = crumbs.replace(/\//g, "-");
  d.subtitle = skin || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = desc || null;
  return d;
}

async function main() {
  const sm = await fetchText(BASE + "/sitemap.xml");
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(u => /\/ta-proionta-mas\/[^/]+\/[^/]+$/.test(u)))];
  console.log(`bioderma.gr: ${urls.length} σελίδες προϊόντων στο sitemap`);
  const out = []; let err = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      const html = await fetchText(url);
      if (!/itemtype="http:\/\/schema.org\/Product"/.test(html)) { console.log(`[${i + 1}/${cap}] skip (όχι προϊόν) ${url}`); await sleep(DELAY_MS); continue; }
      const d = extractBiodermaDetails(html, url);
      if (!d.title) { err++; console.log(`[${i + 1}/${cap}] χωρίς τίτλο ${url}`); await sleep(DELAY_MS); continue; }
      if (!d.gtin) {   // σελίδα χωρίς EAN (κενό gtin / χωρίς μεγέθη) → συνθετικό κλειδί
        d.gtin = "BI-" + d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 60); d.eans = [d.gtin];
        d.variants = [{ ean: d.gtin, size: "", vol: null, short: null }];
      }
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${String(d.eans.length).padStart(2)}sz ${(d.size || "-").slice(0, 14).padEnd(14)} ${(d.line || "-").padEnd(12)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  // ίδιο EAN σε δύο σελίδες → μόνο στην πρώτη
  const seen = new Set(); for (const p of out) { p.details.variants = p.details.variants.filter(v => !seen.has(v.ean) && seen.add(v.ean)); p.details.eans = p.details.variants.map(v => v.ean); }
  const kept = out.filter(p => p.details.eans.length); for (const p of kept) p.gtin = p.details.gtin = p.details.eans[0];
  // ίδιο όνομα σε δύο σελίδες (Sébium Mat Control / Pore Refiner: παλιά και νέα συσκευασία, ίδιο μέγεθος) → κρατάμε την πρώτη
  const byName = new Map(); for (const p of kept) { const k = p.name.toLowerCase(); if (byName.has(k)) p.details.duplicateOf = byName.get(k).url; else byName.set(k, p); }
  await fs.writeFile(OUT_FILE, JSON.stringify(kept, null, 2), "utf8");
  console.log(`\nDone. products=${kept.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
