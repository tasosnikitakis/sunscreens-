#!/usr/bin/env node
// scripts/sync-brand-images.mjs
// Κατεβάζει τοπικά (images/<brand>/) τις επίσημες εικόνες των προϊόντων που
// έχουν σελίδα στο brand site (override με image URL) και ενημερώνει το
// manifest. Για κάθε brand του js/brands.js.
//
// Χρήση:
//   node scripts/sync-brand-images.mjs --brand=aderma
//   node scripts/sync-brand-images.mjs --brand=frezyderm --force     # ξανακατεβάζει όλες
//   node scripts/sync-brand-images.mjs --brand=lamberts --barcode=5055148404383 --debug

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWindowFile, PHARMACY_IMAGE_MARKER } from "./lib-frezyderm.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "images");
const MANIFEST_FILE = path.join(IMG_DIR, "manifest.json");
const MANIFEST_JS_FILE = path.join(IMG_DIR, "manifest.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);
const BRAND = (opt("brand", "") || "").toLowerCase();
const ONLY = opt("barcode", null);
const DEBUG = flag("debug");
const FORCE = flag("force");
const DELAY_MS = parseInt(opt("delay", "350"));

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

export function looksLikeImage(buf) {
  if (buf.length < 8) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  if (buf[0] === 0x42 && buf[1] === 0x4D) return true;
  const head = buf.slice(0, 256).toString("utf8").trim().toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg");
}

export async function fetchBuf(url, referer) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8", "Referer": referer || "https://www.google.com/" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1500) throw new Error("image too small (blocked?)");
  if (!looksLikeImage(buf)) throw new Error("not an image (HTML returned)");
  return { buf, contentType: res.headers.get("content-type") || "" };
}

export function extFromContentType(ct, url) {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("svg")) return "svg";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  const m = (url.split("?")[0] || "").match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);
  if (m) return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  return "jpg";
}

export function slugify(name) {
  return String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[Ͱ-Ͽἀ-῿]/g, " ")
    .replace(/[+&]/g, " ").replace(/[\/\\]/g, "-").replace(/[^\w\s-]/g, " ")
    .toLowerCase().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90).replace(/-+$/, "");
}

export async function loadManifest() { try { return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8")); } catch { return {}; } }
export async function saveManifest(m) {
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(m, null, 2) + "\n", "utf8");
  const clean = Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith("_")));
  await fs.writeFile(MANIFEST_JS_FILE, "// Auto-generated από τα scripts εικόνων (fetch-images / sync-brand-images / fill-brand-missing).\n"
    + "// Συγχρονισμένο με images/manifest.json — μην το επεξεργαστείτε χειροκίνητα.\n"
    + "window.IMAGE_MANIFEST = " + JSON.stringify(clean, null, 2) + ";\n", "utf8");
}

export async function loadBrand(key) {
  const w = await loadWindowFile(path.join(ROOT, "js/brands.js"));
  const cfg = (w.BRAND_CATALOGS || {})[key];
  if (!cfg) throw new Error(`Άγνωστο brand "${key}". Διαθέσιμα: ${Object.keys(w.BRAND_CATALOGS || {}).join(", ")}`);
  const K = key.toUpperCase();
  const supplier = (await loadWindowFile(path.join(ROOT, `js/${key}-supplier.js`)))[`${K}_SUPPLIER`] || [];
  const overrides = (await loadWindowFile(path.join(ROOT, `js/${key}-overrides.js`)))[`${K}_OVERRIDES`] || {};
  const supplemental = (await loadWindowFile(path.join(ROOT, `js/${key}-supplemental.js`)))[`${K}_SUPPLEMENTAL`] || {};
  return { cfg, supplier, overrides, supplemental };
}

async function main() {
  if (!BRAND) { console.error("Usage: node scripts/sync-brand-images.mjs --brand=<key> [--force] [--barcode=…]"); process.exit(1); }
  const { cfg, supplier, overrides } = await loadBrand(BRAND);
  const manifest = await loadManifest();
  const dir = cfg.imageDir;
  await fs.mkdir(path.join(IMG_DIR, dir), { recursive: true });

  // Μόνο προϊόντα με σελίδα στο brand site — οι εικόνες φαρμακείου για τα
  // υπόλοιπα κατεβαίνουν από το fill-brand-missing.mjs.
  let pool = supplier.filter(p => overrides[p.barcode] && overrides[p.barcode].image);
  if (ONLY) pool = pool.filter(p => p.barcode === ONLY);
  console.log(`${cfg.name}: συγχρονισμός ${pool.length} επίσημων εικόνων από ${cfg.host}…\n`);

  // Provenance: από ποιο URL κατέβηκε κάθε τοπική εικόνα — ξεχωρίζει εικόνες
  // φαρμακείου (ίδιος φάκελος) και αλλαγή match σε άλλη σελίδα.
  const sources = manifest[cfg.sourceKey] || (manifest[cfg.sourceKey] = {});
  let ok = 0, skip = 0, fail = 0;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    const o = overrides[p.barcode];
    const existing = manifest[p.barcode];
    const looksOfficial = existing && existing.startsWith(dir + "/") && !PHARMACY_IMAGE_MARKER.test(existing);
    const sameSource = !sources[p.barcode] || sources[p.barcode] === o.image;
    if (!FORCE && looksOfficial && sameSource) {
      try { await fs.access(path.join(IMG_DIR, existing)); if (!sources[p.barcode]) sources[p.barcode] = o.image; skip++; continue; } catch {}
    }
    const label = `[${i + 1}/${pool.length}] ${p.barcode}`;
    try {
      dbg(`GET ${o.image}`);
      let fetched;
      try { fetched = await fetchBuf(o.image, o.url); }
      catch (err) {
        // Το μεγάλο preset μπορεί να λείπει — πέφτουμε στο fallback αντί να μείνει χωρίς εικόνα
        if (!o.imageFallback || o.imageFallback === o.image) throw err;
        dbg(`  ${err.message} → fallback ${o.imageFallback}`);
        fetched = await fetchBuf(o.imageFallback, o.url);
      }
      // Κενό placeholder του CDN (π.χ. Pierre Fabre wedia: διάφανο PNG ~2kb) → δοκίμασε τις υπόλοιπες εικόνες της σελίδας
      if (fetched.buf.length < 3000) {
        const alts = [...(o.images || []), o.imageFallback].filter(u => u && u !== o.image);
        let found = null;
        for (const alt of alts) { try { const f = await fetchBuf(alt, o.url); if (f.buf.length >= 3000) { found = f; dbg(`  κενό placeholder → ${alt}`); break; } } catch {} }
        if (found) fetched = found; else throw new Error(`κενή εικόνα (${fetched.buf.length} bytes) και καμία εναλλακτική`);
      }
      const { buf, contentType } = fetched;
      const ext = extFromContentType(contentType, o.image);
      const brandRe = new RegExp("^" + cfg.name.replace(/[-\s]/g, "[-\\s]?") + "\\s*", "i");
      const relPath = `${dir}/${slugify((o.name || p.name || p.barcode).replace(brandRe, ""))}-${p.barcode}.${ext}`;
      await fs.writeFile(path.join(IMG_DIR, relPath), buf);
      if (existing && existing !== relPath && existing.startsWith(dir + "/")) { try { await fs.unlink(path.join(IMG_DIR, existing)); } catch {} }
      manifest[p.barcode] = relPath;
      sources[p.barcode] = o.image;
      console.log(`${label} OK ${relPath} (${(buf.length / 1024).toFixed(0)}kb)${existing && existing !== relPath ? `  (αντικατέστησε ${existing})` : ""}`);
      ok++;
    } catch (err) { console.log(`${label} ERR ${err.message}`); fail++; }
    if ((i + 1) % 10 === 0) await saveManifest(manifest);
    await sleep(DELAY_MS);
  }
  await saveManifest(manifest);
  console.log(`\nDone. synced=${ok}  skipped=${skip}  failed=${fail}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error("FATAL:", err); process.exit(1); });
}
