#!/usr/bin/env node
// scripts/exclude-frezyderm-boosters-promos.mjs
// Αφαιρεί από το js/frezyderm-supplier.js τα Boosters 5ml (πωλούνται
// μόνο σε set) και τα Promo/νεσεσέρ (bundled seasonal packs). Έτσι δεν
// εμφανίζονται στη σελίδα, στη σελίδα προϊόντος, στα xlsx/csv, στο
// quality report.
//
// Γράφει τη λίστα των αφαιρέσεων στο _debug/frezyderm-excluded.json για
// έλεγχο (barcode + name). Δεν πειράζει overrides/supplemental/manifest —
// αφού το supplier δεν έχει πλέον αυτά τα barcodes, οι consumers δεν
// τα βλέπουν καν.
//
// Χρήση:
//   node scripts/exclude-frezyderm-boosters-promos.mjs           # apply
//   node scripts/exclude-frezyderm-boosters-promos.mjs --dry-run # preview

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUPPLIER_FILE = path.join(ROOT, "js/frezyderm-supplier.js");
const REPORT_FILE = path.join(ROOT, "_debug", "frezyderm-excluded.json");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");

// Patterns που ορίζουν τι δεν θέλουμε στον κατάλογο:
const EXCLUSION_RULES = [
  { name: "booster-5ml",   re: /\bcream\s+booster\s+5\s*ml\b/i,
    reason: "Cream Booster 5ml — πωλείται μόνο σε set" },
  { name: "promo-prefix",  re: /\b(?:promo|frezyderm\s+promo)\b/i,
    reason: "Promo bundle" },
  { name: "nesecer",       re: /νεσεσ[εέ]ρ|νεσσε?σαιρ/i,
    reason: "Νεσεσέρ / bundle" },
  { name: "gift-sample",   re: /δωρο\s+δειγμα|δωρο\s+extra|δωρο\s+επιπλεον|επιπλεον\s+ποσοτητα/i,
    reason: "Προσφορά (δώρο δείγμα / επιπλέον ποσότητα)" }
];

function shouldExclude(p) {
  const name = String(p.name || "");
  for (const rule of EXCLUSION_RULES) {
    if (rule.re.test(name)) return { name: rule.name, reason: rule.reason };
  }
  return null;
}

async function loadSupplier() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(SUPPLIER_FILE, "utf8"), ctx);
  return ctx.window.FREZYDERM_SUPPLIER || [];
}

async function writeSupplier(products) {
  const lines = [];
  lines.push("// Auto-generated από supplier Excel (Frezyderm.xlsx).");
  lines.push("// Φιλτραρισμένο από scripts/exclude-frezyderm-boosters-promos.mjs.");
  lines.push("// Excluded: Boosters 5ml + Promo / νεσεσέρ / δώρο δείγμα.");
  lines.push("//");
  lines.push("// Κάθε product: { barcode, name (supplier), retail, wholesale, variants (extra barcodes) }.");
  lines.push("// Enrichment (ονόματα/περιγραφές/εικόνες από frezyderm.gr) στο js/frezyderm-overrides.js.");
  lines.push("");
  lines.push("window.FREZYDERM_SUPPLIER = [");
  for (let i = 0; i < products.length; i++) {
    const tail = i < products.length - 1 ? "," : "";
    lines.push("  " + JSON.stringify(products[i], null, 0)
      .replace(/,"/g, ', "').replace(/^{"/, '{ "') + tail);
  }
  lines.push("];");
  await fs.writeFile(SUPPLIER_FILE, lines.join("\n") + "\n", "utf8");
}

async function main() {
  const supplier = await loadSupplier();
  const excluded = [];
  const kept = [];

  for (const p of supplier) {
    const hit = shouldExclude(p);
    if (hit) excluded.push({ ...p, _exclusion: hit });
    else kept.push(p);
  }

  console.log(`Total supplier products: ${supplier.length}`);
  console.log(`Excluded:               ${excluded.length}`);
  console.log(`Kept:                   ${kept.length}\n`);

  if (excluded.length === 0) {
    console.log("Δεν εντοπίστηκαν προϊόντα προς αφαίρεση.");
    return;
  }

  console.log(`Excluded breakdown:`);
  const byRule = {};
  for (const e of excluded) {
    const k = e._exclusion.name;
    if (!byRule[k]) byRule[k] = [];
    byRule[k].push(e);
  }
  for (const [rule, items] of Object.entries(byRule)) {
    const label = items[0]._exclusion.reason;
    console.log(`\n  [${rule}] ${label} (${items.length}):`);
    for (const it of items) console.log(`    ${it.barcode.padEnd(13)}  ${it.name}`);
  }

  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await fs.writeFile(REPORT_FILE, JSON.stringify({
    excludedCount: excluded.length,
    keptCount: kept.length,
    excluded: excluded.map(e => ({
      barcode: e.barcode,
      name: e.name,
      rule: e._exclusion.name,
      reason: e._exclusion.reason
    }))
  }, null, 2), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, REPORT_FILE)}.`);

  if (DRY) {
    console.log(`\nDry run — δεν γράφτηκε το ${path.relative(ROOT, SUPPLIER_FILE)}.`);
    return;
  }
  await writeSupplier(kept);
  console.log(`\nΈγραψε ${path.relative(ROOT, SUPPLIER_FILE)} με ${kept.length} προϊόντα.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
