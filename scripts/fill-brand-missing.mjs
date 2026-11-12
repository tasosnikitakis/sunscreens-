#!/usr/bin/env node
// scripts/fill-brand-missing.mjs
// Για κάθε supplier barcode ενός brand που ΔΕΝ έχει σελίδα στο brand site
// (override), ψάχνει το barcode σε ελληνικά φαρμακεία (Skroutz, Pharm24,
// Vita4you, Fr.gr, Blinkshop, Bestpharmacy κ.λπ.) και από την πρώτη επιτυχή
// σελίδα παίρνει og:title / og:description / og:image. Κατεβάζει την εικόνα
// στο images/<brand>/ και γράφει τα δεδομένα στο js/<brand>-supplemental.js.
//
// Προϊόντα με σελίδα στο brand site ΔΕΝ αγγίζονται ποτέ από εδώ — η σελίδα
// (brand-app.js, product.js) διαβάζει OVERRIDES ή, αν λείπουν, SUPPLEMENTAL.
//
// Χρήση:
//   node scripts/fill-brand-missing.mjs --brand=aderma
//   node scripts/fill-brand-missing.mjs --brand=aderma --retry-flagged   # ξανά όσα έχουν κακή περιγραφή
//   node scripts/fill-brand-missing.mjs --brand=aderma --barcode=3282770149722 --debug
//   node scripts/fill-brand-missing.mjs --brand=aderma --force --limit=10

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanPharmacyName } from "./lib-frezyderm.mjs";
import { loadBrand, loadManifest, saveManifest, fetchBuf, extFromContentType, slugify } from "./sync-brand-images.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "images");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);
const BRAND = (opt("brand", "") || "").toLowerCase();
const DEBUG = flag("debug");
const FORCE = flag("force");
const RETRY_FLAGGED = flag("retry-flagged");
const ONLY = opt("barcode", null);
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "1100"));

// Ίδια κριτήρια με το frezydermDescriptionQuality του js/utils.js
function isPoorQuality(desc) {
  const s = (desc || "").trim();
  if (!s) return true;
  if (s.length < 120) return true;
  if (/(σε προσφορά στο\s+Pharm24|Δωρε[άα]ν μεταφορικ[άα]|σε αγορ[έε]ς [άα]νω των|Online\s+Pharmacy|Ofarmakopoiosmou)/i.test(s)) return true;
  const greek = (s.match(/[α-ωΑ-Ωά-ώΆ-Ώ]/g) || []).length, latin = (s.match(/[a-zA-Z]/g) || []).length;
  if (latin > 30 && greek < latin / 3) return true;
  if (s.length < 220 && /(\.{3,}|…)\s*$/.test(s)) return true;
  return false;
}

const PHARMACY_HOSTS = [
  "skroutz.gr", "bestprice.gr", "vita4you.gr", "pharm24.gr", "kosmas.gr", "fr.gr", "blinkshop.gr",
  "mypharmacy.gr", "bestpharmacy.gr", "pharmacy295.gr", "smilepharmacy.gr", "ofarmakopoiosmou.gr",
  "lifepharmacy.gr", "pharmaplaza.gr", "omorfia.gr", "myomorfia.gr", "1010.gr", "galinos.gr"
];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const decodeHtml = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#34;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
function extractMeta(html) {
  const og = (...names) => {
    for (const n of names) {
      let m = html.match(new RegExp(`<meta[^>]+property=["']${n}["'][^>]+content=["']([^"']+)["']`, "i")) || html.match(new RegExp(`<meta[^>]+name=["']${n}["'][^>]+content=["']([^"']+)["']`, "i"));
      if (m) return decodeHtml(m[1]);
    }
    return null;
  };
  return { title: og("og:title", "twitter:title"), description: og("og:description", "description", "twitter:description"), image: og("og:image", "twitter:image") };
}
function cleanupDescription(d) {
  if (!d) return null;
  let s = d.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\s*σε προσφορά στο\s+Pharm24\.gr\b.*$/i, "")
    .replace(/\s*Δωρε[άα]ν μεταφορικ[άα]\s+σε\s+αγορ[έε]ς\s+[άα]νω των\s*\d+[€\s].*$/i, "")
    .replace(/\s*Online\s+Pharmacy\s*[\-·|]*\s*[A-Za-zΑ-Ωα-ω0-9\s\.\,]{0,80}$/i, "")
    .replace(/\s*\|\s*Skroutz\.gr\s*$/i, "").replace(/[·\-\|]\s*$/, "").trim();
  if (s.length > 600) s = s.slice(0, 597).replace(/\s+\S*$/, "") + "...";
  return s || null;
}
// Ελληνική έκδοση των σελίδων φαρμακείων που έχουν και αγγλικό path
const toGreekUrl = u => u.replace(/(ofarmakopoiosmou\.gr|lifepharmacy\.gr)\/en\//i, "$1/");
const hostOf = u => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };

async function ddgSearch(q) {
  let text; try { text = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`); } catch (e) { dbg(`ddg ${e.message}`); return []; }
  const links = [];
  for (const m of text.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g)) {
    let u = decodeHtml(m[1]); if (u.startsWith("//")) u = "https:" + u;
    const r = u.match(/uddg=([^&]+)/); if (r) { try { u = decodeURIComponent(r[1]); } catch {} }
    links.push(u);
  }
  return links;
}
async function bingSearch(q) {
  let text; try { text = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&FORM=QBLH`); } catch (e) { dbg(`bing ${e.message}`); return []; }
  return [...text.matchAll(/<h2><a[^>]+href="(https?:\/\/[^"]+)"/g)].map(m => decodeHtml(m[1])).filter(u => !/bing\.com\/(aclick|ck\/a)/.test(u));
}

async function pharmacyResult(barcode, opts = {}) {
  let links = await ddgSearch(barcode);
  if (!links.length) { await sleep(300); links = await bingSearch(barcode); }
  if (!links.length) return null;
  const rank = u => { const h = hostOf(u); if (opts.preferRich) { const r = ["vita4you.gr", "fr.gr", "blinkshop.gr", "ofarmakopoiosmou.gr", "kosmas.gr", "skroutz.gr", "pharm24.gr"].indexOf(h); if (r >= 0) return r; } const r2 = ["skroutz.gr", "pharm24.gr", "vita4you.gr", "bestprice.gr"].indexOf(h); return r2 >= 0 ? r2 : (PHARMACY_HOSTS.includes(h) ? 4 : 10); };
  links.sort((a, b) => rank(a) - rank(b));
  const quality = d => { if (!d) return 0; const s = d.trim(); let sc = Math.min(s.length, 500) / 100; if (isPoorQuality(s)) sc -= 3; return sc; };
  let best = null, bestScore = -Infinity, first = null;
  for (const raw of links.slice(0, 8)) {
    const u = toGreekUrl(raw), h = hostOf(u);
    if (!PHARMACY_HOSTS.includes(h)) continue;
    dbg(`pharm try ${u}`);
    try {
      const meta = extractMeta(await fetchText(u));
      const title = cleanPharmacyName(meta.title), desc = cleanupDescription(meta.description);
      if (title || meta.image) {
        const hit = { name: title, description: desc, image: meta.image, source: h, url: u };
        const q = quality(desc);
        dbg(`  hit: ${(title || "—").slice(0, 60)} | ${meta.image ? "img+" : "img-"} | q=${q.toFixed(1)}`);
        if (!first) first = hit;
        if (!opts.returnBestByQuality) return hit;
        if (q > bestScore) { bestScore = q; best = hit; }
        if (q >= 3) return best;
      }
    } catch (e) { dbg(`  ${e.message}`); }
    await sleep(300);
  }
  return best || first || null;
}

async function main() {
  if (!BRAND) { console.error("Usage: node scripts/fill-brand-missing.mjs --brand=<key> [--retry-flagged] [--force] [--barcode=…] [--limit=N]"); process.exit(1); }
  const { cfg, supplier, overrides, supplemental } = await loadBrand(BRAND);
  const OUT_FILE = path.join(ROOT, `js/${BRAND}-supplemental.js`);
  const manifest = await loadManifest();
  const dir = cfg.imageDir;
  await fs.mkdir(path.join(IMG_DIR, dir), { recursive: true });

  const pool = supplier.filter(p => {
    if (ONLY && p.barcode !== ONLY) return false;
    if (overrides[p.barcode]) return false;                       // έχει σελίδα brand — δεν το αγγίζουμε
    const s = supplemental[p.barcode];
    if (RETRY_FLAGGED) return isPoorQuality(s && s.description);
    return FORCE || !s;
  });
  console.log(`${cfg.name}: ${pool.length} προϊόντα χωρίς σελίδα στο ${cfg.host} προς αναζήτηση σε φαρμακεία.\n`);

  const save = async () => {
    const banner = `// Auto-generated από το scripts/fill-brand-missing.mjs --brand=${BRAND}.\n`
      + `// Pharmacy-based συμπλήρωμα για ${cfg.name} barcodes χωρίς σελίδα στο ${cfg.host}.\n`
      + "// Ο site το διαβάζει μόνο ως fallback (OVERRIDES > SUPPLEMENTAL > supplier).\n";
    await fs.writeFile(OUT_FILE, banner + `window.${BRAND.toUpperCase()}_SUPPLEMENTAL = ` + JSON.stringify(supplemental, null, 2) + ";\n", "utf8");
    await saveManifest(manifest);
  };
  const brandRe = new RegExp("^" + cfg.name.replace(/[-\s]/g, "[-\\s]?") + "\\s*", "i");
  let ok = 0, imgOk = 0, miss = 0, n = 0;
  for (const p of pool) {
    if (n >= LIMIT) break;
    n++;
    const label = `[${n}/${Math.min(pool.length, LIMIT)}] ${p.barcode}`;
    let hit = null;
    try { hit = await pharmacyResult(p.barcode, RETRY_FLAGGED ? { preferRich: true, returnBestByQuality: true } : {}); } catch (e) { dbg(`ERR ${e.message}`); }
    if (!hit) { console.log(`${label} MISS ${p.name.slice(0, 55)}`); miss++; await sleep(DELAY_MS); continue; }
    supplemental[p.barcode] = { name: hit.name || null, description: hit.description || null, image: hit.image || null, source: hit.source, url: hit.url };
    if (hit.image) {
      try {
        const { buf, contentType } = await fetchBuf(hit.image, hit.url);
        const relPath = `${dir}/${slugify((hit.name || p.name || p.barcode).replace(brandRe, ""))}-${hit.source.replace(/\.gr$/, "")}-${p.barcode}.${extFromContentType(contentType, hit.image)}`;
        await fs.writeFile(path.join(IMG_DIR, relPath), buf);
        manifest[p.barcode] = relPath;
        imgOk++;
        console.log(`${label} OK ${hit.source} img+ (${(buf.length / 1024).toFixed(0)}kb)  ${(hit.name || "").slice(0, 55)}`);
      } catch (e) { console.log(`${label} OK ${hit.source} img- (${e.message})  ${(hit.name || "").slice(0, 55)}`); }
    } else console.log(`${label} OK ${hit.source} no-image  ${(hit.name || "").slice(0, 55)}`);
    ok++;
    if (n % 5 === 0) await save();
    await sleep(DELAY_MS + Math.random() * 300);
  }
  await save();
  console.log(`\nDone. filled=${ok} (with-image=${imgOk})  missed=${miss}.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
