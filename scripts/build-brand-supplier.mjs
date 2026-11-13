#!/usr/bin/env node
// scripts/build-brand-supplier.mjs
// Supplier Excel (χονδρικός κατάλογος προμηθευτή) → js/<brand>-supplier.js
//   window.<BRAND>_SUPPLIER = [{ barcode, name, retail, wholesale, variants[] }]
//
// Διαβάζει το xlsx χωρίς εξαρτήσεις (unzip + sharedStrings), όπως το
// parse-cosmetics-xlsx.mjs. Προεπιλεγμένη διάταξη στηλών (A-Derma):
//   A κωδικός · B barcode · C όνομα · D λιανική · E χονδρική · F variants ("a , b")
//
// Χρήση:
//   node scripts/build-brand-supplier.mjs --brand=aderma --xlsx=Aderma.xlsx
//   node scripts/build-brand-supplier.mjs --brand=aderma --xlsx=Aderma.xlsx --cols=code,barcode,name,retail,wholesale,variants --skip=0
//   node scripts/build-brand-supplier.mjs --brand=aderma --xlsx=Aderma.xlsx --with-site
//       → προσθέτει ΚΑΙ τα προϊόντα του js/<brand>-site.json που δεν υπάρχουν στο Excel
//         (listed:false, χωρίς τιμές) — ο κατάλογος δείχνει όλη τη γκάμα του brand site
//   node scripts/build-brand-supplier.mjs --brand=ducray --xlsx=Ducray.tsv --with-site   (δέχεται και tsv/csv)
//   node scripts/build-brand-supplier.mjs --brand=ducray --with-site
//       → ΧΩΡΙΣ Excel: όλος ο κατάλογος από το site (όλα listed:false). Όταν έρθει ο
//         τιμοκατάλογος, ξανατρέξτε με --xlsx=… --with-site και οι τιμές συμπληρώνονται.
//   --dry-run  δείχνει τι θα γραφτεί

import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const BRAND = (opt("brand", "") || "").toLowerCase();
const XLSX = opt("xlsx", null);
// Προεπιλεγμένη διάταξη στηλών ανά brand (τα Excel Frezyderm/Lamberts δεν έχουν στήλη κωδικού)
const DEFAULT_COLS = { frezyderm: "barcode,name,retail,wholesale,variants", lamberts: "barcode,name,retail,wholesale,variants" };
const COLS = opt("cols", DEFAULT_COLS[(opt("brand", "") || "").toLowerCase()] || "code,barcode,name,retail,wholesale,variants").split(",").map(s => s.trim());
const SKIP = parseInt(opt("skip", "0"));
const DRY = flag("dry-run");
const WITH_SITE = flag("with-site");
const SITE_FILE = path.join(ROOT, `js/${BRAND}-site.json`);
const DISCONTINUED_FILE = path.join(ROOT, `js/${BRAND}-discontinued.json`);   // barcode → {name, reason, …}
const EXCLUSIONS_FILE = path.join(ROOT, `js/${BRAND}-exclusions.json`);         // { rules: [{ name, pattern, flags?, reason }] } — κανόνες ονόματος (promo, boosters…)
const gtin13 = g => { const raw = String(g || "").trim(); if (/^[A-Z]{2,5}-[A-Za-z0-9]{4,}$/.test(raw)) return raw;   // συνθετικό κλειδί (π.χ. LRP-CA024786) για προϊόντα χωρίς EAN στο site
  const d = raw.replace(/\D/g, ""); return d.length === 14 && d[0] === "0" ? d.slice(1) : (d.length === 13 || d.length === 8 ? d : null); };   // EAN-13 ή EAN-8 (30102415)
if (!BRAND || (!XLSX && !WITH_SITE)) { console.error("Usage: node scripts/build-brand-supplier.mjs --brand=<key> --xlsx=<file.xlsx> [--with-site] [--cols=...] [--skip=N]\n       node scripts/build-brand-supplier.mjs --brand=<key> --with-site   (μόνο από το brand site, χωρίς Excel/τιμές)"); process.exit(1); }

const OUT_FILE = path.join(ROOT, `js/${BRAND}-supplier.js`);
const VAR = BRAND.toUpperCase() + "_SUPPLIER";

// Γνωστά λάθη κωδικοποίησης του Excel του προμηθευτή (Latin-1 → "?")
const NAME_FIXES = [
  [/CR\?ME/g, "CRÈME"], [/CREME/g, "CRÈME"], [/CR\?/g, "CRÈ"],
  [/\?\s*/g, "? "]
];

function decodeXml(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

// Τιμοκατάλογος σε tsv/csv (επικόλληση από Excel): ίδιες στήλες με το --cols
async function readDelimited(file) {
  const text = (await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "");
  const sep = text.includes("\t") ? "\t" : ";";
  return text.split(/\r?\n/).filter(l => l.trim()).map(line => {
    const cells = {}; line.split(sep).forEach((v, i) => { cells[colLetter(i)] = v.trim(); }); return cells;
  });
}

async function readSheet(file) {
  if (/\.(tsv|csv|txt)$/i.test(file)) return readDelimited(file);
  const tmp = path.join("/tmp", "_xlsx_" + process.pid);
  execSync(`rm -rf "${tmp}" && mkdir -p "${tmp}" && unzip -q -o "${file}" -d "${tmp}"`);
  let strings = [];
  try {
    const sst = await fs.readFile(`${tmp}/xl/sharedStrings.xml`, "utf8");
    for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      strings.push(decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join("")));
    }
  } catch {}
  const sheet = await fs.readFile(`${tmp}/xl/worksheets/sheet1.xml`, "utf8");
  const rows = [];
  for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cm of rm[1].matchAll(/<c\s+r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = cm[1], attrs = cm[2], body = cm[3];
      const type = (attrs.match(/\st="([^"]*)"/) || [])[1];
      let v = (body.match(/<v>([^<]*)<\/v>/) || [])[1];
      if (v === undefined) v = (body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "";
      if (type === "s") v = strings[parseInt(v)] ?? "";
      else v = decodeXml(v);
      cells[col] = v.trim();
    }
    if (Object.keys(cells).length) rows.push(cells);
  }
  execSync(`rm -rf "${tmp}"`);
  return rows;
}

const colLetter = i => String.fromCharCode(65 + i);
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const isBarcode = v => /^\d{8,14}$/.test(String(v).trim());

function fixName(s) {
  let out = String(s).replace(/\s+/g, " ").trim();
  for (const [re, rep] of NAME_FIXES) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
}

async function main() {
  const rows = XLSX ? await readSheet(path.resolve(ROOT, XLSX)) : [];
  // Αποσυρμένα προϊόντα (js/<brand>-discontinued.json) μένουν εκτός καταλόγου —
  // παρακολουθούνται στη σημείωση ελέγχου (scripts/discontinued-report.mjs).
  let discontinued = {};
  try { discontinued = JSON.parse(await fs.readFile(DISCONTINUED_FILE, "utf8")); } catch {}
  const isDiscontinued = bc => !!discontinued[bc] && !String(bc).startsWith("_");
  let dropped = 0;
  // Κανόνες αποκλεισμού με βάση το όνομα (js/<brand>-exclusions.json): promo πακέτα, νεσεσέρ, boosters 5ml…
  let exclusionRules = [];
  try { exclusionRules = (JSON.parse(await fs.readFile(EXCLUSIONS_FILE, "utf8")).rules || []).map(r => ({ ...r, re: new RegExp(r.pattern, r.flags || "i") })); } catch {}
  const excludedBy = name => exclusionRules.find(r => r.re.test(name));
  const excluded = [];
  const byBarcode = new Map();
  const dupes = [];
  let skippedHeader = 0;
  for (const r of rows.slice(SKIP)) {
    const get = name => r[colLetter(COLS.indexOf(name))] ?? "";
    const barcode = String(get("barcode")).trim();
    if (!isBarcode(barcode)) { skippedHeader++; continue; }   // κεφαλίδα ή κενή γραμμή
    if (isDiscontinued(barcode)) { dropped++; continue; }
    const name = fixName(get("name"));
    const ex = excludedBy(name);
    if (ex) { excluded.push({ barcode, name, rule: ex.name }); continue; }
    const variants = [...new Set([barcode, ...String(get("variants")).split(/[\s,;]+/).filter(isBarcode)])];
    const rec = { barcode, name, retail: num(get("retail")), wholesale: num(get("wholesale")), variants };
    if (byBarcode.has(barcode)) {
      // Ίδιο barcode δύο φορές (πχ. δύο τιμοκατάλογοι) — κρατάμε την πρώτη γραμμή,
      // ενώνουμε variants, και το σημειώνουμε.
      const prev = byBarcode.get(barcode);
      prev.variants = [...new Set([...prev.variants, ...variants])];
      dupes.push({ barcode, kept: `${prev.retail}/${prev.wholesale}`, dropped: `${rec.retail}/${rec.wholesale}` });
      continue;
    }
    byBarcode.set(barcode, rec);
  }
  const products = [...byBarcode.values()];
  console.log(`${XLSX || "(χωρίς Excel)"}: ${rows.length} γραμμές → ${products.length} προϊόντα (${skippedHeader} γραμμές χωρίς barcode, ${dupes.length} διπλά barcode${dropped ? `, ${dropped} αποσυρμένα εκτός` : ""})`);

  // Προϊόντα του brand site που λείπουν από τον τιμοκατάλογο: μπαίνουν χωρίς τιμές
  // (listed:false), με barcode το GTIN της σελίδας, ώστε το match να είναι ακριβές.
  let fromSite = 0;
  if (WITH_SITE) {
    let site = [];
    try { site = JSON.parse(await fs.readFile(SITE_FILE, "utf8")); } catch { console.warn(`  ! δεν βρέθηκε ${path.relative(ROOT, SITE_FILE)} — τρέξτε πρώτα scrape-brand.mjs --brand=${BRAND}`); }
    const known = new Set(products.flatMap(p => p.variants));
    // Χειροκίνητα match (js/<brand>-manual-matches.json: barcode → url): το προϊόν του τιμοκαταλόγου
    // ΕΙΝΑΙ το προϊόν της σελίδας (νέος κωδικός/νέα ονομασία). Το EAN της σελίδας μπαίνει ως variant
    // του προϊόντος, ώστε να μην προστεθεί δεύτερη (άτιμη) εγγραφή για την ίδια σελίδα.
    // Σε σελίδες με πολλά μεγέθη (δικό τους EAN) παίρνουμε μόνο το μέγεθος που αναφέρει το όνομα.
    let manual = {};
    try { manual = JSON.parse(await fs.readFile(path.join(ROOT, `js/${BRAND}-manual-matches.json`), "utf8")); } catch {}
    const normUrl = u => String(u || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
    const siteByUrl = new Map(site.map(sp => [normUrl(sp.url), sp]));
    const sizeOf = s => { const m = String(s || "").match(/(\d{1,4}(?:[.,]\d+)?)\s?(ml|gr|g|kg|l|τμχ|caps|tabs)\b/i); return m ? (m[1].replace(",", ".") + m[2].toLowerCase().replace("gr", "g")).replace(/^(\d+)l$/, "$1000ml") : null; };
    let aliased = 0;
    for (const p of products) {
      const u = manual[p.barcode];
      const sp = u ? siteByUrl.get(normUrl(u)) : null;
      if (!sp) continue;
      const vars = ((sp.details && sp.details.variants) || []).map(v => ({ g: gtin13(v.ean), size: v.size ? sizeOf(v.size) : null })).filter(v => v.g);
      let g = null;
      if (vars.length <= 1) g = (vars[0] && vars[0].g) || gtin13(sp.gtin);
      else { const ps = sizeOf(p.name); const hit = vars.filter(v => v.size === ps); if (hit.length === 1) g = hit[0].g; }
      if (!g || known.has(g)) continue;
      p.variants.push(g); known.add(g); aliased++;
    }
    if (aliased) console.log(`  ${aliased} EAN σελίδων μπήκαν ως variants προϊόντων του τιμοκαταλόγου (χειροκίνητα match — χωρίς διπλή εγγραφή)`);
    let unpriced = 0;
    const siteExcluded = [];
    for (const sp of site) {
      const name = String(sp.name || "").replace(/\s+/g, " ").trim();
      const allVars = (sp.details && sp.details.variants) || [];
      // Σελίδες χωρίς τιμή πώλησης στο site (Shopify: όλες οι παραλλαγές price 0 = δώρα, promo,
      // κρυφές/παλιές σελίδες) δεν μπαίνουν ως «νέα» προϊόντα. Ισχύει μόνο όταν το site δίνει τιμές.
      if (allVars.length && allVars.every(v => typeof v.price === "number") && !allVars.some(v => v.price > 0)) { unpriced++; continue; }
      const ex = excludedBy(name);
      if (ex) { siteExcluded.push({ name, rule: ex.name }); continue; }
      // Σελίδες με πολλές παραλλαγές (μεγέθη με δικό τους EAN, π.χ. larocheposay.gr):
      // μία εγγραφή ανά παραλλαγή, με το μέγεθος στο όνομα.
      const vars = allVars.map(v => ({ g: gtin13(v.ean), size: v.size || "" })).filter(v => v.g);
      const entries = vars.length ? vars : [{ g: gtin13(sp.gtin) || gtin13((sp.url.match(/-(\d{13})-[a-z0-9]+\/?$/i) || [])[1]), size: "" }];
      for (const { g, size } of entries) {
        if (!g || known.has(g) || isDiscontinued(g)) continue;
        known.add(g);
        const nm = size && !new RegExp(size.replace(/\s+/g, "\\s*"), "i").test(name) ? `${name} ${size}` : name;
        products.push({ barcode: g, name: nm, retail: 0, wholesale: 0, variants: [g], listed: false });
        fromSite++;
      }
    }
    console.log(`  + ${fromSite} προϊόντα από το ${BRAND}.gr που δεν υπάρχουν στο Excel (listed:false, χωρίς τιμές)`
      + (unpriced ? `; ${unpriced} σελίδες χωρίς τιμή πώλησης στο site (δώρα/promo/κρυφές) εκτός` : "")
      + (siteExcluded.length ? `; ${siteExcluded.length} εκτός με κανόνες ονόματος` : ""));
  }
  for (const d of dupes) console.log(`  διπλό ${d.barcode}: κράτησα λιανική/χονδρική ${d.kept}, αγνόησα ${d.dropped}`);
  if (excluded.length) { const by = {}; for (const e of excluded) by[e.rule] = (by[e.rule] || 0) + 1; console.log(`  εκτός με κανόνες ονόματος (js/${BRAND}-exclusions.json): ${excluded.length} — ` + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")); }
  const fixed = products.filter(p => /È/.test(p.name)).length;
  if (fixed) console.log(`  διορθώθηκε κωδικοποίηση (CRÈME) σε ${fixed} ονόματα`);
  if (DRY) { for (const p of products) console.log(`  ${p.barcode} ${p.name} | ${p.retail} / ${p.wholesale} | ${p.variants.join(",")}`); return; }

  const banner = (XLSX
      ? `// Auto-generated από supplier Excel (${path.basename(XLSX)}) με το scripts/build-brand-supplier.mjs${WITH_SITE ? " --with-site" : ""}.\n// Πηγή: χονδρικός κατάλογος του προμηθευτή. Δεν επεξεργάζεται χειροκίνητα.\n`
      : `// Auto-generated από το brand site (js/${BRAND}-site.json) με το scripts/build-brand-supplier.mjs --with-site — ΧΩΡΙΣ Excel προμηθευτή (όλα χωρίς τιμές).\n// Δεν επεξεργάζεται χειροκίνητα. Όταν υπάρξει τιμοκατάλογος: --xlsx=… --with-site.\n`)
    + (WITH_SITE ? `// listed:false = υπάρχει στο brand site αλλά όχι στον τιμοκατάλογο (χωρίς τιμές).\n` : "")
    + (dropped ? `// Αποσυρμένα (εξαιρούνται): js/${BRAND}-discontinued.json.\n` : "")
    + (excluded.length ? `// Εκτός με κανόνες ονόματος (promo/boosters…): js/${BRAND}-exclusions.json (${excluded.length}).\n` : "") + "//\n"
    + `// Enrichment (ονόματα/περιγραφές/εικόνες από το brand site) στο js/${BRAND}-overrides.js.\n\n`;
  const body = products.map(p => "  " + JSON.stringify(p)).join(",\n");
  await fs.writeFile(OUT_FILE, `${banner}window.${VAR} = [\n${body}\n];\n`, "utf8");
  console.log(`Έγραψε ${path.relative(ROOT, OUT_FILE)} (${products.length}).`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
