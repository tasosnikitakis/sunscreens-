#!/usr/bin/env node
// scripts/match-frezyderm.mjs
// Ταιριάζει κάθε προϊόν του supplier (js/frezyderm-supplier.js) με τη σελίδα
// του στο frezyderm.gr (js/frezyderm-site.json), με τρεις πηγές αλήθειας
// κατά σειρά προτεραιότητας:
//
//   1. js/frezyderm-manual-matches.json  — χειροκίνητες διορθώσεις (barcode → url,
//      ή null = "δεν έχει σελίδα")
//   2. GTIN                               — το JSON-LD πολλών σελίδων δίνει barcode·
//      αν ταιριάζει με barcode/variant του supplier είναι ακριβές match
//   3. Fuzzy (scripts/lib-match.mjs)      — IDF-weighted tokens, με το όνομα από
//      φαρμακείο (supplemental) ως δεύτερο query.
//
// Τα GTIN matches χρησιμοποιούνται και ως ground truth: το script τυπώνει σε
// πόσα από αυτά ο fuzzy matcher θα έβγαζε το ίδιο αποτέλεσμα.
//
// Έξοδοι:
//   js/frezyderm-overrides.js      — name/subtitle/description/claims/sections/image/url ανά barcode
//   frezyderm-match-report.csv     — ένα-προς-ένα αναφορά για έλεγχο (Excel)
//   js/frezyderm-unmatched.json    — όσα δεν βρέθηκαν
//
// Χρήση:
//   node scripts/match-frezyderm.mjs
//   node scripts/match-frezyderm.mjs --debug                 # top-3 ανά προϊόν
//   node scripts/match-frezyderm.mjs --barcode=5202888227554 # μόνο ένα (δεν γράφει αρχεία)
//   node scripts/match-frezyderm.mjs --min-score=7 --high-score=12 --miss-penalty=0.75

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWindowFile, cleanSiteName, cleanLongDescription, cleanPharmacyName, tabLabel, toLargePreset, VOLUME_TOKEN } from "./lib-frezyderm.mjs";
import { createMatcher, STATUS_LABEL, reportCsv, normUrl } from "./lib-match.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUPPLIER_FILE = path.join(ROOT, "js/frezyderm-supplier.js");
const SITE_FILE = path.join(ROOT, "js/frezyderm-site.json");
const SUPPLEMENTAL_FILE = path.join(ROOT, "js/frezyderm-supplemental.js");
const MANUAL_FILE = path.join(ROOT, "js/frezyderm-manual-matches.json");
const OUT_FILE = path.join(ROOT, "js/frezyderm-overrides.js");
const REPORT_FILE = path.join(ROOT, "frezyderm-match-report.csv");
const UNMATCHED_FILE = path.join(ROOT, "js/frezyderm-unmatched.json");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const ONLY = opt("barcode", null);
const MIN_SCORE = parseFloat(opt("min-score", "7"));
const HIGH_SCORE = parseFloat(opt("high-score", "12"));

// ----- Brand-specific matching config -----

function isPromoPackSite(sp) {
  const url = (sp.url || "").toLowerCase();
  const name = (sp.name || "").toLowerCase();
  if (sp.section === "proionta-prosfores") return true;
  if (name.includes("δωρο") || name.includes("δώρο")) return true;
  if (url.includes("δωρο") || url.includes("me-doro") || url.includes("doro")) return true;
  return false;
}
function isPromoPackSupplier(p) {
  const n = (p.name || "").toLowerCase();
  return n.includes("δωρο") || n.includes("δώρο") || n.includes("νεσεσερ")
      || n.includes("νεσσεσαιρ") || n.includes("επιπλεον") || n.includes("δειγμα");
}
function extractVolume(s) {
  if (!s) return null;
  const m = s.toLowerCase().match(/\b(\d{1,4})\s?(ml|gr|g|kg|l|iu|mg|caps|tabs|tablets|patch|amp|amps|shots|φακελ)\b/);
  return m ? m[1] + m[2] : null;
}
function extractSpf(s) {
  const m = String(s || "").match(/\bspf\s*(\d{1,3})\s*(\+)?/i);
  return m ? m[1] + (m[2] || "") : null;
}

const matcher = createMatcher({
  stopwords: new Set([
    "frezyderm", "ml", "gr", "kg", "mg", "iu", "l",
    "the", "of", "for", "and", "with", "in", "on", "at", "to", "by",
    "και", "σε", "για", "με", "ή", "από", "στο", "στη", "στην", "του", "της",
    "gia", "me", "kai", "sto", "sthn", "tou", "ths",
    "en", "fr", "es", "pt", "de", "it", "nl", "pl", "ro", "el"
  ]),
  packaging: new Set([
    "box", "bottle", "sachet", "capsule", "caps", "tabs", "tablets", "tab", "pack", "stick",
    "τεμ", "τμχ", "τεμαχια", "φακ", "φακελακια", "φακελακι", "ατομ", "δισκια", "μασωμενα", "μασωμ"
  ]),
  abbrev: {
    spr: "spray", sh: "shampoo", cr: "cream", cl: "cleaner", hyper: "hypertonic", iso: "isotonic",
    eucal: "eucalyptus", med: "medium", dandr: "dandruff", ef: "effect", vag: "vaginal", emuls: "emulsion",
    lot: "lotion", sol: "solution", susp: "suspension", tooth: "tooth", oint: "ointment", cond: "conditioner",
    moist: "moisturizing", sens: "sensitive", prot: "protective", hydr: "hydrating", ch: "chewable"
  },
  formGroups: [
    ["cream", "cr", "krema", "κρεμα"], ["gel", "τζελ", "γελη"], ["lotion", "milk", "emulsion", "γαλακτωμα"],
    ["serum", "ορος"], ["oil", "λαδι"], ["spray", "spr", "mist", "σπρει"], ["foam", "mousse", "αφρος"],
    ["shampoo", "sh", "σαμπουαν"], ["conditioner"], ["mask", "μασκα"], ["toothpaste", "οδοντοκρεμα"],
    ["mouthwash", "στοματικο"], ["ointment", "αλοιφη"], ["balm", "butter"], ["stick"], ["wipes", "μαντηλακια"],
    ["powder", "πουδρα"], ["patch", "patches"], ["drops", "σταγονες"], ["wash", "cleanser", "cleaner", "καθαριστικο"],
    ["scrub"], ["deodorant", "deo"], ["douche"], ["ovules", "υποθετα"], ["soap", "σαπουνι"], ["fluid"],
    ["capsule", "capsules", "caps", "tabs", "tablets", "sachets", "sticks", "συμπληρωμα", "δισκια", "μασωμενα", "shots"],
    ["monodose", "monodoses", "ampoule", "ampoules", "vials", "αμπουλες"]
  ],
  volumeToken: VOLUME_TOKEN,
  extractVolume, extractSpf,
  isPromoSite: isPromoPackSite, isPromoSupplier: isPromoPackSupplier,
  penalties: { miss: parseFloat(opt("miss-penalty", "0.75")), form: parseFloat(opt("form-penalty", "10")), spf: parseFloat(opt("spf-penalty", "8")) }
});

async function main() {
  const supplier = (await loadWindowFile(SUPPLIER_FILE)).FREZYDERM_SUPPLIER || [];
  const supplemental = (await loadWindowFile(SUPPLEMENTAL_FILE)).FREZYDERM_SUPPLEMENTAL || {};
  const site = JSON.parse(await fs.readFile(SITE_FILE, "utf8"));
  if (!site.length) { console.error("Το frezyderm-site.json είναι κενό. Τρέξτε πρώτα scripts/scrape-frezyderm.mjs."); process.exit(1); }
  for (const sp of site) sp.name = cleanSiteName(sp.name);
  let manual = {};
  try { manual = JSON.parse(await fs.readFile(MANUAL_FILE, "utf8")); } catch {}

  const idf = matcher.buildIdf(site);
  const byGtin = new Map();
  const byUrl = new Map();
  for (const sp of site) {
    if (sp.gtin) byGtin.set(String(sp.gtin).trim(), sp);
    byUrl.set(normUrl(sp.url), sp);
  }
  console.log(`Site: ${site.length} σελίδες (${byGtin.size} με GTIN), IDF λεξιλόγιο ${idf.size} tokens.`);
  console.log(`Supplier: ${supplier.length} προϊόντα · min-score=${MIN_SCORE} high-score=${HIGH_SCORE}\n`);

  const pool = ONLY ? supplier.filter(p => p.barcode === ONLY || (p.variants || []).includes(ONLY)) : supplier;
  const overrides = {};
  const counts = { manual: 0, exact: 0, high: 0, review: 0, skip: 0, "manual-skip": 0 };
  const report = [];
  const unmatched = [];
  let fuzzyChecked = 0, fuzzyAgree = 0;
  const disagreements = [];

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
    if (type === "exact" && fz.top) {
      fuzzyChecked++;
      if (fz.top.site.url === chosen.url && fz.top.score >= MIN_SCORE) fuzzyAgree++;
      else disagreements.push({ barcode: p.barcode, name: p.name, truth: chosen.name, fuzzy: fz.top.site.name, score: fz.top.score });
    }
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
      const { description, claims } = cleanLongDescription(chosen.longDescription || chosen.description || "");
      const d = chosen.details || {};
      const normFact = s => String(s).replace(/\s+/g, " ").replace(/[\s.·]+$/g, "").trim()
        .replace(/^C[EΕ]\s*(\d{3,4})$/i, "CE $1").replace(/^C[EΕ]$/i, "Σήμανση CE");
      const extraClaims = [...(d.keyFacts || []).map(normFact), ...(d.badges || []).map(b => b === "ΝΕΟ" ? "Νέο" : b)]
        .filter(c => c && c !== d.size && !VOLUME_TOKEN.test(c.replace(/\s+/g, "")));
      const allClaims = [...claims];
      const highlights = [];
      for (const c of extraClaims) {
        const target = c.length <= 45 ? allClaims : highlights;
        if (!target.some(x => x.toLowerCase() === c.toLowerCase())) target.push(c);
      }
      const attributes = {};
      if (d.size) attributes["Συσκευασία"] = d.size;
      if (d.category) attributes["Κατηγορία frezyderm.gr"] = d.category;
      if (d.sku) attributes["SKU"] = d.sku;
      const sections = {};
      for (const [t, text] of Object.entries(d.tabs || {})) if (text) sections[tabLabel(t)] = text;
      overrides[p.barcode] = {
        name: cleanSiteName(d.title || chosen.name),
        subtitle: d.subtitle || null,
        description,
        claims: allClaims,
        highlights,
        attributes,
        sections,
        image: d.imageZoom || toLargePreset(d.imageLarge || chosen.image) || null,
        imageFallback: d.imageLarge || chosen.image || null,
        url: chosen.url,
        source: "frezyderm.gr",
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

  const banner = "// Auto-generated από το scripts/match-frezyderm.mjs — ΜΗΝ το επεξεργάζεστε χειροκίνητα.\n"
    + "// Πηγή: frezyderm.gr (js/frezyderm-site.json). Διορθώσεις match → js/frezyderm-manual-matches.json.\n"
    + "// matchType: manual | exact (GTIN) | high | review (score " + MIN_SCORE + "-" + HIGH_SCORE + ", φαίνεται ως 'Match?')\n"
    + "// Προϊόντα χωρίς εγγραφή εδώ = δεν βρέθηκε σελίδα ('Χωρίς Σελίδα' στο UI, λίστα στο js/frezyderm-unmatched.json).\n";
  await fs.writeFile(OUT_FILE, banner + "window.FREZYDERM_OVERRIDES = " + JSON.stringify(overrides, null, 2) + ";\n", "utf8");

  const headers = ["Barcode", "Όνομα supplier", "Κατάσταση", "Score", "Σελίδα frezyderm.gr", "URL",
    "Εναλλακτική 1", "Score 1", "Εναλλακτική 2", "Score 2", "Εναλλακτική 3", "Score 3"];
  await fs.writeFile(REPORT_FILE, reportCsv(headers, report), "utf8");
  await fs.writeFile(UNMATCHED_FILE, JSON.stringify(unmatched, null, 2) + "\n", "utf8");

  console.log(`\nΑποτέλεσμα (${pool.length}): manual=${counts.manual}  gtin=${counts.exact}  high=${counts.high}  review=${counts.review}  skip=${counts.skip + counts["manual-skip"]}`);
  console.log(`Fuzzy validation σε GTIN matches: ${fuzzyAgree}/${fuzzyChecked} συμφωνούν${disagreements.length ? " — διαφωνίες:" : "."}`);
  for (const d of disagreements.slice(0, 15)) console.log(`   ${d.barcode} "${d.name.slice(0, 40)}"  σωστό: ${d.truth.slice(0, 35)}  |  fuzzy: ${d.fuzzy.slice(0, 35)} (${d.score.toFixed(1)})`);
  console.log(`\nΈγραψε js/frezyderm-overrides.js, frezyderm-match-report.csv, js/frezyderm-unmatched.json.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
