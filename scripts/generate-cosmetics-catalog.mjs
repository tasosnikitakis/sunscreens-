#!/usr/bin/env node
// scripts/generate-cosmetics-catalog.mjs
// Παράγει cosmetics-catalog.csv + cosmetics-catalog.xlsx σε αντιστοιχία με
// το generate-catalog.mjs για τα αντηλιακά.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildXlsx } from "./lib-xlsx.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CSV_FILE = path.join(ROOT, "cosmetics-catalog.csv");
const XLSX_FILE = path.join(ROOT, "cosmetics-catalog.xlsx");

const INTROS = {
  vichy: "Από τη γκάμα της Vichy, με Vichy Mineralizing Water και επιστημονικά τεκμηριωμένα ενεργά συστατικά.",
  laroche: "Από την La Roche-Posay, δερματολογικά ελεγμένη φόρμουλα για ευαίσθητο και προβληματικό δέρμα — με Thermal Spring Water.",
  cerave: "Από τη CeraVe, με 3 βασικά κεραμίδια και υαλουρονικό για ενίσχυση του φυσικού φραγμού του δέρματος."
};

const LINE_NOTES = {
  "Liftactiv": "Σύνθεση κατά της γήρανσης με βιταμίνη C και αντιοξειδωτικά.",
  "Neovadiol": "Στοχευμένη φροντίδα για το ώριμο δέρμα (εμμηνόπαυση).",
  "Mineral 89": "Καθημερινό booster ενυδάτωσης με 89% Vichy Mineralizing Water + Hyaluronic Acid.",
  "Dercos": "Δερματολογική σειρά για τα μαλλιά / τριχωτό κεφαλής.",
  "Dermablend": "Make-up υψηλής κάλυψης για ατέλειες, πανάδες, ουλές.",
  "Purete Thermale": "Καθημερινός καθαρισμός για όλους τους τύπους δέρματος.",
  "Effaclar": "Κατά της ακμής και της λιπαρότητας, με σαλικυλικό οξύ και Zinc PCA.",
  "Toleriane": "Πολύ ευαίσθητο / αλλεργικό δέρμα.",
  "Cicaplast": "Επανορθωτική φροντίδα με Madecassoside.",
  "Lipikar": "Καθημερινή φροντίδα για ξηρό και ατοπικό δέρμα.",
  "Hyalu B5": "Anti-aging με υαλουρονικό + βιταμίνη Β5.",
  "Mela B3": "Κατά των πανάδων με Melasyl + B3.",
  "Hydrating Cleanser": "Καθαρισμός με κεραμίδια & υαλουρονικό.",
  "Moisturizing Cream + Lotion": "Καθημερινή ενυδάτωση σώματος με 3 κεραμίδια.",
  "Hydrating Sunscreen": "Καθημερινή φωτοπροστασία με κεραμίδια."
};

function parseCosmetic(p) {
  const name = p.name;
  const volMatch = name.match(/(?:^|[\s\/\-])(?:[FJTBSPK])?(\d+(?:[.,]\d+)?)\s*(ml|gr|g|kg)\b/i);
  const volume = volMatch ? `${volMatch[1]}${volMatch[2].toLowerCase()}` : "";
  const tags = [];
  if (/spf\s*\d+/i.test(name)) tags.push("SPF");
  if (/anti[- ]?age|retinol|liftactiv|neovadiol/i.test(name)) tags.push("Anti-Age");
  if (/cleans|wash|micell|mic\s+wat/i.test(name)) tags.push("Καθαρισμός");
  if (/serum|booster/i.test(name)) tags.push("Serum");
  if (/eye|yx\b/i.test(name)) tags.push("Μάτια");
  if (/cream|crm|crema/i.test(name)) tags.push("Κρέμα");
  if (/lotion|emulsion/i.test(name)) tags.push("Lotion");
  if (/balm|lipikar/i.test(name)) tags.push("Balm");
  if (/mask|μάσκα/i.test(name)) tags.push("Mask");
  if (/shampoo|conditioner|dercos/i.test(name)) tags.push("Μαλλιά");
  if (/deod|deo/i.test(name)) tags.push("Deodorant");
  if (/men|homme/i.test(name)) tags.push("Ανδρικό");
  if (/kids|baby|enfant|bebe|infant|pediatr/i.test(name)) tags.push("Παιδικό");
  if (/sensit|sens\b/i.test(name)) tags.push("Ευαίσθητο");
  if (/oily|oilyskin|oil\s*ctrl/i.test(name)) tags.push("Λιπαρό");
  if (/acne|effaclar/i.test(name)) tags.push("Ακμή");
  if (/hyalu|hyaluron/i.test(name)) tags.push("Υαλουρονικό");
  if (/cica/i.test(name)) tags.push("Cicaplast");
  return { volume, tags: [...new Set(tags)] };
}

function buildDescription(p, brand) {
  const bits = [INTROS[p.brand] || `Προϊόν από τη γκάμα της ${brand.name}.`];
  if (p.line) bits.push(`Ανήκει στη γραμμή ${p.line}.`);
  if (LINE_NOTES[p.line]) bits.push(LINE_NOTES[p.line]);
  return bits.join(" ");
}

function csvCell(v) {
  let s = String(v ?? "");
  s = s.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (/[";]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function loadContext() {
  const ctx = { window: {}, console, Math, JSON, RegExp, Array, Object, String, Map, Set };
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(path.join(ROOT, "js/cosmetics-data.js"), "utf8")
    + "\nglobalThis.COSMETICS_PRODUCTS=COSMETICS_PRODUCTS;globalThis.COSMETICS_BRANDS=COSMETICS_BRANDS;", ctx);
  vm.runInContext(await fs.readFile(path.join(ROOT, "images/manifest.js"), "utf8"), ctx);
  return ctx;
}

async function main() {
  const ctx = await loadContext();
  const manifest = ctx.window.IMAGE_MANIFEST || {};

  const headers = [
    "Όνομα",
    "Χονδρική τιμή (€)",
    "Περιγραφή",
    "Γραμμή",
    "Χαρακτηριστικά",
    "Εταιρία",
    "Φωτογραφία",
    "Κωδικός",
    "Barcode (EAN)",
    "Συσκευασία"
  ];

  const rows = ctx.COSMETICS_PRODUCTS.map(p => {
    const brand = ctx.COSMETICS_BRANDS[p.brand];
    const parsed = parseCosmetic(p);
    return [
      p.name,
      p.price,
      buildDescription(p, brand),
      p.line || "",
      parsed.tags.join(", "),
      brand.name,
      manifest[p.barcode] || "",
      p.id,
      p.barcode || "",
      parsed.volume
    ];
  });

  // CSV
  function fmtCsv(v) {
    if (typeof v === "number" && Number.isFinite(v)) return v.toFixed(2).replace(".", ",");
    return v;
  }
  const lines = [
    headers.map(csvCell).join(";"),
    ...rows.map(row => row.map(c => csvCell(fmtCsv(c))).join(";"))
  ];
  const BOM = "﻿";
  await fs.writeFile(CSV_FILE, BOM + lines.join("\r\n"), "utf8");
  console.log(`Wrote ${CSV_FILE} — ${rows.length} προϊόντα, ${headers.length} στήλες.`);

  // XLSX
  const xlsxRows = rows.map(row => row.map((c, i) => (i === 8 && c) ? String(c) : c));
  const xlsxBuf = buildXlsx({
    sheetName: "Καλλυντικά 2026",
    headers,
    rows: xlsxRows,
    columnWidths: [50, 14, 70, 22, 30, 18, 50, 14, 16, 12]
  });
  await fs.writeFile(XLSX_FILE, xlsxBuf);
  console.log(`Wrote ${XLSX_FILE} — ${xlsxBuf.length.toLocaleString()} bytes.`);
}

main().catch(err => { console.error(err); process.exit(1); });
