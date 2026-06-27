#!/usr/bin/env node
// scripts/scrape-vican.mjs
// Διαβάζει ολόκληρο τον κατάλογο της vican.gr και παράγει js/vican-data.js.
// Προσέγγιση:
//   1) Φέρνει τη σελίδα /el/proionta.html
//   2) Εντοπίζει όλες τις κατηγορίες (/el/proionta/<slug>.html)
//   3) Για κάθε κατηγορία, παίρνει τα product URLs (paginated)
//   4) Για κάθε product, εξάγει:
//        - barcode (από το τέλος του URL slug: ...-<digits>.html)
//        - όνομα (og:title)
//        - περιγραφή (og:description / meta description)
//        - εικόνα (og:image / JSON-LD Product.image)
//
// Δεν τραβάει χονδρική — μπαίνει 0 και θα συμπληρωθεί από εξωτερικό excel.
//
// Χρήση:
//   node scripts/scrape-vican.mjs                  # πλήρες scraping
//   node scripts/scrape-vican.mjs --debug
//   node scripts/scrape-vican.mjs --limit=20       # για δοκιμή
//   node scripts/scrape-vican.mjs --section=entomoapothitika-antiftheirika

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/vican-data.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const ONLY_SECTION = opt("section", null);
const DELAY_MS = parseInt(opt("delay", "350"));

const BASE = "https://www.vican.gr";
const ROOT_CATEGORY_URL = `${BASE}/el/proionta.html`;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

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
  const title = og("og:title", "twitter:title");
  const description = og("og:description", "description", "twitter:description");
  const image = og("og:image", "twitter:image");
  return { title, description, image };
}

function extractJsonLdProduct(html) {
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
          gtin: node.gtin13 || node.gtin12 || node.gtin || node.gtin8 || null,
          brand: typeof node.brand === "string" ? node.brand : (node.brand && node.brand.name) || null
        };
      }
      if (node["@graph"] && Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
    }
  }
  return null;
}

// Στο vican.gr το barcode είναι το τελευταίο tail digits του slug, π.χ.
// "cer-8-aosmo-entomoapothitiko-spray-5204559030319.html" → 5204559030319.
function barcodeFromUrl(url) {
  const m = url.match(/-(\d{8,14})\.html(?:[?#]|$)/);
  return m ? m[1] : null;
}

// Όνομα κατηγορίας από URL slug: "entomoapothitika-antiftheirika" →
// "Εντομοαπωθητικά / Αντιφθειρικά" (heuristic). Παράγει αναγνώσιμη
// εκδοχή αλλά αργότερα μπορούμε να βάλουμε χειροκίνητα Greek labels.
const SECTION_LABELS = {
  "andriki-peripoiisi": "Ανδρική Περιποίηση",
  "gunaikeia-peripoiisi": "Γυναικεία Περιποίηση",
  "frontida-morou": "Φροντίδα Μωρού",
  "entomoapothitika-antiftheirika": "Εντομοαπωθητικά & Αντιφθειρικά",
  "bitamines-sumpliromata": "Βιταμίνες & Συμπληρώματα",
  "eidiki-frontida": "Ειδική Φροντίδα",
  "peripoiisi-podion": "Περιποίηση Ποδιών",
  "aggeioprostateutika-flebotonika": "Αγγειοπροστατευτικά & Φλεβοτονικά",
  "stomatiki-ugieini": "Στοματική Υγιεινή",
  "antisiptika-apolumantika": "Αντισηπτικά & Απολυμαντικά",
  "diafora": "Διάφορα"
};

function sectionIcons(slug) {
  if (slug === "andriki-peripoiisi") return "🧔";
  if (slug === "gunaikeia-peripoiisi") return "💆‍♀️";
  if (slug === "frontida-morou") return "👶";
  if (slug === "entomoapothitika-antiftheirika") return "🦟";
  if (slug === "bitamines-sumpliromata") return "💊";
  if (slug === "eidiki-frontida") return "✨";
  if (slug === "peripoiisi-podion") return "🦶";
  if (slug === "aggeioprostateutika-flebotonika") return "❤️";
  if (slug === "stomatiki-ugieini") return "🦷";
  if (slug === "antisiptika-apolumantika") return "🧴";
  return "📦";
}

async function discoverSections() {
  let html;
  try { html = await fetchText(ROOT_CATEGORY_URL); }
  catch (e) { console.error(`discovery ${e.message}`); html = ""; }
  const found = new Set();
  // Πιάνουμε και absolute και relative URLs
  const re = /href=["']((?:https?:\/\/[^"'\/]+)?\/el\/proionta\/[^"'#]+\.html)["']/gi;
  for (const m of html.matchAll(re)) {
    let pathOnly = m[1];
    if (pathOnly.startsWith("http")) {
      try { pathOnly = new URL(pathOnly).pathname; } catch { continue; }
    }
    const slug = pathOnly.replace(/^\/el\/proionta\//, "").replace(/\.html$/, "");
    if (slug && !slug.includes("/")) found.add(slug);
  }
  if (found.size === 0) {
    console.error("Δεν εντοπίστηκαν κατηγορίες από HTML — χρησιμοποιώ fallback list.");
    return Object.keys(SECTION_LABELS);
  }
  return [...found];
}

async function discoverProductsInSection(slug) {
  const found = new Set();
  let page = 1;
  while (true) {
    const url = page === 1
      ? `${BASE}/el/proionta/${slug}.html`
      : `${BASE}/el/proionta/${slug}.html?p=${page}`;
    console.error(`section ${slug} page=${page} GET ${url}`);
    let html;
    try { html = await fetchText(url); }
    catch (e) { console.error(`  ${e.message}`); break; }
    const before = found.size;
    // Πιάνουμε absolute + relative URLs
    const re = /href=["']((?:https?:\/\/[^"'\/]+)?\/el\/[^"'#\/?]+\.html)["']/gi;
    for (const m of html.matchAll(re)) {
      let pathOnly = m[1];
      if (pathOnly.startsWith("http")) {
        try { pathOnly = new URL(pathOnly).pathname; } catch { continue; }
      }
      // Φιλτράρουμε out the proionta.html category links and other navigation
      if (pathOnly.startsWith("/el/proionta")) continue;
      if (!barcodeFromUrl(pathOnly)) continue;
      found.add(BASE + pathOnly);
    }
    const gained = found.size - before;
    console.error(`  +${gained} products (total ${found.size})`);
    if (gained === 0) break;
    if (!new RegExp(`[?&]p=${page + 1}\\b`).test(html)) break;
    page++;
    if (page > 50) break;
    await sleep(DELAY_MS);
  }
  return [...found];
}

async function scrapeProduct(url, sectionSlug) {
  const html = await fetchText(url);
  const meta = extractMeta(html);
  const ld = extractJsonLdProduct(html);
  const barcode = barcodeFromUrl(url);
  const name = (ld && ld.name) || meta.title || "";
  const description = (ld && ld.description) || meta.description || "";
  const image = (ld && ld.image) || meta.image || null;
  return {
    barcode,
    section: sectionSlug,
    name: cleanupName(name),
    description: cleanupDescription(description),
    image,
    url
  };
}

function cleanupName(t) {
  if (!t) return "";
  let s = t.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*[\|–\-—]\s*Vican(\.gr)?\s*$/i, "");
  return s;
}

function cleanupDescription(d) {
  if (!d) return "";
  let s = d.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > 600) s = s.slice(0, 597).replace(/\s+\S*$/, "") + "...";
  return s;
}

// ----- Output: js/vican-data.js -----

function jsLiteral(v) {
  return JSON.stringify(v);
}

async function writeDataFile(sections, products) {
  const sectionEntries = sections.map(s => {
    const icon = sectionIcons(s.slug);
    return `  ${jsLiteral(s.slug)}: { slug: ${jsLiteral(s.slug)}, name: ${jsLiteral(s.name)}, icon: ${jsLiteral(icon)}, accent: "#0ea5e9", tagline: ${jsLiteral(s.name)} }`;
  }).join(",\n");

  const productLines = products.map(p => {
    return `  { barcode: ${jsLiteral(p.barcode)}, section: ${jsLiteral(p.section)}, name: ${jsLiteral(p.name)}, description: ${jsLiteral(p.description)}, image: ${jsLiteral(p.image || "")}, url: ${jsLiteral(p.url)}, price: 0 }`;
  }).join(",\n");

  const out =
`// Auto-generated από το scripts/scrape-vican.mjs.
// Πηγή: vican.gr. Χονδρικές συμπληρώνονται από εξωτερικό excel.
// Μην το επεξεργαστείτε χειροκίνητα — θα ξαναγραφτεί στο επόμενο scrape.

window.VICAN_SECTIONS = {
${sectionEntries}
};

window.VICAN_PRODUCTS = [
${productLines}
];

if (typeof window !== "undefined") {
  window.VICAN_BRAND = { name: "Vican", accent: "#0ea5e9", url: "https://www.vican.gr/" };
}
`;
  await fs.writeFile(OUT_FILE, out, "utf8");
}

async function main() {
  console.log("Vican scraper — discovery…");
  const allSlugs = await discoverSections();
  console.log(`Βρέθηκαν ${allSlugs.length} κατηγορίες: ${allSlugs.join(", ")}`);

  const slugs = ONLY_SECTION ? allSlugs.filter(s => s === ONLY_SECTION) : allSlugs;
  if (!slugs.length) { console.error("Καμία κατηγορία προς επεξεργασία"); return; }

  const sectionsOut = [];
  const productsOut = [];
  const seen = new Set();

  for (const slug of slugs) {
    const label = SECTION_LABELS[slug] || slug;
    sectionsOut.push({ slug, name: label });
    console.log(`\n[${slug}] ${label}`);
    const productUrls = await discoverProductsInSection(slug);
    console.log(`  ${productUrls.length} URLs`);
    let n = 0;
    for (const url of productUrls) {
      if (seen.has(url)) continue;
      seen.add(url);
      if (productsOut.length >= LIMIT) break;
      n++;
      try {
        const p = await scrapeProduct(url, slug);
        if (!p.barcode) { dbg(`  no barcode for ${url}`); continue; }
        productsOut.push(p);
        const tag = p.image ? "img+" : "img-";
        console.log(`  [${n}/${productUrls.length}] ${p.barcode} ${tag} ${(p.name || "").slice(0, 60)}`);
      } catch (e) {
        console.log(`  [${n}/${productUrls.length}] ERR ${url} ${e.message}`);
      }
      await sleep(DELAY_MS);
    }
    if (productsOut.length >= LIMIT) break;
  }

  await writeDataFile(sectionsOut, productsOut);
  console.log(`\nDone. sections=${sectionsOut.length}  products=${productsOut.length}.  Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
