#!/usr/bin/env node
// scripts/build-cosmetics-data.mjs
// Διαβάζει το /tmp/cosmetics-raw.json (από parse-cosmetics-xlsx.mjs) και παράγει
// το js/cosmetics-data.js με την ίδια δομή όπως το js/data.js των αντηλιακών.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW = "/tmp/cosmetics-raw.json";
const OUT = path.join(ROOT, "js/cosmetics-data.js");

// Master brand → key + display config
const BRAND_DEF = {
  "Vichy": {
    key: "vichy",
    name: "Vichy",
    accent: "#d72660",
    tagline: "Δερμοκαλλυντικά εμπλουτισμένα με Vichy Mineralizing Water",
    intro: "Από τη Vichy, με την αποκλειστική θερμομεταλλική σύνθεση Vichy Mineralizing Water εμπλουτισμένη με 15 ιχνοστοιχεία."
  },
  "La Roche Posay": {
    key: "laroche",
    name: "La Roche-Posay",
    accent: "#003a70",
    tagline: "Δερματολογική φροντίδα για ευαίσθητο δέρμα",
    intro: "Από τη La Roche-Posay με δερματολογικά ελεγμένη σύνθεση και την La Roche-Posay Thermal Spring Water."
  },
  "CeraVe": {
    key: "cerave",
    name: "CeraVe",
    accent: "#0064a4",
    tagline: "Φροντίδα με κεραμίδια και υαλουρονικό για ενίσχυση του δερματικού φραγμού",
    intro: "Από τη CeraVe, με 3 βασικά κεραμίδια και την τεχνολογία MVE για ενίσχυση του δερματικού φραγμού επί 24 ώρες."
  }
};

function titleCase(s) {
  // Smart title-case για ονόματα από SKU descriptions (όλα CAPS συνήθως)
  if (!s) return s;
  const lower = s.toLowerCase();
  // Διατήρησε γνωστά ακρώνυμα όπως είναι
  const KEEP = new Set(["spf", "uv", "uva", "uvb", "bb", "cc", "hd", "3d", "led", "ph", "ml", "gr", "ha", "fr", "gb", "en", "el", "es", "ru", "pt", "du", "scan", "nl", "g", "ds", "ds24"]);
  return lower.replace(/\b\w+\b/g, w => {
    if (KEEP.has(w)) return w.toUpperCase();
    if (/^[a-z]+$/.test(w)) return w[0].toUpperCase() + w.slice(1);
    return w;
  });
}

function cleanName(raw) {
  if (!raw) return "";
  let s = String(raw).trim();
  // Strip trailing locale tokens like "FR EN gr", "EN FR SCAN", "GR", etc.
  s = s.replace(/\s+(?:[A-Z]{2,5}\s+)+[A-Z]{2,3}$/i, "")
       .replace(/\s+(?:GR|EN|FR|SCAN|GB|EL|ES|RU|PT|NL|DA|DU|ITA|DE)+\s*$/i, "")
       .replace(/\s+(?:GR|EN|FR|SCAN|GB|EL|ES|RU|PT|NL|DA|DU|ITA|DE)+\s*$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return titleCase(s);
}

async function main() {
  const rows = JSON.parse(await fs.readFile(RAW, "utf8"));
  const records = rows.slice(1).filter(r => r.D && r.E && r.F);

  // Build BRANDS object
  const BRANDS = {};
  for (const [raw, def] of Object.entries(BRAND_DEF)) BRANDS[def.key] = { name: def.name, accent: def.accent, tagline: def.tagline };

  // Build PRODUCTS list and capture lines per brand
  const productsByBrand = { vichy: [], laroche: [], cerave: [] };
  const linesByBrand = { vichy: new Map(), laroche: new Map(), cerave: new Map() };

  let skipped = 0;
  for (const r of records) {
    const brandRaw = (r.A || "").trim();
    const brandDef = BRAND_DEF[brandRaw];
    if (!brandDef) { skipped++; continue; }
    const brandKey = brandDef.key;
    const lineRaw = (r.B || "Γενικά").trim();
    const price = parseFloat(String(r.F).replace(",", "."));
    if (!Number.isFinite(price)) { skipped++; continue; }
    const vat = r.I ? parseInt(r.I) : 24;

    const product = {
      id: r.C,
      barcode: String(r.D).trim(),
      brand: brandKey,
      line: lineRaw,
      name: cleanName(r.E),
      rawName: r.E,
      price: Math.round(price * 100) / 100,
      vat
    };
    productsByBrand[brandKey].push(product);
    linesByBrand[brandKey].set(lineRaw, (linesByBrand[brandKey].get(lineRaw) || 0) + 1);
  }

  // Flat list in brand order
  const PRODUCTS = [
    ...productsByBrand.vichy,
    ...productsByBrand.laroche,
    ...productsByBrand.cerave
  ];

  // Emit cosmetics-data.js
  let js = "// Κατάλογος καλλυντικών (L'Oréal Dermatological Beauty 2026)\n";
  js += "// Πηγή: LOREAL ... 2026 .xlsx\n\n";
  js += "const COSMETICS_BRANDS = " + JSON.stringify(BRANDS, null, 2) + ";\n\n";
  js += "const COSMETICS_PRODUCTS = [\n";
  PRODUCTS.forEach(p => {
    js += `  ${JSON.stringify(p)},\n`;
  });
  js += "];\n\n";
  js += "if (typeof module !== 'undefined') module.exports = { COSMETICS_BRANDS, COSMETICS_PRODUCTS };\n";

  await fs.writeFile(OUT, js);
  console.log(`Wrote ${OUT} — ${PRODUCTS.length} προϊόντα, ${skipped} skipped.`);

  console.log("\nPer brand:");
  for (const k of ["vichy", "laroche", "cerave"]) {
    console.log(`  ${BRANDS[k].name}: ${productsByBrand[k].length} προϊόντα, ${linesByBrand[k].size} γραμμές`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
