#!/usr/bin/env node
// scripts/scrape-mollers.mjs
// Möller's (Orkla) = www.mollersomega3.com — διεθνές site, WordPress + WooCommerce, αγγλικά, χωρίς EAN (το ελληνικό mollers.gr δεν απαντά).
// Λίστα + κείμενα: WooCommerce Store API /wp-json/wc/store/v1/products (11 προϊόντα: μουρουνέλαιο, κάψουλες, ζελεδάκια, Total…).
// Τα αγγλικά κείμενα κρατιούνται στο details.sourceEn· τα ελληνικά (ελεύθερη απόδοση) έρχονται από js/mollers-translations.json.
// Κλειδί: "MO-<slug>". Τιμές με js/mollers-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-mollers.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/mollers-site.json");
const TR_FILE = path.join(ROOT, "js/mollers-translations.json");
const BASE = "https://www.mollersomega3.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const CAT_GR = { "Children and teenagers": "Παιδιά & έφηβοι", "Adult": "Ενήλικες", "Healthy aging": "Υγιής γήρανση", "Pregnant and baby": "Εγκυμοσύνη & βρέφη" };

export function extractMollersDetails(p, tr) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.handle = String(p.permalink).replace(/\/+$/, "").split("/").pop();
  const en = text(p.description);
  d.sourceEn = { name: decodeAll(p.name), description: en };
  const t = tr[d.handle] || {};
  d.title = t.name || decodeAll(p.name).replace(/^Möller[’']s\s+/i, "");
  d.tabs = Object.assign({}, t.tabs || { "Περιγραφή": en });
  d.subtitle = t.subtitle || null;
  d.size = t.size || null; d.sizes = d.size ? [d.size] : []; if (d.size) d.attributes["Συσκευασία"] = d.size;
  if (d.tabs["Οφέλη"]) d.advantages = d.tabs["Οφέλη"].split("\n").filter(l => l.length > 8 && !l.startsWith("*"));
  if (/χωρίς προσθήκη ζάχαρης/i.test(d.tabs["Περιγραφή"] || "")) d.keyFacts.push("Χωρίς προσθήκη ζάχαρης");
  if (/Superior Taste Award/.test(d.tabs["Περιγραφή"] || "")) d.keyFacts.push("Superior Taste Award");
  if (/χωρίς βιταμίνη E/i.test(d.subtitle || "")) d.keyFacts.push("Χωρίς βιταμίνη E");
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  d.categories = (p.categories || []).map(c => CAT_GR[decodeAll(c.name)] || decodeAll(c.name)); d.category = d.categories.join(" | ") || null;
  if (d.category) d.attributes["Για"] = d.category;
  d.line = /cod-liver-oil(?!-capsules)/.test(d.handle) && !/active/.test(d.handle) ? "Μουρουνέλαιο" : /jelly/.test(d.handle) ? "Ζελεδάκια" : /first/.test(d.handle) ? "Βρέφη" : "Κάψουλες";
  d.series = d.line; d.attributes["Σειρά"] = d.line;
  for (const im of p.images || []) { const u = String(im.src || "").split("?")[0]; if (u && !d.images.includes(u)) d.images.push(u); }
  d.imageLarge = d.images[0] || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.translated = !!tr[d.handle];
  d.gtin = "MO-" + d.handle.replace(/^mollers-(pharma-)?/, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 60); d.eans = [d.gtin];
  return d;
}

async function main() {
  const res = await fetch(`${BASE}/wp-json/wc/store/v1/products?per_page=100`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const all = await res.json();
  let tr = {}; try { tr = JSON.parse(await fs.readFile(TR_FILE, "utf8")); } catch {}
  const out = [];
  for (const p of all) {
    const d = extractMollersDetails(p, tr);
    out.push({ url: p.permalink, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`${d.images.length ? "img+" : "img-"} ${d.translated ? "GR" : "EN"} ${Object.keys(d.tabs).length}tabs ${d.gtin.padEnd(28)} | ${d.title}`);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
