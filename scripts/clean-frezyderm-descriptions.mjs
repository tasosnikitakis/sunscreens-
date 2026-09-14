#!/usr/bin/env node
// scripts/clean-frezyderm-descriptions.mjs
// Καθαρίζει in-place τα descriptions στο js/frezyderm-supplemental.js:
//   • Αφαιρεί το boilerplate suffix του Pharm24 ("...σε προσφορά στο
//     Pharm24.gr. Δωρεάν μεταφορικά σε αγορές άνω των X€…")
//   • Αφαιρεί παρόμοια generic pharmacy suffixes (bestpharmacy, kosmas κ.λπ.)
//   • Δεν κάνει network calls — δουλεύει μόνο πάνω στα υπάρχοντα κείμενα.
//
// Χρήση:
//   node scripts/clean-frezyderm-descriptions.mjs
//   node scripts/clean-frezyderm-descriptions.mjs --dry-run     # δείχνει τι θα άλλαζε

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { cleanPharmacyName } from "./lib-frezyderm.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUP_FILE = path.join(ROOT, "js/frezyderm-supplemental.js");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");

// Patterns για κοινό pharmacy filler που κολλάει στο τέλος του meta description
const SUFFIX_PATTERNS = [
  // Pharm24.gr — "…σε προσφορά στο Pharm24.gr. Δωρεάν μεταφορικά σε αγορές άνω των 69€ για μέλη."
  /\s*σε προσφορά στο\s+Pharm24\.gr\b.*$/is,
  // "Δωρεάν μεταφορικά σε αγορές άνω των X€…" τελικό
  /\s*Δωρε[άα]ν μεταφορικ[άα]\s+σε\s+αγορ[έε]ς\s+[άα]νω των\s*\d+[€\s].*$/is,
  // "Online Pharmacy" tail
  /\s*Online\s+Pharmacy\s*[\-·|]*\s*[A-Za-zΑ-Ωα-ω0-9\s\.\,]{0,80}$/is,
  // Best Price / Skroutz tail markers που κάποιες φορές έρχονται
  /\s*\|\s*Skroutz\.gr\s*$/is,
];

// Καθαρίζει ένα description string· επιστρέφει null αν δεν άλλαξε τίποτα.
function clean(desc) {
  if (!desc) return null;
  let out = desc;
  for (const pat of SUFFIX_PATTERNS) out = out.replace(pat, "");
  out = out.replace(/\s+$/, "").replace(/[·\-\|]\s*$/, "").trim();
  if (out === desc) return null;
  return out || null;
}

async function loadSupplemental() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(SUP_FILE, "utf8"), ctx);
  return ctx.window.FREZYDERM_SUPPLEMENTAL || {};
}

async function saveSupplemental(m) {
  const banner = "// Auto-generated από το scripts/fill-frezyderm-missing.mjs.\n"
               + "// Καθαρίστηκε τελευταία φορά από το scripts/clean-frezyderm-descriptions.mjs.\n"
               + "// Δεν αγγίζουμε — γράφεται από τα scripts.\n";
  await fs.writeFile(SUP_FILE,
    banner + "window.FREZYDERM_SUPPLEMENTAL = " + JSON.stringify(m, null, 2) + ";\n", "utf8");
}

async function main() {
  const sup = await loadSupplemental();
  let changed = 0, namesChanged = 0, samples = [];
  for (const [barcode, rec] of Object.entries(sup)) {
    const cleanedName = cleanPharmacyName(rec.name);
    if (cleanedName && cleanedName !== rec.name) { if (!DRY) rec.name = cleanedName; namesChanged++; }
    const cleaned = clean(rec.description);
    if (cleaned === null) continue;
    if (samples.length < 5) samples.push({ barcode, before: rec.description, after: cleaned });
    if (!DRY) rec.description = cleaned;
    changed++;
  }
  console.log(`Καθαρίστηκαν: ${changed} περιγραφές, ${namesChanged} ονόματα (από ${Object.keys(sup).length} supplemental).\n`);
  for (const s of samples) {
    console.log(`--- ${s.barcode} ---`);
    console.log(`  BEFORE: ${s.before.slice(0, 180)}${s.before.length > 180 ? "…" : ""}`);
    console.log(`  AFTER : ${s.after.slice(0, 180)}${s.after.length > 180 ? "…" : ""}`);
    console.log();
  }
  if (!DRY && (changed || namesChanged)) { await saveSupplemental(sup); console.log("Έγραψε js/frezyderm-supplemental.js."); }
  if (DRY) console.log("(dry-run — δεν έγραψα τίποτα)");
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
