#!/usr/bin/env node
// scripts/scrape-lactacyd.mjs
// Lactacyd (Perrigo) = www.lactacyd.gr — Drupal, ελληνικά, χωρίς EAN και χωρίς συσκευασία στη σελίδα.
// Λίστα: sitemap.xml (/product/…). Σελίδα (με τη σειρά των στοιχείων):
//   <h1> τίτλος · πρώτο <p> = υπότιτλος · «Χαρακτηριστικά» + <li> · εικονίδια <h3> (γενικά, παραλείπονται) ·
//   <h2> ενότητα + <p> (→ Περιγραφή) · «Συνιστώμενη χρήση» + <p> (→ Χρήση) + <li> (→ Προφυλάξεις).
//   Τέλος στο «Για πάνω από 70 χρόνια…» / «Μπορεί επίσης να ενδιαφέρεστε». Εικόνα: …/product-images/… (S3, χωρίς /styles/).
// Κλειδί: "LC-<λατινικοί χαρακτήρες του τίτλου>". Τιμές/συσκευασία με js/lactacyd-manual-matches.json (barcode Medica → κλειδί).
// robots.txt: επιτρέπει /product/· καθυστέρηση 2s ανά σελίδα.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-lactacyd.mjs [--limit=3] [--delay=2000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/lactacyd-site.json");
const BASE = "https://www.lactacyd.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "2000"));
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const oneLine = s => htmlToText(decodeAll(String(s || "").replace(/<br\s*\/?>/gi, " "))).replace(/[\s​]+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function extractLactacydDetails(url, html) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  html = String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  const a = html.indexOf("<h1");
  let end = html.search(/Για πάνω από 70|ΑΝΑΚΑΛΥΨΤΕ ΓΙΑΤΙ|Μπορεί επίσης να ενδιαφέρεστε/);
  const body = html.slice(a < 0 ? 0 : a, end > a ? end : undefined);
  let mode = null;
  const desc = [], usage = [], warn = [];
  for (const m of body.matchAll(/<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const tag = m[1], t = oneLine(m[2]);
    if (!t) continue;
    if (tag === "h1") { d.title = t.replace(/\s+/g, " "); mode = "sub"; continue; }
    if (tag === "h3") { mode = null; continue; }   // εικονίδια (ίδια σε όλα τα προϊόντα)
    if (tag === "h2") {
      if (/^Χαρακτηριστικά/i.test(t)) mode = "chars";
      else if (/^Συνιστώμενη χρήση/i.test(t)) mode = "usage";
      else if (d.title && t.replace(/\s/g, "") === d.title.replace(/\s/g, "")) mode = null;
      else mode = "desc";
      continue;
    }
    if (mode === "sub" && tag === "p") { d.subtitle = t; mode = null; continue; }
    if (mode === "chars" && tag === "li") { d.keyFacts.push(/^[^a-zα-ω]*$/.test(t) && t.length > 3 ? t[0] + t.slice(1).toLowerCase() : t); continue; }
    if (mode === "desc") { desc.push(t); continue; }
    if (mode === "usage") { (tag === "li" ? warn : usage).push(t); continue; }
  }
  d.title = (d.title || "").replace(/^Lactacyd®?\s*/i, "").trim();
  const size = [...usage, ...warn, ...desc].join(" ").match(/συσκευασία των (\d+) τεμαχίων/i);
  if (size) d.size = `${size[1]} τεμ.`;
  // «Διατίθενται σε συσκευασία…» δεν είναι οδηγία
  const use = usage.filter(x => !/^Διατίθ/i.test(x));
  const warns = warn.filter(x => !/^Διατίθ/i.test(x));
  d.description = desc.join("\n") || null;
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  if (use.length) d.tabs["Χρήση"] = use.join("\n");
  if (warns.length) d.tabs["Προφυλάξεις"] = warns.join("\n");
  if (d.size) { d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; } else d.sizes = [];
  const n = d.title;
  d.line = /^Pharma/i.test(n) ? "Pharma" : /Αφρόλουτρο|Body/i.test(n) ? "Body Care" : /Wipes|Μαντηλάκια/i.test(n) ? "Wipes" : "Daily";
  d.series = d.line; d.attributes["Σειρά"] = d.line;
  for (const u of html.match(/https:\/\/s3[^"'\s]+\/product-images\/[^"'\s]+/g) || []) {
    if (/\/styles\//.test(u)) continue;
    const clean = decodeAll(u);
    if (!d.images.includes(clean)) d.images.push(clean);
  }
  d.handle = decodeURIComponent(url.replace(/\/+$/, "").split("/").pop());
  const slug = n.replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 60) || d.handle.replace(/[^A-Za-z0-9]/g, "");
  d.imageLarge = d.images[0] || null;
  d.gtin = `LC-${slug}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

async function main() {
  const sm = await fetchText(`${BASE}/sitemap.xml`);
  const urls = [...sm.matchAll(/<loc>([^<]*\/product\/[^<]*)<\/loc>/g)].map(m => m[1].trim());
  console.log(`lactacyd.gr: ${urls.length} σελίδες προϊόντων`);
  const out = []; let err = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    let html = null;
    try { html = await fetchText(urls[i]); } catch (e) { err++; console.log(`  ! ${urls[i]}: ${e.message}`); continue; }
    const d = extractLactacydDetails(urls[i], html);
    out.push({ url: urls[i], section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(34)} ${String(d.keyFacts.length).padStart(2)}kf ${(d.line || "-").padEnd(9)} ${d.gtin.padEnd(36)} | ${d.title}`);
    await sleep(DELAY_MS);
  }
  const seen = {}; for (const p of out) { if (seen[p.gtin]) { p.gtin = p.details.gtin = p.gtin + "x" + (++seen[p.gtin]); p.details.eans = [p.gtin]; } else seen[p.gtin] = 1; }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
