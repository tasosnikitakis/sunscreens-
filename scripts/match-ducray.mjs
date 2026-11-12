#!/usr/bin/env node
// scripts/match-ducray.mjs
// Ταιριάζει κάθε προϊόν του supplier (js/ducray-supplier.js) με τη σελίδα του
// στο ducray.com/gr-gr (js/ducray-site.json). Ίδιο workflow με Frezyderm/Lamberts:
//   1. js/ducray-manual-matches.json (barcode → url, ή null = "δεν έχει σελίδα")
//   2. GTIN από το JSON-LD της σελίδας (ακριβές)
//   3. Fuzzy (scripts/lib-match.mjs) — αν ο supplier έχει γαλλικά ονόματα η
//      ταυτότητα είναι σειρά + μορφή + μέγεθος· συχνά μία σελίδα καλύπτει πολλά μεγέθη.
// Χωρίς Excel (--with-site μόνο) όλα τα barcodes είναι GTIN σελίδων → ακριβές match.
//
// Έξοδοι: js/ducray-overrides.js · ducray-match-report.csv · js/ducray-unmatched.json
//
// Χρήση:
//   node scripts/match-ducray.mjs            # όλα
//   node scripts/match-ducray.mjs --debug    # top-3 ανά προϊόν
//   node scripts/match-ducray.mjs --barcode=3282770141320

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWindowFile, cleanSiteName, cleanLongDescription, cleanPharmacyName, tabLabel } from "./lib-frezyderm.mjs";
import { createMatcher, STATUS_LABEL, reportCsv, normUrl } from "./lib-match.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BRAND = "ducray";
const SUPPLIER_FILE = path.join(ROOT, `js/${BRAND}-supplier.js`);
const SITE_FILE = path.join(ROOT, `js/${BRAND}-site.json`);
const SUPPLEMENTAL_FILE = path.join(ROOT, `js/${BRAND}-supplemental.js`);
const MANUAL_FILE = path.join(ROOT, `js/${BRAND}-manual-matches.json`);
const OUT_FILE = path.join(ROOT, `js/${BRAND}-overrides.js`);
const REPORT_FILE = path.join(ROOT, `${BRAND}-match-report.csv`);
const UNMATCHED_FILE = path.join(ROOT, `js/${BRAND}-unmatched.json`);

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);
const DEBUG = flag("debug");
const ONLY = opt("barcode", null);
const MIN_SCORE = parseFloat(opt("min-score", "9"));
const HIGH_SCORE = parseFloat(opt("high-score", "14"));

// Σειρά προϊόντος → ενότητα καταλόγου (js/ducray-sections.js). Κρίνεται από το
// slug της σελίδας (λατινική μεταγραφή) + το όνομα supplier/σελίδας + breadcrumb.
const LINE_RULES = [
  ["keracnyl",   /keracnyl/i],
  ["melascreen", /melascreen/i],
  ["anacaps",    /anacaps/i],
  ["anaphase",   /anaphase|creastim|neoptide|trihoptos|τριχοπτ/i],
  ["kelual",     /kelual/i],
  ["squanorm",   /squanorm/i],
  ["kertyol",    /kertyol|p-s-o|pso/i],
  ["sensinol",   /sensinol/i],
  ["sabal",      /sabal|argeal/i],
  ["elution",    /elution|extra-gentle|extra-doux|nutricerat|densiage/i],
  ["dexyane",    /dexyane|ictyane/i],
  ["hidrosis",   /hidrosis/i],
  ["diaseptyl",  /diaseptyl/i]
];
// Όνομα προϊόντος = <title> της σελίδας (σειρά + προϊόν). Αν ο τίτλος SEO δεν
// αναφέρει τη σειρά ("Λοσιόν αγωγής κατά της τριχόπτωσης", σειρά CREASTIM REACTIV)
// προτάσσουμε τη σειρά (χωρίς τις λέξεις κατηγορίας "Πρόσωπο"/"Μαλλιά").
function siteProductName(d, fallback) {
  const title = d.fullTitle || d.title || fallback || "";
  const line = String(d.line || "").replace(/\s+(Πρόσωπο|Μαλλιά|Σώμα)\s*$/i, "").trim();
  const first = line.split(/\s+/)[0] || "";
  if (!line || !first || first.length < 3) return title;
  const norm = x => x.toLowerCase().replace(/[^a-zα-ωά-ώ0-9]/gi, "");
  return norm(title).includes(norm(first)) ? title : `${line} ${title}`;
}
const lineOf = (...texts) => { const s = texts.filter(Boolean).join(" | "); return (LINE_RULES.find(([, re]) => re.test(s)) || ["diafora"])[0]; };
const gtin13 = g => { const d = String(g || "").replace(/\D/g, ""); return d.length === 14 && d[0] === "0" ? d.slice(1) : (d.length === 13 ? d : null); };

function extractVolume(s) {
  if (!s) return null;
  const m = String(s).toLowerCase().match(/\b(\d{1,4})\s?(ml|gr|g|kg|l)\b/);
  return m ? m[1] + (m[2] === "gr" ? "g" : m[2]) : null;
}
function extractSpf(s) {
  const m = String(s || "").match(/\bspf\s*(\d{1,3})\s*(\+)?/i);
  return m ? m[1] + (m[2] || "") : null;
}

const matcher = createMatcher({
  // "P.S.O." → "PSO", "ANAPHASE+" → "ANAPHASE", "SPF50+" → "SPF 50+"
  normalize: s => s.replace(/\bP\.?S\.?O\.?(?=\s|$)/gi, "PSO").replace(/\+/g, " ").replace(/\b(SPF)\s*(\d)/gi, "$1 $2"),
  stopwords: new Set([
    "ducray", "ml", "gr", "g", "l",
    "the", "of", "and", "with", "for", "in", "de", "la", "le", "les", "des", "du", "et", "pour", "au", "aux", "a",
    "και", "με", "για", "σε", "αντλια", "τεμ", "τμχ",
    "el", "en", "fr"
  ]),
  packaging: new Set(["rp", "nc", "pump", "pompe", "αντλια", "recharge", "refill", "pack", "duo", "lot", "promo"]),
  abbrev: {
    cr: "creme", crm: "creme", emoliente: "emolliente", nettoyant: "nettoyante", purifiant: "purifiante",
    rafraichissant: "rafraichissante", nutritif: "nutritive", douceur: "douceur", soin: "soin",
    moussant: "moussante", lavant: "lavante", compensatrice: "compensatrice", severes: "severes"
  },
  formGroups: [
    ["creme", "cream", "κρεμα", "cica"], ["baume", "balm"], ["lait", "milk", "γαλακτωμα"], ["gel", "τζελ"],
    ["huile", "oil", "λαδι"], ["spray", "brume", "σπρει"], ["mousse", "foam", "αφρος"], ["stick"],
    ["lotion", "eau", "νερο"], ["shampooing", "shampoo", "σαμπουαν"], ["pain", "soap", "savon", "σαπουνι"],
    ["serum", "ορος"], ["masque", "mask", "μασκα"], ["poudre", "powder"]
  ],
  volumeToken: /^\d+([.,]\d+)?(ml|gr|g|kg|l|x\d+)$/i,
  extractVolume, extractSpf,
  keepSingleLetters: false,
  penalties: {
    miss: parseFloat(opt("miss-penalty", "0.75")), form: parseFloat(opt("form-penalty", "6")), spf: parseFloat(opt("spf-penalty", "8")),
    volumeMatch: 2, volumeMismatch: parseFloat(opt("volume-penalty", "1")), extraSite: 0.15
  }
});

async function main() {
  const supplier = (await loadWindowFile(SUPPLIER_FILE))[`${BRAND.toUpperCase()}_SUPPLIER`] || [];
  const supplemental = (await loadWindowFile(SUPPLEMENTAL_FILE))[`${BRAND.toUpperCase()}_SUPPLEMENTAL`] || {};
  const site = JSON.parse(await fs.readFile(SITE_FILE, "utf8"));
  if (!site.length) { console.error(`Το js/${BRAND}-site.json είναι κενό. Τρέξτε πρώτα: node scripts/scrape-brand.mjs --brand=${BRAND}`); process.exit(1); }
  for (const sp of site) sp.name = cleanSiteName(sp.name);
  let manual = {};
  try { manual = JSON.parse(await fs.readFile(MANUAL_FILE, "utf8")); } catch {}

  const idf = matcher.buildIdf(site);
  const byGtin = new Map(), byUrl = new Map();
  for (const sp of site) {
    // GTIN: το JSON-LD δίνει 14ψήφιο με 0 μπροστά ("03282770072730"), το URL το 13ψήφιο
    const g = gtin13(sp.gtin) || gtin13((sp.url.match(/-(\d{13})-[a-z0-9]+\/?$/i) || [])[1]);
    if (g) { sp.gtin = g; byGtin.set(g, sp); }
    byUrl.set(normUrl(sp.url), sp);
  }
  console.log(`Site: ${site.length} σελίδες (${byGtin.size} με GTIN), IDF λεξιλόγιο ${idf.size} tokens.`);
  console.log(`Supplier: ${supplier.length} προϊόντα · min-score=${MIN_SCORE} high-score=${HIGH_SCORE}\n`);

  const pool = ONLY ? supplier.filter(p => p.barcode === ONLY || (p.variants || []).includes(ONLY)) : supplier;
  const overrides = {};
  const counts = { manual: 0, exact: 0, high: 0, review: 0, skip: 0, "manual-skip": 0 };
  const report = [], unmatched = [];
  let fuzzyChecked = 0, fuzzyAgree = 0;

  for (const p of pool) {
    const barcodes = [p.barcode, ...(p.variants || [])];
    let chosen = null, type = null, score = null;

    if (Object.prototype.hasOwnProperty.call(manual, p.barcode) && !p.barcode.startsWith("_")) {
      const u = manual[p.barcode];
      if (u === null) type = "manual-skip";
      else { chosen = byUrl.get(normUrl(u)); if (chosen) type = "manual"; else console.warn(`  ! manual url δεν υπάρχει στο site.json για ${p.barcode}: ${u}`); }
    }
    if (!chosen && type !== "manual-skip") {
      for (const b of barcodes) { if (byGtin.has(b)) { chosen = byGtin.get(b); type = "exact"; break; } }
    }
    const altName = supplemental[p.barcode] ? cleanPharmacyName(supplemental[p.barcode].name) : null;
    const fz = matcher.fuzzyMatch(p, altName, site, idf);
    if (type === "exact" && fz.top) { fuzzyChecked++; if (fz.top.site.url === chosen.url && fz.top.score >= MIN_SCORE) fuzzyAgree++; }
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
      const { description, claims } = cleanLongDescription(d.description || chosen.longDescription || chosen.description || "");
      // Πλεονεκτήματα (bullets της σελίδας) → "Βασικά χαρακτηριστικά"· σύντομα claims → pills
      const highlights = [...(d.advantages || [])];
      for (const c of (d.keyFacts || [])) { const t = c.length <= 45 ? claims : highlights; if (!t.some(x => x.toLowerCase() === c.toLowerCase())) t.push(c); }
      const attributes = Object.assign({}, d.attributes || {});
      // Μέγεθος: του supplier αν το ξέρουμε (η σελίδα καλύπτει πολλά μεγέθη), αλλιώς της σελίδας
      const supplierVol = extractVolume(p.name);
      if (supplierVol) attributes["Συσκευασία"] = supplierVol.replace(/g$/, "g");
      else if (d.size) attributes["Συσκευασία"] = d.size;
      if (d.category) attributes["Κατηγορία ducray.com"] = d.category;
      if (d.line) attributes["Σειρά"] = d.line;
      const sections = {};
      for (const [t, text] of Object.entries(d.tabs || {})) if (text) sections[tabLabel(t)] = text;
      const slug = chosen.url.split("/p/")[1] || chosen.url;
      overrides[p.barcode] = {
        name: cleanSiteName(siteProductName(d, chosen.name)),
        subtitle: d.subtitle || chosen.subtitle || d.shortDescription || null,
        description: description || d.shortDescription || null,
        claims, highlights, attributes, sections,
        image: d.imageLarge || chosen.image || null,
        imageFallback: chosen.image || null,
        images: d.images || null,
        url: chosen.url,
        source: "ducray.com",
        section: lineOf(slug, d.line, chosen.name, (d.breadcrumbs || []).join(" "), p.name),
        matchType: type,
        score: score === null ? null : Number(score.toFixed(1)),
        review: type === "review"
      };
    } else {
      unmatched.push({ barcode: p.barcode, name: p.name, status: type, bestScore: fz.top ? Number(fz.top.score.toFixed(1)) : 0, bestName: fz.top ? fz.top.site.name : null, bestUrl: fz.top?.site?.url || null });
    }
    const alt = i => fz.top3[i] ? [fz.top3[i].site.name, fz.top3[i].score.toFixed(1)] : ["", ""];
    report.push([p.barcode, p.name, STATUS_LABEL[type], score === null ? "" : score.toFixed(1), chosen ? chosen.name : "", chosen ? chosen.url : "", ...alt(0), ...alt(1), ...alt(2)]);
  }

  if (ONLY) { console.log("\n(--barcode: δεν γράφω αρχεία)"); return; }
  const banner = `// Auto-generated από το scripts/match-${BRAND}.mjs — ΜΗΝ το επεξεργάζεστε χειροκίνητα.\n`
    + `// Πηγή: ducray.com/gr-gr (js/${BRAND}-site.json). Διορθώσεις match → js/${BRAND}-manual-matches.json.\n`
    + `// matchType: manual | exact (GTIN) | high | review (score ${MIN_SCORE}-${HIGH_SCORE}, 'Match?')\n`
    + `// Προϊόντα χωρίς εγγραφή εδώ = δεν βρέθηκε σελίδα ('Χωρίς Σελίδα', λίστα στο js/${BRAND}-unmatched.json).\n`;
  await fs.writeFile(OUT_FILE, banner + `window.${BRAND.toUpperCase()}_OVERRIDES = ` + JSON.stringify(overrides, null, 2) + ";\n", "utf8");
  const headers = ["Barcode", "Όνομα supplier", "Κατάσταση", "Score", "Σελίδα ducray.com", "URL", "Εναλλακτική 1", "Score 1", "Εναλλακτική 2", "Score 2", "Εναλλακτική 3", "Score 3"];
  await fs.writeFile(REPORT_FILE, reportCsv(headers, report), "utf8");
  await fs.writeFile(UNMATCHED_FILE, JSON.stringify(unmatched, null, 2) + "\n", "utf8");
  console.log(`\nΑποτέλεσμα (${pool.length}): manual=${counts.manual}  gtin=${counts.exact}  high=${counts.high}  review=${counts.review}  skip=${counts.skip + counts["manual-skip"]}`);
  if (fuzzyChecked) console.log(`Fuzzy validation σε GTIN matches: ${fuzzyAgree}/${fuzzyChecked} συμφωνούν.`);
  console.log(`\nΈγραψε js/${BRAND}-overrides.js, ${BRAND}-match-report.csv, js/${BRAND}-unmatched.json.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
