#!/usr/bin/env node
// scripts/sync-override-images.mjs
// Για κάθε barcode στο js/seasonal-overrides.js, κατεβάζει την επίσημη
// εικόνα (og:image) από το URL που έχουμε δηλώσει στο override και την
// αποθηκεύει στο images/seasonal/. Ενημερώνει images/manifest.json και
// images/manifest.js. Σβήνει τις παλιές (auto-fetched) εικόνες για το ίδιο
// barcode ώστε να μην μένουν ορφανές.
//
// Έτσι, για κάθε brand που έχουμε manual overrides, οι εικόνες έρχονται
// απευθείας από το επίσημο product page → 100% σωστά + ενιαία οπτικά.
//
// Χρήση:
//   node scripts/sync-override-images.mjs                   # όλα τα overrides
//   node scripts/sync-override-images.mjs --barcode=3663555001952
//   node scripts/sync-override-images.mjs --debug

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "images");
const SEASONAL_IMG_DIR = path.join(IMG_DIR, "seasonal");
const MANIFEST_FILE = path.join(IMG_DIR, "manifest.json");
const MANIFEST_JS_FILE = path.join(IMG_DIR, "manifest.js");
const OVERRIDES_FILE = path.join(ROOT, "js/seasonal-overrides.js");
const DATA_FILE = path.join(ROOT, "js/seasonal-data.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : def; };
const flag = (k) => args.includes(`--${k}`);

const ONLY = opt("barcode", null);
const DEBUG = flag("debug");
const DRY_RUN = flag("dry-run");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

async function fetchText(url, extra = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "el-GR,el;q=0.9",
      ...extra
    },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchBuf(url, referer) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8", "Referer": referer },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1500) throw new Error("image too small (probably blocked)");
  const ct = res.headers.get("content-type") || "";
  return { buf, contentType: ct };
}

function decodeHtml(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function extractOgImage(html) {
  const re = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
  const m = html.match(re);
  if (m) return { url: decodeHtml(m[1]), source: "og:image" };
  const re2 = /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i;
  const m2 = html.match(re2);
  if (m2) return { url: decodeHtml(m2[1]), source: "twitter:image" };
  const re3 = /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i;
  const m3 = html.match(re3);
  if (m3) return { url: decodeHtml(m3[1]), source: "link rel=image_src" };
  return null;
}

// JSON-LD Product schema — πιο αξιόπιστη για WP/WooCommerce sites που
// δεν δίνουν og:image (compeed.gr). Παίρνουμε το πρώτο εικόνα URL από
// product schema entries.
function extractJsonLdImage(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let json;
    try { json = JSON.parse(b[1].trim()); } catch { continue; }
    const stack = Array.isArray(json) ? [...json] : [json];
    while (stack.length) {
      const node = stack.shift();
      if (!node || typeof node !== "object") continue;
      const type = node["@type"];
      const typeArr = Array.isArray(type) ? type : [type];
      if (typeArr.includes("Product") && node.image) {
        const img = Array.isArray(node.image) ? node.image[0] : node.image;
        if (typeof img === "string") return { url: img, source: "json-ld Product" };
        if (img && img.url) return { url: img.url, source: "json-ld Product.image.url" };
      }
      if (node["@graph"] && Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
    }
  }
  return null;
}

// WooCommerce / WP gallery <img> tag. Φιλτράρισμα logos/icons/avatars.
function extractGalleryImage(html, baseUrl) {
  const candidates = [];
  // wp-content/uploads images that look like products
  const re = /<img[^>]+(?:src|data-src|data-large_image|data-zoom-image)=["']([^"']+wp-content\/uploads\/[^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(re)) candidates.push(decodeHtml(m[1]));
  // Skip icons, logos, avatars, banners
  const blacklist = /\b(logo|icon|favicon|sprite|placeholder|banner|avatar|loading|spinner|footer|header|menu)\b/i;
  const filtered = candidates
    .map(u => u.replace(/-\d+x\d+(?=\.(?:jpg|jpeg|png|webp))/i, "")) // strip "-300x300" thumbnail suffix
    .filter(u => !blacklist.test(u));
  if (filtered.length === 0) return null;
  // De-dupe and pick first
  const seen = new Set();
  for (const u of filtered) { if (!seen.has(u)) { seen.add(u); return { url: u, source: "wp-content gallery" }; } }
  return null;
}

function findImageInPage(html, pageUrl) {
  return extractOgImage(html)
      || extractJsonLdImage(html)
      || extractGalleryImage(html, pageUrl);
}

function extFromContentType(ct, url) {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("svg")) return "svg";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  // Fallback from URL extension
  const m = (url.split("?")[0] || "").match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
  if (m) return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  return "jpg";
}

function slugify(name) {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[Ͱ-Ͽἀ-῿]/g, " ") // strip Greek chars
    .replace(/[+&]/g, " ").replace(/[\/\\]/g, "-")
    .replace(/[^\w\s-]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 90).replace(/-+$/, "");
}

async function loadOverrides() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(OVERRIDES_FILE, "utf8"), ctx);
  return ctx.window.SEASONAL_OVERRIDES || {};
}

async function loadProductsByBarcode() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(DATA_FILE, "utf8") + "\nglobalThis.OUT=SEASONAL_PRODUCTS;", ctx);
  const m = {};
  for (const p of ctx.OUT) if (p.barcode) m[p.barcode] = p;
  return m;
}

async function loadManifest() {
  try { return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8")); }
  catch { return {}; }
}

async function saveManifest(m) {
  if (DRY_RUN) return;
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(m, null, 2) + "\n", "utf8");
  const clean = Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith("_")));
  const js = "// Auto-generated από το scripts/fetch-images.mjs.\n"
           + "// Συγχρονισμένο με images/manifest.json — μην το επεξεργαστείτε χειροκίνητα.\n"
           + "window.IMAGE_MANIFEST = " + JSON.stringify(clean, null, 2) + ";\n";
  await fs.writeFile(MANIFEST_JS_FILE, js, "utf8");
}

async function deleteIfExists(relPath) {
  if (!relPath) return;
  const abs = path.join(IMG_DIR, relPath);
  try { await fs.unlink(abs); dbg(`  deleted old ${relPath}`); }
  catch (e) { if (e.code !== "ENOENT") dbg(`  unlink ${relPath} ${e.message}`); }
}

async function main() {
  const overrides = await loadOverrides();
  const products = await loadProductsByBarcode();
  const manifest = await loadManifest();

  const barcodes = Object.keys(overrides).filter(bc => !ONLY || bc === ONLY);
  if (barcodes.length === 0) {
    console.log(`Δεν βρέθηκαν overrides${ONLY ? ` για barcode=${ONLY}` : ""}.`);
    return;
  }

  console.log(`Συγχρονισμός ${barcodes.length} εικόνων από τα override URLs…${DRY_RUN ? "  (DRY RUN)" : ""}\n`);
  let ok = 0, fail = 0, unchanged = 0;
  for (const bc of barcodes) {
    const override = overrides[bc];
    const p = products[bc];
    const url = override.url;
    if (!url) { console.log(`${bc} (no URL — skip)`); fail++; continue; }

    try {
      dbg(`GET ${url}`);
      const html = await fetchText(url);
      const hit = findImageInPage(html, url);
      if (!hit) { console.log(`${bc} no image found at ${url}`); fail++; continue; }
      const ogImage = hit.url;
      const imgUrl = ogImage.startsWith("//") ? "https:" + ogImage
                   : ogImage.startsWith("/") ? new URL(ogImage, url).toString()
                   : ogImage;
      dbg(`  ${hit.source} -> ${imgUrl}`);
      const { buf, contentType } = await fetchBuf(imgUrl, url);
      const ext = extFromContentType(contentType, imgUrl);

      // Slug από το override name αν υπάρχει, αλλιώς από supplier name
      const baseName = (override.name || (p && p.name) || bc).replace(/^Compeed\s+/i, "");
      const slug = slugify(baseName);
      const filename = `${slug}-${bc}.${ext}`;
      const relPath = `seasonal/${filename}`;

      if (!DRY_RUN) {
        await fs.mkdir(SEASONAL_IMG_DIR, { recursive: true });
        await fs.writeFile(path.join(IMG_DIR, relPath), buf);
      }

      // Διαγραφή παλιού αρχείου αν είναι διαφορετικό
      const oldRel = manifest[bc];
      if (oldRel && oldRel !== relPath) await deleteIfExists(oldRel);

      manifest[bc] = relPath;
      console.log(`${bc} OK [${hit.source}] ${relPath} (${(buf.length / 1024).toFixed(0)}kb)`);
      ok++;
    } catch (e) {
      console.log(`${bc} ERR ${e.message}`);
      fail++;
    }
    if (ok % 5 === 0) await saveManifest(manifest);
    await sleep(400);
  }
  await saveManifest(manifest);
  console.log(`\nDone. synced=${ok}  failed=${fail}.${DRY_RUN ? "  (DRY RUN — δεν γράφτηκε τίποτα)" : ""}`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
