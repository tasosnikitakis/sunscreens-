#!/usr/bin/env node
// scripts/fetch-images.mjs
// Κατεβάζει εικόνες προϊόντων από πολλαπλές πηγές:
//   1) Bing Image Search (κύρια, πιο αξιόπιστη)
//   2) Greek pharmacy retailers (vita4you, pharmacy24, fr.com)
//   3) Skroutz
//   4) Open Beauty Facts API
//
// Αποθηκεύει στο /images/{barcode}.{jpg|png|webp} και ενημερώνει
// το /images/manifest.json (resumable).
//
// Χρήση:
//   node scripts/fetch-images.mjs                       # όλα τα προϊόντα
//   node scripts/fetch-images.mjs --limit=10            # δοκιμή
//   node scripts/fetch-images.mjs --brand=apivita       # μία εταιρία
//   node scripts/fetch-images.mjs --debug               # αναλυτικό log
//   node scripts/fetch-images.mjs --test=5201279080198  # μόνο ένα EAN
//   node scripts/fetch-images.mjs --force               # ξαναπροσπάθεια όλων
//
// Απαιτεί Node 18+ (built-in fetch).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "images");
const MANIFEST_FILE = path.join(IMG_DIR, "manifest.json");
const DATA_FILE = path.join(ROOT, "js/data.js");

const args = process.argv.slice(2);
const opt = (k, def) => {
  const a = args.find(x => x.startsWith(`--${k}=`));
  return a ? a.split("=")[1] : def;
};
const flag = (k) => args.includes(`--${k}`);

const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const BRAND = opt("brand", null);
const TEST = opt("test", null);
const FORCE = flag("force");
const DEBUG = flag("debug");
const DELAY_MS = parseInt(opt("delay", "1200"));

const UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
];
function pickUA() { return UAS[Math.floor(Math.random() * UAS.length)]; }

function browserHeaders(extra = {}) {
  return {
    "User-Agent": pickUA(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    ...extra
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function dbg(...a) { if (DEBUG) console.log("   ", ...a); }

async function loadProducts() {
  const code = await fs.readFile(DATA_FILE, "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + "\nglobalThis.__OUT={PRODUCTS,BRANDS};", ctx);
  return ctx.__OUT;
}

async function fetchHtml(url, extra = {}) {
  const res = await fetch(url, { headers: browserHeaders(extra), redirect: "follow" });
  const status = res.status;
  if (!res.ok) {
    const err = new Error(`HTTP ${status}`);
    err.status = status;
    throw err;
  }
  return { status, text: await res.text() };
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function findOgImage(html) {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
        || html.match(/<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return m ? decodeHtml(m[1]) : null;
}

function findTwitterImage(html) {
  const m = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  return m ? decodeHtml(m[1]) : null;
}

function looksBlocked(html) {
  const t = html.toLowerCase();
  return t.includes("captcha") || t.includes("are you a robot") || t.includes("access denied") || t.includes("blocked");
}

// ---------- Sources ----------

const sources = [
  {
    name: "bing-images",
    async find(p) {
      const q = `${p.barcode} ${p.name.split(" ").slice(0, 4).join(" ")}`;
      const url = `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`;
      dbg(`bing GET ${url}`);
      const { status, text } = await fetchHtml(url);
      dbg(`bing HTTP ${status}, ${text.length} bytes`);
      // Bing embeds image URLs in murl="..." attributes inside <a> tags with class iusc
      const matches = text.matchAll(/"murl":"([^"]+)"/g);
      for (const m of matches) {
        const u = decodeHtml(m[1]).replace(/\\\//g, "/");
        // Filter: prefer https jpg/png/webp, avoid tiny thumbnails
        if (/^https?:\/\//.test(u) && /\.(jpe?g|png|webp)(\?|$)/i.test(u)) {
          dbg(`bing match: ${u}`);
          return u;
        }
      }
      // Fallback: look for direct image URLs in any tag
      const m2 = text.match(/"contentUrl":"([^"]+)"/);
      if (m2) {
        const u = decodeHtml(m2[1]).replace(/\\\//g, "/");
        dbg(`bing contentUrl: ${u}`);
        return u;
      }
      dbg("bing: no matches");
      return null;
    }
  },
  {
    name: "duckduckgo-images",
    async find(p) {
      // DuckDuckGo doesn't expose images easily but their HTML lite version helps with regular search.
      // We use it to find product page URLs.
      const q = `${p.barcode} ${p.name.split(" ").slice(0, 3).join(" ")}`;
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
      dbg(`ddg GET ${url}`);
      const { status, text } = await fetchHtml(url);
      dbg(`ddg HTTP ${status}`);
      // Find first result that points to a known good host
      const candidateHosts = [
        "vita4you.gr", "pharm24.gr", "pharmacy24.gr", "fr.com.gr", "fr.gr",
        "kosmas.gr", "pharmacy295.gr", "farmasi.gr", "skroutz.gr",
        "apivita.com", "frezyderm.gr", "korres.com",
        "laroche-posay.gr", "vichy.gr", "bioderma.gr"
      ];
      const linkMatches = [...text.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g)];
      for (const m of linkMatches) {
        let u = decodeHtml(m[1]);
        // DDG often wraps in redirect /l/?uddg=...
        if (u.startsWith("//")) u = "https:" + u;
        const redirMatch = u.match(/uddg=([^&]+)/);
        if (redirMatch) u = decodeURIComponent(redirMatch[1]);
        const host = u.replace(/^https?:\/\//, "").split("/")[0];
        if (candidateHosts.some(h => host.includes(h))) {
          dbg(`ddg trying ${u}`);
          try {
            const { text: page } = await fetchHtml(u, { Referer: "https://duckduckgo.com/" });
            if (looksBlocked(page)) { dbg(`  blocked page`); continue; }
            const img = findOgImage(page) || findTwitterImage(page);
            if (img) { dbg(`  found: ${img}`); return img; }
          } catch (e) { dbg(`  ${e.message}`); }
        }
      }
      return null;
    }
  },
  {
    name: "skroutz",
    async find(p) {
      const url = `https://www.skroutz.gr/search?keyphrase=${encodeURIComponent(p.barcode)}`;
      dbg(`skroutz GET ${url}`);
      const { status, text } = await fetchHtml(url, { "Referer": "https://www.google.com/" });
      dbg(`skroutz HTTP ${status}, ${text.length} bytes`);
      if (looksBlocked(text)) { dbg("skroutz blocked"); return null; }
      const m = text.match(/<a[^>]+href=["'](\/s\/\d+\/[^"'#?]+)["']/);
      if (!m) {
        dbg("skroutz: no product links in search");
        return null;
      }
      const productUrl = `https://www.skroutz.gr${m[1]}`;
      dbg(`skroutz product ${productUrl}`);
      const { text: page } = await fetchHtml(productUrl);
      return findOgImage(page);
    }
  },
  {
    name: "openbeautyfacts",
    async find(p) {
      const url = `https://world.openbeautyfacts.org/api/v2/product/${p.barcode}.json?fields=image_front_url,image_url`;
      dbg(`obf GET ${url}`);
      const res = await fetch(url, { headers: { "User-Agent": "SunscreenCatalog/1.0 (github tasosnikitakis/sunscreens-)" } });
      dbg(`obf HTTP ${res.status}`);
      if (!res.ok) return null;
      const j = await res.json();
      if (j.status === 1 && j.product) return j.product.image_front_url || j.product.image_url || null;
      return null;
    }
  }
];

// ---------- Download ----------

function extFromContentType(ct, url) {
  ct = (ct || "").toLowerCase();
  if (ct.includes("jpeg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "jpg";
  if (u.endsWith(".png")) return "png";
  if (u.endsWith(".webp")) return "webp";
  return "jpg";
}

async function downloadImage(url, barcode) {
  dbg(`download ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": pickUA(), "Referer": "https://www.bing.com/" } });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1500) throw new Error("image too small (probably blocked)");
  const e = extFromContentType(res.headers.get("content-type"), url);
  const filename = `${barcode}.${e}`;
  await fs.writeFile(path.join(IMG_DIR, filename), buf);
  dbg(`saved ${filename} (${buf.length} bytes)`);
  return filename;
}

async function existingFor(barcode) {
  const exts = ["jpg", "jpeg", "png", "webp", "gif"];
  for (const e of exts) {
    try {
      await fs.access(path.join(IMG_DIR, `${barcode}.${e}`));
      return `${barcode}.${e}`;
    } catch {}
  }
  return null;
}

async function loadManifest() {
  try { return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8")); }
  catch { return {}; }
}
async function saveManifest(m) {
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(m, null, 2) + "\n", "utf8");
}

async function processProduct(p, manifest, idx, total) {
  const label = `[${idx}${total ? "/" + total : ""}] ${p.barcode} ${p.name.slice(0, 55).padEnd(55)}`;
  if (DEBUG) console.log(`\n${label}`);
  for (const src of sources) {
    try {
      const url = await src.find(p);
      if (!url) continue;
      const filename = await downloadImage(url, p.barcode);
      manifest[p.barcode] = filename;
      if (!DEBUG) console.log(`${label} OK  via ${src.name} -> ${filename}`);
      else console.log(`   => OK via ${src.name}: ${filename}`);
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
  await fs.mkdir(IMG_DIR, { recursive: true });
  const { PRODUCTS } = await loadProducts();

  // Test single product mode
  if (TEST) {
    const p = PRODUCTS.find(x => x.barcode === TEST);
    if (!p) { console.error(`Product with barcode ${TEST} not found`); process.exit(1); }
    console.log(`Testing all sources for ${p.barcode} - ${p.name}`);
    const manifest = await loadManifest();
    await processProduct(p, manifest, 1, 1);
    await saveManifest(manifest);
    return;
  }

  let pool = BRAND ? PRODUCTS.filter(p => p.brand === BRAND) : PRODUCTS;
  if (pool.length === 0) {
    console.error(`No products for brand=${BRAND}`);
    process.exit(1);
  }

  const manifest = await loadManifest();
  let ok = 0, skip = 0, miss = 0, processed = 0;

  for (const p of pool) {
    if (processed >= LIMIT) break;

    if (!FORCE) {
      const existing = manifest[p.barcode] || await existingFor(p.barcode);
      if (existing) { manifest[p.barcode] = existing; skip++; continue; }
    }
    processed++;

    const total = Math.min(pool.length, LIMIT);
    const success = await processProduct(p, manifest, processed, total);
    if (success) { ok++; await saveManifest(manifest); }
    else miss++;

    await sleep(DELAY_MS + Math.random() * 700);
  }

  await saveManifest(manifest);
  console.log(`\nDone. downloaded=${ok}  already-had=${skip}  missed=${miss}`);
  console.log(`Manifest: ${MANIFEST_FILE}`);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
