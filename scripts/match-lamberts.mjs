#!/usr/bin/env node
// scripts/match-lamberts.mjs
// Ταιριάζει κάθε προϊόν του supplier (js/lamberts-supplier.js) με τη σελίδα
// του στο lamberts.gr (js/lamberts-site.json). Ίδιο workflow με τη Frezyderm:
//
//   1. js/lamberts-manual-matches.json — χειροκίνητες διορθώσεις (barcode → url,
//      ή null = "δεν έχει σελίδα")
//   2. GTIN (αν κάποτε το site το δώσει)
//   3. Fuzzy (scripts/lib-match.mjs) — για τη Lamberts η "ταυτότητα" του προϊόντος
//      είναι το όνομα + η ΔΟΣΟΛΟΓΙΑ (100μg ≠ 1000μg· mcg/μg/MCG ταυτίζονται),
//      ενώ το πλήθος (30tabs/60caps) δεν ξεχωρίζει σελίδα — η ίδια σελίδα
//      καλύπτει συνήθως όλες τις συσκευασίες. Δεύτερο query το όνομα από
//      φαρμακείο (supplemental), που είναι συχνά πιο καθαρό από το Excel.
//
// Έξοδοι:
//   js/lamberts-overrides.js     — name/subtitle/description/claims/sections/image/url ανά barcode
//   lamberts-match-report.csv    — ένα-προς-ένα αναφορά για έλεγχο (Excel)
//   js/lamberts-unmatched.json   — όσα δεν βρέθηκαν
//
// Χρήση:
//   node scripts/match-lamberts.mjs
//   node scripts/match-lamberts.mjs --debug
//   node scripts/match-lamberts.mjs --barcode=5055148404383   # μόνο ένα (δεν γράφει αρχεία)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWindowFile, cleanSiteName, cleanLongDescription, cleanPharmacyName, tabLabel } from "./lib-frezyderm.mjs";
import { createMatcher, STATUS_LABEL, reportCsv, normUrl } from "./lib-match.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUPPLIER_FILE = path.join(ROOT, "js/lamberts-supplier.js");
const SITE_FILE = path.join(ROOT, "js/lamberts-site.json");
const SUPPLEMENTAL_FILE = path.join(ROOT, "js/lamberts-supplemental.js");
const MANUAL_FILE = path.join(ROOT, "js/lamberts-manual-matches.json");
const OUT_FILE = path.join(ROOT, "js/lamberts-overrides.js");
const REPORT_FILE = path.join(ROOT, "lamberts-match-report.csv");
const UNMATCHED_FILE = path.join(ROOT, "js/lamberts-unmatched.json");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const ONLY = opt("barcode", null);
const MIN_SCORE = parseFloat(opt("min-score", "4"));
const HIGH_SCORE = parseFloat(opt("high-score", "9"));

// ----- Brand-specific matching config -----

// Δοσολογία: "1000MCG" / "1000μg" / "1000ΜG" (ελληνικό Μ) / "18.750MG" / "10,000mg" → "1000mcg", "18750mg"
export function extractDosage(s) {
  if (!s) return null;
  const t = String(s).toLowerCase().replace(/[μµ]g|\bug\b/g, "mcg").replace(/(\d)\s?μ/g, "$1mc");
  const m = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s?(mg|mcg|iu|g|gr|ml|billion|bn)\b/);
  if (!m) return null;
  let num = m[1];
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, "");   // 18.750 → 18750
  else num = num.replace(",", ".");
  let unit = m[2];
  if (unit === "gr") unit = "g";
  if (unit === "bn") unit = "billion";
  return num + unit;
}

// Token ποσότητας/πλήθους: κρίνεται χωριστά (δοσολογία) ή αγνοείται (πλήθος)
const QTY_TOKEN = /^\d+([.,]\d+)?(mg|mcg|μg|ug|iu|g|gr|ml|billion|tabs?|tabl|tablets?|caps?|capsules?|sachets?|softgels?|gummies|x\d+)$/i;

const matcher = createMatcher({
  // "B-12" → "B12", "D-3" → "D3", "Co-Enzyme" → "Coenzyme" ώστε να ταυτίζονται με τα ονόματα του site
  // "D3" ≡ "D": ο supplier γράφει "VITAMIN D3 2000iu", το site "Vitamin D 2000iu" (και "Vitamin D3 … & K2")
  normalize: s => s.replace(/\b([A-Za-z])-(\d{1,2})\b/g, "$1$2").replace(/\bco-?enzyme\b/gi, "coenzyme").replace(/\bA-Z\b/g, "AtoZ").replace(/\bD3\b/g, "D"),
  stopwords: new Set([
    "lamberts", "the", "of", "and", "with", "for", "in", "on", "at", "to", "by",
    "και", "με", "για", "σε", "των", "του", "της",
    "en", "el", "gr"
  ]),
  // Πλήθος/συσκευασία/σήμανση Excel: μετράνε αν ταιριάξουν, δεν τιμωρούν αν λείπουν
  packaging: new Set([
    "tabs", "tab", "tabl", "tablets", "tablet", "caps", "cap", "capsules", "capsule", "softgels", "softgel",
    "sachets", "sachet", "gummies", "pack", "bottle", "new", "dig", "min", "x", "χαπια", "τεμ", "τμχ"
  ]),
  abbrev: {
    primr: "primrose", tabl: "tablets", vit: "vitamin", vits: "vitamins", compl: "complex", eff: "effervescent",
    αναβραζοντα: "effervescent", χαπια: "tablets", mcg: "mcg", methilcobalamin: "methylcobalamin",
    aswagandha: "ashwagandha", multivit: "multivitamin", "l": "l"
  },
  formGroups: [
    ["tabs", "tab", "tabl", "tablets", "tablet", "δισκια", "χαπια"],
    ["caps", "cap", "capsules", "capsule", "softgel", "softgels"],
    ["powder", "σκονη"], ["liquid", "syrup", "drops", "σιροπι"],
    ["effervescent", "αναβραζοντα"], ["chewable", "gummies", "μασωμενα"], ["sachets", "sachet"]
  ],
  volumeToken: QTY_TOKEN,
  extractVolume: extractDosage,
  keepSingleLetters: true,   // Vitamin D / E / C / K — το γράμμα είναι η ταυτότητα
  penalties: { miss: parseFloat(opt("miss-penalty", "0.75")), form: parseFloat(opt("form-penalty", "4")), volumeMatch: 4, volumeMismatch: parseFloat(opt("dose-penalty", "6")), extraSite: parseFloat(opt("extra-penalty", "0.2")) }
});

// Σελίδες κατηγοριών/αρχείων που μπήκαν κατά λάθος στο scrape ("… Archives")
function isCategoryPage(sp) {
  return /\barchives?\b/i.test(sp.name || "") || /\/(product-category|product-tag|brand|category)\//i.test(sp.url || "");
}

// Το παλιό sitemap έδωσε /en/product/… ΚΑΙ /product/… για τα ίδια προϊόντα.
// Κρατάμε μία σελίδα ανά slug, με προτίμηση στην ελληνική.
function dedupeSite(site) {
  const bySlug = new Map();
  for (const sp of site) {
    const slug = matcher.slugOf(sp.url).toLowerCase();
    const isEn = /\/en\//i.test(sp.url);
    const cur = bySlug.get(slug);
    if (!cur || (/\/en\//i.test(cur.url) && !isEn)) bySlug.set(slug, sp);
  }
  return [...bySlug.values()];
}

async function main() {
  const supplier = (await loadWindowFile(SUPPLIER_FILE)).LAMBERTS_SUPPLIER || [];
  const supplemental = (await loadWindowFile(SUPPLEMENTAL_FILE)).LAMBERTS_SUPPLEMENTAL || {};
  const rawSite = JSON.parse(await fs.readFile(SITE_FILE, "utf8"));
  if (!rawSite.length) { console.error("Το lamberts-site.json είναι κενό. Τρέξτε πρώτα scripts/scrape-lamberts.mjs."); process.exit(1); }
  for (const sp of rawSite) sp.name = cleanSiteName(sp.name);
  const site = dedupeSite(rawSite.filter(sp => !isCategoryPage(sp)));
  let manual = {};
  try { manual = JSON.parse(await fs.readFile(MANUAL_FILE, "utf8")); } catch {}

  const idf = matcher.buildIdf(site);
  const byGtin = new Map();
  const byUrl = new Map();
  for (const sp of site) {
    if (sp.gtin) byGtin.set(String(sp.gtin).trim(), sp);
    byUrl.set(normUrl(sp.url), sp);
    byUrl.set(normUrl(sp.url.replace(/\/en\//i, "/")), sp);
  }
  console.log(`Site: ${site.length} σελίδες (από ${rawSite.length} με διπλά /en/, ${byGtin.size} με GTIN), IDF λεξιλόγιο ${idf.size} tokens.`);
  console.log(`Supplier: ${supplier.length} προϊόντα · min-score=${MIN_SCORE} high-score=${HIGH_SCORE}\n`);

  const pool = ONLY ? supplier.filter(p => p.barcode === ONLY || (p.variants || []).includes(ONLY)) : supplier;
  const overrides = {};
  const counts = { manual: 0, exact: 0, high: 0, review: 0, skip: 0, "manual-skip": 0 };
  const report = [];
  const unmatched = [];

  for (const p of pool) {
    const barcodes = [p.barcode, ...(p.variants || [])];
    let chosen = null, type = null, score = null;

    if (Object.prototype.hasOwnProperty.call(manual, p.barcode)) {
      const u = manual[p.barcode];
      if (u === null) type = "manual-skip";
      else {
        chosen = byUrl.get(normUrl(u));
        if (chosen) type = "manual";
        else console.warn(`  ! manual url δεν υπάρχει στο site.json για ${p.barcode}: ${u}`);
      }
    }
    if (!chosen && type !== "manual-skip") {
      for (const b of barcodes) { if (byGtin.has(b)) { chosen = byGtin.get(b); type = "exact"; break; } }
    }
    const altName = supplemental[p.barcode] ? cleanPharmacyName(supplemental[p.barcode].name) : null;
    const fz = matcher.fuzzyMatch(p, altName, site, idf);
    if (!chosen && type !== "manual-skip") {
      if (fz.top && fz.top.score >= MIN_SCORE) { chosen = fz.top.site; score = fz.top.score; type = (score >= HIGH_SCORE && !fz.disputed) ? "high" : "review"; }
      else type = "skip";
    }
    counts[type]++;

    if (DEBUG) {
      console.log(`\n[${p.barcode}] ${p.name.slice(0, 60)}  → ${STATUS_LABEL[type]}${altName ? `  (alt: ${altName.slice(0, 50)})` : ""}`);
      for (const c of fz.top3) console.log(`  ${c.score.toFixed(1).padStart(6)} [${c.matched.join(",")}] ${c.site.name.slice(0, 55)} — ${matcher.slugOf(c.site.url)}`);
    } else {
      const tag = { manual: "MAN ", exact: "GTIN", high: "OK  ", review: "REV ", skip: "SKIP", "manual-skip": "SKIP" }[type];
      console.log(`${p.barcode.padEnd(13)} ${tag} ${(score ?? (fz.top ? fz.top.score : 0)).toFixed(1).padStart(6)}  ${p.name.slice(0, 45).padEnd(45)} → ${chosen ? chosen.name.slice(0, 45) : "—"}`);
    }

    if (chosen) {
      const d = chosen.details || {};
      const longText = chosen.longDescription || d.description || "";
      const { description, claims } = cleanLongDescription(longText);
      const subtitle = d.subtitle || (chosen.subtitleSource ? chosen.description : null) || null;
      const highlights = [];
      for (const c of (d.keyFacts || [])) {
        const target = c.length <= 45 ? claims : highlights;
        if (!target.some(x => x.toLowerCase() === c.toLowerCase())) target.push(c);
      }
      const attributes = Object.assign({}, d.attributes || {});
      if (d.size) attributes["Συσκευασία"] = d.size;
      if (d.category) attributes["Κατηγορία lamberts.gr"] = d.category;
      if (d.sku) attributes["SKU"] = d.sku;
      const sections = {};
      for (const [t, text] of Object.entries(d.tabs || {})) if (text) sections[tabLabel(t)] = text;
      overrides[p.barcode] = {
        name: cleanSiteName(d.title || chosen.name),
        subtitle,
        // Χωρίς πλήρη περιγραφή από τη σελίδα, μένει ο υπότιτλος ως περιγραφή (και σημαίνεται ως κοντή)
        description: description || subtitle || null,
        claims,
        highlights,
        attributes,
        sections,
        image: d.imageLarge || chosen.image || null,
        imageFallback: chosen.image || null,
        url: chosen.url,
        source: "lamberts.gr",
        section: chosen.section,
        matchType: type,
        score: score === null ? null : Number(score.toFixed(1)),
        review: type === "review"
      };
    } else {
      unmatched.push({ barcode: p.barcode, name: p.name, status: type, bestScore: fz.top ? Number(fz.top.score.toFixed(1)) : 0, bestName: fz.top ? fz.top.site.name : null, bestUrl: fz.top?.site?.url || null });
    }

    const alt = i => fz.top3[i] ? [fz.top3[i].site.name, fz.top3[i].score.toFixed(1)] : ["", ""];
    report.push([
      p.barcode, p.name, STATUS_LABEL[type], score === null ? "" : score.toFixed(1),
      chosen ? chosen.name : "", chosen ? chosen.url : "",
      ...alt(0), ...alt(1), ...alt(2)
    ]);
  }

  if (ONLY) { console.log("\n(--barcode: δεν γράφω αρχεία)"); return; }

  const banner = "// Auto-generated από το scripts/match-lamberts.mjs — ΜΗΝ το επεξεργάζεστε χειροκίνητα.\n"
    + "// Πηγή: lamberts.gr (js/lamberts-site.json). Διορθώσεις match → js/lamberts-manual-matches.json.\n"
    + "// matchType: manual | exact | high | review (score " + MIN_SCORE + "-" + HIGH_SCORE + ", φαίνεται ως 'Match?')\n"
    + "// Προϊόντα χωρίς εγγραφή εδώ = δεν βρέθηκε σελίδα ('Χωρίς Σελίδα' στο UI, λίστα στο js/lamberts-unmatched.json).\n";
  await fs.writeFile(OUT_FILE, banner + "window.LAMBERTS_OVERRIDES = " + JSON.stringify(overrides, null, 2) + ";\n", "utf8");

  const headers = ["Barcode", "Όνομα supplier", "Κατάσταση", "Score", "Σελίδα lamberts.gr", "URL",
    "Εναλλακτική 1", "Score 1", "Εναλλακτική 2", "Score 2", "Εναλλακτική 3", "Score 3"];
  await fs.writeFile(REPORT_FILE, reportCsv(headers, report), "utf8");
  await fs.writeFile(UNMATCHED_FILE, JSON.stringify(unmatched, null, 2) + "\n", "utf8");

  console.log(`\nΑποτέλεσμα (${pool.length}): manual=${counts.manual}  gtin=${counts.exact}  high=${counts.high}  review=${counts.review}  skip=${counts.skip + counts["manual-skip"]}`);
  console.log(`\nΈγραψε js/lamberts-overrides.js, lamberts-match-report.csv, js/lamberts-unmatched.json.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
