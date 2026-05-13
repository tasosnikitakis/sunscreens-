#!/usr/bin/env node
// scripts/fetch-images.mjs
// Κατεβάζει εικόνες προϊόντων από πολλαπλές πηγές, με προτεραιότητα στους
// επίσημους ιστότοπους των κατασκευαστών (apivita.com, korres.com, κ.λπ.)
// μέσω Bing "site:" search.
//
// Πηγές (με σειρά προτεραιότητας):
//   1) Manual overrides από images/urls.json  ({ "<barcode>": "<image-url>" })
//   2) Brand manufacturer (Bing site:<brand-domain>)
//   3) Bing Image Search
//   4) DuckDuckGo HTML search → og:image από Greek pharmacy retailers
//   5) Skroutz
//   6) Open Beauty Facts API
//
// Αποθηκεύει στο /images/{barcode}.{jpg|png|webp} και ενημερώνει το
// /images/manifest.json (resumable).
//
// Χρήση:
//   node scripts/fetch-images.mjs                       # όλα τα προϊόντα
//   node scripts/fetch-images.mjs --limit=10            # δοκιμή
//   node scripts/fetch-images.mjs --brand=apivita       # μία εταιρία
//   node scripts/fetch-images.mjs --debug               # αναλυτικό log
//   node scripts/fetch-images.mjs --debug --save-html   # save responses for inspection
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
const MANIFEST_JS_FILE = path.join(IMG_DIR, "manifest.js");
const URLS_FILE = path.join(IMG_DIR, "urls.json");
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
const SAVE_HTML = flag("save-html");
const DELAY_MS = parseInt(opt("delay", "1200"));

// Map of brand key → primary manufacturer domain. Used for Bing site: searches
// and for the candidate-host list when extracting from generic search engines.
const BRAND_SITES = {
  apivita: ["apivita.com", "apivita.gr"],
  bioderma: ["bioderma.com", "bioderma.gr"],
  frezyderm: ["frezyderm.com", "frezyderm.gr"],
  freshline: ["freshline.gr", "freshline.com"],
  heliodor: ["pharmasept.gr", "pharmasept.com"],
  korres: ["korres.com", "korres.gr"],
  laroche: ["laroche-posay.gr", "laroche-posay.com"],
  vichy: ["vichy.gr", "vichy.com"],
  cerave: ["cerave.gr", "cerave.com"],
  luxurious: ["luxurious-cosmetics.com", "luxurious-cosmetics.gr"],
  aderma: ["aderma.com", "aderma.gr"],
  avene: ["eau-thermale-avene.gr", "eau-thermale-avene.com", "avene.gr"],
  ducray: ["ducray.com", "ducray.gr"],
  svr: ["labo-svr.com", "labosvr.com", "svr.com"],
  isdin: ["isdin.com", "isdin.gr"]
};

// Greek pharmacy retailers used as fallbacks
const RETAILER_HOSTS = [
  "vita4you.gr", "pharm24.gr", "pharmacy24.gr", "fr.com.gr", "fr.gr",
  "kosmas.gr", "pharmacy295.gr", "farmasi.gr", "pharmagora.gr", "epharmacy.gr",
  "skroutz.gr", "galinos.gr"
];

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

async function loadManualUrls() {
  try { return JSON.parse(await fs.readFile(URLS_FILE, "utf8")); }
  catch { return {}; }
}

async function fetchHtml(url, extra = {}) {
  const res = await fetch(url, { headers: browserHeaders(extra), redirect: "follow" });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return { status: res.status, text: await res.text(), finalUrl: res.url || url };
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function findOgImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      const url = decodeHtml(m[1]);
      // Skip very small / placeholder / logo images
      if (!/logo|placeholder|sprite|favicon|icon/i.test(url)) return url;
    }
  }
  return null;
}

function looksBlocked(html) {
  const t = html.toLowerCase();
  return t.includes("captcha") || t.includes("are you a robot") ||
         t.includes("access denied") || t.includes("you have been blocked") ||
         t.includes("403 forbidden");
}

async function saveDebugHtml(name, text) {
  if (!SAVE_HTML) return;
  const f = path.join(IMG_DIR, `_debug_${name}.html`);
  try { await fs.writeFile(f, text); dbg(`saved: ${f}`); } catch {}
}

function simplifyName(name, opts = {}) {
  let s = name
    .replace(/\bPROMO\b|\bNEO\b|ΝΕΟ|\+δώρο|\+δώρα|\+ΤΣ|\+ΤΣΑ|\+ΝΕ|\+ΝΕΣ?/gi, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (opts.dropGreek) {
    s = s.replace(/[Ͱ-Ͽἀ-῿]+/g, "").replace(/\s+/g, " ").trim();
  }
  return s.slice(0, opts.maxLen || 90);
}

// ---------- Sources ----------

async function manualUrlsSource(p, ctx) {
  const url = ctx.manualUrls[p.barcode];
  if (!url) return null;
  dbg(`manual: ${url}`);
  return url;
}

async function bingSiteSearch(p, ctx) {
  const sites = BRAND_SITES[p.brand];
  if (!sites || !sites.length) return null;

  // Build query: try (barcode + brand name) and (name on brand site).
  const queries = [];
  for (const site of sites) {
    queries.push(`site:${site} ${p.barcode}`);
    queries.push(`site:${site} ${simplifyName(p.name, { maxLen: 60, dropGreek: true })}`);
    queries.push(`site:${site} ${simplifyName(p.name, { maxLen: 60 })}`);
  }

  for (const q of queries) {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&FORM=QBLH`;
    dbg(`bing-site GET ${url}`);
    let html;
    try {
      const r = await fetchHtml(url);
      html = r.text;
      dbg(`bing-site HTTP ${r.status} ${html.length}b`);
    } catch (e) { dbg(`bing-site ${e.message}`); continue; }

    if (looksBlocked(html)) { dbg("bing-site blocked"); continue; }
    saveDebugHtml(`bing-site_${p.barcode}_${encodeURIComponent(q).slice(0, 40)}`, html);

    // Find first organic result link to one of the brand domains.
    // Bing organic results have <li class="b_algo"> ... <h2><a href="...">
    const linkRe = /<h2><a[^>]+href="([^"]+)"/g;
    const candidates = [];
    let mm;
    while ((mm = linkRe.exec(html)) !== null) candidates.push(decodeHtml(mm[1]));

    const productLink = candidates.find(u => sites.some(s => u.includes(s)));
    if (!productLink) { dbg(`bing-site: no link to ${sites.join("|")}`); continue; }

    dbg(`bing-site product page: ${productLink}`);
    try {
      const { text: page } = await fetchHtml(productLink, { Referer: "https://www.bing.com/" });
      saveDebugHtml(`brand_${p.barcode}`, page);
      const img = findOgImage(page);
      if (img) { dbg(`brand og:image -> ${img}`); return img; }
      dbg(`brand page: no og:image`);
    } catch (e) { dbg(`brand fetch ${e.message}`); }

    await sleep(400);
  }
  return null;
}

async function bingImagesSource(p) {
  const q = `${p.barcode} ${simplifyName(p.name, { maxLen: 50 })}`;
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1`;
  dbg(`bing-img GET ${url}`);
  let html;
  try {
    const r = await fetchHtml(url);
    html = r.text;
    dbg(`bing-img HTTP ${r.status} ${html.length}b`);
  } catch (e) { dbg(`bing-img ${e.message}`); return null; }

  saveDebugHtml(`bing-img_${p.barcode}`, html);
  if (looksBlocked(html)) { dbg("bing-img blocked"); return null; }

  // Try several patterns that Bing has used for image URLs.
  const patterns = [
    /"murl":"([^"]+)"/,
    /&quot;murl&quot;:&quot;([^&]+)&quot;/,
    /"contentUrl":"([^"]+)"/,
    /m="\{[^"]*&quot;murl&quot;:&quot;([^&]+)&quot;/,
    /imgurl=([^&"'<>]+)/,
    /mediaurl=([^&"'<>]+)/
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    let u = decodeHtml(m[1]).replace(/\\\//g, "/");
    if (re.source.includes("imgurl") || re.source.includes("mediaurl")) {
      try { u = decodeURIComponent(u); } catch {}
    }
    if (/^https?:\/\//.test(u) && /\.(jpe?g|png|webp)(\?|$)/i.test(u)) {
      dbg(`bing-img match via ${re.source.slice(0, 30)}: ${u}`);
      return u;
    }
  }
  dbg("bing-img: no parseable matches");
  return null;
}

async function ddgRetailerSource(p) {
  const q = `${p.barcode} ${simplifyName(p.name, { maxLen: 50 })}`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  dbg(`ddg GET ${url}`);
  let html;
  try {
    const r = await fetchHtml(url);
    html = r.text;
    dbg(`ddg HTTP ${r.status}`);
  } catch (e) { dbg(`ddg ${e.message}`); return null; }

  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/g;
  const links = [];
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    let u = decodeHtml(m[1]);
    if (u.startsWith("//")) u = "https:" + u;
    const redir = u.match(/uddg=([^&]+)/);
    if (redir) { try { u = decodeURIComponent(redir[1]); } catch {} }
    links.push(u);
  }

  // Prefer retailer / brand hosts, then anything else
  const knownHosts = [...RETAILER_HOSTS, ...Object.values(BRAND_SITES).flat()];
  const ordered = [
    ...links.filter(u => knownHosts.some(h => u.includes(h))),
    ...links.filter(u => !knownHosts.some(h => u.includes(h)))
  ];

  for (const u of ordered.slice(0, 6)) {
    dbg(`ddg trying ${u}`);
    try {
      const { text: page } = await fetchHtml(u, { Referer: "https://duckduckgo.com/" });
      if (looksBlocked(page)) { dbg(`  blocked`); continue; }
      saveDebugHtml(`ddg_${p.barcode}_${u.replace(/[^a-z0-9]/gi, "_").slice(0, 40)}`, page);
      const img = findOgImage(page);
      if (img) { dbg(`  og:image -> ${img}`); return img; }
    } catch (e) { dbg(`  ${e.message}`); }
    await sleep(300);
  }
  return null;
}

async function skroutzSource(p) {
  const url = `https://www.skroutz.gr/search?keyphrase=${encodeURIComponent(p.barcode)}`;
  dbg(`skroutz GET ${url}`);
  let html;
  try {
    const r = await fetchHtml(url, { Referer: "https://www.google.com/" });
    html = r.text;
    dbg(`skroutz HTTP ${r.status}`);
  } catch (e) { dbg(`skroutz ${e.message}`); return null; }
  if (looksBlocked(html)) { dbg("skroutz blocked"); return null; }
  const m = html.match(/<a[^>]+href=["'](\/s\/\d+\/[^"'#?]+)["']/);
  if (!m) return null;
  const { text: page } = await fetchHtml(`https://www.skroutz.gr${m[1]}`);
  return findOgImage(page);
}

async function obfSource(p) {
  const url = `https://world.openbeautyfacts.org/api/v2/product/${p.barcode}.json?fields=image_front_url,image_url`;
  dbg(`obf GET ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": "SunscreenCatalog/1.0 (github tasosnikitakis/sunscreens-)" } });
  dbg(`obf HTTP ${res.status}`);
  if (!res.ok) return null;
  const j = await res.json();
  if (j.status === 1 && j.product) return j.product.image_front_url || j.product.image_url || null;
  return null;
}

const sources = [
  { name: "manual",        find: manualUrlsSource  },
  { name: "brand-direct",  find: bingSiteSearch    },
  { name: "bing-images",   find: bingImagesSource  },
  { name: "ddg-retailers", find: ddgRetailerSource },
  { name: "skroutz",       find: skroutzSource     },
  { name: "openbeautyfacts", find: obfSource       }
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
    try { await fs.access(path.join(IMG_DIR, `${barcode}.${e}`)); return `${barcode}.${e}`; }
    catch {}
  }
  return null;
}

async function loadManifest() {
  try { return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8")); }
  catch { return {}; }
}
async function saveManifest(m) {
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(m, null, 2) + "\n", "utf8");
  // Also emit a JS form that the site loads synchronously via <script>
  const clean = Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith("_")));
  const js = "// Auto-generated από το scripts/fetch-images.mjs.\n"
           + "// Συγχρονισμένο με images/manifest.json — μην το επεξεργαστείτε χειροκίνητα.\n"
           + "window.IMAGE_MANIFEST = " + JSON.stringify(clean, null, 2) + ";\n";
  await fs.writeFile(MANIFEST_JS_FILE, js, "utf8");
}

async function processProduct(p, manifest, ctx, idx, total) {
  const label = `[${idx}${total ? "/" + total : ""}] ${p.barcode} ${p.name.slice(0, 55).padEnd(55)}`;
  if (DEBUG) console.log(`\n${label}`);
  for (const src of sources) {
    try {
      const url = await src.find(p, ctx);
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
  const manualUrls = await loadManualUrls();
  const manualCount = Object.keys(manualUrls).length;
  if (manualCount) console.log(`Loaded ${manualCount} manual URL(s) from images/urls.json`);
  const ctx = { manualUrls };

  if (TEST) {
    const p = PRODUCTS.find(x => x.barcode === TEST);
    if (!p) { console.error(`Product with barcode ${TEST} not found`); process.exit(1); }
    console.log(`Testing all sources for ${p.barcode} - ${p.name}`);
    const manifest = await loadManifest();
    await processProduct(p, manifest, ctx, 1, 1);
    await saveManifest(manifest);
    return;
  }

  let pool = BRAND ? PRODUCTS.filter(p => p.brand === BRAND) : PRODUCTS;
  if (pool.length === 0) { console.error(`No products for brand=${BRAND}`); process.exit(1); }

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
    const success = await processProduct(p, manifest, ctx, processed, total);
    if (success) { ok++; await saveManifest(manifest); }
    else miss++;

    await sleep(DELAY_MS + Math.random() * 700);
  }

  await saveManifest(manifest);
  console.log(`\nDone. downloaded=${ok}  already-had=${skip}  missed=${miss}`);
  console.log(`Manifest: ${MANIFEST_FILE}`);
  if (miss > 0) {
    console.log(`\nTip: για όσα έλειψαν, μπορείτε να βάλετε direct URLs στο`);
    console.log(`${URLS_FILE} και να ξανατρέξετε το script.`);
  }
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
