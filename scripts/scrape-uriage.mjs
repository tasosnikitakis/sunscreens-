#!/usr/bin/env node
// scripts/scrape-uriage.mjs
// Uriage Ελλάδα = www.uriage.com/GR/el (το uriage.gr δεν απαντά). Χωρίς JSON-LD/EAN. Δομή (samples/uriage-sample.html):
//   .c-breadcrumb (Αρχική › Αντηλιακά › Αντηλιακή προστασία › Τίτλος), h1.c-product__title, p.c-product__subtitle, p.c-product__skin
//   .c-resume: <dt>Ιδανικό για</dt><dd>…</dd>, <dt>Μέγεθος</dt><dd>50ml</dd>
//   .c-product__intro (σύντομη περιγραφή), .c-product__description (πλήρης, HTML entities)
//   .c-product__part > h2.c-product__part-title: Αποτελέσματα / Ενεργά συστατικά / Συμβουλή / INCI
//   img.c-gallery__img src=/system/products/images/<id>/product_show_<file>
// Λίστα προϊόντων: /GR/el/site-map.xml (/GR/el/προϊόντα/<slug>). Κλειδί (χωρίς EAN): "UR-<slug>".
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-uriage.mjs [--limit=10] [--delay=800]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/uriage-site.json");
const BASE = "https://www.uriage.com";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "800"));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(s)).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const sizeNorm = s => { const m = String(s || "").replace(/(\d),(\d)/g, "$1.$2").match(/(\d{1,4}(?:\.\d+)?)\s?(ml|gr|g|l|kg)\b/i); return m ? (+m[1]) + m[2].toLowerCase().replace("gr", "g") : null; };

// Ελληνικά slugs (Κρέμα-Νερού-…) → λατινικοί χαρακτήρες για το κλειδί UR-…
const GR = { α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o" };
export const translit = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[α-ω]/g, c => GR[c] || c);

export function extractUriageDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const bc = html.match(/<div class='c-breadcrumb[^']*'>([\s\S]*?)<\/div>/i);
  if (bc) d.breadcrumbs = [...bc[1].matchAll(/<(?:a|span)[^>]*c-breadcrumb__item[^>]*>([\s\S]*?)<\/(?:a|span)>/g)].map(m => oneLine(m[1])).filter(Boolean).filter(x => !/^Αρχική/.test(x));
  d.title = oneLine((html.match(/<h1[^>]*c-product__title[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") || null;
  d.subtitle = oneLine((html.match(/<p class='c-product__subtitle'>([\s\S]*?)<\/p>/i) || [])[1] || "") || null;
  const skin = oneLine((html.match(/<p class='c-product__skin'>([\s\S]*?)<\/p>/i) || [])[1] || "").replace(/^\(|\)$/g, "");
  if (skin) d.attributes["Τύπος επιδερμίδας"] = skin;
  for (const m of html.matchAll(/<dt class='c-resume__label'>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) { const k = oneLine(m[1]), v = oneLine(m[2]); if (k && v) d.attributes[k] = v; }
  const crumbs = (d.breadcrumbs || []).slice(0, -1);
  d.category = crumbs.join(" › ") || null; d.line = crumbs[0] || null;
  // σειρά = πρώτη λέξη/πριν από « - » στον τίτλο (BARIÉSUN, HYSÉAC, XÉMOSE…)
  const series = (d.title || "").split(/\s+-\s+/)[0];
  if (series && series !== d.title && series.length <= 30) { d.series = series; d.attributes["Σειρά"] = series; }
  const intro = (html.match(/<div class='c-product__intro[^']*'>([\s\S]*?)<\/div>/i) || [])[1];
  const desc = (html.match(/<div class='c-product__description c-content'>([\s\S]*?)<\/div>\s*<div class='c-product__part/i) || [])[1];
  if (intro) d.tabs["Περιγραφή"] = text(intro) + (desc ? "\n" + text(desc) : "");
  else if (desc) d.tabs["Περιγραφή"] = text(desc);
  for (const m of html.matchAll(/<div class='c-product__part[^']*'>\s*<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<div class='c-product__part|<div class='c-product__help|<\/article>|<section)/g)) {
    const k = oneLine(m[1]); let v = text(m[2].replace(/<div class='c-product__figure'>([\s\S]*?)<\/div>/g, "$1 — "));
    if (!k || !v) continue;
    const key = /Αποτελέσματ/i.test(k) ? "Αποτελέσματα" : /Ενεργά/i.test(k) ? "Συστατικά" : /Συμβουλ/i.test(k) ? "Χρήση" : /INCI/i.test(k) ? "INCI" : k;
    d.tabs[key] = d.tabs[key] ? d.tabs[key] + "\n" + v : v;
  }
  if (d.tabs["INCI"]) { d.inci = d.tabs["INCI"].replace(/\s+/g, " "); d.tabs["Συστατικά"] = (d.tabs["Συστατικά"] ? d.tabs["Συστατικά"] + "\n" : "") + "INCI: " + d.inci; delete d.tabs["INCI"]; }
  for (const m of html.matchAll(/<img[^>]*class="c-gallery__img"[^>]*src="([^"]+)"/g)) { const u = BASE + m[1].split("?")[0]; if (!d.images.includes(u)) d.images.push(u); }
  if (!d.images.length) { const og = (html.match(/property="og:image" content="([^"]+)"/) || [])[1]; if (og) d.images.push(decodeAll(og).replace(/&#x2F;/g, "/").split("?")[0]); }
  d.imageLarge = d.images[0] || null;
  d.size = sizeNorm(d.attributes["Μέγεθος"]) || sizeNorm(d.title);
  d.sizes = d.size ? [d.size] : [];
  if ((d.attributes["Μέγεθος"] || "").split(/[,/–-]|\s+και\s+/).filter(x => sizeNorm(x)).length > 1) d.attributes["Διαθέσιμα μεγέθη"] = d.attributes["Μέγεθος"];
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || d.subtitle || null;
  d.shortDescription = d.subtitle || null;
  if (d.category) d.attributes["Κατηγορία uriage.com"] = d.category;
  const slug = decodeURIComponent(String(url).replace(/\/+$/, "").split("/").pop());
  const key = translit(slug).replace(/[^A-Za-z0-9]/g, "").slice(0, 80);
  d.gtin = "UR-" + (key.length >= 4 ? key : key + "item");
  d.eans = [d.gtin]; d.handle = slug;
  return d;
}

async function main() {
  const sm = await fetchText(BASE + "/GR/el/site-map.xml");
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /\/GR\/el\/(%CF%80%CF%81%CE%BF%CF%8A%CF%8C%CE%BD%CF%84%CE%B1|προϊόντα)\/[^/]+$/i.test(u)))];
  console.log(`uriage GR: ${urls.length} σελίδες προϊόντων`);
  const out = []; let err = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      const html = await fetchText(url);
      const d = extractUriageDetails(html, url);
      if (!d.title) { console.log(`[${i + 1}/${cap}] skip ${url}`); continue; }
      out.push({ url: decodeURI(url), section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").padEnd(6)} ${d.line || "-"} | ${d.title.slice(0, 55)}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
