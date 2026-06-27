#!/usr/bin/env node
// scripts/refine-by-barcode.mjs
// Διορθώνει εποχιακά enrichment για brands όπου το sitemap-fuzzy-match
// πέφτει σε λάθος προϊόν (π.χ. Compeed: slugs σε Dutch/French ή
// γενικό "Conceal & Go" για όλα).
//
// Στρατηγική σε δύο στάδια:
//   1) Παίρνουμε το barcode και κάνουμε αναζήτηση σε ελληνικά φαρμακεία
//      (DDG → Skroutz, vita4you, pharm24, kosmas, fr.gr, blinkshop κ.λπ.).
//      Από την πρώτη pharmacy σελίδα βγάζουμε το **canonical Greek name**
//      μέσω og:title.
//   2) Με αυτό το canonical name κάνουμε ξανά sitemap match στο επίσημο
//      site της εταιρίας (π.χ. compeed.gr) και πέφτουμε σε σωστή σελίδα
//      προϊόντος → og:description.
//
// Αν το βήμα 2 αποτύχει, κρατάμε το pharmacy name + description ως
// fallback (καλύτερο από το λάθος sitemap match).
//
// Χρήση:
//   node scripts/refine-by-barcode.mjs --brand=compeed         # μόνο Compeed
//   node scripts/refine-by-barcode.mjs --brand=compeed --debug
//   node scripts/refine-by-barcode.mjs --brand=compeed --barcode=3663555001457
//   node scripts/refine-by-barcode.mjs --brand=all --limit=20

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "js/seasonal-data.js");
const OUT_FILE = path.join(ROOT, "js/seasonal-enrichment.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : def; };
const flag = (k) => args.includes(`--${k}`);

const BRAND = opt("brand", "compeed");
const BARCODE = opt("barcode", null);
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DEBUG = flag("debug");
const DELAY_MS = parseInt(opt("delay", "1200"));

// Επίσημα brand sites — re-όρισμα εδώ για ανεξαρτησία του script
const BRAND_SITES = {
  compeed: ["compeed.gr"],
  autan: ["autan-international.com"],
  aboca: ["aboca.com"],
  esi: ["esi.it", "esi-italia.com"],
  realcare: ["realcare.gr"],
  galesyn: ["galesyn.gr"],
  pharmalead: ["pharmalead.gr"],
  travelfix: ["travel-fix.gr"]
};

// Ελληνικά φαρμακεία/marketplaces που δείχνουν canonical Greek name στο og:title
const PHARMACY_HOSTS = [
  "skroutz.gr", "bestprice.gr",
  "vita4you.gr", "pharm24.gr", "kosmas.gr", "fr.gr", "blinkshop.gr",
  "mypharmacy.gr", "bestpharmacy.gr", "pharmacy295.gr", "smilepharmacy.gr",
  "ofarmakopoiosmou.gr", "lifepharmacy.gr", "pharmaplaza.gr",
  "omorfia.gr", "doctorpharmacy.gr", "myomorfia.gr", "1010.gr",
  "galinos.gr", "happyflora.gr"
];

const UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
];
const pickUA = () => UAS[Math.floor(Math.random() * UAS.length)];

function browserHeaders(extra = {}) {
  return {
    "User-Agent": pickUA(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
    "Upgrade-Insecure-Requests": "1",
    ...extra
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

async function fetchHtml(url, extra = {}) {
  const res = await fetch(url, { headers: browserHeaders(extra), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { status: res.status, text: await res.text(), finalUrl: res.url || url };
}

function decodeHtml(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function extractMeta(html) {
  const og = (...names) => {
    for (const n of names) {
      let m = html.match(new RegExp(`<meta[^>]+property=["']${n}["'][^>]+content=["']([^"']+)["']`, "i"));
      if (m) return decodeHtml(m[1]);
      m = html.match(new RegExp(`<meta[^>]+name=["']${n}["'][^>]+content=["']([^"']+)["']`, "i"));
      if (m) return decodeHtml(m[1]);
    }
    return null;
  };
  const title = og("og:title", "twitter:title");
  const description = og("og:description", "description", "twitter:description");
  return { title, description };
}

function cleanupTitle(t) {
  if (!t) return null;
  let s = t.replace(/\s+/g, " ").trim();
  // Strip " | Skroutz", " - Vita4you" etc.
  s = s.replace(/\s*[\|–\-—]\s*(Skroutz\.gr|Skroutz|BestPrice\.gr|BestPrice|Vita4you|Pharm24|Kosmas\.gr|Kosmas|Fr\.gr|FR\.GR|Blinkshop|BlinkShop|Pharmacy295|BestPharmacy|MyPharmacy|Smile Pharmacy)\s*\.?$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s || null;
}

function cleanupDescription(d) {
  if (!d) return null;
  let s = d.replace(/\s+/g, " ").trim();
  if (s.length > 500) s = s.slice(0, 497).replace(/\s+\S*$/, "") + "...";
  return s || null;
}

// ----- Στάδιο 1: barcode → canonical Greek name από φαρμακείο -----

function hostFromUrl(u) {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

async function ddgSearchBarcode(barcode) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(barcode)}`;
  dbg(`ddg GET ${url}`);
  const { text } = await fetchHtml(url);
  const links = [];
  for (const m of text.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g)) {
    let u = decodeHtml(m[1]);
    if (u.startsWith("//")) u = "https:" + u;
    const redir = u.match(/uddg=([^&]+)/);
    if (redir) { try { u = decodeURIComponent(redir[1]); } catch {} }
    links.push(u);
  }
  return links;
}

async function bingSearchBarcode(barcode) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(barcode)}&FORM=QBLH`;
  dbg(`bing GET ${url}`);
  let text;
  try { const r = await fetchHtml(url); text = r.text; }
  catch (e) { dbg(`bing ${e.message}`); return []; }
  const links = [];
  for (const m of text.matchAll(/<h2><a[^>]+href="(https?:\/\/[^"]+)"/g)) {
    const u = decodeHtml(m[1]);
    if (/(?:bing\.com\/(?:aclick|ck\/a))/.test(u)) continue;
    links.push(u);
  }
  return links;
}

async function canonicalNameByBarcode(barcode) {
  let links = [];
  try { links = await ddgSearchBarcode(barcode); } catch (e) { dbg(`ddg ERR ${e.message}`); }
  if (links.length === 0) {
    await sleep(300);
    try { links = await bingSearchBarcode(barcode); } catch (e) { dbg(`bing ERR ${e.message}`); }
  }
  if (links.length === 0) return null;

  // Order: Skroutz > BestPrice > pharmacy hosts
  const score = (u) => {
    const h = hostFromUrl(u);
    if (h === "skroutz.gr") return 0;
    if (h === "bestprice.gr") return 1;
    if (PHARMACY_HOSTS.includes(h)) return 2;
    return 10;
  };
  links.sort((a, b) => score(a) - score(b));

  for (const u of links.slice(0, 5)) {
    const h = hostFromUrl(u);
    if (!PHARMACY_HOSTS.includes(h)) continue;
    dbg(`pharm try ${u}`);
    try {
      const { text } = await fetchHtml(u);
      const meta = extractMeta(text);
      const title = cleanupTitle(meta.title);
      const desc = cleanupDescription(meta.description);
      if (title) {
        dbg(`  pharm got: "${title.slice(0, 80)}"`);
        return { name: title, description: desc, source: h, url: u };
      }
    } catch (e) { dbg(`  ${e.message}`); }
    await sleep(300);
  }
  return null;
}

// ----- Στάδιο 2: canonical name → brand sitemap match -----

const sitemapCache = new Map();

function isLikelyProductUrl(url) {
  const lower = url.toLowerCase();
  if (/sitemap|robots|\.xml(\?|$)/.test(lower)) return false;
  if (/\/(category|categories|search|account|cart|checkout|help|contact|about|stores|brands|home|store-locator|customer-service|find-a-store|register|login|press|privacy|cookie|terms|legal)(\/|$)/.test(lower)) return false;
  if (/\/(proionta|products|product|peripoiisi|peripoihsh|skin-care|sun-care|προϊοντα)\//.test(lower)) return true;
  const path = lower.replace(/^https?:\/\/[^\/]+/, "").replace(/[?#].*$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 1) return false;
  const last = parts[parts.length - 1];
  if (last.length > 15 && last.includes("-")) return true;
  return false;
}

async function getSitemapProductUrls(host) {
  if (sitemapCache.has(host)) return sitemapCache.get(host);
  const urls = new Set();
  const seen = new Set();

  const sitemapUrls = new Set();
  for (const root of [`https://www.${host}`, `https://${host}`]) {
    for (const p of [
      "/sitemap_index.xml", "/sitemap-index.xml", "/sitemap.xml",
      "/sitemap-products.xml", "/gr/sitemap.xml", "/el/sitemap.xml", "/en_gr/sitemap.xml",
      "/robots.txt"
    ]) {
      if (p === "/robots.txt") {
        try {
          const { text } = await fetchHtml(root + p);
          for (const m of text.matchAll(/Sitemap:\s*(\S+)/gi)) sitemapUrls.add(m[1].trim());
        } catch {}
      } else {
        sitemapUrls.add(root + p);
      }
    }
  }

  async function processSitemap(smUrl, depth = 0) {
    if (depth > 3 || seen.has(smUrl)) return;
    seen.add(smUrl);
    dbg(`sitemap GET ${smUrl}`);
    let text;
    try { const r = await fetchHtml(smUrl); text = r.text; }
    catch (e) { dbg(`  ${e.message}`); return; }
    const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
    const isIndex = /<sitemapindex/i.test(text);
    if (isIndex) {
      const childrenToProcess = locs.filter(u => /product|catalog|skin|sun|care|proion|peripoi/i.test(u));
      const finalChildren = childrenToProcess.length > 0 ? childrenToProcess : locs.slice(0, 10);
      for (const child of finalChildren) {
        await processSitemap(child, depth + 1);
        await sleep(120);
      }
    } else {
      for (const u of locs) urls.add(u);
    }
  }

  for (const smUrl of sitemapUrls) {
    try { await processSitemap(smUrl); } catch {}
    if (urls.size > 100) break;
  }

  const filtered = [...urls].filter(isLikelyProductUrl);
  sitemapCache.set(host, filtered);
  console.log(`sitemap ${host}: ${urls.size} total, ${filtered.length} product URLs`);
  return filtered;
}

// Διεθνής (Greek+Latin+digits) token extraction που ΔΕΝ πετάει ελληνικά
function tokensFromName(s) {
  const lower = s.toLowerCase()
    .replace(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ\s]/gi, " ");
  return [...new Set(lower.split(/\s+/).filter(w => w.length >= 3))];
}

// Romanize Greek text — slugs στο compeed.gr είναι λατινικά, οπότε τα ταιριάζουμε
function romanize(s) {
  const map = {
    "α": "a", "ά": "a", "β": "v", "γ": "g", "δ": "d", "ε": "e", "έ": "e",
    "ζ": "z", "η": "i", "ή": "i", "θ": "th", "ι": "i", "ί": "i", "ϊ": "i",
    "ΐ": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o",
    "ό": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "i",
    "ύ": "i", "ϋ": "i", "ΰ": "i", "φ": "f", "χ": "ch", "ψ": "ps", "ω": "o", "ώ": "o"
  };
  return s.toLowerCase().split("").map(c => map[c] || c).join("");
}

function bestSitemapMatch(canonicalName, line, urls) {
  const greekTokens = tokensFromName(canonicalName + " " + (line || ""));
  const romanTokens = [...new Set(greekTokens.map(romanize).filter(w => w.length >= 3))];
  const allTokens = [...new Set([...greekTokens, ...romanTokens])];

  let best = null, bestScore = 0, bestMeta = null;
  for (const url of urls) {
    const lower = url.toLowerCase();
    const path = lower.replace(/^https?:\/\/[^\/]+/, "").replace(/[?#].*$/, "");
    const slug = path.split("/").filter(Boolean).pop() || "";
    const slugWords = new Set(slug.replace(/[^a-z0-9α-ω]+/gi, " ").split(/\s+/).filter(Boolean));
    const pathWords = new Set(path.replace(/[^a-z0-9α-ω]+/gi, " ").split(/\s+/).filter(Boolean));

    let score = 0;
    const matched = [];
    for (const kw of allTokens) {
      if (slugWords.has(kw)) { score += 2; matched.push(kw); }
      else if (pathWords.has(kw)) { score += 0.5; matched.push(kw); }
    }
    if (score > bestScore) { bestScore = score; best = url; bestMeta = { slug, matches: matched }; }
  }
  return { url: best, score: bestScore, ...bestMeta };
}

async function brandSitemapDescription(canonicalName, line, host) {
  let urls;
  try { urls = await getSitemapProductUrls(host); } catch { return null; }
  if (!urls.length) return null;

  const match = bestSitemapMatch(canonicalName, line, urls);
  if (!match.url || match.score < 4) {
    dbg(`sitemap ${host}: best score ${match.score.toFixed(1)} (${match.slug || "—"}) — skip`);
    return null;
  }
  dbg(`sitemap match score=${match.score.toFixed(1)} kws=[${(match.matches || []).join(",")}] ${match.url}`);
  try {
    const { text } = await fetchHtml(match.url, { Referer: `https://www.${host}/` });
    const meta = extractMeta(text);
    const title = cleanupTitle(meta.title);
    const description = cleanupDescription(meta.description);
    if (title || description) {
      return { name: title, description, source: host, url: match.url };
    }
  } catch (e) { dbg(`  ${e.message}`); }
  return null;
}

// ----- Main -----

async function loadProducts() {
  const ctx = {};
  vm.createContext(ctx);
  const code = await fs.readFile(DATA_FILE, "utf8");
  vm.runInContext(code + "\nglobalThis.OUT=SEASONAL_PRODUCTS;", ctx);
  return ctx.OUT;
}

async function loadExisting() {
  try {
    const text = await fs.readFile(OUT_FILE, "utf8");
    const m = text.match(/window\.SEASONAL_ENRICHMENT\s*=\s*(\{[\s\S]*?\});\s*$/);
    if (m) return JSON.parse(m[1]);
  } catch {}
  return {};
}

async function saveEnrichment(e) {
  const banner = "// Auto-generated από το scripts/fetch-descriptions.mjs (--catalog=seasonal).\n"
               + "// Επίσημα ονόματα + περιγραφές εποχιακών από τις σελίδες των κατασκευαστών.\n"
               + "// Διορθώσεις per-brand από scripts/refine-by-barcode.mjs.\n"
               + "// Μην το επεξεργαστείτε χειροκίνητα — θα ξαναγραφτεί στην επόμενη εκτέλεση.\n";
  await fs.writeFile(OUT_FILE,
    banner + "window.SEASONAL_ENRICHMENT = " + JSON.stringify(e, null, 2) + ";\n", "utf8");
}

async function processOne(p, enrichment) {
  const label = `${(p.barcode || "").padEnd(13)} ${p.name.slice(0, 55).padEnd(55)}`;
  if (DEBUG) console.log(`\n=== ${label} ===`);

  // Στάδιο 1
  const pharm = await canonicalNameByBarcode(p.barcode);
  if (!pharm) {
    console.log(`${label} no pharmacy hit`);
    return false;
  }
  const canonical = pharm.name;
  if (!DEBUG) console.log(`${label} canonical: "${canonical.slice(0, 60)}"`);

  // Στάδιο 2: πάμε στο επίσημο brand site
  const sites = BRAND_SITES[p.brand] || [];
  for (const host of sites) {
    const brandHit = await brandSitemapDescription(canonical, p.line, host);
    if (brandHit && (brandHit.name || brandHit.description)) {
      enrichment[p.barcode] = brandHit;
      console.log(`${label} OK ${host} ${brandHit.name ? "n+" : "n-"} ${brandHit.description ? "d+" : "d-"}`);
      return true;
    }
  }

  // Fallback: χρησιμοποιούμε τα pharmacy meta — καλύτερο από λάθος sitemap match
  enrichment[p.barcode] = {
    name: pharm.name,
    description: pharm.description,
    source: pharm.source,
    url: pharm.url
  };
  console.log(`${label} OK pharmacy ${pharm.source} ${pharm.name ? "n+" : "n-"} ${pharm.description ? "d+" : "d-"}`);
  return true;
}

async function main() {
  const all = await loadProducts();
  const enrichment = await loadExisting();

  let pool = all.filter(p => p.barcode);
  if (BRAND !== "all") pool = pool.filter(p => p.brand === BRAND);
  if (BARCODE) pool = pool.filter(p => p.barcode === BARCODE);

  if (pool.length === 0) {
    console.log(`No products matched brand=${BRAND}${BARCODE ? " barcode=" + BARCODE : ""}`);
    return;
  }
  console.log(`Refining ${pool.length} ${BRAND} product(s)…\n`);

  let ok = 0, fail = 0, n = 0;
  for (const p of pool) {
    if (n >= LIMIT) break;
    n++;
    try {
      const success = await processOne(p, enrichment);
      if (success) ok++; else fail++;
    } catch (e) {
      console.log(`${p.barcode} ERR ${e.message}`);
      fail++;
    }
    if (n % 5 === 0) await saveEnrichment(enrichment);
    await sleep(DELAY_MS + Math.random() * 400);
  }
  await saveEnrichment(enrichment);
  console.log(`\nDone. refined=${ok}  failed=${fail}  (total=${n})`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
