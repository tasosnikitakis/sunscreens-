#!/usr/bin/env node
// scripts/scrape-apivita.mjs
// www.apivita.com/hellas είναι Magento 2 + ScandiPWA. Οι σελίδες είναι κέλυφος (PWA) χωρίς δεδομένα·
// τα δεδομένα έρχονται από GraphQL (/hellas/graphql). Το site είναι πίσω από Cloudflare:
// τα απλά HTTP requests (curl/fetch) παίρνουν challenge, ενώ ένας κανονικός browser που ανοίγει
// το GraphQL URL ως σελίδα (GET) παίρνει JSON. Γι' αυτό χρησιμοποιούμε Playwright/Chromium,
// με νέο browser context ανά αίτημα (χωρίς να φορτωθεί το PWA κέλυφος) και αργό ρυθμό.
//
// Βήμα 1: products(filter:{category_id:{eq:"128"}}) — «Apivita Products» = όλα τα προϊόντα (412): sku + url_key.
// Βήμα 2: ένα ερώτημα ανά προϊόν products(filter:{url_key:{eq:…}}) — ΜΟΝΟ το ερώτημα ενός προϊόντος επιστρέφει
// τα κείμενα (benefits/usage/ingredients…)· στις λίστες (category/sku in) τα attributes αυτά έρχονται null.
// Πεδία: sku, name, url_key, stock_status, short_description, description, meta_description, image,
// media_gallery, categories, attributes[] (ScandiPWA: benefits_description, usage_description,
// ingredients_description, sustainability_description, product_line, skin_type, concern,
// product_active_ingredients, naturality, size_of_container, more_info_description, clinical_results_*).
// Το site ΔΕΝ δίνει EAN: κλειδί προϊόντος = "AP-<sku χωρίς παύλες>" (συνθετικό, βλ. gtin13 στο builder).
//
// Χρήση (cloud session: μέσα από τον proxy του περιβάλλοντος):
//   node scripts/scrape-apivita.mjs                      # όλα (412 ερωτήματα, ~40 λεπτά με delay 2500ms)
//   node scripts/scrape-apivita.mjs --limit=5 --debug    # 5 προϊόντα
//   node scripts/scrape-apivita.mjs --resume             # συνέχεια: παραλείπει όσα υπάρχουν ήδη στο site.json
//   node scripts/scrape-apivita.mjs --handles=a,b        # συγκεκριμένα url_keys

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { htmlToText } from "./lib-frezyderm.mjs";
// Το playwright είναι εγκατεστημένο global (cloud session: /usr/lib/node_modules, μέσω NODE_PATH) — το require το βρίσκει, το import όχι.
const { chromium } = createRequire(import.meta.url)("playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/apivita-site.json");
const BASE = "https://www.apivita.com";
const STORE = "hellas";
const CATEGORY_ALL = "128";

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = k => args.includes(`--${k}`);
const DEBUG = flag("debug");
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const PAGE_SIZE = parseInt(opt("page-size", "100"));
const DELAY_MS = parseInt(opt("delay", "2500"));
const RESUME = flag("resume");
const ONLY = opt("handles", null) ? opt("handles").split(",").map(s => s.trim()).filter(Boolean) : null;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

const clean = s => htmlToText(String(s || "")).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => clean(s).replace(/\s+/g, " ").trim();
const sizeOf = s => { const m = String(s || "").match(/\b(\d{1,4}(?:[.,]\d+)?)\s?(ml|gr|g|kg|l|τμχ|caps|tabs)\b/i); return m ? m[1].replace(",", ".") + m[2].toLowerCase().replace("gr", "g") : null; };
const keyOf = sku => "AP-" + String(sku || "").replace(/[^A-Za-z0-9]/g, "");
// Εικόνες: ο φάκελος /cache/<hash>/ είναι μέγεθος cache· χωρίς αυτόν = πρωτότυπο αρχείο (μεγάλο)
const origImg = u => String(u || "").replace(/\/media\/catalog\/product\/cache\/[0-9a-f]+\//, "/media/catalog/product/");

const FIELDS = `sku name url_key stock_status meta_description short_description{html} description{html}
  image{url label} media_gallery{url label position} categories{name url_path}
  attributes{attribute_code attribute_label attribute_value attribute_options{label value}}`;
const listQuery = (page) => `{products(filter:{category_id:{eq:"${CATEGORY_ALL}"}},pageSize:${PAGE_SIZE},currentPage:${page}){total_count page_info{total_pages} items{sku url_key name}}}`;
const productQuery = (urlKey) => `{products(filter:{url_key:{eq:${JSON.stringify(urlKey)}}}){items{${FIELDS}}}}`;

let browser;
async function gqlGet(query) {
  const url = `${BASE}/${STORE}/graphql?query=${encodeURIComponent(query)}`;
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "el-GR", userAgent: UA });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    let title = await page.title();
    for (let k = 0; k < 12 && /just a moment|Περιμένετε/i.test(title); k++) { await page.waitForTimeout(3000); title = await page.title(); }
    const txt = await page.evaluate(() => document.body.innerText);
    if (!txt.trim().startsWith("{")) throw new Error(`HTTP ${res && res.status()} — όχι JSON (${title.slice(0, 40)})`);
    const j = JSON.parse(txt);
    if (j.errors && !j.data) throw new Error(j.errors.map(e => e.message).join("; ").slice(0, 200));
    return j.data;
  } finally { await ctx.close(); }
}

// attribute_value μπορεί να είναι id(s) επιλογών ("5622,5644") → labels από attribute_options
function attrText(a) {
  if (a == null || a.attribute_value == null || a.attribute_value === "") return null;
  const opts = a.attribute_options || [];
  if (opts.length) {
    const ids = String(a.attribute_value).split(",").map(s => s.trim());
    const labels = ids.map(id => (opts.find(o => String(o.value) === id) || {}).label).filter(Boolean);
    if (labels.length) return labels.join(", ");
  }
  return String(a.attribute_value);
}

function buildEntry(p) {
  const url = `${BASE}/${STORE}/${p.url_key}.html`;
  const A = {}; for (const a of (p.attributes || [])) A[a.attribute_code] = a;
  const T = code => { const v = attrText(A[code]); return v ? clean(v) : null; };
  const L = code => { const v = attrText(A[code]); return v ? oneLine(v) : null; };
  const name = oneLine(p.name);
  const shortDesc = clean(p.short_description && p.short_description.html);
  const longDesc = clean(p.description && p.description.html);
  const benefits = T("benefits_description");
  const tabs = {};
  if (benefits) tabs["Πληροφορίες"] = benefits;
  if (T("usage_description")) tabs["Χρήση"] = T("usage_description");
  if (T("ingredients_description")) tabs["Συστατικά"] = T("ingredients_description");
  if (T("sustainability_description")) tabs["Συσκευασία"] = T("sustainability_description");
  const clinical = [];
  for (let i = 1; i <= 6; i++) { const pct = L("clinical_results_percentage" + (i === 1 ? "" : i)), txt = L("clinical_results_text" + (i === 1 ? "" : i)); if (pct || txt) clinical.push([pct, txt].filter(Boolean).join(" ")); }
  if (clinical.length) tabs["Κλινικά αποτελέσματα"] = (L("clinical_results_audience") ? L("clinical_results_audience") + "\n" : "") + clinical.map(c => "• " + c).join("\n");
  const attributes = {};
  if (L("product_line")) attributes["Σειρά"] = L("product_line");
  if (L("skin_type")) attributes["Τύπος επιδερμίδας"] = L("skin_type");
  if (L("concern")) attributes["Ανάγκες"] = L("concern");
  if (L("product_active_ingredients")) attributes["Κύρια δραστικά συστατικά"] = L("product_active_ingredients");
  if (L("naturality")) attributes["Φυσικότητα"] = L("naturality");
  if (L("size_of_container")) attributes["Μέγεθος"] = L("size_of_container");
  if (L("more_info_description")) attributes["Πληροφορίες"] = L("more_info_description");
  if (L("usage")) attributes["Χρόνος χρήσης"] = L("usage");
  const cats = (p.categories || []).map(c => ({ name: oneLine(c.name), path: c.url_path || "" }));
  const gallery = (p.media_gallery || []).sort((a, b) => (a.position || 0) - (b.position || 0)).map(m => origImg(m.url)).filter(Boolean);
  const images = [...new Set([...(p.image && p.image.url ? [origImg(p.image.url)] : []), ...gallery])];
  const size = L("size_of_container") || sizeOf(name);
  const gtin = keyOf(p.sku);
  const description = shortDesc || longDesc || benefits || "";
  const details = {
    title: name, fullTitle: name, line: L("product_line"), gtin, sku: p.sku,
    variants: [], sizes: size ? [size] : [], size: size || null,
    subtitle: shortDesc ? shortDesc.split("\n")[0].slice(0, 160) : null,
    shortDescription: shortDesc || null,
    advantages: shortDesc ? shortDesc.split("\n").map(s => s.replace(/^•\s*/, "").trim()).filter(Boolean) : [],
    keyFacts: [], description: longDesc || benefits || shortDesc || null,
    tabs, attributes, images, imageLarge: images[0] || null,
    breadcrumbs: cats.map(c => c.name), category: cats.map(c => c.path).filter(Boolean).join(" | ") || null,
    categories: cats, stockStatus: p.stock_status || null, metaDescription: oneLine(p.meta_description) || null,
    notOnline: !!attrText(A["not_online"]), isSet: !!attrText(A["is_offer_set"]), isFree: /^yes$/i.test(attrText(A["is_free"]) || ""),
    greek: true
  };
  return { url, section: "p", name, description: description.replace(/\s+/g, " ").slice(0, 700), longDescription: longDesc || benefits || null, subtitle: details.subtitle, details, image: images[0] || null, sku: p.sku, gtin };
}

async function withRetry(label, fn) {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); }
    catch (e) { console.log(`  ${label}: προσπάθεια ${attempt} απέτυχε — ${e.message}`); if (attempt >= 3) throw e; await sleep(DELAY_MS * 3); }
  }
}

async function main() {
  browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"], proxy: (process.env.HTTPS_PROXY || process.env.https_proxy) ? { server: process.env.HTTPS_PROXY || process.env.https_proxy } : undefined });
  let out = [];
  if (RESUME) { try { out = JSON.parse(await fs.readFile(OUT_FILE, "utf8")); console.log(`resume: ${out.length} ήδη στο site.json`); } catch {} }
  const have = new Set(out.map(e => e.details && e.details.sku));
  let err = 0;
  try {
    // Βήμα 1: λίστα (sku, url_key)
    const list = [];
    for (let page = 1, pages = 1; page <= pages; page++) {
      const data = await withRetry(`λίστα σελ. ${page}`, () => gqlGet(listQuery(page)));
      pages = data.products.page_info.total_pages;
      list.push(...data.products.items);
      if (page === 1) console.log(`apivita.com/${STORE}: ${data.products.total_count} προϊόντα (${pages} σελίδες λίστας)`);
      await sleep(DELAY_MS);
    }
    let todo = list.filter(p => p.url_key && !have.has(p.sku));
    if (ONLY) todo = todo.filter(p => ONLY.includes(p.url_key));
    const cap = Math.min(todo.length, LIMIT);
    console.log(`Κατεβάζω ${cap} προϊόντα (ένα ερώτημα το καθένα, delay ${DELAY_MS}ms)…\n`);
    // Βήμα 2: ένα ερώτημα ανά προϊόν
    for (let i = 0; i < cap; i++) {
      const lp = todo[i];
      try {
        const data = await withRetry(lp.url_key, () => gqlGet(productQuery(lp.url_key)));
        const p = (data.products.items || [])[0];
        if (!p) throw new Error("κενό αποτέλεσμα");
        const e = buildEntry(p); out.push(e);
        console.log(`[${i + 1}/${cap}] ${e.details.images.length ? "img+" : "img-"} ${e.details.tabs["Χρήση"] ? "use+" : "use-"} ${e.details.tabs["Πληροφορίες"] ? "info+" : "info-"} ${e.sku} ${e.name.slice(0, 60)}`);
        dbg(JSON.stringify(e.details.attributes));
      } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${lp.sku} ${lp.url_key}: ${ex.message}`); }
      if ((i + 1) % 10 === 0) await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
      await sleep(DELAY_MS);
    }
  } finally { await browser.close(); }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}  errors=${err}.  Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
  console.log("Επόμενο: node scripts/build-brand-supplier.mjs --brand=apivita --with-site && node scripts/match-apivita.mjs");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
