#!/usr/bin/env node
// scripts/enrich-frezyderm-descriptions.mjs
// Ξανακατεβάζει κάθε product URL του js/frezyderm-site.json και εξάγει
// τη ΜΕΓΑΛΗ περιγραφή (multi-paragraph text κάτω από το SKU line) που
// εμφανίζει το frezyderm.gr στη σελίδα του προϊόντος. Προσθέτει field
// `longDescription` σε κάθε entry του site.json.
//
// Μετά τρέξτε ξανά scripts/match-frezyderm.mjs — θα προτιμήσει το
// longDescription έναντι του σύντομου og:description όταν υπάρχει.
//
// Χρήση:
//   node scripts/enrich-frezyderm-descriptions.mjs
//   node scripts/enrich-frezyderm-descriptions.mjs --debug
//   node scripts/enrich-frezyderm-descriptions.mjs --limit=20
//   node scripts/enrich-frezyderm-descriptions.mjs --inspect="https://www.frezyderm.gr/…/"

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE_FILE = path.join(ROOT, "js/frezyderm-site.json");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const FORCE = flag("force");
const INSPECT = opt("inspect", null);
const GREP = opt("grep", null);
const DELAY_MS = parseInt(opt("delay", "350"));

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "el-GR,el;q=0.9" },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function decodeHtml(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—").replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Επιστρέφει clean text από HTML block: κρατά paragraph breaks, αφαιρεί
// scripts/styles/tags/whitespace.
function stripHtml(html) {
  return decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(?:div|li|h[1-6]|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/\r/g, "")
    .split("\n").map(l => l.replace(/[ \t]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Πιθανά containers που μπορεί να περιέχουν την περιγραφή. Δοκιμάζονται
// με σειρά — παίρνουμε το ΠΡΩΤΟ που δίνει text > 120 chars.
const CANDIDATE_PATTERNS = [
  // Standard WooCommerce full-description tab
  { name: "wc-tabs-desc",   re: /<div[^>]+class=["'][^"']*woocommerce-Tabs-panel--description[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i },
  { name: "tab-description",re: /<div[^>]+id=["']tab-description["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div|<footer|<section)/i },
  // Short summary right of the image
  { name: "wc-short-desc",  re: /<div[^>]+class=["'][^"']*woocommerce-product-details__short-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  // Schema.org itemprop
  { name: "itemprop-desc",  re: /<div[^>]+itemprop=["']description["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div|<footer|<section)/i },
  // Elementor product widget
  { name: "elementor-desc", re: /<div[^>]+class=["'][^"']*(?:elementor-widget-woocommerce-product-content|elementor-widget-text-editor)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i },
  // Generic entry-content
  { name: "entry-content",  re: /<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|article)>\s*<\/article>/i },
  // Generic product-description div/section
  { name: "product-desc",   re: /<(?:div|section)[^>]+class=["'][^"']*product-description[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i },
  // "Περιγραφή" heading followed by paragraphs
  { name: "greek-heading",  re: /<h[1-6][^>]*>\s*(?:Περιγραφή|ΠΕΡΙΓΡΑΦΗ|Description)\s*<\/h[1-6]>([\s\S]*?)(?=<h[1-6]|<\/section|<\/article|<footer)/i }
];

function extractLongDescription(html) {
  const results = [];
  for (const c of CANDIDATE_PATTERNS) {
    const m = html.match(c.re);
    if (!m) continue;
    const text = stripHtml(m[1]);
    results.push({ name: c.name, text, length: text.length });
  }
  // Πιστεύουμε το μεγαλύτερο block πάνω από 120 chars
  const valid = results.filter(r => r.length >= 120);
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.length - a.length);
  return valid[0];
}

// JSON-LD Product.description μπορεί να είναι πλήρη σε ορισμένα CMS.
// Ξεχωριστή extraction γιατί είναι δομημένο (όχι regex σε HTML).
function extractJsonLdDescription(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let json;
    try { json = JSON.parse(b[1].trim()); } catch { continue; }
    const stack = Array.isArray(json) ? [...json] : [json];
    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== "object") continue;
      const type = node["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (types.includes("Product") && typeof node.description === "string") {
        const clean = stripHtml(node.description);
        if (clean.length >= 120) return { name: "json-ld", text: clean, length: clean.length };
      }
      if (node["@graph"] && Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
    }
  }
  return null;
}

function bestDescription(html) {
  const jsonLd = extractJsonLdDescription(html);
  const long = extractLongDescription(html);
  if (jsonLd && long) {
    // Παίρνουμε το μεγαλύτερο — συνήθως το tab-description είναι πιο πλήρες
    return long.length > jsonLd.length ? long : jsonLd;
  }
  return jsonLd || long;
}

// ----- Inspect mode: dump όλα τα candidate matches για ένα URL -----

async function inspect(url) {
  console.log(`GET ${url}\n`);
  const html = await fetchText(url);
  console.log(`HTML size: ${(html.length / 1024).toFixed(0)}kb\n`);

  const jsonLd = extractJsonLdDescription(html);
  if (jsonLd) console.log(`[json-ld]  ${jsonLd.length} chars\n${jsonLd.text.slice(0, 400)}${jsonLd.text.length > 400 ? "…" : ""}\n`);
  else console.log("[json-ld]  (none)\n");

  for (const c of CANDIDATE_PATTERNS) {
    const m = html.match(c.re);
    if (!m) { console.log(`[${c.name}] (no match)`); continue; }
    const text = stripHtml(m[1]);
    console.log(`[${c.name}] ${text.length} chars\n${text.slice(0, 400)}${text.length > 400 ? "…" : ""}\n`);
  }

  const best = bestDescription(html);
  if (best) console.log(`\n=> BEST: ${best.name} (${best.length} chars)`);
  else console.log(`\n=> NO candidate above 120 chars threshold`);

  // Save raw HTML για offline inspection
  await fs.mkdir(path.join(ROOT, "_debug"), { recursive: true });
  const debugFile = path.join(ROOT, "_debug", "frezyderm-inspect.html");
  await fs.writeFile(debugFile, html, "utf8");
  console.log(`\nRaw HTML saved to ${path.relative(ROOT, debugFile)} για offline inspection.`);

  // Λίστα από ύποπτα class + id names
  const classSet = new Set();
  for (const m of html.matchAll(/\bclass=["']([^"']+)["']/g)) {
    for (const c of m[1].split(/\s+/)) {
      if (/desc|content|product|text|body|main|entry|article|tab|summary|editor|elementor|singular|post/i.test(c)) classSet.add(c);
    }
  }
  const idSet = new Set();
  for (const m of html.matchAll(/\bid=["']([^"']+)["']/g)) {
    if (/desc|content|product|text|body|main|entry|article|tab|summary|editor|elementor/i.test(m[1])) idSet.add(m[1]);
  }
  console.log(`\nSuspect classes (${classSet.size}):`);
  [...classSet].slice(0, 40).forEach(c => console.log(`  .${c}`));
  console.log(`\nSuspect ids (${idSet.size}):`);
  [...idSet].slice(0, 20).forEach(i => console.log(`  #${i}`));

  // Grep mode: εντοπίζει keyword στο HTML και δείχνει 300 chars context
  if (GREP) {
    console.log(`\n--- GREP "${GREP}" context ---`);
    const idx = html.toLowerCase().indexOf(GREP.toLowerCase());
    if (idx < 0) console.log("Not found in HTML.");
    else {
      const start = Math.max(0, idx - 200);
      const end = Math.min(html.length, idx + 800);
      console.log(html.slice(start, end));
      // Βρες τα ονόματα των γονέων tags που περικλείουν το keyword
      const before = html.slice(0, idx);
      const opens = [...before.matchAll(/<(div|section|article|main|aside)\b[^>]*>/gi)];
      const closes = [...before.matchAll(/<\/(div|section|article|main|aside)>/gi)];
      const depth = opens.length - closes.length;
      console.log(`\nDepth from start of body: ${depth} open containers`);
      // Show last 5 open tags
      const lastFewOpens = opens.slice(-8).map(m => m[0]);
      console.log(`Last 8 opened containers before match:`);
      lastFewOpens.forEach(t => console.log(`  ${t.slice(0, 200)}`));
    }
  }
}

// ----- Main -----

async function main() {
  if (INSPECT) { await inspect(INSPECT); return; }

  const raw = await fs.readFile(SITE_FILE, "utf8");
  const site = JSON.parse(raw);

  const pool = site.filter(p => p.url && (FORCE || !p.longDescription));
  console.log(`Enriching ${pool.length} product descriptions from frezyderm.gr…\n`);

  let ok = 0, noBetter = 0, fail = 0, n = 0;
  for (const p of pool) {
    if (n >= LIMIT) break;
    n++;
    const label = `[${n}/${Math.min(pool.length, LIMIT)}] ${p.url.replace(/^https?:\/\/[^\/]+/, "")}`;
    try {
      const html = await fetchText(p.url);
      const best = bestDescription(html);
      if (best) {
        p.longDescription = best.text;
        p.longDescriptionSource = best.name;
        ok++;
        console.log(`${label} OK [${best.name}] ${best.length}c`);
      } else {
        noBetter++;
        console.log(`${label} NO_BETTER (kept og:description of ${(p.description || "").length}c)`);
      }
    } catch (e) {
      fail++;
      console.log(`${label} ERR ${e.message}`);
    }
    if (n % 10 === 0) await fs.writeFile(SITE_FILE, JSON.stringify(site, null, 2), "utf8");
    await sleep(DELAY_MS);
  }
  await fs.writeFile(SITE_FILE, JSON.stringify(site, null, 2), "utf8");
  console.log(`\nDone. enriched=${ok}  no-better=${noBetter}  failed=${fail}.  Άλλαξε το js/frezyderm-site.json — τρέξτε node scripts/match-frezyderm.mjs για να διαπεράσει στα overrides.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
