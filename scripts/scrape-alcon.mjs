#!/usr/bin/env node
// scripts/scrape-alcon.mjs
// Alcon (Systane) — η σελίδα myalcon.com/gr/consumer/ παραπέμπει για τα προϊόντα φαρμακείου στο
// **systane.myalcon.com/gr/products/** (Drupal / Site Studio, ελληνικά, χωρίς EAN). Τα διαλύματα φακών επαφής
// (Opti-Free) δεν έχουν ακόμη ελληνική σελίδα («coming soon»)· οι φακοί επαφής (total.myalcon.com) είναι οπτικά → εκτός.
// Σελίδα (γραμμές κειμένου, χωρίς <sup>): <h1> · υπότιτλος · εισαγωγή · «Βασικά Οφέλη» · «πληροφοριεσ προϊοντοσ» ·
//   «οδηγιεσ χρησησ» · «… ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ» · «Συστατικά» · «Ασφάλεια» · τέλος στο «ΒΡΕΙΤΕ ΠΡΑΓΜΑΤΙΚΗ ΑΝΑΚΟΥΦΙΣΗ».
//   «Διαθέσιμα μεγέθη: φιάλη των 10mL & 30 φιαλίδια μιας χρήσης…» → 2 εγγραφές (φιάλη / μονοδόσεις).
// Εικόνα: «…-packshot-banner-GR-new.jpg». Κλειδί: "AL-<slug>[-10ml|-ud30]". Τιμές με js/alcon-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-alcon.mjs [--delay=3000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/alcon-site.json");
const BASE = "https://systane.myalcon.com";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "3000"));
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const toLines = h => decodeAll(String(h || "").replace(/<sup>[\s\S]*?<\/sup>/g, m => /®|™|&reg;|&trade;/.test(m) ? m.replace(/<[^>]+>/g, "") : "")
  .replace(/<(br|\/?div|\/?p|\/?li|\/?ul|\/?h\d|\/tr|\/td|\/button|\/summary)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "))
  .replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").trim())
  .filter(l => l && !/^__PRESENT$|^[*†‡\d,\s]+$/.test(l));

export function extractAlconDetails(url, raw) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const html = String(raw || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "");
  const h1 = html.indexOf("<h1");
  let seg = html.slice(h1);
  const end = seg.search(/ΒΡΕΙΤΕ ΠΡΑΓΜΑΤΙΚΗ ΑΝΑΚΟΥΦΙΣΗ/); if (end > 0) seg = seg.slice(0, end);
  const lines = toLines(seg);
  d.title = lines[0].replace(/\s*®\s*/g, "® ").replace(/ΧΩΡΙΣ ΣΥΝΤΗΡΗΤΙΚΑ/g, "χωρίς συντηρητικά").replace(/Οφθαλμικές [Σσ]ταγόνες/g, "οφθαλμικές σταγόνες").replace(/\s+/g, " ").trim();
  const tail = toLines(html.slice(h1 + seg.length));
  const reg = lines.find(l => /Καλλυντικό προϊόν/i.test(l)) || tail.find(l => /Ιατροτεχνολογικό προϊόν|Καλλυντικό προϊόν/i.test(l));
  if (reg) d.attributes["Κατηγορία"] = /Καλλυντικό/i.test(reg) ? "Καλλυντικό προϊόν" : reg.replace(/\.$/, "");
  let key = "intro"; const intro = [], faq = [];
  for (const l of lines.slice(1)) {
    if (/^Βασικά Οφέλη$/i.test(l)) { key = "Οφέλη"; continue; }
    if (/^Πληροφορίες & οδηγίες χρήσης$/i.test(l) || /^Συστατικά & Ασφάλεια$/i.test(l)) continue;
    if (/^πληροφορ[ιί]ε[σς] προ[ιϊ]οντο[σς]$/i.test(l)) { key = "Χαρακτηριστικά"; continue; }
    if (/^οδηγ[ιί]ε[σς] χρ[ηή]ση[σς]$/i.test(l)) { key = "Χρήση"; continue; }
    if (/ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ$/i.test(l)) { key = "Συχνές ερωτήσεις"; continue; }
    if (/^Συστατικά$/i.test(l)) { key = "Συστατικά"; continue; }
    if (/^Ασφάλεια$/i.test(l)) { key = "Προφυλάξεις"; continue; }
    if (/^Καλλυντικό προϊόν/i.test(l)) continue;
    if (key === "intro") { intro.push(l); continue; }
    if (key === "Συχνές ερωτήσεις") { faq.push(/;$/.test(l) ? `• ${l}` : l); continue; }
    const m = l.match(/^(?:Συσκευασία|Διαθέσιμα μεγέθη)\s*:\s*(.+)$/i);
    if (m) { d.packText = m[1]; continue; }
    d.tabs[key] = [d.tabs[key], l].filter(Boolean).join("\n");
  }
  if (faq.length) d.tabs["Συχνές ερωτήσεις"] = faq.join("\n");
  // «Μην\nτο χρησιμοποιείτε…» (έντονο πρώτο κομμάτι) → μία γραμμή
  if (d.tabs["Προφυλάξεις"]) d.tabs["Προφυλάξεις"] = d.tabs["Προφυλάξεις"].replace(/\n(?=[a-zα-ωά-ώ])/g, " ");
  d.subtitle = intro[0] || null;
  d.description = intro.slice(1).join(" ").replace(/\s+([.,])/g, "$1") || null;
  if (!d.description && d.subtitle) { d.description = d.subtitle; d.subtitle = null; }
  const img = [...html.matchAll(/(?:src|srcset)="([^" ]*packshot[^" ]*GR[^" ]*)"/gi)].map(m => m[1])[0];
  if (img) d.images.push(new URL(decodeAll(img), BASE).href);
  d.handle = url.replace(/\/+$/, "").split("/").pop();
  d.imageLarge = d.images[0] || null;
  d.gtin = `AL-${d.handle.replace(/^systane-/, "").replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

async function main() {
  const list = await fetchText(`${BASE}/gr/products/`);
  const urls = [...new Set([...list.matchAll(/href="(\/gr\/products\/[a-z0-9-]+)\/?"/g)].map(m => `${BASE}${m[1]}/`))];
  console.log(`systane.myalcon.com/gr: ${urls.length} προϊόντα`);
  const out = []; let err = 0;
  for (const u of urls) {
    await sleep(DELAY_MS);
    let html = null;
    try { html = await fetchText(u); } catch (e) { err++; console.log(`  ! ${u}: ${e.message}`); continue; }
    const d = extractAlconDetails(u, html);
    // πολλά μεγέθη («φιάλη των 10mL & 30 φιαλίδια μιας χρήσης…») → μία εγγραφή ανά μέγεθος
    const packs = [];
    const pt = d.packText || "";
    const ml = pt.match(/(?:Φιάλη|φιάλη των)\s*(\d+)\s*ml/i); if (ml) packs.push({ size: `${ml[1]}ml`, suffix: `${ml[1]}ml`, label: "" });
    const ud = pt.match(/(\d+)\s*φιαλίδια μιας χρήσης(?:[^0-9]*?(\d+[.,]\d+)\s*ml)?/i); if (ud) packs.push({ size: `${ud[1]} φιαλίδια μιας χρήσης${ud[2] ? ` × ${ud[2].replace(".", ",")}ml` : ""}`, suffix: `ud${ud[1]}`, label: " μονοδόσεις" });
    for (const p of packs.length ? packs : [{ size: null, suffix: "", label: "" }]) {
      const dd = JSON.parse(JSON.stringify(d));
      if (packs.length > 1) { dd.gtin = `${d.gtin}${p.suffix}`; dd.eans = [dd.gtin]; dd.title = d.title + p.label; }
      if (p.size) { dd.size = p.size; dd.sizes = [p.size]; dd.attributes["Συσκευασία"] = p.size; } else dd.sizes = [];
      out.push({ url: u, section: "p", name: dd.title, description: (dd.description || "").slice(0, 700), longDescription: dd.description, subtitle: dd.subtitle, details: dd, image: dd.images[0] || null, gtin: dd.gtin });
      console.log(`  ${dd.images.length ? "img+" : "img-"} ${Object.keys(dd.tabs).join(",").padEnd(66)} ${(p.size || "-").padEnd(30)} ${dd.gtin.padEnd(32)} | ${dd.title}`);
    }
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
