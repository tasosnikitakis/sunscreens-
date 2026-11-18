#!/usr/bin/env node
// scripts/scrape-altion.mjs
// ALTION (συμπληρώματα διατροφής, ΒΙΑΝΕΞ / ΒΙΑΝ) = www.altion.gr — Joomla, χωρίς sitemap, EAN και τιμές.
// Λίστα: το μενού «Ανάγκες υγείας» (/anages-ygeias/<ανάγκη>/<προϊόν>) της αρχικής + /altion-kids· κάθε προϊόν μία φορά (slug).
// Σελίδα (div.product): <title> «ALTION Tonovit - ALTION» · .product-image (1η εικόνα = συσκευασία) · .product-description ·
//   .product-features h3 (οφέλη) · .bottom-tabs: «Συστατικά» (κείμενο ή εικόνα πίνακα) / «Τρόπος Λήψης» (+ «Συσκευασία: …») ·
//   .notes (προειδοποιήσεις ΕΟΦ, «Αρ. Γνωστοποίησης»). Οι «συμβουλές» (product-achievements) παραλείπονται.
// D3 Sticks → 2 εγγραφές (1000 / 2000 I.U.). Ανάγκες υγείας της σελίδας (μενού) → «Κατάλληλο για». Κλειδί: "AL-<slug>". Τιμές Medica με js/altion-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-altion.mjs [--delay=2000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/altion-site.json");
const BASE = "https://www.altion.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "2000"));
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const toLines = h => decodeAll(String(h || "").replace(/<(br|\/?p|\/?div|\/?li|\/?ul|\/?h\d|\/tr)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "))
  .replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").replace(/\s+([.,;:!])/g, "$1").replace(/\s*®/g, "®")
  .replace(/[ΑA]\s?LTION/g, "ALTION").replace(/Κ\s?ids/g, "Kids").replace(/(?<![\p{L}])To(?= )/gu, "Το").replace(/(?<![\p{L}])Mε/gu, "Με").replace(/(?<![\p{L}])Aυ/gu, "Αυ").replace(/(?<![\p{L}])Nα/gu, "Να").trim()).filter(Boolean);
const abs = u => !u ? null : /^https?:/.test(u) ? u : BASE + (u.startsWith("/") ? "" : "/") + u;
const block = (html, cls) => {   // περιεχόμενο του πρώτου <div class="cls"> με σωστό βάθος
  const i = html.search(new RegExp(`<div class="${cls}"`)); if (i < 0) return "";
  const s = html.indexOf(">", i) + 1; let depth = 1; const re = /<(\/?)div\b[^>]*>/g; re.lastIndex = s; let m;
  while ((m = re.exec(html))) { depth += m[1] ? -1 : 1; if (depth === 0) return html.slice(s, m.index); }
  return html.slice(s);
};

export function extractAltionDetails(url, raw, needs = []) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const html = String(raw || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "");
  d.title = toLines((html.match(/<title>([^<]+)<\/title>/) || [])[1] || "").join(" ").replace(/\s*-\s*ALTION\s*$/i, "").replace(/^ALTION\s+/i, "").replace(/\bkids\b/i, "Kids").trim();
  const page = html.slice(html.indexOf('<div class="page-contents">'));
  const img = block(page, "product-image");
  for (const m of img.matchAll(/<img[^>]*src="([^"]+)"/g)) { const u = abs(decodeAll(m[1])); if (!d.images.includes(u)) d.images.push(u); }
  d.description = toLines(block(page, "product-description")).join("\n") || null;
  const feats = [...block(page, "product-features").matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map(m => toLines(m[1]).join(" ")).filter(Boolean);
  if (feats.length) { d.tabs["Οφέλη"] = feats.join("\n"); d.keyFacts = feats; }
  // κάτω καρτέλες
  const bt = page.slice(page.indexOf('class="bottom-tabs'));
  const labels = [...(bt.match(/<ul>([\s\S]*?)<\/ul>/) || ["", ""])[1].matchAll(/<a class="tab-link">([^<]+)<\/a>/g)].map(m => decodeAll(m[1]).trim());
  const contents = []; let k = 0;
  while ((k = bt.indexOf('<div class="tab-content">', k)) >= 0) { contents.push(block(bt.slice(k), "tab-content")); k += 10; if (contents.length >= labels.length) break; }
  labels.forEach((label, i) => {
    const c = contents[i] || "";
    const key = /Συστατικ|Σύνθεση/i.test(label) ? "Συστατικά" : /Λήψη|Χρήση|Δοσολογ/i.test(label) ? "Χρήση" : label;
    let lines = toLines(c);
    if (key === "Συστατικά" && !lines.length) { const ti = (c.match(/<img[^>]*src="([^"]+)"/) || [])[1]; if (ti) d.ingredientsImage = abs(decodeAll(ti)); return; }   // πίνακας συστατικών μόνο ως εικόνα
    const out = [];
    for (const l of lines) {
      const sz = l.match(/^Συσκευασία\s*:?\s*(.+)$/i);
      if (sz) {
        let v = sz[1].replace(/\.$/, "").trim();
        const fl = v.match(/^(.*?)\s*-\s*Με γεύση\s+(.+)$/i); if (fl) { v = fl[1]; d.attributes["Γεύση"] = fl[2]; }
        v = v.replace(/^(\d+)\s*mL,\s*(.+)$/i, "$1ml ($2)").replace(/I\.U$/, "I.U.");
        d.size = v; d.sizes = [v]; d.attributes["Συσκευασία"] = v; continue;
      }
      out.push(l);
    }
    if (out.length) d.tabs[key] = [d.tabs[key], ...out].filter(Boolean).join("\n");
  });
  // χωρίς «Συσκευασία:» στο κείμενο — από την εικόνα συσκευασίας της σελίδας
  const SIZE_FIX = { "altion-b-complex-syrup": "150ml" };
  const h0 = url.replace(/\/+$/, "").split("/").pop();
  if (!d.size && SIZE_FIX[h0]) { d.size = SIZE_FIX[h0]; d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; }
  if (!d.sizes) d.sizes = [];
  // σημειώσεις ΕΟΦ
  for (const l of toLines(block(page, "notes p0-20"))) {
    const g = l.match(/Αρ\.?\s*Γνωστοποίησης\s*:?\s*(.+)$/i);
    if (g) { d.attributes["Αρ. γνωστοποίησης ΕΟΦ"] = g[1].trim(); continue; }
    if (/δεν επέχει θέση αδείας/i.test(l)) continue;
    d.tabs["Προφυλάξεις"] = [d.tabs["Προφυλάξεις"], l].filter(Boolean).join("\n");
  }
  d.attributes["Κατηγορία"] = "Συμπλήρωμα διατροφής";
  if (needs.length) d.tabs["Κατάλληλο για"] = needs.join(" · ");
  d.categories = needs; d.category = needs[0] || null;
  d.line = /kids/i.test(d.title) ? "ALTION Kids" : "ALTION"; d.series = d.line; d.attributes["Σειρά"] = d.line;
  if ((d.description || "").length < 120 && feats.length) d.description = [d.description, ...feats].filter(Boolean).join("\n");
  d.handle = url.replace(/\/+$/, "").split("/").pop();
  d.imageLarge = d.images[0] || null;
  d.gtin = `AL-${d.handle.replace(/^altion-/, "").replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

async function main() {
  const home = await fetchText(`${BASE}/`); await sleep(DELAY_MS);
  const kids = await fetchText(`${BASE}/altion-kids`); await sleep(DELAY_MS);
  const bySlug = new Map();   // slug → { url, needs[] }
  for (const h of [home, kids]) {
    // μενού: <span class="separator">Ανάγκη</span> … <a href="/anages-ygeias/x/altion-…">
    let need = null;
    for (const m of h.matchAll(/<span class="separator ">([^<]+)<\/span>|<a href="(\/anages-ygeias\/[^"]+\/(altion-[a-z0-9-]+))"/g)) {
      if (m[1]) { need = decodeAll(m[1]).trim(); continue; }
      const slug = m[3]; if (!bySlug.has(slug)) bySlug.set(slug, { url: BASE + m[2], needs: [] });
      const e = bySlug.get(slug); if (need && !e.needs.includes(need)) e.needs.push(need);
    }
  }
  console.log(`altion.gr: ${bySlug.size} προϊόντα`);
  const out = []; let err = 0;
  for (const [slug, e] of bySlug) {
    let html = null;
    try { html = await fetchText(e.url); } catch (x) { err++; console.log(`  ! ${e.url}: ${x.message}`); continue; }
    await sleep(DELAY_MS);
    const d = extractAltionDetails(e.url, html, e.needs);
    // D3 Sticks: μία σελίδα για 2 περιεκτικότητες (1000 & 2000 I.U., ξεχωριστά barcode/τιμή) → 2 εγγραφές
    if (d.handle === "altion-d3-sticks") {
      for (const iu of ["1000", "2000"]) {
        const c = JSON.parse(JSON.stringify(d)); c.title = `${d.title} ${iu} I.U.`; c.gtin = `${d.gtin}${iu}`; c.eans = [c.gtin];
        c.attributes["Περιεκτικότητα"] = `${iu} I.U. βιταμίνης D3 ανά stick`;
        out.push({ url: e.url, section: "p", name: c.title, description: (c.description || "").slice(0, 700), longDescription: c.description, subtitle: null, details: c, image: c.images[0] || null, gtin: c.gtin });
        console.log(`  img+ (διπλή περιεκτικότητα) ${c.gtin} | ${c.title}`);
      }
      continue;
    }
    out.push({ url: e.url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: null, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`  ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(50)} ${(d.size || "-").padEnd(28)} ${d.gtin.padEnd(22)} | ${d.title}`);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
