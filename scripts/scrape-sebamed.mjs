#!/usr/bin/env node
// scripts/scrape-sebamed.mjs
// Sebamed Ελλάδα = Intramed Pharma (www.intramed-pharma.gr, αντιπρόσωπος) — WordPress, custom post type «products», ελληνικά, χωρίς EAN.
// Λίστα: η σελίδα της μάρκας /brands/sebamed/ (όλα τα προϊόντα Sebamed)· κάθε σελίδα πρέπει να έχει class «brands-sebamed».
// Σελίδα (samples/sebamed-sample.html): h1, «Μέγεθος συσκευασίας: <span>», «Σύντομη περιγραφή» (μπλοκ με <strong>Τίτλος:</strong> + <ul>:
//   «Γιατί να επιλέξετε…» → Περιγραφή, «Χαρακτηριστικά» → Οφέλη, «Ενδείξεις», «Χρήση»), «Συστατικά» (INCI), .product-tab,
//   εικόνα #productImage, κατηγορία από το class products_category-<slug>.
// Κλειδί: "SB-<slug>". Τιμές με js/sebamed-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-sebamed.mjs [--limit=5] [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/sebamed-site.json");
const BASE = "https://www.intramed-pharma.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "1000"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
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
const CAT_GR = { "katharismos-somatos": "Καθαρισμός σώματος", "frontida-prosopou-xeilion": "Φροντίδα προσώπου & χειλιών", "frontida-somatos": "Φροντίδα σώματος", "katharismos-frontida-mallion": "Μαλλιά", "vrefiki-paidiki-frontida": "Βρεφική & παιδική φροντίδα", "aposmitika": "Αποσμητικά", "gunaikologiki-frontida": "Γυναικολογική φροντίδα", "kremes-xerion": "Κρέμες χεριών", "antiliaka": "Αντηλιακά", "katharismos-prosopou": "Καθαρισμός προσώπου", "frontida-prosopou": "Φροντίδα προσώπου", "soma": "Σώμα", "mallia": "Μαλλιά", "vrefika": "Βρεφικά", "paidika": "Παιδικά", "apaosmitika": "Αποσμητικά", "eyaisthiti-periochi": "Ευαίσθητη περιοχή", "cheria": "Χέρια", "podia": "Πόδια", "antiliaka": "Αντηλιακά" };
const LABEL = [[/^Γιατί να επιλέξετε/i, "Περιγραφή"], [/^Χαρακτηριστικά|^Οφέλη|^Δράση/i, "Οφέλη"], [/^Ενδείξεις|^Κατάλληλο/i, "Ενδείξεις"], [/^Χρήση|^Οδηγίες|^Τρόπος χρήσης/i, "Χρήση"], [/^Προσοχή|^Προφυλάξεις|^Προειδοποιήσεις/i, "Προφυλάξεις"], [/^Συστατικά|^Δραστικά/i, "Ενεργά συστατικά"]];

export function extractSebamedDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const art = (html.match(/<article[\s\S]*?<\/article>/) || [""])[0];
  d.isSebamed = /brands-sebamed\b/.test((art.match(/<article[^>]*class="([^"]+)"/) || [])[1] || "");
  d.title = oneLine((art.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/^SEBAMED\b/i, "Sebamed") || null;
  d.discontinued = /ΚΑΤΑΡΓΗΜΕΝΟ/i.test(d.title || "");
  const sizeRaw = oneLine((art.match(/Μέγεθος συσκευασίας:\s*<span>([\s\S]*?)<\/span>/) || [])[1] || "") || null;
  // «200ml, 300ml (με αντλία), 1000ml (Refill)» / «70 ml και 3 x 70ml» → ένα μέγεθος ανά variant (κλειδί SB-<slug><μέγεθος>)
  const sizeList = sizeRaw ? sizeRaw.split(/\s*(?:,(?!\d)|\bκαι\b)\s*/).map(x => x.trim()).filter(x => /\d/.test(x)) : [];
  d.sizes = sizeList.map(x => x.replace(/(\d)\s+(ml|g|gr)\b/i, "$1$2").replace(/(\d)gr\b/, "$1g"));
  d.size = d.sizes[0] || null;
  if (d.sizes.length > 1) d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", "); else if (d.size) d.attributes["Συσκευασία"] = d.size;
  const cats = [...((art.match(/<article[^>]*class="([^"]+)"/) || [])[1] || "").matchAll(/products_category-([a-z0-9-]+)/g)].map(m => CAT_GR[m[1]] || m[1].replace(/-/g, " "));
  d.categories = cats; d.category = cats.join(" | ") || null;
  if (d.category) d.attributes["Κατηγορία intramed-pharma.gr"] = d.category;
  // «Σύντομη περιγραφή»: <p><strong>Τίτλος:</strong></p><ul>…</ul> ή <p><strong>Χρήση</strong>: κείμενο</p>
  const sd = (art.match(/Σύντομη περιγραφή<\/p>([\s\S]*?)<p class="font-bold[^"]*">\s*Συστατικά/) || art.match(/Σύντομη περιγραφή<\/p>([\s\S]*?)<div class="share-blog/) || [])[1] || "";
  let cur = "Περιγραφή"; const parts = {};
  for (const m of sd.matchAll(/<p[^>]*>([\s\S]*?)<\/p>|<ul[^>]*>([\s\S]*?)<\/ul>/g)) {
    if (m[2] !== undefined) { const lis = [...m[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(x => oneLine(x[1])).filter(Boolean); (parts[cur] ||= []).push(...lis); continue; }
    const p = m[1]; const strong = oneLine((p.match(/^(?:\s|<p[^>]*>|<span[^>]*>)*<strong>([\s\S]*?)<\/strong>/) || [])[1] || "");
    const rest = oneLine(p.replace(/^(?:\s|<p[^>]*>|<span[^>]*>)*<strong>[\s\S]*?<\/strong>\s*:?\s*/, ""));
    const lab = strong && (LABEL.find(([re]) => re.test(strong.replace(/:$/, ""))) || [])[1];
    if (lab) { cur = lab; if (rest && rest !== ":") (parts[cur] ||= []).push(rest.replace(/^:\s*/, "")); continue; }
    const t = oneLine(p); if (t) (parts[cur] ||= []).push(t);
  }
  for (const [k, v] of Object.entries(parts)) { const t = v.filter(Boolean).join("\n").trim(); if (t) d.tabs[k] = t; }
  if (parts["Οφέλη"]) d.advantages = parts["Οφέλη"];
  for (const l of [...(parts["Ενδείξεις"] || []), ...(parts["Οφέλη"] || [])]) if (/pH\s?5[.,]5|Δερματολογικ|Κλινικά|χωρίς σαπούνι|χωρίς άρωμα|vegan/i.test(l) && l.length < 90) d.keyFacts.push(l.replace(/\.$/, ""));
  d.keyFacts = [...new Map(d.keyFacts.map(k => [k.toLowerCase(), k])).values()];
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  const inci = oneLine((art.match(/<p class="font-bold[^"]*">\s*Συστατικά\s*<\/p>([\s\S]*?)<div class="share-blog/) || [])[1] || "");
  if (inci) d.tabs["Συστατικά"] = inci;
  const tab = text((art.match(/<div class="product-tab"[^>]*>([\s\S]*?)<\/div>\s*<div class="product-contact-form/) || [])[1] || "");
  if (tab && tab.length > 20) d.tabs["Πληροφορίες"] = tab;
  const img = (art.match(/id="productImage"[^>]*href="([^"]+)"/) || art.match(/<a href="([^"]+)" id="productImage"/) || art.match(/class="image-block">\s*<a href="([^"]+)"/) || [])[1];
  if (img) d.images.push(img);
  d.imageLarge = d.images[0] || null;
  const L = d.title && d.title.match(/^Sebamed\s+(Baby|Kids?|Clear Face|Anti-?Ageing|Anti-?Dry|Anti-?Hairloss|Anti-?Dandruff|Every-?Day|Hair Repair|Pro!|Feminine|Intimate|Men|For Men|Sun|Urea|Extreme Dry Skin|Sensitive Skin)/i);
  d.line = L ? L[1] : null; if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
  d.subtitle = (parts["Ενδείξεις"] || [])[0] || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = decodeURIComponent(String(url).replace(/\/+$/, "").split("/").pop());
  const key = d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 60);
  d.gtin = "SB-" + (key.length >= 4 ? key : key + "item"); d.eans = [d.gtin];
  if (d.sizes.length > 1) {
    d.variants = d.sizes.map(z => ({ ean: (d.gtin + z.toLowerCase().replace(/refill/, "r").replace(/[^a-z0-9]/g, "")).slice(0, 72), size: z }));
    const seen = new Set(); d.variants = d.variants.filter(v => !seen.has(v.ean) && seen.add(v.ean));
    d.eans = d.variants.map(v => v.ean); d.gtin = d.eans[0];
  }
  return d;
}

async function main() {
  const brand = await fetchText(BASE + "/brands/sebamed/");
  const urls = [...new Set([...brand.matchAll(/href="(https:\/\/www\.intramed-pharma\.gr\/products\/[^"#?]+)"/g)].map(m => m[1].replace(/\/?$/, "/")))];
  console.log(`intramed-pharma.gr: ${urls.length} σελίδες στη σελίδα της μάρκας Sebamed`);
  const out = []; let err = 0, other = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      let html = await fetchText(url);
      let d = extractSebamedDetails(html, url);
      // ο server επιστρέφει πού και πού άλλη σελίδα (χωρίς <article> του προϊόντος) → ξανά
      for (let t = 0; t < 2 && (!d.title || !/<article[^>]*class="[^"]*\bproducts\b/.test(html)); t++) { await sleep(4000); html = await fetchText(url); d = extractSebamedDetails(html, url); }
      if (d.discontinued) { other++; console.log(`[${i + 1}/${cap}] skip (καταργημένο) ${d.title}`); await sleep(DELAY_MS); continue; }
      if (!d.isSebamed || !d.title) { other++; console.log(`[${i + 1}/${cap}] skip (όχι Sebamed) ${url}`); await sleep(DELAY_MS); continue; }
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").padEnd(10)} ${(d.category || "-").slice(0, 20).padEnd(20)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  // ίδιο όνομα σε δύο σελίδες (μεγέθη) → μέγεθος στο όνομα
  const byName = {}; for (const p of out) (byName[p.name.toLowerCase()] ||= []).push(p);
  for (const g of Object.values(byName)) if (g.length > 1) for (const p of g) if (p.details.size && !p.name.includes(p.details.size)) p.details.fullTitle = `${p.name} ${p.details.size}`;
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} other=${other} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
