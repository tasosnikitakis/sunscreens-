#!/usr/bin/env node
// scripts/scrape-superfoods.mjs
// Superfoods (GP Hellenic Soil) = superfoods.eu — WordPress (δικό τους theme + Polylang), ελληνικά στο /el/, χωρίς EAN.
// Λίστα: /product-sitemap.xml (AIOSEO) → μόνο τα /el/product/* (το post type «product» δεν είναι στο REST).
// Σελίδα (samples/superfoods-sample.html):
//   p.text-uppercase (κατηγορία, π.χ. «Αρθρώσεις»), h1.product-title, span.fruit-type (βασικό συστατικό), περιγραφή (row mb-10),
//   .product-desc span (συσκευασία), #tabs-cont: 1ο container = Πληροφορίες (<ul> → Οφέλη), .product-table (Συστατικά),
//   h5 ενότητες (ΠΡΟΤΕΙΝΕΤΑΙ ΣΕ / ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ / ΧΩΡΙΣ), p.extra-info (προειδοποιήσεις), p.eof-number (ΕΟΦ),
//   .plant-info (η «υπερτροφή»), img.product-image.
// Κλειδί: "SF-<slug>". Τιμές με js/superfoods-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-superfoods.mjs [--limit=5] [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/superfoods-site.json");
const BASE = "https://superfoods.eu";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "1000"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => String(s || "").replace(/<iframe[\s\S]*?<\/iframe>/gi, "").replace(/<div[^>]*class="arve[\s\S]*?<\/video>\s*<\/div>\s*<\/div>\s*<\/div>/gi, "").replace(/<img[^>]*>/gi, "").replace(/<sup>\s*(®|™)\s*<\/sup>/gi, "$1");
const text = s => htmlToText(decodeAll(clean(s).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n").replace(/<\/t[dh]>/gi, " · "))).replace(/[ \t ]+/g, " ").replace(/ · \n/g, "\n").replace(/\s*·\s*$/gm, "").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
// «ΓΑΪΔΟΥΡΑΓΚΑΘΟ» → «Γαϊδουράγκαθο»-ish: κεφαλαία ελληνικά → πρώτο κεφαλαίο (οι τίτλοι του site είναι συνήθως ήδη σωστοί)
const tidyTitle = t => t.replace(/\s+/g, " ").trim();

export function extractSuperfoodsDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const main = html.slice(html.indexOf('id="content"'), html.indexOf('class="related-blogs"') > 0 ? html.indexOf('class="related-blogs"') : undefined);
  d.title = tidyTitle(oneLine((main.match(/<h1[^>]*class="[^"]*product-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "")) || null;
  const right = main.slice(main.indexOf("pt-xl-100") > 0 ? main.indexOf("pt-xl-100") : 0);
  const cat = oneLine((right.match(/<p class="text-uppercase">([\s\S]*?)<\/p>/) || [])[1] || "");
  d.categories = cat ? [cat] : []; d.category = cat || null; d.line = cat || null;
  if (cat) d.attributes["Κατηγορία superfoods.eu"] = cat;
  d.ingredient = oneLine((main.match(/<span class="fruit-type">([\s\S]*?)<\/span>/) || [])[1] || "") || null;
  if (d.ingredient) d.attributes["Βασικό συστατικό"] = d.ingredient;
  // περιγραφή: το block ανάμεσα στο fruit-info και στο product-desc
  const a = main.indexOf('class="fruit-info"'), b = main.indexOf('product-desc');
  if (a > 0 && b > a) {
    const blk = main.slice(main.indexOf('<div class="row', a), b).replace(/<div class="d-inline-block[^"]*$/, "");
    const desc = text(blk); if (desc) d.tabs["Περιγραφή"] = desc;
  }
  const sizes = [...(main.match(/class="[^"]*product-desc[^"]*">([\s\S]*?)<\/div>/) || ["", ""])[1].matchAll(/<span>([\s\S]*?)<\/span>/g)].map(m => oneLine(m[1])).filter(Boolean);
  const sizeTidy = z => z.replace(/^Μπουκάλι\s*/i, "").replace(/(\d)\s*ml\b/i, "$1ml").replace(/[\p{L}]+/gu, w => /^DR$/.test(w) ? w : w.toLowerCase()).replace(/σκληρες/g, "σκληρές").replace(/καψουλες/g, "κάψουλες");
  for (let i = 0; i < sizes.length; i++) sizes[i] = sizeTidy(sizes[i]);
  d.size = sizes.join(" · ") || null; d.sizes = sizes; if (d.size) d.attributes["Συσκευασία"] = d.size;
  const sub = oneLine((main.match(/<p class="sub-description[^"]*">([\s\S]*?)<\/p>/) || [])[1] || "");
  // tabs
  const tc = main.slice(main.indexOf('id="tabs-cont"'));
  if (main.includes('id="tabs-cont"')) {
    const conts = tc.split(/<div class="container">/).slice(1);
    const info = conts.find(c => !/product-table|<h5|extra-info|eof-number/.test(c));
    if (info) {
      const lis = [...info.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => oneLine(m[1])).filter(Boolean);
      if (lis.length) { d.advantages = lis; d.tabs["Οφέλη"] = lis.join("\n"); }
      let rest = text(info.replace(/<ul[\s\S]*?<\/ul>/g, ""));
      const bul = rest.split("\n").filter(l => /^[•·\-–]\s*/.test(l));
      if (!lis.length && bul.length >= 2) { d.advantages = bul.map(l => l.replace(/^[•·\-–]\s*/, "")); d.tabs["Οφέλη"] = d.advantages.join("\n"); rest = rest.split("\n").filter(l => !/^[•·\-–]\s*/.test(l)).join("\n"); }
      if (rest && rest.length > 20) d.tabs["Πληροφορίες"] = rest;
    }
    const tbl = (tc.match(/<div class="product-table">([\s\S]*?)<\/table>/) || [])[1];
    if (tbl) {
      const rows = tbl.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_, r) => "<p>" + [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => text(c[1]).replace(/\n/g, " ¶ ")).filter(Boolean).join(" · ") + "</p>");
      const v = text(rows).replace(/ ¶ /g, "\n"); if (v) d.tabs["Συστατικά"] = v;
    }
    for (const m of tc.matchAll(/<h5[^>]*>([\s\S]*?)<\/h5>([\s\S]*?)(?=<h5|<\/div>\s*<\/div>\s*<\/div>)/g)) {
      const k = oneLine(m[1]).toUpperCase(); const v = text(m[2]); if (!k || !v) continue;
      if (/ΠΡΟΤΕΙΝΕΤΑΙ|ΚΑΤΑΛΛΗΛΟ|ΑΠΕΥΘΥΝΕΤΑΙ/.test(k)) {
        const ls = v.split("\n"), facts = ls.filter(l => /^(vegan|vegetarian|κατάλληλο για (vegan|χορτοφάγ))/i.test(l.trim()));
        for (const f of facts) d.keyFacts.push(/vegan/i.test(f) ? "Κατάλληλο για vegans" : "Κατάλληλο για χορτοφάγους");
        const r = ls.filter(l => !facts.includes(l)).join("\n").trim(); if (r) d.tabs["Ενδείξεις"] = r;
      }
      else if (/ΟΔΗΓΙΕΣ|ΔΟΣΟΛΟΓΙΑ|ΧΡΗΣΗ/.test(k)) d.tabs["Χρήση"] = [d.tabs["Χρήση"], v].filter(Boolean).join("\n");
      else if (/^(ΧΩΡΙΣ|FREE OF)/.test(k)) { d.attributes["Χωρίς"] = v.replace(/\n/g, ", ").replace(/\.$/, ""); d.keyFacts.push("Χωρίς " + d.attributes["Χωρίς"].toLowerCase()); }
      else if (/ΣΥΣΤΑΤΙΚ/.test(k)) d.tabs["Συστατικά"] = [d.tabs["Συστατικά"], v].filter(Boolean).join("\n\n");
      else if (/ΠΡΟΣΟΧΗ|ΠΡΟΦΥΛΑΞ|ΑΝΤΕΝΔ/.test(k)) d.tabs["Προφυλάξεις"] = [d.tabs["Προφυλάξεις"], v].filter(Boolean).join("\n");
      else d.tabs[oneLine(m[1]).replace(/^./, c => c).toLowerCase().replace(/^./, c => c.toUpperCase())] = v;
    }
    const warn = text((tc.match(/<p class="extra-info[^"]*">([\s\S]*?)<\/p>/) || [])[1] || "");
    if (warn) d.tabs["Προφυλάξεις"] = [d.tabs["Προφυλάξεις"], warn].filter(Boolean).join("\n");
    const eof = oneLine((tc.match(/<p class="eof-number[^"]*">([\s\S]*?)<br/) || [])[1] || "");
    if (eof && /\d/.test(eof)) d.attributes["Γνωστοποίηση ΕΟΦ"] = eof.replace(/^.*?ΕΟΦ\s*:?\s*/i, "");
  }
  if (!d.tabs["Προφυλάξεις"] && sub) d.tabs["Προφυλάξεις"] = sub;
  const plant = main.match(/<div class="plant-wrapper">\s*<h4[^>]*>([\s\S]*?)<\/h4>\s*<p[^>]*>([\s\S]*?)<\/p>/);
  if (plant && oneLine(plant[2])) d.tabs["Η υπερτροφή"] = text(plant[2]);
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  const img = (main.match(/<img class="product-image[^"]*" src="([^"]+)"/) || html.match(/property="og:image" content="([^"]+)"/) || [])[1];
  if (img) d.images.push(img);
  d.imageLarge = d.images[0] || null;
  d.subtitle = d.ingredient || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.ingredient || null;
  d.handle = decodeURIComponent(String(url).replace(/\/+$/, "").split("/").pop());
  const key = d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 70);
  d.gtin = "SF-" + (key.length >= 4 ? key : key + "item"); d.eans = [d.gtin];
  return d;
}

async function main() {
  const sm = await fetchText(BASE + "/product-sitemap.xml");
  const urls = [...new Set([...sm.matchAll(/<loc>(?:<!\[CDATA\[)?([^<\]]+)(?:\]\]>)?<\/loc>/g)].map(m => m[1]).filter(u => /\/el\/product\/[^/]+\/?$/.test(u)))];
  console.log(`superfoods.eu: ${urls.length} ελληνικές σελίδες προϊόντων`);
  const out = []; let err = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      const html = await fetchText(url);
      const d = extractSuperfoodsDetails(html, url);
      if (!d.title) { console.log(`[${i + 1}/${cap}] skip ${url}`); continue; }
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").slice(0, 24).padEnd(24)} ${(d.line || "-").slice(0, 18).padEnd(18)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
