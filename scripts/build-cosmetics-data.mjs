#!/usr/bin/env node
// scripts/build-cosmetics-data.mjs
// Reads /tmp/cosmetics-raw.json (produced by parse-cosmetics-xlsx.mjs)
// and emits js/cosmetics-data.js with COSMETICS_BRANDS, COSMETICS_LINES,
// COSMETICS_PRODUCTS in the same shape as js/data.js for sunscreens.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IN = "/tmp/cosmetics-raw.json";
const OUT = path.join(ROOT, "js/cosmetics-data.js");

const BRAND_KEY = {
  "Vichy": "vichy",
  "La Roche Posay": "laroche",
  "CeraVe": "cerave"
};

const BRANDS = {
  vichy: {
    name: "Vichy",
    accent: "#d72660",
    tagline: "Φροντίδα προσώπου, σώματος και μαλλιών — εμπνευσμένη από το Vichy Thermal Water"
  },
  laroche: {
    name: "La Roche-Posay",
    accent: "#003a70",
    tagline: "Δερματολογικά καλλυντικά για ευαίσθητο και προβληματικό δέρμα"
  },
  cerave: {
    name: "CeraVe",
    accent: "#0064a4",
    tagline: "Καθαρισμός & ενυδάτωση με 3 κεραμίδια — η Νο1 σύσταση δερματολόγων στις ΗΠΑ"
  }
};

const raw = JSON.parse(await fs.readFile(IN, "utf8"));
const products = [];
const linesByBrand = { vichy: new Set(), laroche: new Set(), cerave: new Set() };

for (const r of raw.slice(1)) {
  const sig = (r.A || "").trim();
  const line = (r.B || "").trim();
  const code = (r.C || "").trim();
  const barcode = (r.D || "").trim();
  const name = (r.E || "").trim();
  const priceRaw = (r.F || "").toString().trim();
  if (!sig || !name || !priceRaw || !BRAND_KEY[sig]) continue;
  const brand = BRAND_KEY[sig];
  const price = parseFloat(priceRaw.replace(",", "."));
  if (!Number.isFinite(price)) continue;
  if (line) linesByBrand[brand].add(line);
  products.push({
    id: code || `c-${barcode || products.length}`,
    barcode: barcode || "",
    brand,
    line,
    name,
    price
  });
}

console.log(`Parsed ${products.length} products`);
for (const [b, ls] of Object.entries(linesByBrand)) {
  console.log(`  ${b}: ${ls.size} lines, ${products.filter(p => p.brand === b).length} products`);
}

const LINES = {};
for (const [brand, set] of Object.entries(linesByBrand)) {
  LINES[brand] = [...set];
}

const header = `// Κατάλογος καλλυντικών - L'Oréal Dermatological Beauty (Vichy / La Roche-Posay / CeraVe)
// Παράγεται αυτόματα από το scripts/build-cosmetics-data.mjs.
// Πηγή: 03069ef6-LOREAL_KATALOGOS_KALLYNTIKWN_2026.xlsx

`;

let body = "const COSMETICS_BRANDS = " + JSON.stringify(BRANDS, null, 2) + ";\n\n";
body += "const COSMETICS_LINES = " + JSON.stringify(LINES, null, 2) + ";\n\n";
body += "const COSMETICS_PRODUCTS = [\n";
for (const p of products) {
  body += `  { id: ${JSON.stringify(p.id)}, barcode: ${JSON.stringify(p.barcode)}, brand: ${JSON.stringify(p.brand)}, line: ${JSON.stringify(p.line)}, name: ${JSON.stringify(p.name)}, price: ${p.price} },\n`;
}
body += "];\n\n";
body += "if (typeof module !== 'undefined') module.exports = { COSMETICS_BRANDS, COSMETICS_LINES, COSMETICS_PRODUCTS };\n";

await fs.writeFile(OUT, header + body, "utf8");
console.log(`Wrote ${OUT}`);
