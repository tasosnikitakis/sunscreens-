#!/usr/bin/env node
// scripts/match-lamberts.mjs
// Ταιριάζει κάθε προϊόν του supplier (js/lamberts-supplier.js) με το πιο
// σχετικό προϊόν του lamberts.gr (js/lamberts-site.json). Γράφει
// js/lamberts-overrides.js.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUPPLIER_FILE = path.join(ROOT, "js/lamberts-supplier.js");
const SITE_FILE = path.join(ROOT, "js/lamberts-site.json");
const OUT_FILE = path.join(ROOT, "js/lamberts-overrides.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const ONLY = opt("barcode", null);
const MIN_SCORE = parseFloat(opt("min-score", "3"));
const HIGH_SCORE = parseFloat(opt("high-score", "6"));

// Stopwords: γενικές λέξεις που δεν βοηθούν στο match
const STOPWORDS = new Set([
  "lamberts", "tabs", "tab", "caps", "cap", "capsules", "sachets", "χαπια",
  "gr", "mg", "mcg", "iu", "ml", "kg", "l",
  "και", "με", "για", "σε",
  "extra", "plus", "complex", "advanced", "pro", "active",
  "en", "gr", "fr", "es", "pt", "de", "it", "nl", "pl", "ro", "el"
]);

function extractTokens(s) {
  if (!s) return new Set();
  const lower = s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[+&\/\\.]/g, " ")
    .replace(/[^\w\sα-ωά-ώΑ-Ωa-z0-9]/gi, " ");
  const raw = lower.split(/\s+/).filter(Boolean);
  const toks = new Set();
  for (const t of raw) {
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    toks.add(t);
  }
  return toks;
}

function extractDosage(s) {
  if (!s) return null;
  const m = s.toLowerCase().match(/\b(\d{1,5})\s?(mg|mcg|iu|gr|g|ml|caps|tabs|sachets|billion)\b/);
  return m ? m[1] + m[2] : null;
}

function extractCount(s) {
  if (!s) return null;
  // "60caps", "30tabs", "x60"
  const m = s.toLowerCase().match(/(?:x\s*)?(\d{2,4})\s*(caps|tabs|tablets|sachets)?\b/);
  return m ? m[1] + (m[2] || "") : null;
}

function scoreMatch(supplierTokens, supplierDose, supplierCount, sitePr) {
  const siteName = sitePr.name || "";
  const siteUrl = sitePr.url || "";
  const nameTokens = extractTokens(siteName);
  const urlTokens = extractTokens(siteUrl.replace(/[\/\-\.]/g, " "));
  const siteDose = extractDosage(siteName);
  const siteCount = extractCount(siteName);

  let score = 0;
  const matched = [];
  for (const t of supplierTokens) {
    if (nameTokens.has(t)) { score += 2; matched.push(t); }
    else if (urlTokens.has(t)) { score += 0.5; }
  }
  if (supplierDose && siteDose && supplierDose === siteDose) score += 3;
  else if (supplierDose && siteDose && supplierDose !== siteDose) score -= 1;
  if (supplierCount && siteCount && supplierCount === siteCount) score += 2;
  return { score, matched };
}

function bestMatch(supplier, siteCatalog) {
  const st = extractTokens(supplier.name);
  const sd = extractDosage(supplier.name);
  const sc = extractCount(supplier.name);
  const scored = siteCatalog
    .map(sp => ({ site: sp, ...scoreMatch(st, sd, sc, sp) }))
    .sort((a, b) => b.score - a.score);
  return { top: scored[0], top3: scored.slice(0, 3) };
}

async function loadSupplier() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(SUPPLIER_FILE, "utf8"), ctx);
  return ctx.window.LAMBERTS_SUPPLIER || [];
}

async function loadSite() {
  return JSON.parse(await fs.readFile(SITE_FILE, "utf8"));
}

async function saveOverrides(overrides) {
  const banner = "// Auto-generated από το scripts/match-lamberts.mjs.\n"
               + "// Fuzzy-matched supplier products με lamberts.gr catalog.\n";
  await fs.writeFile(OUT_FILE,
    banner + "window.LAMBERTS_OVERRIDES = " + JSON.stringify(overrides, null, 2) + ";\n", "utf8");
}

async function main() {
  const supplier = await loadSupplier();
  const site = await loadSite();
  if (!site.length) { console.error("Το lamberts-site.json είναι κενό. Τρέξτε πρώτα scripts/scrape-lamberts.mjs."); process.exit(1); }

  console.log(`Matching ${supplier.length} supplier products against ${site.length} site products…\n`);
  const overrides = {};
  let high = 0, review = 0, skip = 0;
  const pool = ONLY ? supplier.filter(p => p.barcode === ONLY || (p.variants || []).includes(ONLY)) : supplier;

  for (const p of pool) {
    const { top, top3 } = bestMatch(p, site);
    if (DEBUG) {
      console.log(`\n[${p.barcode}] ${p.name.slice(0, 60)}`);
      for (const c of top3) console.log(`  ${c.score.toFixed(1).padStart(5)} [${c.matched.join(",")}] ${(c.site.name || "").slice(0, 60)} — ${c.site.url}`);
    }
    if (!top || top.score < MIN_SCORE) { skip++; if (!DEBUG) console.log(`${p.barcode.padEnd(13)} SKIP  (best=${top ? top.score.toFixed(1) : "0"}) — ${p.name.slice(0, 55)}`); continue; }
    const s = top.site;
    const isHigh = top.score >= HIGH_SCORE;
    overrides[p.barcode] = {
      name: s.name,
      description: s.description || null,
      image: s.image || null,
      url: s.url,
      source: "lamberts.gr",
      section: s.section,
      score: Number(top.score.toFixed(1)),
      review: !isHigh
    };
    if (isHigh) { high++; if (!DEBUG) console.log(`${p.barcode.padEnd(13)} OK    ${top.score.toFixed(1).padStart(5)} — ${(s.name || "").slice(0, 55)}`); }
    else { review++; if (!DEBUG) console.log(`${p.barcode.padEnd(13)} REV   ${top.score.toFixed(1).padStart(5)} — ${(s.name || "").slice(0, 55)}`); }
  }
  await saveOverrides(overrides);
  console.log(`\nDone. high=${high}  review=${review}  skip=${skip}  (of ${pool.length}).`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
