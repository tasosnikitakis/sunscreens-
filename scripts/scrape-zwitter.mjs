#!/usr/bin/env node
// scripts/scrape-zwitter.mjs
// Zwitter (ελληνική εταιρία, οφθαλμολογικά) = zwitter.gr — WordPress + Elementor, χωρίς EAN.
// Λίστα: portfolio-sitemap.xml (/portfolio/<προϊόν>/) — όλα στην ενότητα «Μη Συνταγογραφούμενα» (ιατροτεχνολογικά,
// συμπληρώματα· κανένα φάρμακο). Σελίδα: breadcrumb «Οφθαλμολογικά προϊόντα > Μη Συνταγογραφούμενα > <Κατηγορία> > ΟΝΟΜΑ» ·
//   <h2> τίτλος · text-editor widgets (υπότιτλος, «Ιατροτεχνολογικό προϊόν, class … CE …» / «Συμπλήρωμα διατροφής… ΕΟΦ»,
//   περιγραφή, «Για το ΦΟΧ … εδώ» = PDF) · εικόνα προϊόντος · accordions «Χαρακτηριστικά», «Οφέλη», «Οδηγίες χρήσης»
//   (κουκκίδες «•»· η «Βιβλιογραφία:» κόβεται). Τέλος στο «Περισσότερα προϊόντα».
// Κλειδί: "ZW-<slug>". Τιμές με js/zwitter-manual-matches.json (barcode Medica → κλειδί).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-zwitter.mjs [--delay=2000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/zwitter-site.json");
const BASE = "https://zwitter.gr";
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
const toLines = h => decodeAll(String(h || "").replace(/<sup>\s*(®|™|&reg;|&trade;)\s*<\/sup>/g, "$1").replace(/<sup>[\s\S]*?<\/sup>/g, "")
  .replace(/<(br|\/?p|\/?div|\/?li|\/?h\d)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, ""))
  .replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").replace(/^\s*[•·]\s*/, "").replace(/\s+([.,;:])/g, "$1").trim())
  .filter(l => l && !/^[*\d\s]+$/.test(l));
const oneLine = h => toLines(h).join(" ").replace(/\s+/g, " ").trim();

export function extractZwitterDetails(url, raw) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  let html = String(raw || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "");
  const bc = html.search(/(Οφθαλμολογικά|Άλλα) προϊόντα\s*&gt;/);
  const endM = html.indexOf("Περισσότερα", bc);
  html = html.slice(bc, endM > 0 ? endM : undefined);
  // breadcrumb
  const crumb = oneLine(html.slice(0, html.indexOf("</div>"))).split(">").map(s => s.trim()).filter(Boolean);
  d.category = crumb.length >= 4 ? crumb[2] : (crumb[0] || "").replace(/ προϊόντα$/, "");
  d.breadcrumbs = crumb;
  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  d.title = (h2 ? oneLine(h2[1]).replace(/\s*®/g, "®") : crumb[crumb.length - 1]).replace(/^OMK2®?$/i, "OMK2®");
  // text-editor widgets ανάμεσα στον τίτλο και τα accordions
  const afterH2 = h2 ? html.slice(h2.index + h2[0].length) : html;
  const accStart = afterH2.search(/ct_accordion/);
  const intro = afterH2.slice(0, accStart > 0 ? accStart : undefined);
  const blocks = intro.split(/<div[^>]*data-widget_type="ct_text_editor\.default"[^>]*>/).slice(1).map(b => toLines(b));
  const desc = [];
  for (const lines of blocks) {
    const txt = lines.join(" ");
    if (!txt) continue;
    if (/Για το ΦΟΧ/i.test(txt)) continue;
    if (/^Ιατροτεχνολογικό προϊόν/i.test(txt)) { d.attributes["Κατηγορία"] = txt.replace(/\s+/g, " "); continue; }
    if (/^Αριθ\.? Γνωστ/i.test(txt)) { d.attributes["Αρ. γνωστοποίησης ΕΟΦ"] = txt.replace(/^Αριθ\.? Γνωστ\.?\s*ΕΟΦ:?\s*/i, ""); continue; }
    if (/^Τα συμπληρώματα διατροφής δεν υποκαθιστούν|^Οι αριθμοί γνωστοποίησης/i.test(txt)) { d.tabs["Προφυλάξεις"] = [d.tabs["Προφυλάξεις"], ...lines].filter(Boolean).join("\n"); continue; }
    if (!d.subtitle && lines.length <= 2 && txt.length < 160) { d.subtitle = txt; continue; }
    desc.push(...lines);
  }
  if (!d.attributes["Κατηγορία"] && /Συμπλήρωμα διατροφής/i.test(d.subtitle || "")) d.attributes["Κατηγορία"] = "Συμπλήρωμα διατροφής";
  d.description = desc.join("\n") || null;
  // χωρίς παράγραφο περιγραφής (Salz, Xytea, Neukron) → υπότιτλος + χαρακτηριστικά (συμπληρώνεται μετά τα accordions)
  const noDesc = !d.description;
  const pdf = (intro.match(/href="([^"]+\.pdf)"/i) || [])[1];
  if (pdf) d.attributes["Φύλλο οδηγιών (PDF)"] = decodeAll(pdf);
  const img = (intro.match(/<img[^>]+src="([^"]+\/wp-content\/uploads\/[^"]+)"/) || [])[1];
  if (img) d.images.push(decodeAll(img));
  // accordions
  for (const m of afterH2.matchAll(/<a[^>]*>\s*([^<]{2,60}?)\s*<i[^>]*><\/i>\s*<\/a>\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const title = decodeAll(m[1]).trim();
    const key = /Χαρακτηριστικ/i.test(title) ? "Χαρακτηριστικά" : /Οφέλη/i.test(title) ? "Οφέλη" : /Οδηγίες|Χρήση/i.test(title) ? "Χρήση" : /Συστατικ|Σύνθεση/i.test(title) ? "Συστατικά" : /Προφυλ|Προσοχή|Αντενδ/i.test(title) ? "Προφυλάξεις" : title;
    const body = m[2].split(/Βιβλιογραφία\s*:?/i)[0];
    const lines = toLines(body);
    if (lines.length) d.tabs[key] = [d.tabs[key], ...lines].filter(Boolean).join("\n");
  }
  if (noDesc || (d.description || "").length < 120) d.description = [noDesc ? d.subtitle : null, d.description, d.tabs["Χαρακτηριστικά"]].filter(Boolean).join("\n") || null;
  // συσκευασία από το κείμενο
  const all = [d.tabs["Χαρακτηριστικά"], d.description, d.subtitle].filter(Boolean).join("\n");
  let size = null;
  const ud = all.match(/(\d+)\s*(?:περιέκτες μ[ιί]ας δόσης|μονοδόσεις|φιαλίδια|αμπούλες|περιέκτες)[^.\n]*?(\d+[.,]\d+)\s*ml/i);
  const pk = all.match(/(?:Συσκευασία|φιαλίδιο|φιάλη|σωληνάριο|περιέκτης)[^.\n]{0,25}?(\d+(?:[.,]\d+)?)\s*(ml|g|gr|κάψουλες|δισκία|φακελίσκους|φακελίσκοι)(?!\p{L})/iu);
  const vials = all.match(/(\d+)\s*φιαλίδια των\s*(\d+)\s*ml/i);
  if (ud) size = `${ud[1]} μονοδόσεις × ${ud[2].replace(".", ",")}ml`;
  else if (vials) size = `${vials[1]} φιαλίδια × ${vials[2]}ml`;
  else if (pk) size = `${pk[1]}${/^(ml|g|gr)$/i.test(pk[2]) ? pk[2].toLowerCase().replace(/^gr$/, "g") : " " + pk[2]}`;
  if (size) { d.size = size; d.sizes = [size]; d.attributes["Συσκευασία"] = size; } else d.sizes = [];
  d.line = d.category || null; if (d.line) d.attributes["Σειρά"] = d.line;
  d.handle = url.replace(/\/+$/, "").split("/").pop();
  d.imageLarge = d.images[0] || null;
  d.gtin = `ZW-${d.handle.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

async function main() {
  const sm = await fetchText(`${BASE}/portfolio-sitemap.xml`);
  const urls = [...new Set([...sm.matchAll(/https:\/\/zwitter\.gr\/portfolio\/[a-z0-9-]+\//gi)].map(m => m[0]))];
  console.log(`zwitter.gr: ${urls.length} προϊόντα`);
  const out = []; let err = 0;
  for (const u of urls) {
    await sleep(DELAY_MS);
    let html = null;
    try { html = await fetchText(u); } catch (e) { err++; console.log(`  ! ${u}: ${e.message}`); continue; }
    if (/Συνταγογραφούμενα\s*<\/a>/.test(html) && !/Μη Συνταγογραφούμενα/.test(html)) { console.log(`  - συνταγογραφούμενο, εκτός: ${u}`); continue; }
    const d = extractZwitterDetails(u, html);
    out.push({ url: u, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`  ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(46)} ${(d.size || "-").padEnd(24)} ${(d.category || "-").padEnd(28)} ${d.gtin.padEnd(24)} | ${d.title}`);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
