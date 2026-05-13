#!/usr/bin/env node
// scripts/fetch-images.mjs
// Κατεβάζει εικόνες προϊόντων από Skroutz και Open Beauty Facts
// στο φάκελο /images/, και γράφει το /images/manifest.json.
//
// Χρήση:
//   node scripts/fetch-images.mjs                  # όλα τα προϊόντα
//   node scripts/fetch-images.mjs --brand=apivita  # μόνο μία εταιρία
//   node scripts/fetch-images.mjs --limit=20       # δοκιμαστικό run
//   node scripts/fetch-images.mjs --force          # ξαναπροσπάθεια & για αρχεία που υπάρχουν
//
// Απαιτεί Node 18+ (έχει built-in fetch).

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "images");
const MANIFEST_FILE = path.join(IMG_DIR, "manifest.json");
const DATA_FILE = path.join(ROOT, "js/data.js");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "el-GR,el;q=0.9,en;q=0.7",
  "Cache-Control": "no-cache"
};

const args = process.argv.slice(2);
const opt = (k, def) => {
  const a = args.find(x => x.startsWith(`--${k}=`));
  return a ? a.split("=")[1] : def;
};
const flag = (k) => args.includes(`--${k}`);

const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const BRAND = opt("brand", null);
const FORCE = flag("force");
const DELAY_MS = parseInt(opt("delay", "900"));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadProducts() {
  const code = await fs.readFile(DATA_FILE, "utf8");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + "\nglobalThis.__OUT={PRODUCTS,BRANDS};", ctx);
  return ctx.__OUT;
}

async function fetchHtml(url, extra = {}) {
  const res = await fetch(url, { headers: { ...HEADERS, ...extra }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
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
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return m ? decodeHtml(m[1]) : null;
}

const sources = [
  {
    name: "skroutz-barcode",
    async find(p) {
      const html = await fetchHtml(`https://www.skroutz.gr/search?keyphrase=${encodeURIComponent(p.barcode)}`);
      const m = html.match(/<a[^>]+href=["'](\/s\/\d+\/[^"'#?]+)["']/);
      if (!m) return null;
      const page = await fetchHtml(`https://www.skroutz.gr${m[1]}`);
      return findOgImage(page);
    }
  },
  {
    name: "skroutz-name",
    async find(p) {
      // Drop promo wording for better hits
      const q = p.name
        .replace(/[+,].*$/, "")
        .replace(/\bPROMO\b|\bNEO\b|ΝΕΟ|\+δώρο|\+ΤΣ|\(.*?\)/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      const html = await fetchHtml(`https://www.skroutz.gr/search?keyphrase=${encodeURIComponent(q)}`);
      const m = html.match(/<a[^>]+href=["'](\/s\/\d+\/[^"'#?]+)["']/);
      if (!m) return null;
      const page = await fetchHtml(`https://www.skroutz.gr${m[1]}`);
      return findOgImage(page);
    }
  },
  {
    name: "openbeautyfacts",
    async find(p) {
      const res = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${p.barcode}.json?fields=image_front_url,image_url`, {
        headers: { "User-Agent": "SunscreenCatalog/1.0 (github tasosnikitakis/sunscreens-)" }
      });
      if (!res.ok) return null;
      const j = await res.json();
      if (j.status === 1 && j.product) return j.product.image_front_url || j.product.image_url || null;
      return null;
    }
  }
];

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
  const res = await fetch(url, { headers: { ...HEADERS, "Referer": "https://www.google.com/" } });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1500) throw new Error("image too small");
  const e = extFromContentType(res.headers.get("content-type"), url);
  const filename = `${barcode}.${e}`;
  await fs.writeFile(path.join(IMG_DIR, filename), buf);
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

async function main() {
  await fs.mkdir(IMG_DIR, { recursive: true });
  const { PRODUCTS } = await loadProducts();
  let pool = BRAND ? PRODUCTS.filter(p => p.brand === BRAND) : PRODUCTS;
  if (pool.length === 0) {
    console.error(`No products for brand=${BRAND}`);
    process.exit(1);
  }

  const manifest = await loadManifest();
  let ok = 0, skip = 0, miss = 0, processed = 0;

  for (const p of pool) {
    if (processed >= LIMIT) break;

    // Skip if we already have a local image and not --force
    if (!FORCE) {
      const existing = manifest[p.barcode] || await existingFor(p.barcode);
      if (existing) {
        manifest[p.barcode] = existing;
        skip++;
        continue;
      }
    }
    processed++;

    const label = `[${processed}${LIMIT !== Infinity ? "/" + Math.min(pool.length, LIMIT) : ""}] ${p.barcode} ${p.name.slice(0, 55).padEnd(55)}`;

    let saved = null;
    for (const src of sources) {
      try {
        const url = await src.find(p);
        if (!url) continue;
        const filename = await downloadImage(url, p.barcode);
        manifest[p.barcode] = filename;
        saved = { src: src.name, filename };
        break;
      } catch (e) {
        // try next source
      }
      await sleep(120);
    }

    if (saved) {
      console.log(`${label} OK  via ${saved.src} -> ${saved.filename}`);
      ok++;
      // Save manifest after every successful download (resumable)
      await saveManifest(manifest);
    } else {
      console.log(`${label} MISS`);
      miss++;
    }

    await sleep(DELAY_MS + Math.random() * 500);
  }

  await saveManifest(manifest);
  console.log(`\nDone. downloaded=${ok}  already-had=${skip}  missed=${miss}`);
  console.log(`Manifest: ${MANIFEST_FILE}`);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
