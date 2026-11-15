#!/usr/bin/env node
// scripts/scrape-vencil.mjs
// Vencil Pharmaceuticals = www.vencil.gr — nopCommerce, ελληνικά στο /el/, χωρίς EAN.
// Λίστα: /sitemap.xml → όλα τα /el/… URL· σελίδα προϊόντος = έχει .product-essential (κατηγορίες/blog/νέα παραλείπονται).
// Σελίδα (samples/vencil-sample.html): .category-name (σειρά), .product-name h1 (όνομα + μέγεθος), .short-description,
//   .full-description με <h3> ενότητες (ΣΥΣΤΑΤΙΚΑ / ΕΝΔΕΙΞΕΙΣ / ΠΡΟΤΕΙΝΟΜΕΝΗ ΧΡΗΣΗ / ΠΡΟΣΟΧΗ …), εικόνα #main-product-img-*.
// ΕΚΤΟΣ: προϊόντα αισθητικής ιατρικής (επαγγελματικά — σειρά «Προϊόντα Αισθητικής Ιατρικής»).
// Κλειδί: "VE-<slug>". Τιμές με js/vencil-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-vencil.mjs [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/vencil-site.json");
const BASE = "https://www.vencil.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "1000"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<(p|li|div|h\d)\b[^>]*>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
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
const SEC = [[/ΣΥΣΤΑΤΙΚ|ΣΥΝΘΕΣΗ|ΔΡΑΣΤΙΚ/i, "Ενεργά συστατικά"], [/ΕΝΔΕΙΞ|ΚΑΤΑΛΛΗΛΟ/i, "Ενδείξεις"], [/ΧΡΗΣΗ|ΔΟΣΟΛΟΓΙΑ|ΟΔΗΓΙΕΣ|ΕΦΑΡΜΟΓΗ/i, "Χρήση"], [/ΠΡΟΣΟΧΗ|ΠΡΟΦΥΛΑΞ|ΠΡΟΕΙΔΟΠ|ΑΝΤΕΝΔΕΙΞ/i, "Προφυλάξεις"], [/ΟΦΕΛ|ΔΡΑΣΗ|ΙΔΙΟΤΗΤ|ΠΛΕΟΝΕΚΤ/i, "Οφέλη"], [/INGREDIENTS|INCI/i, "Συστατικά"], [/ΣΥΣΚΕΥΑΣ|ΜΟΡΦΗ/i, "Συσκευασία"]];

export function extractVencilDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  if (!/class=product-essential|class="product-essential"/.test(html)) return null;
  d.rawTitle = oneLine((html.match(/class=product-name><h1>([\s\S]*?)<\/h1>/) || html.match(/class="product-name"[^>]*>\s*<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "");
  if (!d.rawTitle) return null;
  d.line = oneLine((html.match(/class=category-name><h3><span>([\s\S]*?)<\/span>/) || html.match(/class="category-name"[^>]*>\s*<h3[^>]*>\s*<span>([\s\S]*?)<\/span>/) || [])[1] || "") || null;
  const sz = d.rawTitle.match(/(\d+(?:[.,]\d+)?)\s?(ml|gr|g|caps|tabs|sachets|κάψουλες|δισκία|φακελίσκοι|τμχ)\b\.?$/i) || d.rawTitle.match(/(\d+)\s?(caps|tabs)\b/i);
  d.size = sz ? `${sz[1]}${/ml|gr|g/i.test(sz[2]) ? sz[2].toLowerCase().replace("gr", "g") : " " + sz[2].toLowerCase()}` : null;
  d.title = d.rawTitle.replace(/^Vencil\s+/i, "").replace(/\s*\d+(?:[.,]\d+)?\s?(ml|gr|g)\.?$/i, "").replace(/\s*[-–]\s*$/, "").trim();
  d.subtitle = null;
  const sd = text((html.match(/class=short-description>([\s\S]*?)<\/div>/) || html.match(/class="short-description"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "");
  if (sd) d.tabs["Περιγραφή"] = sd;
  const fd = (html.match(/class=full-description>([\s\S]*?)<input name=__RequestVerificationToken/) || html.match(/class="full-description"[^>]*>([\s\S]*?)<\/form>/) || [])[1] || "";
  const parts = fd.split(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/);
  if (parts[0] && text(parts[0]).length > 20) d.tabs["Περιγραφή"] = [d.tabs["Περιγραφή"], text(parts[0])].filter(Boolean).join("\n");
  for (let i = 1; i < parts.length; i += 2) {
    const head = oneLine(parts[i]); const body = text(parts[i + 1] || ""); if (!head || !body) continue;
    const key = (SEC.find(([re]) => re.test(head)) || [])[1] || (head[0] + head.slice(1).toLowerCase());
    d.tabs[key] = [d.tabs[key], body].filter(Boolean).join("\n");
  }
  if (d.tabs["Συσκευασία"]) { if (!d.size) d.size = d.tabs["Συσκευασία"].split("\n")[0].replace(/\.$/, ""); delete d.tabs["Συσκευασία"]; }
  // «Tired Legs Gel 100 & 200ml», «Octenoven Spray 50, 100 & 200ml», «Hairnail 30 & Extra 90 Caps» → ένα κλειδί ανά μέγεθος
  const multi = d.rawTitle.match(/^(?:Vencil\s+)?(.*?)\s+((?:\d+\s*(?:,|&)\s*)+(?:Extra\s+)?\d+)\s*(ml|caps|tabs)\.?$/i);
  if (multi) {
    d.title = multi[1].trim(); const unit = multi[3].toLowerCase();
    d.sizes = multi[2].split(/\s*(?:,|&)\s*/).map(x => x.trim()).filter(Boolean).map(x => /ml/.test(unit) ? `${x}ml` : `${x} ${unit}`);
    d.size = d.sizes[0];
  } else d.sizes = d.size ? [d.size] : [];
  if (d.sizes.length > 1) d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", "); else if (d.size) d.attributes["Συσκευασία"] = d.size;
  if (d.tabs["Ενεργά συστατικά"]) d.advantages = d.tabs["Ενεργά συστατικά"].split("\n").filter(l => l.length > 10);
  if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; d.category = d.line; d.categories = [d.line]; }
  d.subtitle = (sd.split(/(?<=\.)\s/)[0] || "").slice(0, 160) || null;
  const img = (html.match(/id=main-product-img-\d+[^>]*>/) ? (html.match(/<img[^>]*src=(https:\/\/www\.vencil\.gr\/images\/thumbs\/[^ >]+)[^>]*id=main-product-img/) || [])[1] : null)
    || (html.match(/<img[^>]*src="?(https:\/\/www\.vencil\.gr\/images\/thumbs\/[^" >]+)"?[^>]*main-product-img/) || [])[1]
    || (html.match(/property="?og:image"? content="?([^" >]+)/) || [])[1];
  if (img) d.images.push(decodeAll(img));   // _550 = 550px (αρκεί· το πλήρες είναι ~1MB)
  d.imageLarge = d.images[0] || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = decodeURIComponent(String(url).replace(/\/+$/, "").split("/").pop());
  const key = d.handle.replace(/^vencil-/, "").normalize("NFD").replace(/[^A-Za-z0-9]/g, "").slice(0, 60);
  d.gtin = "VE-" + (key.length >= 4 ? key : key + "item"); d.eans = [d.gtin];
  if (d.sizes.length > 1) { d.variants = d.sizes.map(z => ({ ean: d.gtin + z.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(ml|caps|tabs)$/, ""), size: z })); d.eans = d.variants.map(v => v.ean); d.gtin = d.eans[0]; }
  return d;
}

async function main() {
  const sm = await fetchText(BASE + "/sitemap.xml");
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(u => /^https:\/\/www\.vencil\.gr\/el\/[^/]+$/.test(u) && !/%[0-9A-F]{2}/.test(u)))];
  console.log(`vencil.gr: ${urls.length} ελληνικές σελίδες στο sitemap`);
  const out = []; let err = 0, skip = 0, pro = 0;
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (/\/(search|contactus|news|blog|gdpr|accessibility-statement|proionta-vencil|[a-z-]+-series[^/]*|maternity|supplements|proionta-aisthitikis-iatrikis|vencil-new-products)$/.test(url)) { skip++; continue; }
    try {
      const html = await fetchText(url);
      const d = extractVencilDetails(html, url);
      if (!d) { skip++; await sleep(DELAY_MS / 2); continue; }
      if (/Αισθητικής Ιατρικής|Aesthetic/i.test(d.line || "")) { pro++; console.log(`[${i + 1}] εκτός (αισθητική ιατρική) | ${d.rawTitle}`); await sleep(DELAY_MS); continue; }
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").padEnd(10)} ${(d.line || "-").slice(0, 20).padEnd(20)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  const seen = {}; for (const p of out) { if (seen[p.gtin]) { p.gtin = p.details.gtin = p.gtin + "x" + (++seen[p.gtin]); p.details.eans = [p.gtin]; } else seen[p.gtin] = 1; }
  const byName = {}; for (const p of out) (byName[p.name.toLowerCase()] ||= []).push(p);
  for (const g of Object.values(byName)) if (g.length > 1) for (const p of g) if (p.details.size) p.details.fullTitle = `${p.name} ${p.details.size}`;
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} skipped=${skip} aesthetic=${pro} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
