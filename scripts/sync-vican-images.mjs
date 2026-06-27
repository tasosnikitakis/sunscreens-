#!/usr/bin/env node
// scripts/sync-vican-images.mjs
// Κατεβάζει τοπικά τις εικόνες όλων των προϊόντων Vican.
// Διαβάζει το p.image URL που έχει ήδη αποθηκεύσει το scrape-vican.mjs
// (από JSON-LD ή og:image του vican.gr), και αποθηκεύει την εικόνα στο
// images/vican/<slug>-<barcode>.<ext>. Ενημερώνει manifest.json + manifest.js.
//
// Χρήση:
//   node scripts/sync-vican-images.mjs                       # όλα
//   node scripts/sync-vican-images.mjs --debug
//   node scripts/sync-vican-images.mjs --barcode=5204559030319
//   node scripts/sync-vican-images.mjs --force               # ξανατραβάει και όσα ήδη υπάρχουν

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "images");
const VICAN_IMG_DIR = path.join(IMG_DIR, "vican");
const MANIFEST_FILE = path.join(IMG_DIR, "manifest.json");
const MANIFEST_JS_FILE = path.join(IMG_DIR, "manifest.js");
const DATA_FILE = path.join(ROOT, "js/vican-data.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const ONLY = opt("barcode", null);
const DEBUG = flag("debug");
const FORCE = flag("force");
const DELAY_MS = parseInt(opt("delay", "350"));

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

function looksLikeImage(buf) {
  if (buf.length < 8) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  if (buf[0] === 0x42 && buf[1] === 0x4D) return true;
  const head = buf.slice(0, 256).toString("utf8").trim().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return true;
  return false;
}

async function fetchBuf(url, referer) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8", "Referer": referer || "https://www.vican.gr/" },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1500) throw new Error("image too small (blocked?)");
  if (!looksLikeImage(buf)) throw new Error("not an image (server returned HTML)");
  return { buf, contentType: res.headers.get("content-type") || "" };
}

function extFromContentType(ct, url) {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("svg")) return "svg";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  const m = (url.split("?")[0] || "").match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
  if (m) return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  return "jpg";
}

function slugify(name) {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[Ͱ-Ͽἀ-῿]/g, " ")
    .replace(/[+&]/g, " ").replace(/[\/\\]/g, "-")
    .replace(/[^\w\s-]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 90).replace(/-+$/, "");
}

async function loadProducts() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(DATA_FILE, "utf8"), ctx);
  return ctx.window.VICAN_PRODUCTS || [];
}

async function loadManifest() {
  try { return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8")); }
  catch { return {}; }
}

async function saveManifest(m) {
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(m, null, 2) + "\n", "utf8");
  const clean = Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith("_")));
  const js = "// Auto-generated από το scripts/fetch-images.mjs.\n"
           + "// Συγχρονισμένο με images/manifest.json — μην το επεξεργαστείτε χειροκίνητα.\n"
           + "window.IMAGE_MANIFEST = " + JSON.stringify(clean, null, 2) + ";\n";
  await fs.writeFile(MANIFEST_JS_FILE, js, "utf8");
}

async function main() {
  const products = await loadProducts();
  const manifest = await loadManifest();

  let pool = products.filter(p => p.barcode && p.image);
  if (ONLY) pool = pool.filter(p => p.barcode === ONLY);

  console.log(`Συγχρονισμός ${pool.length} Vican εικόνων…\n`);
  let ok = 0, skip = 0, fail = 0;
  await fs.mkdir(VICAN_IMG_DIR, { recursive: true });

  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    const existing = manifest[p.barcode];
    if (!FORCE && existing && existing.startsWith("vican/")) {
      // Verify file exists on disk
      try { await fs.access(path.join(IMG_DIR, existing)); skip++; continue; }
      catch {}
    }

    const label = `[${i + 1}/${pool.length}] ${p.barcode}`;
    try {
      dbg(`GET ${p.image}`);
      const { buf, contentType } = await fetchBuf(p.image, p.url);
      const ext = extFromContentType(contentType, p.image);
      const baseName = (p.name || p.barcode).replace(/^CER['’]?\s?8?\s*/i, "cer-8 ");
      const slug = slugify(baseName);
      const relPath = `vican/${slug}-${p.barcode}.${ext}`;
      await fs.writeFile(path.join(IMG_DIR, relPath), buf);
      // Clean up old non-vican entry pointing elsewhere
      if (existing && existing !== relPath && !existing.startsWith("vican/")) {
        try { await fs.unlink(path.join(IMG_DIR, existing)); dbg(`  removed old ${existing}`); }
        catch {}
      }
      manifest[p.barcode] = relPath;
      console.log(`${label} OK ${relPath} (${(buf.length / 1024).toFixed(0)}kb)`);
      ok++;
    } catch (e) {
      console.log(`${label} ERR ${e.message}`);
      fail++;
    }
    if ((i + 1) % 10 === 0) await saveManifest(manifest);
    await sleep(DELAY_MS);
  }
  await saveManifest(manifest);
  console.log(`\nDone. synced=${ok}  skipped=${skip}  failed=${fail}.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
