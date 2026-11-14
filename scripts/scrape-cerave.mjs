#!/usr/bin/env node
// scripts/scrape-cerave.mjs
// CeraVe (L'Oréal / Sitecore, theme όπως Vichy) = www.cerave.gr. Χωρίς sitemap: BFS στις σελίδες /peripoihsh-dermatos/*
// (κατηγορίες ανά ανάγκη/τύπο δέρματος/συστατικό + σελίδες προϊόντων). Σελίδα προϊόντος (samples/cerave-sample.html):
//   JSON-LD Product (name, image[], gtin13), <h1> στο .pdp-heading, p.product-details__tagline (spans),
//   p.product-details__main-benefit, div.product-details__description (+ «Διαθέσιμα Μεγέθη: …»),
//   <accordion title="ΣΥΣΤΑΤΙΚΑ|ΟΦΕΛΗ|ΧΡΗΣΗ|ΠΡΟΦΥΛΑΞΕΙΣ">, κάρτες benefit (h3 + back-text).
// Το EAN της σελίδας (3606000…) είναι το νέο EAN· ο τιμοκατάλογος έχει συχνά τα παλιά 3337875… → manual matches.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-cerave.mjs [--limit=10] [--delay=1500]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/cerave-site.json");
const BASE = "https://www.cerave.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "1500"));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(p|li|ul)[^>]*>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/[​]/g, "").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const sizeNorm = s => { const m = String(s || "").replace(/(\d),(\d)/g, "$1.$2").match(/(\d{1,4}(?:\.\d+)?)\s?(ml|gr|g|l|kg)\b/i); return m ? (+m[1]) + m[2].toLowerCase().replace("gr", "g") : null; };
export const isCeraveProductPage = html => /class="product-details"/.test(html) && /"@type":\s*"Product"/.test(html);

export function extractCeraveDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  let ld = null;
  // EAN του κύριου προϊόντος = data-tag-label="…::EAN" του div.product-details (οι υπόλοιπες αναφορές είναι σχετικά προϊόντα)
  const mainEan = (html.match(/<div class="product-details"[^>]*data-tag-label="[^"]*::(\d{8,14})"/) || [])[1] || null;
  const norm = u => String(u || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  const lds = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { const j = JSON.parse(m[1]); if (j["@type"] === "Product") lds.push(j); } catch {} }
  ld = lds.find(j => norm(j.url || j["@id"]) === norm(url)) || lds.find(j => mainEan && String(j.gtin13 || j.sku) === mainEan) || (lds.length === 1 ? lds[0] : null);
  d.title = oneLine((html.match(/<div class="pdp-heading">[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") || (ld ? decodeAll(ld.name) : null);
  const tag = (html.match(/<p class="product-details__tagline">([\s\S]*?)<\/p>/i) || [])[1];
  if (tag) d.tagline = [...tag.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(m => oneLine(m[1])).filter(Boolean).join(" · ");
  const main = oneLine((html.match(/<p class="product-details__main-benefit">([\s\S]*?)<\/p>/i) || [])[1] || "");
  const descBlock = (html.match(/<div class="product-details__description">([\s\S]*?)<\/div>/i) || [])[1] || "";
  const sizesTxt = oneLine((descBlock.match(/Διαθέσιμ[^<]*<\/b>([\s\S]*?)$/i) || [])[1] || "");
  const desc = text(descBlock.replace(/<b>\s*Διαθέσιμ[\s\S]*$/i, ""));
  d.tabs["Περιγραφή"] = [main, desc].filter(Boolean).join("\n") || null;
  if (!d.tabs["Περιγραφή"]) delete d.tabs["Περιγραφή"];
  if (sizesTxt) d.attributes["Διαθέσιμα μεγέθη"] = sizesTxt;
  const accBlock = (html.match(/class="product-details__accordions"([\s\S]*?)<\/accordion-group>/) || [])[1] || "";
  for (const m of accBlock.matchAll(/<accordion[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/accordion>/g)) {
    const k = oneLine(m[1]).toUpperCase(); const body = m[2];
    if (/ΣΥΣΤΑΤΙΚ/.test(k)) { const inci = oneLine((body.match(/<p>([\s\S]*?)<\/p>/) || [])[1] || body); d.inci = inci; d.tabs["Συστατικά"] = "INCI: " + inci; }
    else if (/ΟΦΕΛ/.test(k)) { d.advantages = [...body.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x => oneLine(x[1])).filter(Boolean); d.tabs["Οφέλη"] = d.advantages.length ? d.advantages.join("\n") : text(body); }
    else if (/ΧΡΗΣΗ|ΕΦΑΡΜΟΓ/.test(k)) d.tabs["Χρήση"] = text(body);
    else if (/ΠΡΟΦΥΛΑΞ/.test(k)) d.tabs["Προφυλάξεις"] = text(body);
    else d.tabs[oneLine(m[1])] = text(body);
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); if (j["@type"] !== "FAQPage") continue;
      const qa = (j.mainEntity || []).map(q => `${oneLine(q.name)}\n${text(decodeAll((q.acceptedAnswer || {}).text || ""))}`).filter(x => x.trim());
      if (qa.length) d.tabs["Συχνές ερωτήσεις"] = qa.join("\n\n");
    } catch {}
  }
  for (const m of html.matchAll(/<div class="benefit__card-front-title icon-heading">\s*<h3>([\s\S]*?)<\/h3>[\s\S]*?class="richtext benefit__card-back-text">([\s\S]*?)<\/div>/g)) {
    const h = oneLine(m[1]), b = oneLine(m[2]); if (h) d.keyFacts.push(b ? `${h}: ${b}` : h);
  }
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  for (const im of (ld && ld.image) || []) { const u = (im.startsWith("http") ? im : BASE + im).split("?")[0]; if (!d.images.includes(u)) d.images.push(u); }
  d.imageLarge = d.images[0] || null;
  const ean = String(mainEan || (ld && (ld.gtin13 || ld.sku)) || "").trim();
  d.gtin = /^\d{13}$/.test(ean) ? ean : "CV-" + String(url).split("/").pop().replace(/[^A-Za-z0-9]/g, "").slice(0, 60);
  d.eans = [d.gtin];
  d.sizes = [...new Set((sizesTxt.match(/\d{1,4}(?:[.,]\d+)?\s?(?:ml|gr|g|l|kg)\b/gi) || []).map(sizeNorm).filter(Boolean))];
  // μέγεθος της κύριας σελίδας από τα tags (data-tag-product-variant="236 ml") όταν λείπει το «Διαθέσιμα Μεγέθη»
  const tm = html.match(new RegExp('data-tag-product-name="([^"]+)"[^>]*data-tag-product-variant="([^"]+)"[^>]*data-tag-product-id="' + (mainEan || "x") + '"'));
  const tagVar = tm && oneLine(tm[1]).toLowerCase() === String(d.title || "").toLowerCase() ? tm[2] : null;   // μόνο αν το tag είναι του ίδιου προϊόντος
  if (!d.sizes.length && sizeNorm(tagVar)) d.sizes = [sizeNorm(tagVar)];
  if (tagVar && !d.attributes["Διαθέσιμα μεγέθη"]) d.attributes["Μέγεθος"] = tagVar;
  d.size = d.sizes[0] || sizeNorm(d.title);
  const cat = (html.match(/data-tag-product-category="([^"]+)"[^>]*data-eans="\d+"/) || [])[1];
  if (cat) d.siteCategory = cat;
  d.subtitle = main || d.tagline || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = main || null;
  d.handle = String(url).replace(/\/+$/, "").split("/").pop();
  return d;
}

async function main() {
  const seen = new Set(), queue = [BASE + "/peripoihsh-dermatos", BASE + "/"], products = new Map(), catsOf = new Map();
  const catName = new Map();
  let fetched = 0;
  while (queue.length && products.size < LIMIT) {
    const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
    let html; try { html = await fetchText(url); fetched++; } catch (e) { console.log("ERR", url, e.message); continue; }
    if (isCeraveProductPage(html)) {
      const d = extractCeraveDetails(html, url);
      products.set(url, { url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${products.size}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${d.gtin} ${(d.sizes.join("/") || "-").padEnd(14)} | ${d.title}`);
    } else {
      const h1 = oneLine((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
      if (h1 && url !== BASE + "/") catName.set(url, h1);
    }
    for (const m of html.matchAll(/href="(\/peripoihsh-dermatos\/[a-z0-9-]+)\/?"/g)) {
      const u = BASE + m[1];
      if (!isCeraveProductPage(html) && url !== BASE + "/" && url !== BASE + "/peripoihsh-dermatos") { if (!catsOf.has(u)) catsOf.set(u, new Set()); catsOf.get(u).add(url); }
      if (!seen.has(u) && !queue.includes(u)) queue.push(u);
    }
    await sleep(DELAY_MS);
  }
  const out = [...products.values()];
  // Το cerave.gr έχει σε μερικές σελίδες το EAN άλλου προϊόντος (π.χ. Hydrating Cleanser = EAN της Moisturising Cream):
  // EAN που εμφανίζεται σε >1 σελίδα δεν είναι αξιόπιστο → συνθετικό κλειδί CV-<slug> (τιμή με αντιστοίχιση ονόματος).
  const cnt = {}; for (const p of out) cnt[p.gtin] = (cnt[p.gtin] || 0) + 1;
  for (const p of out) if (cnt[p.gtin] > 1) {
    p.details.siteEan = p.gtin;
    p.gtin = p.details.gtin = "CV-" + p.details.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 60); p.details.eans = [p.gtin];
  }
  for (const p of out) {
    const cats = [...(catsOf.get(p.url) || [])].map(u => catName.get(u)).filter(Boolean);
    p.details.categories = [...new Set(cats)];
    p.details.category = p.details.categories.join(" | ") || null;
    if (p.details.category) p.details.attributes["Κατηγορίες cerave.gr"] = p.details.category;
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. ${fetched} σελίδες, products=${out.length}, κατηγορίες=${catName.size}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
