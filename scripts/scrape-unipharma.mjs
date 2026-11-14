#!/usr/bin/env node
// scripts/scrape-unipharma.mjs
// Uni-Pharma (ελληνική φαρμακοβιομηχανία) = www.uni-pharma.gr — WordPress, post type «nonprescriptive» (REST), ελληνικά, χωρίς EAN.
// Λίστα: /wp-json/wp/v2/nonprescriptive (κατηγορίες non_prescriptive_drug_categories + brands). Τα links του REST είναι χαλασμένα
// («%nonprescriptive-slug%») → URL = /el/nonprescriptive/<slug>/ (όπως στο nonprescriptive-sitemap.xml).
// ΕΚΤΟΣ: φάρμακα (κατηγορίες «Μη Συνταγογραφούμενα» 680 και «Συνταγογραφούμενα» 679) — ο κατάλογος κρατά συμπληρώματα,
// ιατροτεχνολογικά, αντικουνουπικά, δερμοκαλλυντικά, στοματική κοιλότητα, τρόφιμα.
// Σελίδα (samples/unipharma-sample.html): h3.product-title, .product-subtitle (μορφή), .product-description (κείμενο, <ul> χαρακτηριστικά,
//   <strong>ΔΟΣΟΛΟΓΙΑ…:</strong>, <strong>ΣΥΣΚΕΥΑΣΙΑ:</strong>, «•» προειδοποιήσεις, Αρ. Γνωστοποίησης ΕΟΦ), .product-info (Μορφή, Συσκευασία),
//   .product-image img. Κλειδί: "UP-<slug>". Τιμές με js/unipharma-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-unipharma.mjs [--limit=5] [--delay=800]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/unipharma-site.json");
const BASE = "https://www.uni-pharma.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "800"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MEDICINES = new Set([679, 680]);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n").replace(/<\/t[dh]>/gi, " · "))).replace(/[ \t ]+/g, " ").replace(/ · \n/g, "\n").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const fetchJson = async u => JSON.parse(await fetchText(u));
const LABELS = [[/ΔΟΣΟΛΟΓΙΑ|ΤΡΟΠΟΣ ΧΡΗΣΗΣ|ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ|ΧΡΗΣΗ/i, "Χρήση"], [/ΣΥΣΤΑΤΙΚ|ΣΥΝΘΕΣΗ/i, "Συστατικά"], [/ΣΥΣΚΕΥΑΣΙΑ/i, "Συσκευασία"], [/ΕΝΔΕΙΞΕΙΣ/i, "Ενδείξεις"], [/ΠΡΟΦΥΛΑΞ|ΠΡΟΣΟΧΗ|ΠΡΟΕΙΔΟΠ/i, "Προφυλάξεις"]];

export function extractUnipharmaDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = oneLine((html.match(/<h3 class="product-title">([\s\S]*?)<\/h3>/) || [])[1] || "") || null;
  d.form = oneLine((html.match(/<div class="product-subtitle">([\s\S]*?)<\/div>/) || [])[1] || "") || null;
  const bc = (html.match(/<div class="products-page-breadcrumb">([\s\S]*?)<\/div>/) || [])[1] || "";
  d.breadcrumbs = [...bc.matchAll(/<(?:a|span)[^>]*>([\s\S]*?)<\/(?:a|span)>/g)].map(m => oneLine(m[1])).filter(x => x && x !== "/" && !/^ΠΡΟΪΟΝΤΑ$/i.test(x));
  d.category = d.breadcrumbs.slice(0, -1).join(" › ") || null;
  const descHtml = (html.match(/<div class="product-description[^"]*">([\s\S]*?)<\/div>\s*<div class="product-info">/) || [])[1] || "";
  // <strong>ΕΤΙΚΕΤΑ: </strong>κείμενο → χωριστό πεδίο
  let rest = descHtml.replace(/<strong>\s*([^<:]{3,60}):?\s*<\/strong>\s*:?\s*([\s\S]*?)(?=<br\s*\/?>\s*<strong>|<\/p>)/g, (all, lab, body) => {
    const hit = LABELS.find(([re]) => re.test(lab)); if (!hit) return all;
    const v = oneLine(body); if (v) d.tabs[hit[1]] = d.tabs[hit[1]] ? d.tabs[hit[1]] + "\n" + v : v; return "";
  });
  const lis = [...rest.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => oneLine(m[1])).filter(Boolean);
  rest = rest.replace(/<ul>[\s\S]*?<\/ul>/g, "");
  const lines = text(rest).split("\n").map(s => s.trim()).filter(Boolean), descL = [], warn = [];
  for (const l of lines) {
    const eof = l.match(/Αρ\.?\s*Γνωστ[^\s.:]*\.?\s*ΕΟΦ\s*:?\s*([0-9/\-.]+)/i); if (eof) { d.attributes["Γνωστοποίηση ΕΟΦ"] = eof[1]; continue; }
    if (/^•/.test(l) || /(Να μη γίνεται υπέρβαση|δεν πρέπει να χρησιμοποιούνται|Να φυλάσσεται|Συμβουλευτείτε|δεν προορίζεται για την πρόληψη)/i.test(l)) { warn.push(l.replace(/^•\s*/, "")); continue; }
    descL.push(l);
  }
  if (descL.length) d.tabs["Περιγραφή"] = descL.join("\n");
  if (lis.length) { d.advantages = lis; d.tabs["Οφέλη"] = lis.join("\n"); }
  d.keyFacts = lis.filter(l => /^(Χωρίς|Κατάλληλο|Χαμηλή|Με γεύση|Δεν περιέχει)/i.test(l) && l.length < 120);
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  if (warn.length) d.tabs["Προφυλάξεις"] = [d.tabs["Προφυλάξεις"], ...warn].filter(Boolean).join("\n");
  for (const m of html.matchAll(/<div class="row">\s*<b[^>]*>([\s\S]*?)<\/b>\s*<span>([\s\S]*?)<\/span>/g)) { const k = oneLine(m[1]).replace(/:$/, ""), v = oneLine(m[2]); if (k && v) d.attributes[k] = v; }
  if (d.tabs["Συσκευασία"]) { d.size = d.tabs["Συσκευασία"].split(/\s•\s|\.\s•/)[0].replace(/\.$/, "").trim(); d.attributes["Συσκευασία"] = d.size; delete d.tabs["Συσκευασία"]; }
  else if (d.attributes["Συσκευασία"]) d.size = d.attributes["Συσκευασία"];
  if (d.form && !d.attributes["Μορφή"]) d.attributes["Μορφή"] = d.form;
  const img = (html.match(/<div class="product-image">[\s\S]*?<img[^>]*src="([^"]+)"/) || [])[1];
  if (img) d.images.push(img.split("?")[0]);
  d.imageLarge = d.images[0] || null;
  d.sizes = d.size ? [d.size] : [];
  const first = (d.tabs["Περιγραφή"] || "").split(/(?<=\.)\s/)[0] || "";
  d.subtitle = d.form || (first.length <= 200 ? first : null);
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = first.length <= 200 ? first : null;
  d.handle = String(url).replace(/\/+$/, "").split("/").pop();
  const key = d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 70);
  d.gtin = "UP-" + (key.length >= 4 ? key : key + "item"); d.eans = [d.gtin];
  return d;
}

async function main() {
  const items = [];
  for (let pg = 1; pg < 10; pg++) { const a = await fetchJson(`${BASE}/wp-json/wp/v2/nonprescriptive?per_page=100&page=${pg}&_fields=id,slug,title,non_prescriptive_drug_categories,brands`).catch(() => []); items.push(...a); if (a.length < 100) break; }
  const brands = new Map(); for (let pg = 1; pg < 5; pg++) { const a = await fetchJson(`${BASE}/wp-json/wp/v2/brands?per_page=100&page=${pg}&_fields=id,name`).catch(() => []); for (const b of a) brands.set(b.id, decodeAll(b.name)); if (a.length < 100) break; }
  const cats = new Map((await fetchJson(`${BASE}/wp-json/wp/v2/non_prescriptive_drug_categories?per_page=100&_fields=id,name`)).map(c => [c.id, decodeAll(c.name)]));
  const keep = items.filter(p => !(p.non_prescriptive_drug_categories || []).some(c => MEDICINES.has(c)));
  console.log(`uni-pharma.gr: ${items.length} μη συνταγογραφούμενα, ${keep.length} εκτός φαρμάκων`);
  const out = []; let err = 0; const cap = Math.min(keep.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const p = keep[i]; const url = `${BASE}/el/nonprescriptive/${p.slug}/`;
    try {
      const html = await fetchText(url);
      const d = extractUnipharmaDetails(html, url);
      if (!d.title) { console.log(`[${i + 1}/${cap}] skip ${url}`); continue; }
      const bn = (p.brands || []).map(b => brands.get(b)).filter(Boolean); if (bn.length) { d.line = d.series = bn[0]; d.attributes["Σειρά"] = bn[0]; }
      d.categories = (p.non_prescriptive_drug_categories || []).map(c => cats.get(c)).filter(Boolean);
      d.category = d.categories.join(" | ") || d.category; if (d.category) d.attributes["Κατηγορία uni-pharma.gr"] = d.category;
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").slice(0, 26).padEnd(26)} ${(d.line || "-").padEnd(12)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  // ίδιο όνομα σε πολλές σελίδες (π.χ. Repel Spray 15/50/150ml) → συσκευασία στο όνομα
  const byName = {}; for (const e of out) (byName[e.name.toLowerCase()] ||= []).push(e);
  for (const g of Object.values(byName)) if (g.length > 1) for (const e of g) e.details.fullTitle = `${e.name} ${String(e.details.size || e.details.form || "").replace(/^(BT|BOV|FL|TB)\s*x\s*/i, "")}`.trim();
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
