#!/usr/bin/env node
// scripts/scrape-frezyderm.mjs
// Διατρέχει τον κατάλογο της frezyderm.gr μέσω sitemap και για κάθε product
// URL μαζεύει: og:title, og:description, εικόνα (JSON-LD Product.image ή
// og:image), section (από το πρώτο path segment) και SKU αν είναι ορατό
// στο HTML. Γράφει js/frezyderm-site.json ως raw catalog.
//
// Χρήση:
//   node scripts/scrape-frezyderm.mjs
//   node scripts/scrape-frezyderm.mjs --debug
//   node scripts/scrape-frezyderm.mjs --limit=30 --debug

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/frezyderm-site.json");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "300"));

const HOST = "frezyderm.gr";
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

// SKU codes εμφανίζονται στο HTML σε ποικίλα σημεία. Δοκιμάζουμε αρκετά.
function extractSkuFromHtml(html) {
  const candidates = [];
  // Yoast SEO product schema συνήθως έχει "sku":"..."
  for (const m of html.matchAll(/"sku"\s*:\s*"([^"]+)"/gi)) candidates.push(m[1]);
  // WooCommerce class="sku">CODE</span>
  for (const m of html.matchAll(/class=["']sku["']\s*>\s*([^<\s]+)/gi)) candidates.push(m[1]);
  // Έντυπο "Κωδικός: NNNN" ή "SKU: NNNN"
  for (const m of html.matchAll(/(?:Κωδικ[όο]ς|SKU|Product\s+code)\s*[:：]\s*<[^>]*>\s*([A-Za-z0-9\-\.\/]+)/gi)) candidates.push(m[1]);
  for (const m of html.matchAll(/(?:Κωδικ[όο]ς|SKU|Product\s+code)\s*[:：]\s*([A-Za-z0-9\-\.\/]{4,})/gi)) candidates.push(m[1]);
  return [...new Set(candidates.filter(x => x && x.length >= 3 && x.length <= 40))];
}

function isProductUrl(url) {
  const lower = url.toLowerCase();
  if (!lower.includes(HOST)) return false;
  if (/sitemap|robots|\.xml(\?|$)/.test(lower)) return false;
  if (/\/(category|categories|search|account|cart|checkout|help|contact|about|stores|brands|store-locator|wp-content|wp-json|feed|blog|arthra|klimakas|dermatologikoi-astoi)(\/|$)/.test(lower)) return false;
  const p = lower.replace(/^https?:\/\/[^\/]+/, "").replace(/[?#].*$/, "");
  const parts = p.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  const last = parts[parts.length - 1];
  // Product slugs στο frezyderm.gr είναι πολύ μεγάλα (μπολικά ελληνικά+αγγλικά words)
  if (last.length > 20 && last.includes("-")) return true;
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

function sectionFromUrl(url) {
  try {
    const p = new URL(url).pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    return p[0] || "diafora";
  } catch { return "diafora"; }
}

async function scrapeProduct(url) {
  const html = await fetchText(url);
  const meta = extractMeta(html);
  const ld = extractJsonLd(html);
  const skus = extractSkuFromHtml(html);
  return {
    url,
    section: sectionFromUrl(url),
    name: (ld && ld.name) || meta.title || "",
    description: cleanupDescription((ld && ld.description) || meta.description || ""),
    image: (ld && ld.image) || meta.image || null,
    sku: (ld && ld.sku) || skus[0] || null,
    gtin: (ld && ld.gtin) || null,
    allSkus: skus
  };
}

function cleanupDescription(d) {
  if (!d) return "";
  let s = d.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > 700) s = s.slice(0, 697).replace(/\s+\S*$/, "") + "...";
  return s;
}

async function main() {
  console.log("Frezyderm scraper — sitemap discovery…");
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
