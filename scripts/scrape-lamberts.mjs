#!/usr/bin/env node
// scripts/scrape-lamberts.mjs
// Διατρέχει τον κατάλογο της lamberts.gr μέσω sitemap και για κάθε product
// URL μαζεύει: og:title, og:description, εικόνα (JSON-LD Product.image ή
// og:image), section (πρώτο path segment), και SKU αν είναι ορατό.
// Γράφει js/lamberts-site.json.
//
// Χρήση:
//   node scripts/scrape-lamberts.mjs
//   node scripts/scrape-lamberts.mjs --debug --limit=20

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/lamberts-site.json");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "300"));
const INSPECT = opt("inspect", null);
const GREP = opt("grep", null);

const HOST = "lamberts.gr";
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
  return {
    title: og("og:title", "twitter:title"),
    description: og("og:description", "description", "twitter:description"),
    image: og("og:image", "twitter:image")
  };
}

function extractJsonLd(html) {
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
      if (types.includes("Product")) {
        let img = node.image;
        if (Array.isArray(img)) img = img[0];
        if (img && typeof img === "object") img = img.url;
        return {
          name: node.name || null,
          description: node.description || null,
          image: typeof img === "string" ? img : null,
          sku: node.sku || node.mpn || null,
          gtin: node.gtin13 || node.gtin12 || node.gtin || null
        };
      }
      if (node["@graph"] && Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
    }
  }
  return null;
}

function extractSkuFromHtml(html) {
  const candidates = [];
  for (const m of html.matchAll(/"sku"\s*:\s*"([^"]+)"/gi)) candidates.push(m[1]);
  for (const m of html.matchAll(/class=["']sku["']\s*>\s*([^<\s]+)/gi)) candidates.push(m[1]);
  for (const m of html.matchAll(/(?:Κωδικ[όο]ς|SKU|Product\s+code)\s*[:：]\s*([A-Za-z0-9\-\.\/]{3,})/gi)) candidates.push(m[1]);
  return [...new Set(candidates.filter(x => x && x.length >= 3 && x.length <= 40))];
}

function isProductUrl(url) {
  const lower = url.toLowerCase();
  if (!lower.includes(HOST)) return false;
  if (/sitemap|robots|\.xml(\?|$)/.test(lower)) return false;
  if (/\/(category|categories|search|account|cart|checkout|help|contact|about|stores|brands|store-locator|wp-content|wp-json|feed|blog|arthra)(\/|$)/.test(lower)) return false;
  const p = lower.replace(/^https?:\/\/[^\/]+/, "").replace(/[?#].*$/, "");
  const parts = p.split("/").filter(Boolean);
  if (parts.length < 1) return false;
  const last = parts[parts.length - 1];
  if (last.length > 15 && last.includes("-")) return true;
  return false;
}

async function getSitemapProductUrls() {
  const urls = new Set();
  const seen = new Set();
  const sitemapUrls = new Set();

  for (const root of [`https://www.${HOST}`, `https://${HOST}`]) {
    try {
      const text = await fetchText(root + "/robots.txt");
      for (const m of text.matchAll(/Sitemap:\s*(\S+)/gi)) sitemapUrls.add(m[1].trim());
    } catch {}
    for (const p of ["/sitemap_index.xml", "/sitemap-index.xml", "/sitemap.xml", "/product-sitemap.xml", "/loop_product-sitemap.xml"]) {
      sitemapUrls.add(root + p);
    }
  }

  async function process(smUrl, depth = 0) {
    if (depth > 4 || seen.has(smUrl)) return;
    seen.add(smUrl);
    dbg(`sitemap GET ${smUrl}`);
    let text;
    try { text = await fetchText(smUrl); } catch (e) { dbg(`  ${e.message}`); return; }
    const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
    if (/<sitemapindex/i.test(text)) {
      const children = locs.filter(u => /product|proion|catalog/i.test(u));
      const finalChildren = children.length ? children : locs;
      for (const c of finalChildren) { await process(c, depth + 1); await sleep(120); }
    } else {
      for (const u of locs) urls.add(u);
    }
  }

  for (const smUrl of sitemapUrls) {
    try { await process(smUrl); } catch {}
    if (urls.size > 800) break;
  }

  return [...urls].filter(isProductUrl);
}

// Το lamberts.gr έχει flat URLs (/en/product-slug/) χωρίς category segment.
// Οπότε δεν μπορούμε να πάρουμε section από το URL — αντ' αυτού κάνουμε
// heuristic classification από το όνομα του προϊόντος.
const SECTION_RULES = [
  { section: "wmega",              re: /\b(omega|fish\s+oil|krill|cod\s+liver|dha|epa|flaxseed|linseed)\b/i },
  { section: "probiotika",         re: /\b(probio|acidophil|bifido|biome|prebio|lactobacill)\b/i },
  { section: "aminoxea",           re: /\b(carnitine|arginine|lysine|glutamine|taurine|tryptophan|htp|5-htp|creatine|bcaa|whey|methionine)\b/i },
  { section: "adynatisma",         re: /\b(cla|garcinia|chitosan|diet|weight|slim|water\s+shape)\b/i },
  { section: "gynaikeia-frontida", re: /\b(meno[- ]?pause|meno-|fertil|folic|pregnan|prenatal|feminex|cystoco)\b/i },
  { section: "andrikh-frontida",   re: /\b(prosta|men'?s|testo|male)\b/i },
  { section: "paidiki-frontida",   re: /\b(kids|children|gummies\s+for|junior|multi\s+guard\s+for\s+kids)\b/i },
  { section: "ugeia-osteon",       re: /\b(glucosamine|chondroit|joint|bone|arthri|msm|collagen|calcium|magnesium|osteo)\b/i },
  { section: "ugeia-kardias",      re: /\b(cardio|heart|coq10|coenzyme|red\s+yeast|policosanol|garlic|hawthorn)\b/i },
  { section: "amyna-organismou",   re: /\b(immune|elderberry|echinacea|zinc|vitamin\s+c\s+\d)\b/i },
  { section: "antigiransi",        re: /\b(retinol|resveratrol|hyalur|astaxanthin|beauty|radiance|skin|nails|hair)\b/i },
  { section: "energia",            re: /\b(energy|caffeine|guarana|ginseng|maca|rhodiola|siberian)\b/i },
  { section: "fisika-symplirwmata",re: /\b(ashwagand|curcumin|turmer|milk\s+thistle|ginkgo|ginger|garlic|nettle|extract|herbal|silymar|liquorice|tribulus|saw\s+palmet|black\s+cohosh|st\s+john|passifl|valer)\b/i },
  { section: "mineralia",          re: /\b(magnesium|calcium|zinc|iron|selenium|potassium|chromium|iodine|molybdenum|copper|manganese|multi\s+mineral)\b/i },
  { section: "vitamines",          re: /\b(vitamin|b[-\s]?\d{1,2}|b\s?complex|multi[- ]?guard|multi[- ]?vitamin|a-z|niacin|biotin|folate)\b/i },
  { section: "eidiki-diatrofh",    re: /\b(super\s+food|spirulin|chlorella|greens|barley|wheatgrass|maca|cocoa)\b/i },
  { section: "omoiopathitika",     re: /\b(homeo)\b/i },
];

function sectionFromName(name) {
  for (const r of SECTION_RULES) {
    if (r.re.test(name || "")) return r.section;
  }
  return "diafora";
}

function cleanupTitle(t) {
  if (!t) return "";
  let s = t.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*[-–—]\s*lamberts\.gr\s*$/i, "");
  s = s.replace(/\s*[\|]\s*Lamberts\s*(Greece|Ελλάδα)?\s*$/i, "");
  return s.trim();
}

function cleanupDescription(d) {
  if (!d) return "";
  let s = d.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > 700) s = s.slice(0, 697).replace(/\s+\S*$/, "") + "...";
  return s;
}

function stripHtmlKeepText(html) {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ").trim();
}

// Ο user θέλει μόνο το short subtitle κάτω από το product title. Στο
// lamberts.gr τυπικά είναι σε <h2>, <h3>, <strong> ή WooCommerce
// short-description. Δοκιμάζουμε cascade — παίρνουμε το πρώτο ≥ 15
// χαρακτήρες που είναι λογικός υπότιτλος (< 250 chars, όχι multi-paragraph).
const SUBTITLE_PATTERNS = [
  // Lamberts.gr custom theme: <h4 class="sub-title">…</h4> κάτω από
  // το <h2 class="product_title">. Αυτό ακριβώς θέλει ο user.
  { name: "lamberts-sub-title", re: /<h4[^>]+class=["'][^"']*sub-title[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i },
  { name: "wc-short-desc",   re: /<div[^>]+class=["'][^"']*woocommerce-product-details__short-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i },
  { name: "entry-summary-strong", re: /<div[^>]+class=["'][^"']*entry-summary[^"']*["'][^>]*>[\s\S]*?<(?:h2|h3|h4|p|strong|b)[^>]*>([\s\S]*?)<\/(?:h2|h3|h4|p|strong|b)>/i },
  { name: "product-subtitle",re: /<(?:div|h2|h3|p)[^>]+class=["'][^"']*(?:product[- ]?subtitle|tagline|subtitle|product[- ]?tagline|product[- ]?intro)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|h2|h3|p)>/i },
  { name: "h2-after-title",  re: /<h1[^>]*>[\s\S]*?<\/h1>\s*<h2[^>]*>([\s\S]*?)<\/h2>/i },
  { name: "first-strong",    re: /<h1[^>]*>[\s\S]*?<\/h1>[\s\S]*?<(?:p|div)[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/(?:p|div)>/i },
  { name: "elementor-heading", re: /<h2[^>]+class=["'][^"']*elementor-heading-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i },
];

function extractSubtitle(html) {
  for (const p of SUBTITLE_PATTERNS) {
    const m = html.match(p.re);
    if (!m) continue;
    const txt = stripHtmlKeepText(m[1]);
    if (txt.length < 15 || txt.length > 250) continue;
    if (txt.split(/[.!?]\s+/).length > 3) continue; // πάρα πολλές προτάσεις
    return { name: p.name, text: txt };
  }
  return null;
}

// Το sitemap του lamberts.gr επιστρέφει URLs κάτω από /en/product/ που
// σερβίρουν αγγλικά περιεχόμενα. Η Ελληνική έκδοση είναι στο root path
// (/product/…). Rewrite ώστε να τραβάμε την Ελληνική σελίδα.
function toGreekUrl(url) {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/^\/en\//i, "/");
    return u.toString();
  } catch { return url; }
}

async function scrapeProduct(rawUrl) {
  const url = toGreekUrl(rawUrl);
  const html = await fetchText(url);
  const meta = extractMeta(html);
  const ld = extractJsonLd(html);
  const skus = extractSkuFromHtml(html);
  const name = cleanupTitle((ld && ld.name) || meta.title || "");
  // Απλή περιγραφή: μόνο ο υπότιτλος κάτω από το title. Αν δεν βρεθεί,
  // fallback στο og:description (το οποίο τυπικά είναι κοντό).
  const subtitle = extractSubtitle(html);
  const description = subtitle ? subtitle.text
                              : cleanupDescription((ld && ld.description) || meta.description || "");
  return {
    url,
    section: sectionFromName(name),
    name,
    description,
    subtitleSource: subtitle ? subtitle.name : null,
    image: (ld && ld.image) || meta.image || null,
    sku: (ld && ld.sku) || skus[0] || null,
    gtin: (ld && ld.gtin) || null,
    allSkus: skus
  };
}

async function inspect(url) {
  console.log(`GET ${url}\n`);
  const html = await fetchText(url);
  console.log(`HTML size: ${(html.length / 1024).toFixed(0)}kb\n`);

  for (const p of SUBTITLE_PATTERNS) {
    const m = html.match(p.re);
    if (!m) { console.log(`[${p.name}] (no match)`); continue; }
    const txt = stripHtmlKeepText(m[1]);
    console.log(`[${p.name}] ${txt.length}c: ${txt.slice(0, 300)}${txt.length > 300 ? "…" : ""}`);
  }

  const best = extractSubtitle(html);
  if (best) console.log(`\n=> BEST: [${best.name}] ${best.text}`);
  else console.log(`\n=> NO subtitle candidate found`);

  await fs.mkdir(path.join(ROOT, "_debug"), { recursive: true });
  await fs.writeFile(path.join(ROOT, "_debug", "lamberts-inspect.html"), html, "utf8");
  console.log(`\nRaw HTML → _debug/lamberts-inspect.html`);

  if (GREP) {
    const idx = html.toLowerCase().indexOf(GREP.toLowerCase());
    if (idx < 0) console.log(`\nGREP "${GREP}" not found in HTML.`);
    else {
      console.log(`\n--- GREP "${GREP}" context (${idx}b in) ---`);
      console.log(html.slice(Math.max(0, idx - 200), Math.min(html.length, idx + 800)));
      const before = html.slice(0, idx);
      const opens = [...before.matchAll(/<(div|section|article|main|aside|p|h1|h2|h3|strong)\b[^>]*>/gi)];
      console.log(`\nLast 8 opened containers before match:`);
      opens.slice(-8).forEach(m => console.log(`  ${m[0].slice(0, 200)}`));
    }
  }
}

async function main() {
  if (INSPECT) { await inspect(INSPECT); return; }
  console.log("Lamberts scraper — sitemap discovery…");
  const urls = await getSitemapProductUrls();
  console.log(`Βρέθηκαν ${urls.length} product URLs.\n`);

  const out = [];
  const sectionCounts = {};
  const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      const p = await scrapeProduct(url);
      out.push(p);
      sectionCounts[p.section] = (sectionCounts[p.section] || 0) + 1;
      const tag = [p.image ? "img+" : "img-", p.sku ? "sku+" : "sku-"].join(" ");
      console.log(`[${i + 1}/${cap}] ${p.section.padEnd(30)} ${tag} ${(p.name || "").slice(0, 55)}`);
    } catch (e) {
      console.log(`[${i + 1}/${cap}] ERR ${url} ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nSections found:`);
  for (const [s, n] of Object.entries(sectionCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(45)} ${n}`);
  }
  console.log(`\nDone. products=${out.length}.  Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
