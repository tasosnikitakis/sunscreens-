#!/usr/bin/env node
// scripts/fetch-descriptions.mjs
// Φέρνει το επίσημο όνομα και περιγραφή για κάθε καλλυντικό από:
//   1) τις επίσημες σελίδες του κατασκευαστή (vichy.gr, laroche-posay.gr, cerave.gr)
//   2) τα ελληνικά φαρμακεία (vita4you, pharm24, kosmas, fr.gr, blinkshop κλπ.)
//
// Αποθηκεύει στο js/cosmetics-enrichment.js (window.COSMETICS_ENRICHMENT)
// και το site το προτιμά πάνω από τα supplier SKU descriptions.
//
// Χρήση:
//   node scripts/fetch-descriptions.mjs                      # όλα όσα λείπουν
//   node scripts/fetch-descriptions.mjs --limit=10           # δοκιμή
//   node scripts/fetch-descriptions.mjs --test=<barcode>     # ένα προϊόν με log
//   node scripts/fetch-descriptions.mjs --debug              # αναλυτικό log
//   node scripts/fetch-descriptions.mjs --force              # ξαναπροσπάθεια όλων
//
// Απαιτεί Node 18+ (built-in fetch).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/cosmetics-enrichment.js");
const COSMETICS_FILE = path.join(ROOT, "js/cosmetics-data.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : def; };
const flag = (k) => args.includes(`--${k}`);

const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const TEST = opt("test", null);
const FORCE = flag("force");
const DEBUG = flag("debug");
const SAVE_HTML = flag("save-html");
const DEBUG_DIR = path.join(ROOT, "images", "_debug_descriptions");
const DELAY_MS = parseInt(opt("delay", "1100"));

const BRAND_SITES = {
  vichy: ["vichy.gr", "vichy.com"],
  laroche: ["laroche-posay.gr", "laroche-posay.com"],
  cerave: ["cerave.gr", "cerave.com"]
};

const UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
];
const pickUA = () => UAS[Math.floor(Math.random() * UAS.length)];

function browserHeaders(extra = {}) {
  return {
    "User-Agent": pickUA(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    ...extra
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

async function saveHtml(url, text, barcode) {
  try {
    await fs.mkdir(DEBUG_DIR, { recursive: true });
    const safe = url.replace(/^https?:\/\//, "").replace(/[^a-z0-9.-]/gi, "_").slice(0, 100);
    const file = path.join(DEBUG_DIR, `${barcode}_${safe}.html`);
    await fs.writeFile(file, text, "utf8");
    dbg(`  saved html: ${file}`);
  } catch {}
}

async function fetchHtml(url, extra = {}) {
  const res = await fetch(url, { headers: browserHeaders(extra), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { status: res.status, text: await res.text(), finalUrl: res.url || url };
}

function decodeHtml(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

// Πρέπει να είμαστε προσεκτικοί: πολλά κανονικά product pages αναφέρουν
// "captcha" (reCAPTCHA σε φόρμες) ή "access denied" (νομικά κείμενα) χωρίς
// να είναι bot-walls. Ψάχνουμε ΜΟΝΟ ξεκάθαρα σήματα Cloudflare / challenge.
function looksBlocked(html) {
  const t = html.toLowerCase();
  if (t.includes("cf-browser-verification") || t.includes("cf_chl_opt")) return true;
  if (t.includes("checking your browser before accessing")) return true;
  if (t.includes("attention required") && t.includes("cloudflare")) return true;
  if (t.includes("just a moment") && t.includes("cloudflare")) return true;
  if (t.includes("are you a robot")) return true;
  // Short page (<5KB) με αναφορά σε CAPTCHA = πιθανότατα wall
  if (html.length < 5000 && /\brecaptcha\b|\bg-recaptcha\b/.test(t)) return true;
  // Title-bar λέει "access denied" / "blocked" / "403"
  const titleMatch = t.match(/<title>([^<]*)<\/title>/);
  if (titleMatch && /\b(access denied|blocked|forbidden|403)\b/i.test(titleMatch[1])) return true;
  return false;
}

// ----- Cosmetic name expansion (same as fetch-images.mjs) -----
function expandCosmeticName(p) {
  const base = (p.rawName || p.name || "").toString();
  let s = " " + base + " ";
  const abbr = [
    [/\bPT\b/gi, "Purete Thermale"], [/\bM\.?89\b/gi, "Mineral 89"],
    [/\bMIN\.?\s?89\b/gi, "Mineral 89"], [/\bLFT\b/gi, "Liftactiv"],
    [/\bLIFT\b(?!ACT)/gi, "Liftactiv"], [/\bNEO\b/gi, "Neovadiol"],
    [/\bDB\b/gi, "Dermablend"], [/\bDEM\b/gi, "Dermablend"],
    [/\bEFF\b/gi, "Effaclar"], [/\bTOL\b/gi, "Toleriane"],
    [/\bCICA\b/gi, "Cicaplast"], [/\bLIP\b/gi, "Lipikar"],
    [/\bHOM\b/gi, "Homme"], [/\bWAT\b/gi, "Water"], [/\bMIC\b/gi, "Micellar"],
    [/\bSENS\b/gi, "Sensitive"], [/\bCRM?\b/gi, "Cream"], [/\bLOT\b/gi, "Lotion"],
    [/\bSPR\b/gi, "Spray"], [/\bSH\b/gi, "Shampoo"], [/\bM-?UP\b/gi, "Make-up"],
    [/\bREM\b/gi, "Remover"], [/\bSOOT\b/gi, "Soothing"],
    [/\bPERFEC\b/gi, "Perfecting"], [/\bMOUS\b/gi, "Mousse"],
    [/\bINV\b/gi, "Invisible"], [/\bHYDRA\b/gi, "Hydra"],
    [/\bMAT\b(?!CH)/gi, "Mat"], [/\bDEO\b/gi, "Deodorant"]
  ];
  for (const [re, rep] of abbr) s = s.replace(re, rep);
  s = s.replace(/\b[FJTBSP](\d+(?:\.\d+)?)\s*(ml|gr|kg|g)\b/gi, "$1$2");
  s = s.replace(/\b(?:GR|EN|FR|ES|PT|RU|EL|PL|DE|IT|NL|DU|DA|SCAN|GB|CH|CZ|HU|SK|RO|HR|BG|TR)\b/gi, "");
  return s.replace(/\s+/g, " ").trim();
}
function searchQueryFor(p) {
  const expanded = expandCosmeticName(p);
  const reEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineRe = p.line ? new RegExp(`\\b${reEscape(p.line)}\\b`, "i") : null;
  const linePart = (p.line && !lineRe.test(expanded)) ? p.line + " " : "";
  return (linePart + expanded).replace(/\s+/g, " ").trim();
}

// ----- og:* extraction -----
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

function cleanupTitle(title, brandName) {
  if (!title) return null;
  let t = title.trim();
  // Strip " | Vichy", " - La Roche-Posay", "| CeraVe Greece" etc.
  t = t.replace(/\s*[|–\-—]\s*(Vichy|La Roche[- ]?Posay|CeraVe)(\s+(Hellas|Greece|GR|Ελλάδα))?\s*$/i, "");
  t = t.replace(/\s*[|]\s*Official\s+(Site|Online\s+Shop)\s*$/i, "");
  t = t.replace(/\s+/g, " ").trim();
  return t || null;
}

function cleanupDescription(desc) {
  if (!desc) return null;
  let d = desc.replace(/\s+/g, " ").trim();
  // Cut at first sentence boundary if extremely long
  if (d.length > 500) d = d.slice(0, 497).replace(/\s+\S*$/, "") + "...";
  return d || null;
}

function isProductPage(url, html) {
  const u = url.toLowerCase();
  // Δυνατό σήμα: og:type=product
  if (/<meta[^>]+property=["']og:type["'][^>]+content=["']product/i.test(html)) return true;

  const path = u.replace(/^https?:\/\/[^\/]+/, "").replace(/[?#].*$/, "");
  // Παραλείπουμε homepage / language root (π.χ. "/", "/gr", "/en/")
  if (path === "" || path === "/" || /^\/[a-z]{2}\/?$/.test(path)) return false;
  // Σαφώς non-product πεδία
  if (/\/(category|categories|search|brand|brands|about|contact|faq|help|news|blog)\//.test(u)) return false;
  // Σαφώς product πεδία (συμπεριλαμβανομένου του /proionta/ του vichy.gr/lrp.gr)
  if (/\/(product|p|products|item|skin-care|sun-care|body|face|hair|proionta|προϊοντα)\//.test(u)) return true;
  // Μεγάλο slug στο τέλος → πιθανότατα product
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  if (last.length > 15 && last.includes("-")) return true;
  return true;
}

// ----- Sources -----

async function ddgSearch(query, barcode = "ddg") {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  dbg(`ddg GET ${url}`);
  const { text } = await fetchHtml(url);
  if (SAVE_HTML) await saveHtml(url, text, barcode);
  const links = [];
  for (const m of text.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g)) {
    let u = decodeHtml(m[1]);
    if (u.startsWith("//")) u = "https:" + u;
    const redir = u.match(/uddg=([^&]+)/);
    if (redir) { try { u = decodeURIComponent(redir[1]); } catch {} }
    links.push(u);
  }
  dbg(`ddg => ${links.length} links`);
  return links;
}

// Bing web search — fallback όταν το DDG μας rate-limit-άρει ή επιστρέφει
// άδειες απαντήσεις. Διαφορετική IP-based throttling, οπότε συνήθως έχει
// διαθεσιμότητα όταν το DDG δεν έχει.
async function bingSearch(query, barcode = "bing") {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&FORM=QBLH`;
  dbg(`bing GET ${url}`);
  let text;
  try {
    const r = await fetchHtml(url);
    text = r.text;
  } catch (e) { dbg(`bing ${e.message}`); return []; }
  if (SAVE_HTML) await saveHtml(url, text, barcode);
  const links = [];
  // Bing's organic result links sit inside <h2><a href="...">
  for (const m of text.matchAll(/<h2><a[^>]+href="(https?:\/\/[^"]+)"/g)) {
    const u = decodeHtml(m[1]);
    // Skip Bing's own tracking URLs (bing.com/aclick, bing.com/ck/a)
    if (/(?:bing\.com\/(?:aclick|ck\/a))/.test(u)) continue;
    links.push(u);
  }
  dbg(`bing => ${links.length} links`);
  return links;
}

// Συνδυασμένη αναζήτηση: πρώτα DDG, μετά Bing fallback.
async function searchLinks(query, barcode) {
  let links = [];
  try { links = await ddgSearch(query, barcode); } catch (e) { dbg(`ddg ERR: ${e.message}`); }
  if (links.length === 0) {
    await sleep(300);
    try { links = await bingSearch(query, barcode); } catch (e) { dbg(`bing ERR: ${e.message}`); }
  }
  return links;
}

// Bing Image Search: για κάθε image result κρατάει και `purl` (page URL όπου
// φιλοξενείται η εικόνα). Σύμφωνα με τα live tests του fetch-images.mjs,
// ένα ζωντανό κανάλι όταν DDG μας rate-limit-άρει και το site:vichy.gr query
// σε Bing web πέφτει σε cookie wall.
// Αυστηρός έλεγχος hostname για να μη γίνεται δεκτό vichy.com.vn ή
// vichy-deutschland.de επειδή τυχαίνει να περιέχουν "vichy.com"/"vichy.gr".
function hostMatches(url, sites) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return sites.includes(host);
  } catch { return false; }
}

async function bingImagesBrandPages(p, sites) {
  const expanded = expandCosmeticName(p);
  const reEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineRe = p.line ? new RegExp(`\\b${reEscape(p.line)}\\b`, "i") : null;
  const withLine = (p.line && !lineRe.test(expanded)) ? `${p.line} ${expanded}` : expanded;

  // Δοκιμάζουμε δύο queries για να αυξήσουμε τις πιθανότητες να εμφανιστούν
  // .gr και .com URLs στα image results.
  const queries = [
    `${withLine} ${p.barcode || ""}`.trim(),
    `${sites[0]} ${withLine}`              // bias toward primary host (vichy.gr)
  ];

  const collected = new Map(); // url -> first-seen index (για ranking)
  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`;
    dbg(`bing-img GET ${url}`);
    let html;
    try {
      const r = await fetchHtml(url);
      html = r.text;
      dbg(`bing-img => ${html.length}b`);
    } catch (e) { dbg(`bing-img ${e.message}`); continue; }
    if (SAVE_HTML) await saveHtml(url, html, p.barcode);

    const patterns = [
      /&quot;purl&quot;:&quot;([^&]+)&quot;/g,
      /"purl":"([^"]+)"/g,
      /purl=([^&"'<>]+)/g
    ];
    let found = 0, kept = 0;
    for (const re of patterns) {
      for (const m of html.matchAll(re)) {
        let u;
        try { u = decodeHtml(m[1]).replace(/\\\//g, "/"); }
        catch { continue; }
        if (re.source.includes("purl=")) { try { u = decodeURIComponent(u); } catch {} }
        if (!/^https?:\/\//.test(u)) continue;
        found++;
        if (!hostMatches(u, sites)) continue;
        if (!collected.has(u)) collected.set(u, qi);
        kept++;
      }
    }
    dbg(`bing-img query ${qi+1}/${queries.length} => ${found} total purls, ${kept} brand-strict`);
    if (qi < queries.length - 1) await sleep(700);
  }

  // Order: prefer .gr over .com, then by first-seen query index
  const urls = [...collected.entries()].sort((a, b) => {
    const ag = a[0].includes(".gr") ? 0 : 1;
    const bg = b[0].includes(".gr") ? 0 : 1;
    if (ag !== bg) return ag - bg;
    return a[1] - b[1];
  }).map(([u]) => u);
  dbg(`bing-img => ${urls.length} brand-domain page URLs (strict host match)`);
  return urls;
}

async function brandDirectSource(p) {
  const sites = BRAND_SITES[p.brand];
  if (!sites) return null;

  const pages = await bingImagesBrandPages(p, sites);
  if (pages.length === 0) return null;

  const seenUrls = new Set();
  for (const url of pages.slice(0, 6)) {
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    dbg(`brand try ${url}`);
    try {
      const { text } = await fetchHtml(url, { Referer: "https://www.bing.com/" });
      if (SAVE_HTML) await saveHtml(url, text, p.barcode);
      if (looksBlocked(text)) { dbg(`  blocked (HTML ${text.length}b)`); continue; }
      if (!isProductPage(url, text)) { dbg("  not a product page"); continue; }
      const meta = extractMeta(text);
      const brandName = ({ vichy: "Vichy", laroche: "La Roche-Posay", cerave: "CeraVe" })[p.brand];
      const title = cleanupTitle(meta.title, brandName);
      const description = cleanupDescription(meta.description);
      dbg(`  meta: title=${title ? title.slice(0, 60) : "—"} | desc=${description ? description.slice(0, 60) : "—"}`);
      if (title || description) {
        return { name: title, description, source: url.replace(/^https?:\/\//, "").split("/")[0], url };
      }
    } catch (e) { dbg(`  ${e.message}`); }
    await sleep(400);
  }
  return null;
}

// ===== Sitemap source =====
// Search engines δεν φέρνουν αξιόπιστα vichy.gr / laroche-posay.gr /
// cerave.gr URLs (Bing image purls = 0 hits, DDG rate-limit, Bing site:
// = cookie wall). Αντί γι' αυτά, κατεβάζουμε μία φορά το sitemap κάθε
// brand site, κρατάμε όλες τις διευθύνσεις προϊόντων, και κάνουμε
// fuzzy match του ονόματος προϊόντος σε σχέση με το slug της κάθε URL.
// Έτσι, οι περιγραφές που παίρνουμε είναι **ντόπιες ελληνικές** από
// το vichy.gr / laroche-posay.gr.

const sitemapCache = new Map();

function isLikelyProductUrl(url) {
  const lower = url.toLowerCase();
  if (/sitemap|robots|\.xml(\?|$)/.test(lower)) return false;
  if (/\/(category|categories|search|account|cart|checkout|help|contact|about|stores|brands|home|store-locator|customer-service|find-a-store|register|login|press|privacy|cookie|terms|legal)(\/|$)/.test(lower)) return false;
  // Επιθυμητά path patterns (vichy.gr & laroche-posay.gr Salesforce Commerce,
  // και cerave.gr / international /products/)
  if (/\/(proionta|products|product|collections\/[^\/]+\/products|skin-care|sun-care|peripoihsh|προϊοντα|peripoiisi)\//.test(lower)) return true;
  // Permissive: μεγάλο last segment με dashes (συνήθως product slug)
  const path = lower.replace(/^https?:\/\/[^\/]+/, "").replace(/[?#].*$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1];
  if (last.length > 20 && last.includes("-")) return true;
  return false;
}

async function getSitemapProductUrls(host) {
  if (sitemapCache.has(host)) return sitemapCache.get(host);
  const urls = new Set();
  const seen = new Set();

  // 1. robots.txt για να βρούμε το sitemap location
  const sitemapUrls = new Set();
  try {
    const { text } = await fetchHtml(`https://www.${host}/robots.txt`);
    for (const m of text.matchAll(/Sitemap:\s*(\S+)/gi)) sitemapUrls.add(m[1].trim());
  } catch {}
  // 2. Fallback σε standard sitemap paths
  if (sitemapUrls.size === 0) {
    sitemapUrls.add(`https://www.${host}/sitemap.xml`);
    sitemapUrls.add(`https://www.${host}/sitemap_index.xml`);
  }

  async function processSitemap(smUrl, depth = 0) {
    if (depth > 3 || seen.has(smUrl)) return;
    seen.add(smUrl);
    dbg(`sitemap GET ${smUrl}`);
    let text;
    try {
      const r = await fetchHtml(smUrl);
      text = r.text;
    } catch (e) { dbg(`  ${e.message}`); return; }
    const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
    const isIndex = /<sitemapindex/i.test(text);
    dbg(`  ${isIndex ? "index" : "sitemap"} with ${locs.length} entries`);
    if (isIndex) {
      // Process child sitemaps. Limit to those likely to contain products.
      const childrenToProcess = locs.filter(u => /product|catalog|skin|sun|care/i.test(u));
      const finalChildren = childrenToProcess.length > 0 ? childrenToProcess : locs.slice(0, 10);
      for (const child of finalChildren) {
        await processSitemap(child, depth + 1);
        await sleep(150);
      }
    } else {
      for (const u of locs) urls.add(u);
    }
  }

  for (const smUrl of sitemapUrls) {
    try { await processSitemap(smUrl); } catch (e) { dbg(`  ${e.message}`); }
  }

  const filtered = [...urls].filter(isLikelyProductUrl);
  sitemapCache.set(host, filtered);
  console.log(`sitemap ${host}: ${urls.size} total URLs, ${filtered.length} likely product URLs`);
  return filtered;
}

function bestSitemapMatch(p, urls) {
  // Build keyword list from expanded English/Latin product name
  const expanded = expandCosmeticName(p).toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const keywords = [...new Set(expanded.split(/\s+/).filter(w => w.length >= 3))];
  // Volume-only tokens like "200ml" carry information too
  const linePart = (p.line || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length >= 3);
  const allKeywords = [...new Set([...keywords, ...linePart])];

  let best = null, bestScore = 0, bestMeta = null;
  for (const url of urls) {
    const lower = url.toLowerCase();
    const path = lower.replace(/^https?:\/\/[^\/]+/, "").replace(/[?#].*$/, "");
    const slug = path.split("/").filter(Boolean).pop() || "";
    const slugWords = new Set(slug.replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean));
    const pathWords = new Set(path.replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean));

    let score = 0;
    for (const kw of allKeywords) {
      if (slugWords.has(kw)) score += 2;          // πιο βαρύ αν στο slug
      else if (pathWords.has(kw)) score += 0.5;   // πιο ελαφρύ αν στο path
    }
    if (score > bestScore) { bestScore = score; best = url; bestMeta = { slug, matches: allKeywords.filter(kw => slugWords.has(kw) || pathWords.has(kw)) }; }
  }
  return { url: best, score: bestScore, ...bestMeta };
}

async function sitemapSource(p) {
  const sites = BRAND_SITES[p.brand];
  if (!sites) return null;

  for (const host of sites) {
    let urls;
    try { urls = await getSitemapProductUrls(host); }
    catch (e) { dbg(`sitemap ${host} ERR ${e.message}`); continue; }
    if (urls.length === 0) { dbg(`sitemap ${host}: no products`); continue; }

    const match = bestSitemapMatch(p, urls);
    // Threshold: τουλάχιστον 2 keyword matches (score ≥ 4) ώστε να αποφύγουμε
    // false positives. Για short slugs απαιτούμε λίγο περισσότερο.
    if (!match.url || match.score < 4) {
      dbg(`sitemap ${host}: best score ${match.score.toFixed(1)} (${match.slug || "—"}) — skip`);
      continue;
    }
    dbg(`sitemap ${host} match score=${match.score.toFixed(1)} kws=[${(match.matches || []).join(",")}]`);
    dbg(`  ${match.url}`);
    try {
      const { text } = await fetchHtml(match.url, { Referer: `https://www.${host}/` });
      if (SAVE_HTML) await saveHtml(match.url, text, p.barcode);
      if (looksBlocked(text)) { dbg(`  blocked (HTML ${text.length}b)`); continue; }
      const meta = extractMeta(text);
      const brandName = ({ vichy: "Vichy", laroche: "La Roche-Posay", cerave: "CeraVe" })[p.brand];
      const title = cleanupTitle(meta.title, brandName);
      const description = cleanupDescription(meta.description);
      dbg(`  meta: title=${title ? title.slice(0, 60) : "—"} | desc=${description ? description.slice(0, 60) : "—"}`);
      if (title || description) {
        return { name: title, description, source: host, url: match.url };
      }
    } catch (e) { dbg(`  ${e.message}`); }
  }
  return null;
}

// Αποκλειστικά επίσημες πηγές — σε σειρά προτεραιότητας:
//   1) sitemap (vichy.gr → ελληνικές περιγραφές)
//   2) brand-direct via Bing image purls (fallback)
const sources = [
  { name: "sitemap",      find: sitemapSource      },
  { name: "brand-direct", find: brandDirectSource  }
];

// ----- Main loop -----

async function loadProducts() {
  const ctx = {};
  vm.createContext(ctx);
  const code = await fs.readFile(COSMETICS_FILE, "utf8");
  vm.runInContext(code + "\nglobalThis.OUT=COSMETICS_PRODUCTS;", ctx);
  return ctx.OUT;
}

async function loadExisting() {
  try {
    const text = await fs.readFile(OUT_FILE, "utf8");
    const m = text.match(/window\.COSMETICS_ENRICHMENT\s*=\s*(\{[\s\S]*?\});\s*$/);
    if (m) return JSON.parse(m[1]);
  } catch {}
  return {};
}

async function saveEnrichment(enrichment) {
  const js = "// Auto-generated από το scripts/fetch-descriptions.mjs.\n"
           + "// Επίσημα ονόματα + περιγραφές καλλυντικών από vichy.gr / laroche-posay.gr /\n"
           + "// cerave.gr και ελληνικά φαρμακεία. Μην το επεξεργαστείτε χειροκίνητα —\n"
           + "// θα ξαναγραφτεί στην επόμενη εκτέλεση. Manual overrides: cosmetics-overrides.json\n"
           + "window.COSMETICS_ENRICHMENT = " + JSON.stringify(enrichment, null, 2) + ";\n";
  await fs.writeFile(OUT_FILE, js, "utf8");
}

async function processProduct(p, enrichment, idx, total) {
  const label = `[${idx}${total ? "/" + total : ""}] ${(p.barcode || "").padEnd(13)} ${p.name.slice(0, 50).padEnd(50)}`;
  if (DEBUG) console.log(`\n${label}`);
  for (const src of sources) {
    try {
      const result = await src.find(p);
      if (!result || (!result.name && !result.description)) continue;
      enrichment[p.barcode] = result;
      if (!DEBUG) console.log(`${label} OK  ${src.name.padEnd(13)} ${(result.source || "").padEnd(20)} ${result.name ? "n+" : "n-"} ${result.description ? "d+" : "d-"}`);
      else console.log(`   => OK via ${src.name}: ${result.source}`);
      return true;
    } catch (e) {
      dbg(`${src.name} ERR: ${e.message}`);
    }
    await sleep(200);
  }
  if (!DEBUG) console.log(`${label} MISS`);
  else console.log(`   => MISS`);
  return false;
}

async function main() {
  const products = await loadProducts();
  const enrichment = await loadExisting();
  console.log(`Loaded ${Object.keys(enrichment).length} existing enrichments`);

  if (TEST) {
    const p = products.find(x => x.barcode === TEST);
    if (!p) { console.error(`barcode ${TEST} not in catalog`); process.exit(1); }
    p.__cosmetic = true;
    await processProduct(p, enrichment, 1, 1);
    await saveEnrichment(enrichment);
    return;
  }

  let ok = 0, skip = 0, miss = 0, processed = 0;
  const pool = products.filter(p => p.barcode);
  for (const p of pool) {
    if (processed >= LIMIT) break;
    if (!FORCE && enrichment[p.barcode]) { skip++; continue; }
    processed++;
    p.__cosmetic = true;
    const total = Math.min(pool.length, LIMIT);
    const success = await processProduct(p, enrichment, processed, total);
    if (success) ok++; else miss++;
    if (success && processed % 5 === 0) await saveEnrichment(enrichment); // checkpoint
    await sleep(DELAY_MS + Math.random() * 500);
  }
  await saveEnrichment(enrichment);
  console.log(`\nDone. enriched=${ok}  already-had=${skip}  missed=${miss}`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
