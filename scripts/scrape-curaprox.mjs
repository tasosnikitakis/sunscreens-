#!/usr/bin/env node
// scripts/scrape-curaprox.mjs
// Curaprox Ελλάδα = curaprox.gr — PrestaShop (CURAPROX-Shop Greece), ελληνικά, με EAN (gtin13) και λιανική τιμή.
// Λίστα: /sitemap-el-only-images.xml → σελίδες «…-p<id>». Σελίδα (samples/curaprox-sample.html):
//   JSON-LD Product (name, description, category, gtin13, sku, offers.price = λιανική με ΦΠΑ, εικόνες large_default),
//   h1, .product-description-short (h2 + p), #block-productusp (USP), accordion .pdp-accordion: «Περιγραφή», «Χρήση» (dl: Ηλικία,
//   Συνίσταται για), «Χαρακτηριστικά» (dl: Απαλότητα, Μέγεθος κεφαλής, Χρώμα, Τύπος συσκευασίας), .product-variants (ομάδες
//   επιλογών — χρώματα οδοντόβουρτσας = μία καρτέλα· μεγέθη/ISO βουρτσακιών → καταγράφονται στα attributes).
// Η λιανική τιμή του site μπαίνει στο details.retailPrice (build-brand-supplier --site-retail → p.retail).
// ΕΚΤΟΣ: σετ / promo / duo / gift. Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-curaprox.mjs [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/curaprox-site.json");
const BASE = "https://curaprox.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "1000"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<sup>\s*(®|™)\s*<\/sup>/gi, "$1").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d|dd)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
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
// σετ = ταξιδιωτικά / συλλογές / δώρα· ΟΧΙ τα «set prime start / perio start» (βουρτσάκια + λαβές = βασικό προϊόν)
const SET_RE = /ταξιδ|travel|σετ καθαρισμού|σετ καθαριστής|\bgift\b|δώρο|δωρο|\bpromo\b|\bbundle\b/i;

export function extractCuraproxDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  let ld = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) { try { const j = JSON.parse(m[1]); if (j["@type"] === "Product") { ld = j; break; } } catch {} }
  const fullHtml = html;   // το accordion μπορεί να είναι ΜΕΤΑ τα «σχετικά προϊόντα»
  const cut = html.search(/<section class="page-product-box|class="product-accessories|id="footer"/); if (cut > 0) html = html.slice(0, cut);   // χωρίς «σχετικά προϊόντα» (product-name-add, USP)
  d.title = oneLine((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || (ld && ld.name) || "") || null;
  if (!d.title) return null;
  d.gtin = ld && /^\d{8,14}$/.test(String(ld.gtin13 || "")) ? String(ld.gtin13) : null;
  d.sku = ld && ld.sku || null;
  const price = ld && ld.offers && parseFloat(String(ld.offers.price || "").replace(",", "."));
  d.retailPrice = price > 0 ? price : null;
  if (d.retailPrice) d.attributes["Λιανική τιμή curaprox.gr"] = d.retailPrice.toFixed(2).replace(".", ",") + " €";
  d.category = oneLine(ld && ld.category || "") || null; d.categories = d.category ? [d.category] : [];
  d.line = d.category; d.series = d.category;
  if (d.category) d.attributes["Κατηγορία curaprox.gr"] = d.category;
  const add = oneLine((html.match(/class="product-name-add"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "");
  const short = (html.match(/class="d-none d-lg-block product-description-short">([\s\S]*?)<\/div>/) || [])[1] || "";
  d.subtitle = oneLine((short.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || "") || add || null;
  const shortP = text(short.replace(/<h2[^>]*>[\s\S]*?<\/h2>/, ""));
  const usp = [...((html.match(/<div class="d-none d-lg-block">\s*<div id="block-productusp"[\s\S]*?<\/ul>/) || [""])[0]).matchAll(/<div class="desc-wrap">([\s\S]*?)<\/div>/g)].map(m => oneLine(m[1])).filter(Boolean);
  if (usp.length) { d.advantages = usp; d.tabs["Οφέλη"] = usp.join("\n"); }
  // accordion: κάθε <div class="card"> του .pdp-accordion μέχρι την επόμενη κάρτα (το card-body έχει εμφωλευμένα divs)
  const acc = (fullHtml.match(/<div class="pdp-accordion">([\s\S]*?)<\/section>/) || [])[1] || "";
  for (const seg of acc.split(/<div class="card">/).slice(1)) {
    const head = oneLine((seg.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || "");
    const body = (seg.match(/<div class="card-body">([\s\S]*)$/) || [])[1] || "";
    if (!head || !body) continue;
    if (/^Περιγραφή/i.test(head)) { const t = text(body); if (t) d.tabs["Περιγραφή"] = [shortP, t].filter(Boolean).join("\n"); continue; }
    const dl = [...body.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)].map(x => [oneLine(x[1]), text(x[2]).split("\n").join(", ")]);
    const key = /Χρήση|Οδηγίες/i.test(head) ? "Χρήση" : /Συστατικ/i.test(head) ? "Συστατικά" : /Χαρακτηριστικ/i.test(head) ? "Χαρακτηριστικά" : head;
    if (dl.length) { for (const [k, v] of dl) if (k && v) d.attributes[k] = v; d.tabs[key] = [d.tabs[key], dl.map(([k, v]) => `${k}: ${v}`).join("\n")].filter(Boolean).join("\n"); }
    else { const t = text(body); if (t) d.tabs[key] = [d.tabs[key], t].filter(Boolean).join("\n"); }
  }
  if (!d.tabs["Περιγραφή"] && shortP) d.tabs["Περιγραφή"] = shortP;
  // ομάδες επιλογών (χρώμα, μέγεθος…)
  for (const g of html.matchAll(/<div class="form-group product-variants-item">\s*<div class="label">([\s\S]*?)<\/div>([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const label = oneLine(g[1]).replace(/\s*-\s*.*$/, "");
    const opts = [...g[2].matchAll(/<span class="sr-only">([\s\S]*?)<\/span>|<option[^>]*>([\s\S]*?)<\/option>|<span class="radio-label">([\s\S]*?)<\/span>/g)].map(m => oneLine(m[1] || m[2] || m[3])).filter(Boolean);
    if (opts.length > 1) { d.attributes[`Επιλογές: ${label}`] = opts.length > 6 ? `${opts.length} επιλογές` : opts.join(", "); (d.optionGroups ||= []).push({ label, count: opts.length }); }
  }
  const imgs = ld && ld.offers && Array.isArray(ld.offers.image) ? ld.offers.image : (ld && ld.image ? [ld.image] : []);
  for (const u of imgs) { const x = String(u).replace(/-home_default\//, "-large_default/"); if (!d.images.includes(x)) d.images.push(x); }
  if (!d.images.length) for (const m of html.matchAll(/property="og:image" content="([^"]+)"/g)) if (!d.images.includes(m[1])) d.images.push(m[1]);   // χωρίς offers στο JSON-LD
  d.imageLarge = d.images[0] || null;
  const sz = (add.match(/(\d+(?:[.,]\d+)?)\s?(ml|g|τεμ\.?|τμχ|m)\b/i) || d.title.match(/(\d+(?:[.,]\d+)?)\s?(ml|g)\b/i));
  d.size = sz ? `${sz[1]}${sz[2]}`.replace(/\s/g, "") : (d.attributes["Τύπος συσκευασίας"] || null); d.sizes = d.size ? [d.size] : [];
  if (sz) d.attributes["Συσκευασία"] = d.size;
  if (add && !d.title.includes(add)) d.attributes["Περιγραφή συσκευασίας"] = add;
  d.isSet = SET_RE.test(d.title);
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = decodeURIComponent(String(url).replace(/[#?].*$/, "").split("/").pop());
  if (!d.gtin) d.gtin = "CP-" + d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 60);
  d.eans = [d.gtin];
  return d;
}

async function main() {
  const sm = await fetchText(BASE + "/sitemap-el-only-images.xml");
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim().replace(/#.*$/, "")).filter(u => /-p\d+$/.test(u)))];
  console.log(`curaprox.gr: ${urls.length} σελίδες προϊόντων`);
  const out = []; let err = 0, sets = 0;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const html = await fetchText(url);
      const d = extractCuraproxDetails(html, url);
      if (!d) { err++; console.log(`[${i + 1}/${urls.length}] χωρίς τίτλο ${url}`); await sleep(DELAY_MS); continue; }
      if (d.isSet) { sets++; console.log(`[${i + 1}/${urls.length}] set  | ${d.title}`); await sleep(DELAY_MS); continue; }
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${urls.length}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${d.gtin.padEnd(14)} ${String(d.retailPrice || "-").padEnd(6)} ${(d.optionGroups || []).map(g => g.label + ":" + g.count).join(",").slice(0, 26).padEnd(26)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${urls.length}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  const seen = new Set(); const kept = [];
  for (const p of out) { if (seen.has(p.gtin)) { console.log(`  διπλό EAN ${p.gtin} → εκτός: ${p.name}`); continue; } seen.add(p.gtin); kept.push(p); }
  const byName = {}; for (const p of kept) (byName[p.name.toLowerCase()] ||= []).push(p);
  for (const g of Object.values(byName)) if (g.length > 1) for (const p of g) if (p.details.size) p.details.fullTitle = `${p.name} ${p.details.size}`;
  await fs.writeFile(OUT_FILE, JSON.stringify(kept, null, 2), "utf8");
  console.log(`\nDone. products=${kept.length} sets=${sets} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
