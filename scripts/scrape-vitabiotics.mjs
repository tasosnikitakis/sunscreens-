#!/usr/bin/env node
// scripts/scrape-vitabiotics.mjs
// Vitabiotics Ελλάδα = vitabiotics.gr (WooCommerce, ελληνικά). Χωρίς EAN. robots.txt: Crawl-Delay 20 → σεβόμαστε 20s ανά σελίδα.
// Λίστα + βασικά στοιχεία: WooCommerce Store API /wp-json/wc/store/v1/products (όνομα, permalink, περιγραφή, short_description
// με μέγεθος και bullets, εικόνες, κατηγορίες, attributes «ΜΟΡΦΗ ΠΡΟΪΟΝΤΟΣ» / «ΔΙΑΤΡΟΦΙΚΕΣ ΣΥΝΗΘΕΙΕΣ»).
// Οι σελίδες προϊόντος έχουν bot check («One moment, please…» → reload) → ανοίγουν με Playwright· tabs WooCommerce:
//   --description, --diatrofikes (διατροφικές πληροφορίες + συστατικά), --odigies (οδηγίες/προφυλάξεις), --sychnes (FAQ).
// Κλειδί: "VB-<slug>". Τιμές με js/vitabiotics-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-vitabiotics.mjs [--limit=3] [--delay=20000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/vitabiotics-site.json");
const BASE = "https://vitabiotics.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "20000"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n").replace(/<\/tr>/gi, "\n").replace(/<\/t[dh]>/gi, " · "))).replace(/[ \t ]+/g, " ").replace(/ · \n/g, "\n").replace(/\s*·\s*$/gm, "").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
const sizeNorm = s => { const m = String(s || "").replace(/(\d),(\d)/g, "$1.$2").match(/(\d{1,4}(?:\.\d+)?)\s?(ml|gr|g|l)\b/i); return m ? (+m[1]) + m[2].toLowerCase().replace("gr", "g") : null; };

export function extractVitabioticsDetails(p, html) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = decodeAll(p.name).replace(/\s+/g, " ").trim();
  // short_description: 1η γραμμή = μέγεθος («30 δισκία», «200ml»), μετά υπότιτλος και bullets
  const sd = text(p.short_description).split("\n").map(s => s.trim()).filter(s => s && s !== " ");
  if (sd.length && (/^\d+\s*\S+/.test(sd[0]) && sd[0].length < 40)) { d.size = sd.shift(); d.attributes["Συσκευασία"] = d.size; }
  if (sd.length) d.subtitle = sd.shift();
  d.advantages = sd.filter(s => s.length > 8);
  if (d.advantages.length) d.tabs["Οφέλη"] = d.advantages.join("\n");
  const panel = k => html ? (html.match(new RegExp(`<div class="woocommerce-Tabs-panel woocommerce-Tabs-panel--${k}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>\\s*(?=<div class="woocommerce-Tabs-panel|<\\/div>\\s*<\\/div>)`)) || [])[1] : null;
  const strip = s => String(s || "").replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, "");
  const desc = text(strip(panel("description"))) || text(p.description);
  if (desc) d.tabs["Περιγραφή"] = desc.replace(/Αυτές οι πληροφορίες δεν προορίζονται[\s\S]*$/, "").trim();
  // διατροφικός πίνακας: μία γραμμή ανά <tr> («Συστατικό · ποσότητα · %NRV»)
  const rows = h => String(h || "").replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_, r) => "<p>" + [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => oneLine(c[1])).filter(Boolean).join(" · ") + "</p>").replace(/<\/?(table|tbody|thead)[^>]*>/g, "");
  const nutr = text(rows(strip(panel("diatrofikes")))); if (nutr) d.tabs["Συστατικά"] = nutr;
  const dir = text(strip(panel("odigies")));
  if (dir) {
    const lines = dir.split("\n"), use = [], warn = [];
    for (const l of lines) {
      if (/^(Κατάλληλο για|Χωρίς |Χωρίς$|Δεν περιέχει|Vegan|Συμπλήρωμα διατροφής$)/i.test(l) && l.length < 70) { if (!/^Συμπλήρωμα/.test(l)) d.keyFacts.push(l.replace(/\.$/, "")); continue; }
      if (/δεν δοκιμάζεται σε ζώα/i.test(l) && l.length < 70) { d.keyFacts.push(l.replace(/^το /, "Το ").replace(/\.$/, "")); continue; }
      (/(Μην υπερβαίνετε|Πάντα να διαβάζετε|αλλεργ|ίχνη|Φυλάσσεται|Διατηρείται|Συμβουλευτείτε|δεν πρέπει να χρησιμοποιούνται|αντιπηκτικ)/i.test(l) ? warn : use).push(l);
    }
    if (use.length) d.tabs["Χρήση"] = use.join("\n"); if (warn.length) d.tabs["Προφυλάξεις"] = warn.join("\n");
  }
  const faq = text(strip(panel("sychnes"))); if (faq) d.tabs["Συχνές ερωτήσεις"] = faq;
  for (const a of p.attributes || []) {
    const vals = (a.terms || []).map(t => decodeAll(t.name)).filter(Boolean); if (!vals.length) continue;
    if (/ΜΟΡΦΗ/i.test(a.name)) d.attributes["Μορφή"] = vals.join(", ");
    else if (/ΔΙΑΤΡΟΦΙΚ/i.test(a.name)) d.keyFacts.push(...vals.flatMap(v => v.split("/")).map(v => /vegan/i.test(v) ? "Κατάλληλο για vegans" : /veget/i.test(v) ? "Κατάλληλο για χορτοφάγους" : v));
    else if (/ΔΙΑΡΚΕΙΑ/i.test(a.name)) d.attributes["Διάρκεια"] = vals.join(", ");
    else d.attributes[decodeAll(a.name)] = vals.join(", ");
  }
  d.keyFacts = [...new Map(d.keyFacts.map(k => [k.toLowerCase(), k])).values()];
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  const cats = (p.categories || []).map(c => decodeAll(c.name)).filter(c => !/^(ΔΙΑΡΚΕΙΑ|Uncategorized)$/i.test(c));
  d.categories = cats; d.category = cats.join(" | ") || null;
  const BRANDS = /^(Pregnacare|Wellteen|Wellkid|Feroglobin|Ultra|Immunace|Perfectil|Menopace|Wellman|Wellwoman|Osteocare|Cardioace|Jointace|Neurozan|Visionace|Diabetone|Hairfollic|Secret Curves)/i;
  d.line = (d.title.match(BRANDS) || [])[1] || cats.find(c => BRANDS.test(c)) || null;
  if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
  if (d.category) d.attributes["Κατηγορίες vitabiotics.gr"] = d.category;
  for (const im of p.images || []) { const u = String(im.src || "").split("?")[0]; if (u && !d.images.includes(u)) d.images.push(u); }
  d.imageLarge = d.images[0] || null;
  d.sizes = d.size ? [d.size] : [];
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle || null;
  d.handle = String(p.permalink).replace(/\/+$/, "").split("/").pop();
  const key = decodeURIComponent(d.handle).replace(/[^A-Za-z0-9]/g, "").slice(0, 70);
  d.gtin = "VB-" + (key.length >= 4 ? key : key + "item"); d.eans = [d.gtin];
  return d;
}

async function main() {
  const res = await fetch(`${BASE}/wp-json/wc/store/v1/products?per_page=100`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
  const all = await res.json();
  console.log(`vitabiotics.gr: ${all.length} προϊόντα (Store API)`);
  const { chromium } = createRequire(import.meta.url)("playwright");   // global playwright (NODE_PATH): το require το βρίσκει, το import όχι
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
  const page = await b.newPage({ userAgent: UA, locale: "el-GR" });
  const out = []; const cap = Math.min(all.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const p = all[i]; let html = null;
    try {
      await page.goto(p.permalink, { waitUntil: "domcontentloaded", timeout: 60000 });
      for (let t = 0; t < 8; t++) { await page.waitForTimeout(3000); if (!/One moment/i.test(await page.title()) && /woocommerce-Tabs-panel/.test(await page.content())) break; }
      html = await page.content();
    } catch (e) { console.log(`  ! ${p.permalink}: ${e.message}`); }
    const d = extractVitabioticsDetails(p, html);
    out.push({ url: p.permalink, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").padEnd(14)} ${(d.line || "-").padEnd(12)} | ${d.title}`);
    if (i < cap - 1) await sleep(DELAY_MS);
  }
  await b.close();
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
