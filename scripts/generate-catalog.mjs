#!/usr/bin/env node
// scripts/generate-catalog.mjs
// Παράγει catalog.csv (UTF-8 BOM, semicolon) ΚΑΙ catalog.xlsx (native Excel)
// με όλα τα προϊόντα του καταλόγου σε ξεχωριστές στήλες.
//
// Χρήση:  node scripts/generate-catalog.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildXlsx } from "./lib-xlsx.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CSV_FILE = path.join(ROOT, "catalog.csv");
const XLSX_FILE = path.join(ROOT, "catalog.xlsx");

// Λεκτικά intro ανά εταιρία (αντιγραφή από product.js)
const INTROS = {
  apivita: "Από τη γραμμή Bee Sun Safe της APIVITA, εμπνευσμένη από την προστατευτική δύναμη της μέλισσας και τη φύση της Ελλάδας.",
  bioderma: "Από τη Photoderm της Bioderma με αποκλειστική τεχνολογία Cellular Bioprotection™ για ολοκληρωμένη προστασία σε κυτταρικό επίπεδο.",
  frezyderm: "Ελληνικής παραγωγής από τη Frezyderm, με ασφαλή & καινοτόμα φίλτρα και εξειδικευμένες συνθέσεις για κάθε ανάγκη.",
  freshline: "Από τη Fresh Line, εμπνευσμένη από την αρχαία ελληνική παράδοση καλλωπισμού με φυσικά συστατικά.",
  heliodor: "Από τη γραμμή Heliodor της Pharmasept, με δερματολογικά ελεγμένη σύνθεση & υψηλή φωτοπροστασία.",
  korres: "Από τη γραμμή αντηλιακών Korres με βιοενεργά συστατικά όπως Γιαούρτι, Κόκκινο Αμπέλι & Αιγαίο Bronze.",
  laroche: "Από τη La Roche-Posay Anthelios με τεχνολογία UVMune 400 για ολοκληρωμένη προστασία από UVB, UVA short & long.",
  vichy: "Από τη Vichy με Capital Soleil / Idéal Soleil, ενισχυμένο με αντιοξειδωτικά και Vichy Mineralizing Water.",
  cerave: "Από τη CeraVe, με 3 βασικά κεραμίδια & υαλουρονικό για ενίσχυση του δερματικού φραγμού.",
  luxurious: "Από τη Luxurious Suncare, ελληνική γκάμα με ολοκληρωμένη φροντίδα για πρόσωπο, σώμα και μαλλιά.",
  aderma: "Από τη γραμμή Protect / Epitheliale της A-Derma με Βρώμη Realba® για πολύ ευαίσθητο δέρμα.",
  avene: "Από την Avène με Θερμομεταλλικό Νερό Avène — καταπραϋντικό και αντι-ερεθιστικό.",
  ducray: "Από τη γραμμή Melascreen της Ducray, ειδικά για δέρμα με τάση δυσχρωμιών και υπερμελάγχρωσης.",
  svr: "Από τη γραμμή Sun Secure της SVR — υψηλή προστασία με δερματολογική σύνθεση.",
  isdin: "Από την ISDIN με τις γραμμές Fotoprotector & Fotoultra — κορυφαία ισπανική φωτοπροστασία."
};

function buildDescription(p, parsed, brand) {
  const bits = [];
  bits.push(INTROS[p.brand] || `Προϊόν από τη γκάμα της ${brand.name}.`);

  if (parsed.spf) {
    const n = parseInt(parsed.spf);
    if (n >= 50) bits.push(`Πολύ υψηλή αντηλιακή προστασία (SPF ${parsed.spf}) ενάντια σε UVB και UVA ακτινοβολία.`);
    else if (n >= 30) bits.push(`Υψηλή αντηλιακή προστασία (SPF ${parsed.spf}).`);
    else bits.push(`Αντηλιακή προστασία SPF ${parsed.spf}.`);
  }
  if (parsed.types.length) {
    bits.push(`Σε υφή ${parsed.types.join(" / ").toLowerCase()}${parsed.volume ? ", συσκευασία " + parsed.volume : ""}.`);
  } else if (parsed.volume) {
    bits.push(`Συσκευασία ${parsed.volume}.`);
  }
  if (parsed.audience.includes("Παιδικό")) bits.push("Κατάλληλο για παιδιά.");
  if (parsed.audience.includes("Ευαίσθητο δέρμα")) bits.push("Ειδικά για ευαίσθητο δέρμα.");
  if (parsed.audience.includes("Anti-Aging")) bits.push("Δράση κατά της φωτογήρανσης και των ρυτίδων.");
  if (parsed.audience.includes("Κατά πανάδων")) bits.push("Στοχευμένη δράση κατά των πανάδων και των δυσχρωμιών.");
  if (parsed.audience.includes("Λιπαρό/Μικτό")) bits.push("Ιδανικό για λιπαρό ή μικτό δέρμα.");
  if (parsed.audience.includes("Με χρώμα")) bits.push("Με χρωματισμό για ενιαία όψη.");
  if (parsed.audience.includes("Dry Touch")) bits.push("Λεπτόρρευστη υφή Dry Touch.");
  if (parsed.audience.includes("Sport")) bits.push("Ανθεκτικό σε ιδρώτα & νερό.");
  if (parsed.audience.includes("Βρεγμένο δέρμα")) bits.push("Εφαρμόζεται και σε βρεγμένο δέρμα.");
  if (parsed.audience.includes("Οικογενειακό")) bits.push("Οικογενειακή συσκευασία.");
  return bits.join(" ");
}

// CSV cell quoting (RFC 4180-ish, semicolon variant)
function csvCell(v) {
  let s = String(v ?? "");
  // Strip newlines for one-line cells in Excel
  s = s.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (/[";]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function loadContext() {
  const ctx = {
    window: {},
    console, Math, JSON, RegExp, Array, Object, String, Map, Set,
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: () => Promise.resolve({ ok: false })
  };
  vm.createContext(ctx);
  const data = await fs.readFile(path.join(ROOT, "js/data.js"), "utf8");
  vm.runInContext(data + "\nglobalThis.PRODUCTS=PRODUCTS;globalThis.BRANDS=BRANDS;", ctx);
  const manifest = await fs.readFile(path.join(ROOT, "images/manifest.js"), "utf8");
  vm.runInContext(manifest, ctx);
  const utils = await fs.readFile(path.join(ROOT, "js/utils.js"), "utf8");
  vm.runInContext(utils + "\nglobalThis.parseProduct=parseProduct;", ctx);
  return ctx;
}

async function main() {
  const ctx = await loadContext();
  const manifest = ctx.window.IMAGE_MANIFEST || {};

  const headers = [
    "Όνομα",
    "Χονδρική τιμή (€)",
    "Περιγραφή",
    "Τύπος",
    "Περιοχή",
    "Χαρακτηριστικά",
    "Εταιρία",
    "Φωτογραφία",
    "Κωδικός",
    "Barcode (EAN)",
    "SPF",
    "Συσκευασία"
  ];

  const rows = ctx.PRODUCTS.map(p => {
    const brand = ctx.BRANDS[p.brand];
    const parsed = ctx.parseProduct(p);
    return [
      p.name,
      p.price,                                   // number — Excel θα μπορεί να ταξινομήσει
      buildDescription(p, parsed, brand),
      parsed.types.join(", "),
      parsed.areas.join(", "),
      parsed.audience.join(", "),
      brand.name,
      manifest[p.barcode] || "",
      p.id,
      p.barcode,                                 // string (EAN — διατηρούμε leading zeros)
      parsed.spf || "",
      parsed.volume || ""
    ];
  });

  // ----- CSV (UTF-8 BOM, semicolon, comma decimal για ελληνικό Excel) -----
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

  // ----- XLSX (native Excel) -----
  const columnWidths = [
    50,  // Όνομα
    14,  // Χονδρική τιμή
    70,  // Περιγραφή
    18,  // Τύπος
    18,  // Περιοχή
    30,  // Χαρακτηριστικά
    18,  // Εταιρία
    50,  // Φωτογραφία
    12,  // Κωδικός
    16,  // Barcode
    8,   // SPF
    12   // Συσκευασία
  ];
  // Barcodes (col 10, 0-indexed 9) stored as text — αλλιώς το Excel τα μετατρέπει
  // σε επιστημονική σημείωση.
  const xlsxRows = rows.map(row => row.map((cell, i) => {
    if (i === 9 && cell != null && cell !== "") return String(cell);
    return cell;
  }));
  const xlsxBuf = buildXlsx({
    sheetName: "Αντηλιακά 2026",
    headers,
    rows: xlsxRows,
    columnWidths
  });
  await fs.writeFile(XLSX_FILE, xlsxBuf);
  console.log(`Wrote ${XLSX_FILE} — ${xlsxBuf.length.toLocaleString()} bytes.`);
}

main().catch(err => { console.error(err); process.exit(1); });
