#!/usr/bin/env node
// scripts/fill-lamberts-missing.mjs
// Ίδια λογική με fill-frezyderm-missing: για Lamberts barcodes χωρίς override
// (ή με ανεπαρκή περιγραφή σε --retry-flagged), ψάχνει σε ελληνικά φαρμακεία
// για og:title / og:description / og:image.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "images");
const LAM_IMG_DIR = path.join(IMG_DIR, "lamberts");
const MANIFEST_FILE = path.join(IMG_DIR, "manifest.json");
const MANIFEST_JS_FILE = path.join(IMG_DIR, "manifest.js");
const SUPPLIER_FILE = path.join(ROOT, "js/lamberts-supplier.js");
const OVERRIDES_FILE = path.join(ROOT, "js/lamberts-overrides.js");
const OUT_FILE = path.join(ROOT, "js/lamberts-supplemental.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const FORCE = flag("force");
const RETRY_FLAGGED = flag("retry-flagged");
const ONLY = opt("barcode", null);
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "1100"));

function isPoorQuality(desc) {
  const s = (desc || "").trim();
  if (!s) return true;
  if (s.length < 120) return true;
  if (/(σε προσφορά στο\s+Pharm24|Δωρε[άα]ν μεταφορικ[άα]|σε αγορ[έε]ς [άα]νω των|Online\s+Pharmacy|Ofarmakopoiosmou)/i.test(s)) return true;
  const greekChars = (s.match(/[α-ωΑ-Ωά-ώΆ-Ώ]/g) || []).length;
  const latinChars = (s.match(/[a-zA-Z]/g) || []).length;
  if (latinChars > 30 && greekChars < latinChars / 3) return true;
  if (s.length < 220 && /(\.{3,}|…)\s*$/.test(s)) return true;
  return false;
}

const PHARMACY_HOSTS = [
  "skroutz.gr", "bestprice.gr",
  "vita4you.gr", "pharm24.gr", "kosmas.gr", "fr.gr", "blinkshop.gr",
  "mypharmacy.gr", "bestpharmacy.gr", "pharmacy295.gr", "smilepharmacy.gr",
  "ofarmakopoiosmou.gr", "lifepharmacy.gr", "pharmaplaza.gr",
  "myomorfia.gr", "1010.gr", "galinos.gr"
];

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchBuf(url, referer) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8", "Referer": referer || "https://www.google.com/" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1500) throw new Error("image too small");
  if (!looksLikeImage(buf)) throw new Error("not an image");
  return { buf, contentType: res.headers.get("content-type") || "" };
}

function looksLikeImage(buf) {
  if (buf.length < 8) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
  const head = buf.slice(0, 256).toString("utf8").trim().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return true;
  return false;
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
  return { title: og("og:title", "twitter:title"), description: og("og:description", "description", "twitter:description"), image: og("og:image", "twitter:image") };
}

function cleanupTitle(t) {
  if (!t) return null;
  let s = t.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*[\|–\-—]\s*(Skroutz(\.gr)?|BestPrice(\.gr)?|Vita4you|Pharm24|Kosmas(\.gr)?|Fr\.gr|Blinkshop|Pharmacy295|BestPharmacy|MyPharmacy|SmilePharmacy|oFarmakopoiosmou|LifePharmacy|Pharmaplaza|Galinos)\s*\.?$/i, "");
  return s.replace(/\s+/g, " ").trim() || null;
}

function cleanupDescription(d) {
  if (!d) return null;
  let s = d.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > 600) s = s.slice(0, 597).replace(/\s+\S*$/, "") + "...";
  return s || null;
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
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[Ͱ-Ͽἀ-῿]/g, " ")
    .replace(/[+&]/g, " ").replace(/[\/\\]/g, "-").replace(/[^\w\s-]/g, " ")
    .toLowerCase().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90).replace(/-+$/, "");
}

function hostOf(u) { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }

async function ddgSearch(barcode) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(barcode)}`;
  let text;
  try { text = await fetchText(url); } catch { return []; }
  const links = [];
  for (const m of text.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/g)) {
    let u = decodeHtml(m[1]);
    if (u.startsWith("//")) u = "https:" + u;
    const redir = u.match(/uddg=([^&]+)/);
    if (redir) { try { u = decodeURIComponent(redir[1]); } catch {} }
    links.push(u);
  }
  return links;
}

async function bingSearch(barcode) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(barcode)}&FORM=QBLH`;
  let text;
  try { text = await fetchText(url); } catch { return []; }
  const links = [];
  for (const m of text.matchAll(/<h2><a[^>]+href="(https?:\/\/[^"]+)"/g)) {
    const u = decodeHtml(m[1]);
    if (/(?:bing\.com\/(?:aclick|ck\/a))/.test(u)) continue;
    links.push(u);
  }
  return links;
}

async function pharmacyResult(barcode, opts = {}) {
  let links = await ddgSearch(barcode);
  if (links.length === 0) { await sleep(300); links = await bingSearch(barcode); }
  if (links.length === 0) return null;

  const score = (u) => {
    const h = hostOf(u);
    if (opts.preferRich) {
      if (h === "vita4you.gr") return 0;
      if (h === "fr.gr") return 1;
      if (h === "blinkshop.gr") return 2;
      if (h === "ofarmakopoiosmou.gr") return 3;
      if (h === "kosmas.gr") return 4;
      if (h === "skroutz.gr") return 5;
      if (h === "pharm24.gr") return 6;
    }
    if (h === "skroutz.gr") return 0;
    if (h === "pharm24.gr") return 1;
    if (h === "vita4you.gr") return 2;
    if (h === "bestprice.gr") return 3;
    if (PHARMACY_HOSTS.includes(h)) return 4;
    return 10;
  };
  links.sort((a, b) => score(a) - score(b));

  const descQualityScore = (d) => {
    if (!d) return 0;
    const s = d.trim();
    let sc = Math.min(s.length, 500) / 100;
    if (/(σε προσφορά στο\s+Pharm24|Δωρε[άα]ν μεταφορικ[άα]|σε αγορ[έε]ς [άα]νω των|Online\s+Pharmacy|Ofarmakopoiosmou)/i.test(s)) sc -= 5;
    const greek = (s.match(/[α-ωΑ-Ωά-ώΆ-Ώ]/g) || []).length;
    const latin = (s.match(/[a-zA-Z]/g) || []).length;
    if (latin > 30 && greek < latin / 3) sc -= 3;
    if (s.length < 220 && /(\.{3,}|…)\s*$/.test(s)) sc -= 1;
    return sc;
  };

  let bestHit = null, bestScore = -Infinity, firstHit = null;
  for (const u of links.slice(0, 8)) {
    const h = hostOf(u);
    if (!PHARMACY_HOSTS.includes(h)) continue;
    try {
      const text = await fetchText(u);
      const meta = extractMeta(text);
      const title = cleanupTitle(meta.title);
      const desc = cleanupDescription(meta.description);
      const img = meta.image;
      if (title || img) {
        const hit = { name: title, description: desc, image: img, source: h, url: u };
        const qScore = descQualityScore(desc);
        if (!firstHit) firstHit = hit;
        if (!opts.returnBestByQuality) return hit;
        if (qScore > bestScore) { bestScore = qScore; bestHit = hit; }
        if (qScore >= 3) return bestHit;
      }
    } catch {}
    await sleep(300);
  }
  return bestHit || firstHit || null;
}

async function loadJs(file, name) {
  const ctx = { window: {} }; vm.createContext(ctx);
  try { vm.runInContext(await fs.readFile(file, "utf8"), ctx); } catch {}
  return ctx.window[name] || (Array.isArray(ctx.window[name]) ? [] : {});
}

async function saveSupplemental(m) {
  const banner = "// Auto-generated από το scripts/fill-lamberts-missing.mjs.\n"
               + "// Pharmacy-based συμπλήρωμα για Lamberts barcodes χωρίς lamberts.gr match.\n";
  await fs.writeFile(OUT_FILE, banner + "window.LAMBERTS_SUPPLEMENTAL = " + JSON.stringify(m, null, 2) + ";\n", "utf8");
}

async function loadManifest() { try { return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8")); } catch { return {}; } }
async function saveManifest(m) {
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(m, null, 2) + "\n", "utf8");
  const clean = Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith("_")));
  const js = "// Auto-generated από το scripts/fetch-images.mjs.\nwindow.IMAGE_MANIFEST = " + JSON.stringify(clean, null, 2) + ";\n";
  await fs.writeFile(MANIFEST_JS_FILE, js, "utf8");
}

async function main() {
  const supplier = await loadJs(SUPPLIER_FILE, "LAMBERTS_SUPPLIER");
  const overrides = await loadJs(OVERRIDES_FILE, "LAMBERTS_OVERRIDES");
  const supplemental = await loadJs(OUT_FILE, "LAMBERTS_SUPPLEMENTAL");
  const manifest = await loadManifest();

  let pool = supplier.filter(p => {
    if (ONLY && p.barcode !== ONLY) return false;
    const o = overrides[p.barcode];
    const s = supplemental[p.barcode];
    if (RETRY_FLAGGED) {
      const desc = (o && o.description) || (s && s.description) || null;
      return isPoorQuality(desc);
    }
    if (o && o.image) return false;
    if (!FORCE && s) return false;
    return true;
  });

  console.log(`Missing/flagged: ${pool.length} Lamberts προϊόντα προς αναζήτηση σε φαρμακεία.\n`);
  await fs.mkdir(LAM_IMG_DIR, { recursive: true });

  let ok = 0, imgOk = 0, miss = 0, n = 0;
  for (const p of pool) {
    if (n >= LIMIT) break;
    n++;
    const label = `[${n}/${Math.min(pool.length, LIMIT)}] ${p.barcode}`;
    let hit = null;
    try {
      const opts = RETRY_FLAGGED ? { preferRich: true, returnBestByQuality: true } : {};
      hit = await pharmacyResult(p.barcode, opts);
    } catch (e) { dbg(`ERR: ${e.message}`); }
    if (!hit) { console.log(`${label} MISS ${p.name.slice(0, 55)}`); miss++; await sleep(DELAY_MS); continue; }

    supplemental[p.barcode] = { name: hit.name || null, description: hit.description || null, image: hit.image || null, source: hit.source, url: hit.url };

    if (hit.image) {
      try {
        const { buf, contentType } = await fetchBuf(hit.image, hit.url);
        const ext = extFromContentType(contentType, hit.image);
        const baseName = (hit.name || p.name || p.barcode).replace(/^LAMBERTS\s*/i, "");
        const slug = slugify(baseName);
        const relPath = `lamberts/${slug}-${p.barcode}.${ext}`;
        await fs.writeFile(path.join(IMG_DIR, relPath), buf);
        manifest[p.barcode] = relPath;
        imgOk++;
        console.log(`${label} OK ${hit.source} img+ (${(buf.length/1024).toFixed(0)}kb)  ${(hit.name || "").slice(0, 55)}`);
      } catch (e) {
        console.log(`${label} OK ${hit.source} img- (${e.message})  ${(hit.name || "").slice(0, 55)}`);
      }
    } else {
      console.log(`${label} OK ${hit.source} no-image  ${(hit.name || "").slice(0, 55)}`);
    }
    ok++;
    if (n % 5 === 0) { await saveSupplemental(supplemental); await saveManifest(manifest); }
    await sleep(DELAY_MS + Math.random() * 300);
  }
  await saveSupplemental(supplemental);
  await saveManifest(manifest);
  console.log(`\nDone. filled=${ok} (with-image=${imgOk})  missed=${miss}.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
