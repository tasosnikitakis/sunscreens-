#!/usr/bin/env node
// scripts/scrape-podia.mjs
// Podia footcare (ελληνική εταιρία) = www.podiafootcare.com — WordPress + Elementor (θέμα «artware»), ελληνικά, χωρίς EAN/τιμές.
// Λίστα από το /pproducts-sitemap.xml (εκτός /en/). Η σελίδα είναι διαδοχή από widgets: product-features (τίτλος h1 + χαρακτηριστικά),
// content-toggle (περιγραφή), title-tagline (επικεφαλίδα ενότητας) + content-toggle (κείμενο), steps-carousel (βήματα εφαρμογής),
// nested-repeater «Συστατικά», notice «Αντενδείξεις», slickslider (φωτογραφίες). Κρατάμε: Περιγραφή, Οφέλη, Δράση, Χρήση, Συστατικά,
// Προφυλάξεις — όχι video/στατιστικά/ρουτίνες/blog/ερωτήσεις/προτεινόμενα. Κλειδί "PD-<slug>"· τιμές (Medica) με js/podia-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-podia.mjs [--cache=<dir>] [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/podia-site.json");
const BASE = "https://www.podiafootcare.com";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "1000"));
const CACHE = opt("cache", null);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "\n• ").replace(/<\/(p|li|div|h\d|ul)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
// επικεφαλίδα (title-tagline) → ενότητα· null = παράλειψη
// μεγέθη που δεν αναφέρονται στη σελίδα αλλά πωλούνται ξεχωριστά (τιμοκατάλογος): slug → μεγέθη
const FAMILIES = {
  "prostateftiko-kalyma-daktylou": ["Small", "Medium", "Large"],
  "prostateftikos-kylindros-gelis-daktylon": ["Small", "Medium"],
  "anatomikoi-patoi-kathimerinis-anesis-xekourasis": ["Νο 39", "Νο 44"]
};
const HEAD = [[/Στοχευμ|Δραση|Δράση|Πώς δρα|Τεχνολογ/i, "Δράση"], [/Συμβουλ|εφαρμογ|Χρήση|Οδηγ/i, "Χρήση"], [/Video|Στατιστικ|ΟΙΚΟΛΟΓΙΚ|FSC|επαγγελματ|ΡΟΥΤΙΝ|Ακούμε|Blog|ερωτησ|Συνδυ|Σημεία πώλησης|Προστατευμ/i, null]];

async function fetchText(url) {
  for (let t = 0; t < 3; t++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, signal: AbortSignal.timeout(60000) });
    if (r.ok) return r.text();
    await sleep(4000 * (t + 1));
  }
  throw new Error("HTTP failed " + url);
}

export function extractPodiaDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const h = html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/g, "");
  const start = h.indexOf("artware-product-features.default");
  d.title = oneLine((h.slice(start).match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/\.$/, "");
  d.keyFacts = [...h.slice(start, start + 8000).matchAll(/<div class="feature-title">([\s\S]*?)<\/div>/g)].map(m => oneLine(m[1])).filter(Boolean);
  const crumb = oneLine((h.match(/artware-breadcrumbs[\s\S]*?<\/div>\s*<\/div>/) || [""])[0]).replace(/^.*?Προϊόντα\s*\/\s*/, "");
  d.category = crumb.split("/").map(s => s.trim()).filter(Boolean).pop() || null;
  // widgets με τη σειρά
  const parts = h.slice(start).split(/data-widget_type="([^"]+)"/);
  let head = "Περιγραφή", first = true;
  const add = (k, v) => { if (k && v) d.tabs[k] = [d.tabs[k], v].filter(Boolean).join("\n"); };
  for (let k = 1; k < parts.length; k += 2) {
    const w = parts[k], body = parts[k + 1].replace(/<div class="elementor-element[\s\S]*$/, "").replace(/^\s*>/, "");
    if (/featured-products|comments-form|blog-carousel/.test(w)) break;
    if (w.startsWith("artware-title-tagline")) { const t = oneLine(body); head = (HEAD.find(([re]) => re.test(t)) || [, "Πληροφορίες"])[1]; first = false; continue; }
    if (w.startsWith("artware-content-toggle")) { add(first ? "Περιγραφή" : head, text(body).replace(/^>\s*/, "")); first = false; continue; }
    if (w.startsWith("artware-steps-carousel")) { add("Χρήση", text(body).replace(/Βήμα (\d+)\s*\n?/g, "Βήμα $1: ")); continue; }
    if (w.startsWith("artware-nested-repeater")) { add("Συστατικά", text(body).replace(/^(Συστατικ[αά]|Σύσταση|B?Βασικά συστατικά|Bασικά συστατικά)\s*$/gim, "").replace(/\n{2,}/g, "\n").trim()); continue; }
    if (w.startsWith("artware-notice")) { const t = text(body); if (/^Αντενδείξ|^Προσοχ|^Προειδοπ/i.test(t)) add("Προφυλάξεις", t.replace(/^Αντενδείξεις και Ειδικές Οδηγίες\s*/i, "")); else if (/^Tip/i.test(t)) add("Χρήση", t.replace(/^Tip\s*/i, "Συμβουλή: ")); continue; }
  }
  for (const k of Object.keys(d.tabs)) d.tabs[k] = d.tabs[k].split("\n").filter(l => !/^(Περισσότερα|Λιγότερα|Ανακαλύψτε την|>)$/i.test(l.trim()) && !/Curabitur|Lorem ipsum/i.test(l)).join("\n").trim();
  if (d.keyFacts.length) { d.tabs["Οφέλη"] = d.keyFacts.join("\n"); d.advantages = d.keyFacts; }
  for (const m of h.matchAll(/<div class="product-img-carousel">([\s\S]*?)<div class="zoom">/g)) for (const im of m[1].matchAll(/data-src="([^"]+)"/g)) if (!d.images.includes(im[1])) d.images.push(im[1]);
  d.imageLarge = d.images[0] || null;
  d.catSlug = d.category; d.categories = d.category ? [d.category] : []; d.line = d.category;
  if (d.category) d.attributes["Κατηγορία"] = d.category;
  const all = Object.values(d.tabs).join("\n");
  const sz = d.title.match(/(\d+)\s?(ml|gr|g)\b/i) || all.match(/(?:περιέκτη|Δοχείο|Φιαλίδιο|συσκευασία)[^\n]{0,20}?(\d+)\s?(ml|gr|g)\b/i);
  d.size = sz ? sz[1] + (sz[2].toLowerCase() === "gr" ? "g" : sz[2].toLowerCase()) : null; d.sizes = d.size ? [d.size] : [];
  if (d.size) d.attributes["Συσκευασία"] = d.size;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.keyFacts[0] || (d.description ? d.description.slice(0, 220) : null);
  d.handle = decodeURIComponent(url.replace(/\/+$/, "").split("/").pop());
  d.gtin = "PD-" + d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 50); d.eans = [d.gtin];
  // «Διαθέσιμα μεγέθη: Small (35–37), Medium (38–40), Large (41–44)» ή FAMILIES → μία κάρτα ανά μέγεθος
  const avail = (all.match(/Διαθέσιμα\s+[Μμ]εγέθη:\s*([^\n]+)/) || [])[1];
  const sizes = FAMILIES[d.handle] || (avail ? avail.split(/\s*(?:,\s*(?=[A-ZΑ-Ω])|\s-\s)\s*/).map(x => x.trim()).filter(Boolean) : []);
  if (sizes.length > 1) {
    d.variants = sizes.map(z => ({ ean: d.gtin.slice(0, 40) + z.replace(/\s*\(.*$/, "").replace(/[^A-Za-z0-9]/g, ""), size: z }));
    d.eans = d.variants.map(v => v.ean); d.gtin = d.eans[0]; d.sizes = sizes; d.attributes["Διαθέσιμα μεγέθη"] = sizes.join(", ");
  }
  return d;
}

async function main() {
  const sm = await fetchText(`${BASE}/pproducts-sitemap.xml`);
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /\/pproducts\/[^/]+\/$/.test(u) && !/\/en\//.test(u));
  console.log(`podiafootcare.com: ${urls.length} σελίδες προϊόντων (ελληνικά)`);
  if (CACHE) await fs.mkdir(CACHE, { recursive: true });
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const cf = CACHE && path.join(CACHE, crypto.createHash("md5").update(u).digest("hex").slice(0, 12) + ".html");
    let html; try { html = await fs.readFile(cf, "utf8"); } catch { html = await fetchText(u); if (cf) await fs.writeFile(cf, html, "utf8"); await sleep(DELAY_MS); }
    const d = extractPodiaDetails(html, u);
    if (!d.title) { console.log(`[${i + 1}] χωρίς τίτλο — ${u}`); continue; }
    out.push({ url: u, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${i + 1}/${urls.length}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(55)} ${(d.category || "-").slice(0, 22).padEnd(22)} | ${d.title}`);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
