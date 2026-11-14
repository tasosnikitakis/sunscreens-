#!/usr/bin/env node
// scripts/scrape-solgar.mjs
// Solgar Ελλάδα = www.solgar.gr (Nestlé Health Science, Drupal). Χωρίς EAN/τιμές.
// Το Akamai του Nestlé απορρίπτει αιτήματα χωρίς πλήρη headers browser → τα αιτήματα γίνονται με curl και headers Chrome.
// Λίστα: /sitemap.xml (σελίδες /proionta/<slug>). Σελίδα (samples/solgar-sample.html):
//   JSON-LD Product (name, category «Α, Β & Γ,Δ,…», description, image.url), <div class="title"><h1>,
//   .product-certifications (Vegan, Gluten Free…), .block-available <li> (διαθέσιμα μεγέθη: «30 ταμπλέτες»),
//   #accordionProduct .card: ΠΡΟΤΕΙΝΟΜΕΝΗ ΧΡΗΣΗ / ΣΥΣΤΑΤΙΚΑ / ΠΡΟΦΥΛΑΞΕΙΣ.
// Κάθε διαθέσιμο μέγεθος = variant με συνθετικό κλειδί "SG-<slug>V<μέγεθος>" (ο τιμοκατάλογος έχει τιμή ανά μέγεθος).
// Οι τιμές μπαίνουν από τον τιμοκατάλογο με js/solgar-manual-matches.json (barcode → κλειδί μεγέθους ή url).
// Χρήση: node scripts/scrape-solgar.mjs [--limit=5] [--delay=1200]

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const run = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/solgar-site.json");
const BASE = "https://www.solgar.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "1200"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n").replace(/<\/t[dh]>/gi, " "))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
export const HEADERS = [
  "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language: el-GR,el;q=0.9,en;q=0.8",
  "Accept-Encoding: gzip, deflate, br", "Sec-Fetch-Mode: navigate", "Sec-Fetch-Site: none", "Sec-Fetch-Dest: document", "Upgrade-Insecure-Requests: 1"
];
async function fetchText(url) {
  const { stdout } = await run("curl", ["-sS", "--compressed", "--max-time", "45", "-w", "\n%{http_code}", ...HEADERS.flatMap(h => ["-H", h]), url], { maxBuffer: 32 << 20 });
  const i = stdout.lastIndexOf("\n"); const code = +stdout.slice(i + 1);
  if (code !== 200) throw new Error(`HTTP ${code}`);
  return stdout.slice(0, i);
}
// «30 ταμπλέτες» → { size: "30 ταμπλέτες", token: "30t" }
const UNIT = [[/ταμπλ|tabl/i, "t"], [/φυτοκ[αά]ψ|vegetable cap|veg/i, "v"], [/μαλακ|softgel/i, "s"], [/κ[αά]ψουλ|cap/i, "c"], [/ml|μλ/i, "ml"], [/gr?\b|γρ/i, "g"], [/μασ[ωώ]μεν|chew/i, "m"], [/φακελ|sachet/i, "f"]];
const sizeToken = s => { const m = String(s).match(/(\d{1,4})/); if (!m) return null; const u = (UNIT.find(([re]) => re.test(s)) || [null, "x"])[1]; return m[1] + u; };

export function extractSolgarDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  let ld = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1]); ld = ld || (j["@graph"] || [j]).find(g => g["@type"] === "Product"); } catch {}
  }
  d.title = oneLine((html.match(/<div class="title">\s*<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") || (ld && ld.name) || null;
  const cats = String((ld && ld.category) || "").split(/,(?!\s)/).map(s => s.trim()).filter(Boolean);
  d.categories = cats; d.category = cats.join(" | ") || null; d.line = cats[0] || null;
  if (d.category) d.attributes["Κατηγορίες solgar.gr"] = d.category;
  // πιστοποιήσεις (Vegan, Gluten Free…) = <div class="icon-text">…<div class="text"><span>…</span>
  const certBlock = (html.match(/<div class="product-certifications">([\s\S]*?)<div class="(?:description|row-description|product-description|body)/) || html.match(/<div class="product-certifications">([\s\S]{0,20000})/) || [])[1] || "";
  d.keyFacts = [...new Set([...certBlock.matchAll(/<div class="icon-text">[\s\S]*?<div class="text">\s*<span>([\s\S]*?)<\/span>/g)].map(m => oneLine(m[1])).filter(Boolean))];
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  let desc = String((ld && ld.description) || "").replace(/\r/g, "");
  const eof = (desc.match(/Αριθ\.?\s*Πρωτ\.?[^\n]*/) || [])[0];
  if (eof) { d.attributes["Γνωστοποίηση ΕΟΦ"] = eof.replace(/^Αριθ\.?\s*Πρωτ\.?\s*Γνωστοποίησης\s*ΕΟΦ:?\s*/i, "").trim(); desc = desc.replace(eof, ""); }
  desc = desc.replace(/\n\s*\[\d+\][\s\S]*$/, "").replace(/\[\d+\](,\s*\[\d+\])*/g, "").replace(/&nbsp;/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (desc) d.tabs["Περιγραφή"] = decodeAll(desc);
  const avail = (html.match(/<div class="col-md-8 list-available">([\s\S]*?)<\/ul>/) || [])[1] || "";
  const sizes = [...avail.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => oneLine(m[1])).filter(Boolean);
  if (sizes.length) d.attributes["Διαθέσιμα μεγέθη"] = sizes.join(", ");
  for (const m of html.matchAll(/<div class="card-header"[^>]*>\s*<button[^>]*>([\s\S]*?)<span class="toggle"><\/span>\s*<\/button>\s*<\/div>\s*<div id="collapse\d+"[^>]*>\s*<div class="card-body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)) {
    const k = oneLine(m[1]).toUpperCase(); const v = text(m[2]); if (!v) continue;
    const key = /ΧΡΗΣΗ/.test(k) ? "Χρήση" : /ΣΥΣΤΑΤΙΚ/.test(k) ? "Συστατικά" : /ΠΡΟΦΥΛΑΞ/.test(k) ? "Προφυλάξεις" : oneLine(m[1]);
    d.tabs[key] = v;
  }
  const img = ld && ld.image && (ld.image.url || ld.image);
  if (img && typeof img === "string") d.images.push(img.startsWith("http") ? img : BASE + img);
  // χωρίς εικόνα στο JSON-LD: og:image, μετά οι εικόνες της gallery (πριν από το κείμενο του προϊόντος)
  if (!d.images.length) { const og = (html.match(/property="og:image" content="([^"]+)"/) || [])[1]; if (og) d.images.push(og); }
  if (!d.images.length) { const gal = html.slice(0, Math.max(0, html.indexOf("main-contentInfoProduct")));
    for (const m of gal.matchAll(/(?:src|data-src)="([^"]+\/files\/[^"]+\.(?:png|jpe?g|webp))"/g)) if (!d.images.includes(m[1])) d.images.push(m[1].startsWith("http") ? m[1] : BASE + m[1]); }
  d.imageLarge = d.images[0] || null;
  d.handle = String(url).replace(/\/+$/, "").split("/").pop();
  const base = d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 60);
  d.gtin = "SG-" + (base.length >= 4 ? base : base + "item");
  d.variants = sizes.map(s => ({ ean: `${d.gtin}V${sizeToken(s) || "x"}`, size: s })).filter((v, i, a) => a.findIndex(x => x.ean === v.ean) === i);
  d.eans = d.variants.length ? d.variants.map(v => v.ean) : [d.gtin];
  d.sizes = sizes; d.size = sizes[0] || null;
  d.subtitle = (d.tabs["Περιγραφή"] || "").split("\n").find(l => l.trim().length > 30)?.slice(0, 200) || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  return d;
}

async function main() {
  const sm = await fetchText(BASE + "/sitemap.xml");
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /\/proionta\/[^/]+$/.test(u)))];
  console.log(`solgar.gr: ${urls.length} σελίδες προϊόντων`);
  const out = []; let err = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    let ok = false;
    for (let t = 0; t < 3 && !ok; t++) {
      try {
        const html = await fetchText(url);
        const d = extractSolgarDetails(html, url);
        if (!d.title) { console.log(`[${i + 1}/${cap}] skip ${url}`); ok = true; break; }
        out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
        console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${String(d.variants.length).padStart(2)}sz ${(d.line || "-").slice(0, 24).padEnd(24)} | ${d.title}`);
        ok = true;
      } catch (ex) { if (t === 2) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); } else await sleep(4000); }
    }
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
