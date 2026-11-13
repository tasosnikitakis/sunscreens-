#!/usr/bin/env node
// scripts/scrape-brand.mjs
// Γενικός scraper επίσημου brand site → js/<brand>-site.json
//
//   1. Βρίσκει product URLs από sitemaps (robots.txt + συνήθεις διαδρομές).
//   2. Κατεβάζει κάθε υποψήφια σελίδα και την κρατά μόνο αν είναι σελίδα
//      προϊόντος (JSON-LD @type Product, og:type product ή schema.org/Product).
//   3. Εξάγει γενικά πεδία: name, description, longDescription, image, gtin,
//      sku, breadcrumbs, section + `details` (h1, καρτέλες από επικεφαλίδες).
//      Για template-specific εξαγωγή (όπως lib-frezyderm / lib-lamberts)
//      δηλώνεται extractor στο BRANDS παρακάτω μόλις μελετηθεί ένα δείγμα.
//
// Χρήση (σε cloud session με proxy: NODE_USE_ENV_PROXY=1 node scripts/scrape-brand.mjs …):
//   node scripts/scrape-brand.mjs --brand=aderma
//   node scripts/scrape-brand.mjs --brand=aderma --limit=20 --debug
//   node scripts/scrape-brand.mjs --brand=aderma --inspect="https://www.aderma.gr/…/" --dump=samples/aderma-sample.html
//   node scripts/scrape-brand.mjs --brand=aderma --urls=urls.txt   # λίστα URLs αντί για sitemap

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeHtml, htmlToText } from "./lib-frezyderm.mjs";
import { extractAdermaDetails, extractPierreFabreDetails } from "./lib-aderma.mjs";
import { extractLrpDetails, isLrpProductPage } from "./lib-lrp.mjs";
import { extractVichyDetails, isVichyProductPage } from "./lib-vichy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const BRAND = (opt("brand", "") || "").toLowerCase();
const DEBUG = flag("debug");
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
let DELAY_MS = parseInt(opt("delay", "0"));
const INSPECT = opt("inspect", null);
const DUMP = opt("dump", null);
const URLS_FILE = opt("urls", null);

// Brand-specific ρυθμίσεις scraping. `extractor` (προαιρετικό): async (html, url) → details
// object όπως τα lib-frezyderm/lib-lamberts, μόλις χαρτογραφηθεί το template.
const BRANDS = {
  aderma: {
    host: "aderma.gr",
    // Σελίδες που σίγουρα δεν είναι προϊόντα
    skip: /\/(blog|news|nea|arthra|article|articles|about|sxetika|contact|epikoinonia|stores|store-locator|legal|privacy|cookies|terms|tag|tags|search|cart|account|faq|routine|routines|conseils|advice|symvoules|sitemap|wp-content|wp-json|feed|node|user|taxonomy|media|files)(\/|$)/i,
    // Προτίμηση διαδρομών προϊόντων (αν υπάρχουν — αλλιώς κρίνει το JSON-LD)
    prefer: /\/p\//i,
    toLocalUrl: u => u,
    extractor: async (html, url) => extractAdermaDetails(html, url)
  },
  ducray: {
    host: "ducray.com",
    // Διεθνές site με locale στο path: κρατάμε ΜΟΝΟ το ελληνικό product sitemap
    // (/gr-gr/product.xml) και τις σελίδες προϊόντων του (/gr-gr/p/…)
    only: /\/gr-gr\/product\.xml$|\/gr-gr\/p\//i,
    skip: /\/(blog|news|nea|arthra|article|articles|about|contact|stores|store-locator|legal|privacy|cookies|terms|tag|tags|search|cart|account|faq|routine|routines|conseils|advice|symvoules|sitemap|media|files)(\/|$)/i,
    prefer: /\/gr-gr\/p\//i,
    toLocalUrl: u => u,
    delay: 5000,            // robots.txt: Crawl-delay: 5
    extractor: async (html, url) => extractPierreFabreDetails(html, url)
  },
  avene: {
    host: "eau-thermale-avene.gr",
    only: /\/product\.xml$|\/p\//i,
    skip: /\/(blog|news|article|articles|about|contact|stores|store-locator|legal|privacy|cookies|terms|tag|tags|search|cart|account|faq|routine|routines|conseils|advice|sitemap|media|files)(\/|$)/i,
    prefer: /\/p\//i,
    toLocalUrl: u => u,
    delay: 5000,            // robots.txt: Crawl-delay: 5
    extractor: async (html, url) => extractPierreFabreDetails(html, url)
  },
  lrp: {
    // La Roche-Posay (L'Oréal / Sitecore): σελίδες προϊόντων = /<σειρά>/<slug>, χωρίς JSON-LD Product
    host: "larocheposay.gr",
    only: /^https:\/\/www\.larocheposay\.gr\/(?!article\/|event\/)[a-z0-9-]+\/[a-z0-9-]+\/?$/i,
    skip: /\/(article|event|farmakeia|accounts|search|sitecore|api|diagonismos)(\/|$)/i,
    prefer: /\/(anthelios|effaclar|toleriane|lipikar|cicaplast|hyalu-b5|mela-b3|hydraphase|kerium|nutritic|vitamin-c|retinol|toleriane-make-up)\//i,
    toLocalUrl: u => u,
    delay: 1500,
    isProduct: html => isLrpProductPage(html),
    extractor: async (html, url) => extractLrpDetails(html, url)
  },
  vichy: {
    // Vichy (L'Oréal / Sitecore, άλλο theme από LRP): προϊόντα = /proionta/<κατηγορία>[/<υποκατηγορία>]/<slug>
    host: "vichy.gr",
    only: /^https:\/\/www\.vichy\.gr\/proionta\/[a-z0-9-]+(?:\/[a-z0-9-]+){1,3}\/?$/i,
    skip: /\/(arthra|olistiki-ygeia|farmakeia|accounts|search|sitecore|api|diagonismos)(\/|$)/i,
    prefer: /\/proionta\//i,
    toLocalUrl: u => u,
    delay: 1500,
    isProduct: html => isVichyProductPage(html),
    extractor: async (html, url) => extractVichyDetails(html, url)
  },
  klorane: {
    host: "klorane.com",
    only: /\/gr-el\/product\.xml$|\/gr-el\/p\//i,
    skip: /\/(blog|news|article|articles|about|contact|stores|store-locator|legal|privacy|cookies|terms|tag|tags|search|cart|account|faq|routine|routines|conseils|advice|sitemap|media|files)(\/|$)/i,
    prefer: /\/gr-el\/p\//i,
    toLocalUrl: u => u,
    delay: 5000,            // robots.txt: Crawl-delay: 5
    extractor: async (html, url) => extractPierreFabreDetails(html, url)
  }
};
const cfg = BRANDS[BRAND];
if (!cfg) { console.error(`Άγνωστο brand "${BRAND}". Διαθέσιμα: ${Object.keys(BRANDS).join(", ")}`); process.exit(1); }
const OUT_FILE = path.join(ROOT, `js/${BRAND}-site.json`);
if (!DELAY_MS) DELAY_MS = cfg.delay || 400;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "el-GR,el;q=0.9,en;q=0.5" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractMeta(html) {
  const og = (...names) => {
    for (const n of names) {
      let m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']*)["']`, "i"))
             || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${n}["']`, "i"));
      if (m) return decodeHtml(m[1]);
    }
    return null;
  };
  return { title: og("og:title", "twitter:title"), description: og("og:description", "description", "twitter:description"), image: og("og:image", "twitter:image"), type: og("og:type") };
}

function jsonLdNodes(html) {
  const out = [];
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let json; try { json = JSON.parse(b[1].trim()); } catch { continue; }
    const stack = Array.isArray(json) ? [...json] : [json];
    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== "object") continue;
      out.push(node);
      if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
      if (Array.isArray(node.itemListElement)) stack.push(...node.itemListElement.map(x => x.item || x));
      if (node.mainEntity) stack.push(node.mainEntity);
    }
  }
  return out;
}
const typesOf = n => [].concat(n["@type"] || []).map(String);

function extractProductLd(html) {
  for (const n of jsonLdNodes(html)) {
    if (!typesOf(n).some(t => /Product/i.test(t))) continue;
    let img = n.image; if (Array.isArray(img)) img = img[0]; if (img && typeof img === "object") img = img.url || img.contentUrl;
    const images = [].concat(n.image || []).map(x => typeof x === "string" ? x : (x && (x.url || x.contentUrl))).filter(Boolean);
    const offers = [].concat(n.offers || []);
    return {
      name: n.name || null, description: typeof n.description === "string" ? n.description : null,
      image: typeof img === "string" ? img : null, images,
      sku: n.sku || n.mpn || (offers[0] && offers[0].sku) || null,
      gtin: n.gtin13 || n.gtin || n.gtin12 || n.gtin14 || n.gtin8 || (offers[0] && (offers[0].gtin13 || offers[0].gtin)) || null,
      brand: n.brand && (n.brand.name || n.brand) || null, category: n.category || null
    };
  }
  return null;
}

function extractBreadcrumbs(html) {
  for (const n of jsonLdNodes(html)) {
    if (!typesOf(n).includes("BreadcrumbList")) continue;
    const items = (n.itemListElement || []).map(x => (x.name || (x.item && x.item.name) || "")).filter(Boolean);
    if (items.length) return items;
  }
  const m = html.match(/<(?:nav|ol|ul|div)[^>]+(?:class|id)=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/(?:nav|ol|ul|div)>/i);
  if (m) return htmlToText(m[1]).split("\n").map(s => s.replace(/^[›>\/»·\-\s]+|[›>\/»·\-\s]+$/g, "").trim()).filter(Boolean);
  return [];
}

function isProductPage(html, meta, ld) {
  if (cfg.isProduct) return cfg.isProduct(html);
  if (ld) return true;
  if (meta.type && /product/i.test(meta.type)) return true;
  if (/itemtype=["']https?:\/\/schema\.org\/Product["']/i.test(html)) return true;
  return false;
}

// Γενικές καρτέλες: κάθε <h2>/<h3> μέσα στο <main>/<article> με το κείμενο μέχρι την επόμενη επικεφαλίδα.
function genericSections(html) {
  const mainM = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const main = (mainM ? mainM[1] : html).replace(/<(script|style|nav|footer|header)\b[\s\S]*?<\/\1>/gi, "");
  const parts = main.split(/(?=<h[23]\b)/i);
  const tabs = {};
  for (const part of parts) {
    const h = part.match(/^<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/i);
    if (!h) continue;
    const title = htmlToText(h[1]).replace(/\s+/g, " ").trim();
    const body = htmlToText(part.slice(h[0].length)).trim();
    if (title && body.length >= 20 && body.length <= 4000 && !tabs[title]) tabs[title] = body;
  }
  return tabs;
}

function genericLongDescription(html, ld) {
  const cands = [];
  for (const re of [
    /<[^>]+itemprop=["']description["'][^>]*>([\s\S]*?)<\/(?:div|section|p)>/i,
    /<(?:div|section)[^>]+class=["'][^"']*(?:product[-_ ]?description|field--name-body|description|product-text|desc)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i
  ]) { const m = html.match(re); if (m) cands.push(htmlToText(m[1])); }
  if (ld && ld.description) cands.push(htmlToText(ld.description));
  const valid = cands.filter(t => t && t.length >= 120).sort((a, b) => b.length - a.length);
  return valid[0] || null;
}

function sectionFromUrl(url) {
  try { const segs = new URL(url).pathname.split("/").filter(Boolean); return segs.length > 1 ? segs[segs.length - 2] : (segs[0] || "diafora"); } catch { return "diafora"; }
}

async function getSitemapUrls() {
  const urls = new Set(), seen = new Set(), sitemaps = new Set();
  for (const root of [`https://www.${cfg.host}`, `https://${cfg.host}`]) {
    try { const t = await fetchText(root + "/robots.txt"); for (const m of t.matchAll(/Sitemap:\s*(\S+)/gi)) sitemaps.add(m[1].trim()); } catch {}
    for (const p of ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/product-sitemap.xml", "/el/sitemap.xml"]) sitemaps.add(root + p);
  }
  async function walk(u, depth = 0) {
    if (depth > 4 || seen.has(u)) return; seen.add(u);
    dbg(`sitemap GET ${u}`);
    let t; try { t = await fetchText(u); } catch (e) { dbg(`  ${e.message}`); return; }
    const locs = [...t.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => decodeHtml(m[1]));
    if (/<sitemapindex/i.test(t)) { for (const c of locs) { if (cfg.only && !cfg.only.test(c)) continue; await walk(c, depth + 1); await sleep(150); } }
    else for (const l of locs) urls.add(l);
  }
  for (const s of sitemaps) { await walk(s); if (urls.size > 3000) break; }
  return [...urls];
}

async function scrapeProduct(url) {
  const html = await fetchText(url);
  const meta = extractMeta(html);
  const ld = extractProductLd(html);
  if (!isProductPage(html, meta, ld)) return null;
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  const breadcrumbs = extractBreadcrumbs(html);
  const details = cfg.extractor ? await cfg.extractor(html, url) : {
    title: h1 ? htmlToText(h1).replace(/\s+/g, " ").trim() : null,
    breadcrumbs, category: breadcrumbs.slice(1, -1).join(" › ") || null,
    images: [...new Set([...(ld ? ld.images : []), meta.image].filter(Boolean))],
    tabs: genericSections(html),
    ldCategory: ld && ld.category || null
  };
  const name = (ld && ld.name) || (details.title) || meta.title || "";
  return {
    url, section: sectionFromUrl(url),
    name: decodeHtml(String(name)).replace(/\s+/g, " ").trim(),
    description: htmlToText((ld && ld.description) || meta.description || "").replace(/\s+/g, " ").trim().slice(0, 700),
    longDescription: details.description || genericLongDescription(html, ld),
    subtitle: details.subtitle || null,
    details,
    image: details.imageLarge || (ld && ld.image) || meta.image || null,
    sku: ld && ld.sku || null, gtin: (details.gtin || (ld && ld.gtin) || (url.match(/-(\d{13})-[a-z0-9]+\/?$/i) || [])[1] || null) && String(details.gtin || (ld && ld.gtin) || url.match(/-(\d{13})-[a-z0-9]+\/?$/i)[1])
  };
}

async function inspect(url) {
  console.log(`GET ${url}\n`);
  const html = await fetchText(url);
  const meta = extractMeta(html), ld = extractProductLd(html);
  console.log(`HTML ${(html.length / 1024).toFixed(0)}kb · og:type=${meta.type} · JSON-LD Product=${ld ? "yes" : "no"} · isProductPage=${isProductPage(html, meta, ld)}\n`);
  console.log("JSON-LD Product:", JSON.stringify(ld, null, 1).slice(0, 1500));
  console.log("\nBreadcrumbs:", extractBreadcrumbs(html));
  console.log("\nGeneric sections:", JSON.stringify(genericSections(html), null, 1).slice(0, 2500));
  const ld2 = genericLongDescription(html, ld); console.log("\nGeneric long description:", ld2 ? ld2.slice(0, 500) : "(none)");
  const classes = new Set(); for (const m of html.matchAll(/\bclass=["']([^"']+)["']/g)) for (const c of m[1].split(/\s+/)) if (/product|desc|tab|accord|ingredient|usage|benefit|claim|field--|spec|attribute|gallery|zoom|price|sku|ref/i.test(c)) classes.add(c);
  console.log(`\nSuspect classes (${classes.size}):`, [...classes].slice(0, 60).join("  "));
  if (DUMP) {
    const safe = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+=("[^"]*"|'[^']*')/gi, "")
      .replace(/([?&](?:key|token|api_key|apikey|access_token|secret|nonce)=)[^&"'\s]+/gi, "$1REDACTED");
    await fs.mkdir(path.dirname(path.resolve(ROOT, DUMP)), { recursive: true });
    await fs.writeFile(path.resolve(ROOT, DUMP), safe, "utf8");
    console.log(`\nSanitized HTML → ${DUMP} (${(safe.length / 1024).toFixed(0)}kb) — ασφαλές για commit.`);
  }
}

async function main() {
  if (INSPECT) { await inspect(INSPECT); return; }
  let urls;
  if (URLS_FILE) urls = (await fs.readFile(URLS_FILE, "utf8")).split(/\r?\n/).map(s => s.trim()).filter(s => /^https?:/.test(s));
  else {
    console.log(`${BRAND}: sitemap discovery στο ${cfg.host}…`);
    const all = await getSitemapUrls();
    urls = all.filter(u => u.includes(cfg.host) && (!cfg.only || cfg.only.test(u)) && !cfg.skip.test(u) && !/\.(xml|jpg|jpeg|png|webp|pdf|svg)(\?|$)/i.test(u));
    urls = [...new Set(urls.map(cfg.toLocalUrl))].sort((a, b) => (cfg.prefer.test(b) ? 1 : 0) - (cfg.prefer.test(a) ? 1 : 0));
    console.log(`Sitemap: ${all.length} URLs → ${urls.length} υποψήφιες σελίδες (κρατούνται μόνο όσες είναι σελίδες προϊόντος).\n`);
  }
  const out = [];
  let notProduct = 0, err = 0;
  const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      const p = await scrapeProduct(url);
      if (!p) { notProduct++; dbg(`skip (όχι προϊόν) ${url}`); }
      else {
        out.push(p);
        const tabs = Object.keys(p.details.tabs || {}).length;
        console.log(`[${i + 1}/${cap}] ${(p.gtin ? "gtin+" : "gtin-")} ${(p.longDescription ? "desc" + p.longDescription.length : "desc-").padEnd(8)} tabs${tabs} ${(p.image ? "img+" : "img-")}  ${p.name.slice(0, 55)}`);
      }
    } catch (e) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${e.message}`); }
    if (out.length % 10 === 0) await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  const sections = {}; for (const p of out) sections[p.section] = (sections[p.section] || 0) + 1;
  console.log(`\nSections:`); for (const [s, n] of Object.entries(sections).sort((a, b) => b[1] - a[1])) console.log(`  ${s.padEnd(40)} ${n}`);
  console.log(`\nDone. products=${out.length}  not-product=${notProduct}  errors=${err}.  Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
  console.log(`Επόμενο: node scripts/match-${BRAND}.mjs`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
