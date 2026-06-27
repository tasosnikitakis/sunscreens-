#!/usr/bin/env node
// scripts/list-brand-catalog.mjs
// Διαβάζει το sitemap ενός brand site (ή μία category page) και εκτυπώνει
// για κάθε product URL το og:title (Greek). Χρησιμοποιείται για να
// συντάξουμε χειροκίνητα το js/seasonal-overrides.json — barcode → URL.
//
// Χρήση:
//   node scripts/list-brand-catalog.mjs --brand=compeed
//   node scripts/list-brand-catalog.mjs --brand=compeed --host=compeed.gr
//   node scripts/list-brand-catalog.mjs --brand=compeed --json   # JSON output
//
// Για brands χωρίς δικό τους site (πωλούνται μέσω distributor όπως vican.gr):
//   node scripts/list-brand-catalog.mjs --category-url="https://www.vican.gr/el/proionta.html?manufacturer=1229"

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const BRAND = opt("brand", "compeed");
const HOST_OVERRIDE = opt("host", null);
const CATEGORY_URL = opt("category-url", null);
const JSON_OUT = flag("json");
const DELAY_MS = parseInt(opt("delay", "400"));

const BRAND_HOSTS = {
  compeed: "compeed.gr",
  frezyderm: "frezyderm.gr",
  korres: "korres.gr",
  powerhealth: "powerhealth.gr",
  solgar: "solgar.gr",
  elancyl: "elancyl.gr",
  realcare: "realcare.gr",
  galesyn: "galesyn.gr",
  pharmalead: "pharmalead.gr",
  travelfix: "travel-fix.gr",
  repel: "repel.gr"
};

const HOST = HOST_OVERRIDE || BRAND_HOSTS[BRAND];
if (!CATEGORY_URL && !HOST) {
  console.error(`Άγνωστο brand: ${BRAND}. Δώστε --host=... ή --category-url=...`);
  process.exit(1);
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "el-GR,el;q=0.9"
    },
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
    description: og("og:description", "description", "twitter:description")
  };
}

function isLikelyProductUrl(url, host) {
  const lower = url.toLowerCase();
  if (!lower.includes(host)) return false;
  if (/sitemap|robots|\.xml(\?|$)/.test(lower)) return false;
  if (/\/(category|categories|search|account|cart|checkout|help|contact|about|stores|brands|store-locator|customer-service|find-a-store|register|login|press|privacy|cookie|terms|legal|wp-content|wp-json|feed)(\/|$)/.test(lower)) return false;
  if (/\/(proionta|products|product|peripoiisi|peripoihsh|skin-care|sun-care|προϊοντα)\//.test(lower)) return true;
  const path = lower.replace(/^https?:\/\/[^\/]+/, "").replace(/[?#].*$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 1) return false;
  const last = parts[parts.length - 1];
  if (last.length > 15 && last.includes("-")) return true;
  return false;
}

async function getSitemapProductUrls(host) {
  const urls = new Set();
  const seen = new Set();
  const sitemapUrls = new Set();

  for (const root of [`https://www.${host}`, `https://${host}`]) {
    try {
      const text = await fetchText(root + "/robots.txt");
      for (const m of text.matchAll(/Sitemap:\s*(\S+)/gi)) sitemapUrls.add(m[1].trim());
    } catch {}
    for (const p of ["/sitemap_index.xml", "/sitemap-index.xml", "/sitemap.xml"]) {
      sitemapUrls.add(root + p);
    }
  }

  async function processSitemap(smUrl, depth = 0) {
    if (depth > 3 || seen.has(smUrl)) return;
    seen.add(smUrl);
    let text;
    try { text = await fetchText(smUrl); } catch { return; }
    const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
    if (/<sitemapindex/i.test(text)) {
      const childrenToProcess = locs.filter(u => /product|catalog|proion|peripoi/i.test(u));
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
    if (urls.size > 200) break;
  }

  return [...urls].filter(u => isLikelyProductUrl(u, host));
}

// Παίρνει όλα τα <a href=...> ενός category page, φιλτράρει σε product-like
// links από τον ίδιο host. Συμπληρώνει pagination αν εντοπίσει "?page=" links.
async function scrapeCategoryPage(catUrl) {
  const seen = new Set();
  const found = new Set();
  const queue = [catUrl];
  const host = new URL(catUrl).hostname.toLowerCase();
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    console.error(`category page GET ${url}`);
    let html;
    try { html = await fetchText(url); } catch (e) { console.error(`  ${e.message}`); continue; }
    for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
      let u = decodeHtml(m[1]);
      try { u = new URL(u, url).toString(); } catch { continue; }
      const lower = u.toLowerCase();
      if (new URL(u).hostname.toLowerCase() !== host) continue;
      // Pagination
      if (/[?&](p|page)=\d+/.test(lower) && !seen.has(u)) queue.push(u.split("#")[0]);
      if (!isLikelyProductUrl(u, host)) continue;
      found.add(u.split("#")[0]);
    }
    await sleep(DELAY_MS);
    if (queue.length > 20) break; // safety
  }
  return [...found];
}

async function main() {
  let urls;
  if (CATEGORY_URL) {
    console.error(`Category-page scraping ${CATEGORY_URL}…`);
    urls = await scrapeCategoryPage(CATEGORY_URL);
  } else {
    console.error(`Sitemap discovery για ${HOST}…`);
    urls = await getSitemapProductUrls(HOST);
  }
  console.error(`Βρέθηκαν ${urls.length} product URLs. Διαβάζω og:title για κάθε ένα…\n`);

  const items = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const html = await fetchText(url);
      const meta = extractMeta(html);
      items.push({ url, title: meta.title || "(no og:title)", description: meta.description || "" });
      if (!JSON_OUT) console.log(`${(i + 1).toString().padStart(3)}. ${meta.title || "(no og:title)"}\n     ${url}\n`);
    } catch (e) {
      items.push({ url, title: `(error: ${e.message})`, description: "" });
      if (!JSON_OUT) console.log(`${(i + 1).toString().padStart(3)}. (error: ${e.message})\n     ${url}\n`);
    }
    await sleep(DELAY_MS);
  }

  if (JSON_OUT) console.log(JSON.stringify(items, null, 2));
  console.error(`\nΣύνολο: ${items.length} προϊόντα στο ${HOST}.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
