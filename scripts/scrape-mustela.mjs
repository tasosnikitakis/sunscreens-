#!/usr/bin/env node
// scripts/scrape-mustela.mjs
// Mustela Ελλάδα = www.mustela.com.gr (Shopify πολλαπλών αγορών· το mustela.gr ανακατευθύνει εδώ). Χωρίς EAN/τιμές.
// Λίστα: /sitemap_products_1.xml (μόνο τα ελληνικά προϊόντα· το /products.json ανακατεύει όλες τις αγορές).
// Ανά προϊόν: /products/<handle>.js (τίτλος, ελληνική περιγραφή, εικόνες, tags) + η σελίδα HTML
// (samples/mustela-sample.html): ετικέτα κατηγορίας div.product-tags, ενότητες <clrz-expandable> με
// h2.t-small-title «Ιδιότητες» / «Οδηγίες Χρήσης» / «Συστατικά» (+ h3 «Λίστα συστατικών» = INCI).
// Κλειδί (χωρίς EAN): "MU-<handle>". Οι τιμές μπαίνουν από τον τιμοκατάλογο με manual matches.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-mustela.mjs [--limit=5] [--delay=800]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/mustela-site.json");
const BASE = "https://www.mustela.com.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "800"));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h3)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const sizeNorm = s => { const m = String(s || "").replace(/(\d),(\d)/g, "$1.$2").match(/(\d{1,4}(?:\.\d+)?)\s?(ml|gr|g|l|kg)\b/i); return m ? (+m[1]) + m[2].toLowerCase().replace("gr", "g") : null; };
const G2L = { Α: "A", Β: "B", Ε: "E", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X", Ζ: "Z" };
// ελληνικά κεφαλαία σε λατινική λέξη («Μustela», «Οrganic») → λατινικά
export const cleanTitle = t => String(t || "").replace(/[ΑΒΕΗΙΚΜΝΟΡΤΥΧΖ](?=[a-z])/g, c => G2L[c]).replace(/\s*Mustela\s*®?\s*$/i, "").replace(/®/g, "®").replace(/\s+/g, " ").trim();

export function extractMustelaDetails(html, js, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = cleanTitle(js.title) || cleanTitle(oneLine((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || ""));
  d.fullTitle = d.title;
  const desc = text(js.description || "");
  if (desc) d.tabs["Περιγραφή"] = desc;
  const tag = oneLine((html.match(/class='[^']*product-tags[^']*'[^>]*>\s*<span[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/) || [])[1] || "");
  if (tag) { d.category = tag; d.line = tag; d.attributes["Κατηγορία mustela.com.gr"] = tag; }
  const NAMES = { "Ιδιότητες": "Οφέλη", "Οδηγίες Χρήσης": "Χρήση", "Συστατικά": "Συστατικά" };
  for (const m of html.matchAll(/<clrz-expandable[\s\S]*?<h2 class='t-small-title'[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)<\/clrz-expandable>/g)) {
    const raw = oneLine(m[1]); const k = Object.keys(NAMES).find(n => n.toLocaleUpperCase("el").normalize("NFD").replace(/[̀-ͯ]/g, "") === raw.toLocaleUpperCase("el").normalize("NFD").replace(/[̀-ͯ]/g, "")) || raw; const body = m[2].replace(/<figure[\s\S]*?<\/figure>/g, "").replace(/<picture[\s\S]*?<\/picture>/g, "");
    if (!k || /Σχετικ|Κριτικ|FAQ/i.test(k)) continue;
    let v = text(body); if (!v) continue;
    if (/Συστατικ/.test(k)) {
      const inci = oneLine((body.match(/Λίστα συστατικών\s*<\/h3>\s*<p>([\s\S]*?)<\/p>/i) || [])[1] || "");
      if (inci) { d.inci = inci; v = v.replace(/Λίστα συστατικών[\s\S]*$/, "").trim() + "\nINCI: " + inci; }
    }
    d.tabs[NAMES[k] || k] = v;
  }
  if (d.tabs["Οφέλη"]) d.advantages = d.tabs["Οφέλη"].split("\n").map(s => s.trim()).filter(s => s.length > 3).slice(0, 8);
  for (const im of js.images || []) { const u = (im.startsWith("//") ? "https:" + im : im).split("?")[0]; if (!d.images.includes(u)) d.images.push(u); }
  d.imageLarge = d.images[0] || null;
  d.size = sizeNorm(js.title) || sizeNorm((desc.match(/\d{1,4}\s?(?:ml|gr|g)\b/i) || [])[0]);
  d.sizes = d.size ? [d.size] : [];
  d.tags = js.tags || [];
  d.subtitle = (desc.split("\n")[0] || "").length <= 160 ? desc.split("\n")[0] : null;
  d.description = desc.replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = js.handle || String(url).split("/").pop();
  const key = String(d.handle).replace(/[^A-Za-z0-9]/g, "").replace(/mustelar?$/i, "").slice(0, 70);
  d.gtin = "MU-" + (key.length >= 4 ? key : key + "item");
  d.eans = [d.gtin];
  return d;
}

async function main() {
  const idx = await fetchText(BASE + "/sitemap.xml");
  const psm = (idx.match(/<loc>(https:\/\/www\.mustela\.com\.gr\/sitemap_products_1\.xml[^<]*)<\/loc>/) || [])[1];
  const sm = await fetchText(decodeAll(psm || BASE + "/sitemap_products_1.xml"));
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /\/products\/[^/]+$/.test(u)))];
  console.log(`mustela GR: ${urls.length} σελίδες προϊόντων`);
  const out = []; let err = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      const js = JSON.parse(await fetchText(url + ".js"));
      const html = await fetchText(url);
      const d = extractMustelaDetails(html, js, url);
      out.push({ url: decodeURI(url), section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").padEnd(6)} ${(d.category || "-").padEnd(22)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
