#!/usr/bin/env node
// scripts/scrape-helenvision.mjs
// Helenvision (ελληνική εταιρία, οφθαλμική φροντίδα) = helenvision.gr — WordPress + WooCommerce (+WPML).
// Όλα από το Store API /wp-json/wc/store/v1/products (ένα αίτημα): short_description = «συσκευασία» + περιγραφή,
// description = ενότητες με <strong>ΤΙΤΛΟ:</strong> (ΟΦΕΛΗ, ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ, ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ, ΣΥΝΘΕΣΗ, ΠΡΟΕΙΔΟΠΟΙΗΣΕΙΣ)
// και «BARCODE: 52130…» → πραγματικό EAN (ακριβές match με τη Medica, χωρίς manual matches).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-helenvision.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/helenvision-site.json");
const BASE = "https://helenvision.gr";
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const toLines = h => decodeAll(String(h || "").replace(/<img[^>]*alt="CE Mark"[^>]*>/gi, "CE ").replace(/<(br|\/?p|\/?li|\/?ul|\/?h\d)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, ""))
  .replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const KEY = t => /ΟΦΕΛΗ/i.test(t) ? "Οφέλη" : /ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ/i.test(t) ? "Χαρακτηριστικά" : /ΟΔΗΓΙΕΣ|ΧΡΗΣΗ|ΔΟΣΟΛΟΓΙΑ/i.test(t) ? "Χρήση"
  : /ΣΥΝΘΕΣΗ|ΣΥΣΤΑΤΙΚΑ/i.test(t) ? "Συστατικά" : /ΠΡΟΕΙΔΟΠΟΙΗΣΕΙΣ|ΠΡΟΦΥΛΑΞΕΙΣ|ΠΡΟΣΟΧΗ/i.test(t) ? "Προφυλάξεις" : /ΕΝΔΕΙΞΕΙΣ/i.test(t) ? "Ενδείξεις" : null;

export function extractHelenvisionDetails(p) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = decodeAll(p.name).replace(/^HELENVISION\s+/i, "").trim();
  const short = toLines(p.short_description);
  // πρώτη γραμμή = συσκευασία («20 αμπούλες x 0.5ml», «10ml», «30 κάψουλες»)
  if (short.length && short[0].length < 50 && /\d/.test(short[0])) {
    d.size = short.shift().replace(/\s*x\s*/i, " × ").replace(/(\d)\.(\d)/g, "$1,$2");
    d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size;
  } else d.sizes = [];
  d.description = short.join("\n") || null;
  let key = null;
  for (const l of toLines(p.description)) {
    const bc = l.match(/^BARCODE\s*:?\s*(\d{8,14})/i);
    if (bc) { d.ean = bc[1]; continue; }
    const h = l.match(/^([Α-ΩΆ-Ώ ]{4,40})\s*:\s*(.*)$/);
    if (h && KEY(h[1])) { key = KEY(h[1]); if (h[2]) d.tabs[key] = [d.tabs[key], h[2]].filter(Boolean).join("\n"); continue; }
    if (!key) { d.description = [d.description, l].filter(Boolean).join("\n"); continue; }
    if (/^CE\s*\d{4}/.test(l)) { d.attributes["Κατηγορία"] = l.replace(/^CE\s*(\d{4})\s*/, "CE $1 — "); continue; }
    d.tabs[key] = [d.tabs[key], l].filter(Boolean).join("\n");
  }
  // σύντομη περιγραφή (μία φράση) → + τα «Οφέλη» της σελίδας
  if ((d.description || "").length < 120 && d.tabs["Οφέλη"]) d.description = [d.description, d.tabs["Οφέλη"]].filter(Boolean).join("\n");
  const cats = (p.categories || []).map(c => decodeAll(c.name));
  d.category = cats[0] || null; d.categories = cats;
  if (d.category) { d.line = d.category; d.attributes["Κατηγορία helenvision.gr"] = d.category; }
  for (const im of p.images || []) { const u = String(im.src || "").split("?")[0]; if (u && !d.images.includes(u)) d.images.push(u); }
  d.handle = decodeURIComponent(String(p.permalink).replace(/\/+$/, "").split("/").pop());
  d.imageLarge = d.images[0] || null;
  d.gtin = d.ean || `HV-${d.handle.replace(/^helenvision-/, "").replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

async function main() {
  const all = [];
  for (let pg = 1; pg < 10; pg++) { const a = JSON.parse(await fetchText(`${BASE}/wp-json/wc/store/v1/products?per_page=100&page=${pg}`)); all.push(...a); if (a.length < 100) break; }
  const out = [];
  for (const p of all) {
    if (/promo|offer|δώρο|gift|\bset\b|\s\+\s/i.test(decodeAll(p.name))) { console.log(`  - promo/σετ, εκτός: ${p.name}`); continue; }
    const d = extractHelenvisionDetails(p);
    out.push({ url: p.permalink, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: null, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`  ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(56)} ${(d.size || "-").padEnd(22)} ${String(d.gtin).padEnd(16)} | ${d.title}`);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
