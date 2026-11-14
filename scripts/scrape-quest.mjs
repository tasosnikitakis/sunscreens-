#!/usr/bin/env node
// scripts/scrape-quest.mjs
// Quest Vitamins στην Ελλάδα = www.douni.gr (Douni Health Products, αντιπρόσωπος· Umbraco). Ελληνικά κείμενα, χωρίς EAN/μέγεθος.
// Λίστα: /sitemap → σελίδες /etairies/quest/<σειρά>/<προϊόν>/ (σελίδα προϊόντος = div.detail-page).
// Σελίδα (samples/quest-sample.html): breadcrumb (Quest › <σειρά>), h1, .left-cell .image img, .full-text (περιγραφή),
//   .accordion .title-tab + .text: ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ ΠΡΟΪΟΝΤΟΣ / ΔΟΣΟΛΟΓΙΑ & ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ / ΘΡΕΠΤΙΚΗ ΑΞΙΑ (πίνακας) /
//   ΣΥΣΤΑΤΙΚΑ / ΟΔΗΓΙΕΣ ΓΙΑ ΑΛΛΕΡΓΙΕΣ. Αρ. Γν. ΕΟΦ μέσα στα χαρακτηριστικά.
// Κλειδί: "QV-<slug>"· τα μεγέθη της ελληνικής αγοράς (js/quest-sizes.json, από τον τιμοκατάλογο) → variants QV-<slug>V<πλήθος>.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-quest.mjs [--limit=5] [--delay=700]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/quest-site.json");
const BASE = "https://www.douni.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "700"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<sup>\s*ο\s*<\/sup>/gi, "°").replace(/<sup>([^<]*)<\/sup>/gi, "^$1").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n").replace(/<\/t[dh]>/gi, " · "))).replace(/\^TM/g, "™").replace(/[ \t ]+/g, " ").replace(/ · \n/g, "\n").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
export const isQuestProductPage = html => /class="detail-page"/.test(html) && /class="accordion-cell product"/.test(html);

export function extractQuestDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = oneLine((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "") || null;
  const bc = (html.match(/<div class="breadcrumb[^"]*">([\s\S]*?)<\/div>/) || [])[1] || "";
  d.breadcrumbs = [...bc.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map(m => oneLine(m[1])).filter(x => x && !/^(Αρχική|Προϊόντα)$/.test(x));
  const crumbs = d.breadcrumbs.slice(0, -1).filter(x => x !== "Quest");
  d.line = crumbs[crumbs.length - 1] || null; d.categories = crumbs; d.category = crumbs.join(" › ") || null;
  if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
  const img = (html.match(/<div class="left-cell">\s*<div class="image"><img src=["']?([^"'\s>?]+)/) || [])[1];
  if (img) d.images.push(img.startsWith("http") ? img : BASE + img);
  const desc = (html.match(/<div class="text font21[^"]*full-text">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/) || [])[1];
  if (desc) d.tabs["Περιγραφή"] = text(desc);
  const acc = (html.match(/<div class="accordion-cell product">([\s\S]*?)<div class="product-slider-cell|<div class="accordion-cell product">([\s\S]*?)<\/section>/) || [])[1] || "";
  let nutrition = "", ingredients = "", allergy = "";
  for (const m of acc.matchAll(/<div class="title-tab[^"]*">([\s\S]*?)<\/div>\s*<div class="text[^"]*">([\s\S]*?)<\/div>/g)) {
    const k = oneLine(m[1]).toUpperCase(); const v = text(m[2]); if (!v) continue;
    if (/ΧΑΡΑΚΤΗΡΙΣΤΙΚ/.test(k)) {
      const lines = v.split("\n").map(x => x.trim()).filter(Boolean), keep = [];
      for (const l of lines) {
        const eof = l.match(/Αρ\.?\s*Γν(?:ωστ)?\.?\s*ΕΟΦ:?\s*([0-9/\-.]+)/i);
        if (eof) d.attributes["Γνωστοποίηση ΕΟΦ"] = eof[1].replace(/\.$/, "");
        if (/συμπλήρωμα διατροφής και δεν υποκαθιστά|Αρ\.?\s*Γν/i.test(l) && l.length < 220) continue;
        keep.push(l);
      }
      d.advantages = keep; if (keep.length) d.tabs["Οφέλη"] = keep.join("\n");
      d.keyFacts = keep.filter(l => /^(Κατάλληλο|Δεν περιέχει|Χωρίς|Χωρίς γλουτένη)/i.test(l) && l.length < 90).map(l => l.replace(/\.$/, ""));
    } else if (/ΔΟΣΟΛΟΓΙΑ|ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ/.test(k)) {
      const lines = v.split("\n").map(x => x.trim()).filter(Boolean); const use = [], warn = [];
      for (const l of lines) (use.length && /(Διατηρείται|Φυλάσσεται|Να μη γίνεται|δεν πρέπει να χρησιμοποιούνται|Συμβουλευτείτε|δεν επέχει)/i.test(l) ? warn : use).push(l);
      if (use.length) d.tabs["Χρήση"] = use.join("\n"); if (warn.length) d.tabs["Προφυλάξεις"] = warn.join("\n");
    } else if (/ΘΡΕΠΤΙΚ/.test(k)) {
      // πίνακας: μία γραμμή ανά <tr> («Συστατικό · ποσότητα»), το υπόλοιπο κείμενο όπως είναι
      const html2 = m[2].replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_, row) => "<p>" + [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => oneLine(c[1])).filter(Boolean).join(" · ") + "</p>").replace(/<\/?(table|tbody|thead)[^>]*>/g, "");
      nutrition = text(html2);
    }
    else if (/ΑΛΛΕΡΓ/.test(k)) allergy = v;
    else if (/ΣΥΣΤΑΤΙΚ/.test(k)) ingredients = v;
    else d.tabs[oneLine(m[1])] = v;
  }
  const parts = [];
  if (nutrition) parts.push("Θρεπτική αξία:\n" + nutrition);
  if (ingredients) parts.push("Συστατικά: " + ingredients);
  if (allergy) parts.push("Αλλεργιογόνα: " + allergy);
  if (parts.length) d.tabs["Συστατικά"] = parts.join("\n\n");
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  d.imageLarge = d.images[0] || null;
  const first = (d.tabs["Περιγραφή"] || "").split(/(?<=\.)\s/)[0] || "";
  d.subtitle = first.length <= 200 ? first : null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = decodeURIComponent(String(url).replace(/\/+$/, "").split("/").pop());
  const key = d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 70);
  d.gtin = "QV-" + (key.length >= 4 ? key : key + "item"); d.eans = [d.gtin];
  d.size = null; d.sizes = [];
  return d;
}

// Μεγέθη συσκευασίας της ελληνικής αγοράς (js/quest-sizes.json, από τον τιμοκατάλογο): >1 μέγεθος → variants QV-<slug>V<πλήθος>
// Το ίδιο προϊόν σε δύο σειρές (π.χ. BioFolic σε Βιταμίνες και Platinum Excellence) → μία εγγραφή με όλες τις σειρές
export function dedupe(out) {
  const by = new Map();
  for (const e of out) { const h = e.details.handle; if (!by.has(h)) { by.set(h, e); continue; }
    const k = by.get(h).details; for (const c of e.details.categories || []) if (!k.categories.includes(c)) k.categories.push(c);
    k.category = k.categories.join(" | "); }
  out.splice(0, out.length, ...by.values());
  for (const e of out) { e.name = e.details.title = e.name.replace(/[ΑΒΕΗΙΚΜΝΟΡΤΥΧΖ](?=[a-z])/g, c => ({ Α: "A", Β: "B", Ε: "E", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X", Ζ: "Z" })[c]); }
  return out;
}

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
  const sm = await fetchText(BASE + "/sitemap");
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /\/etairies\/quest\/[^/]+\/[^/]+\/$/.test(u) || /\/etairies\/quest\/[^/]+\/$/.test(u)))];
  console.log(`douni.gr: ${urls.length} σελίδες Quest (σειρές + προϊόντα)`);
  const out = []; let err = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      const html = await fetchText(url);
      if (!isQuestProductPage(html)) { await sleep(200); continue; }
      const d = extractQuestDetails(html, url);
      if (!d.title) continue;
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.line || "-").slice(0, 22).padEnd(22)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  dedupe(out);
  try { applySizes(out, JSON.parse(await fs.readFile(path.join(ROOT, "js/quest-sizes.json"), "utf8"))); } catch {}
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
