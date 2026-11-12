#!/usr/bin/env node
// scripts/generate-catalog.mjs
// Παράγει csv + xlsx ανά κατάλογο:
//   catalog.*            — αντηλιακά        cosmetics-catalog.* — καλλυντικά
//   seasonal-catalog.*   — εποχιακά         vican-catalog.*     — Vican
//   <brand>-catalog.*    — κάθε brand του js/brands.js (Frezyderm, Lamberts, A-Derma, …)
//
// Χρήση:  node scripts/generate-catalog.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildXlsx } from "./lib-xlsx.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ===== Sunscreens descriptions =====

const SUN_INTROS = {
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

function sunscreenDescription(p, parsed, brand) {
  const bits = [SUN_INTROS[p.brand] || `Προϊόν από τη γκάμα της ${brand.name}.`];
  if (parsed.spf) {
    const n = parseInt(parsed.spf);
    if (n >= 50) bits.push(`Πολύ υψηλή αντηλιακή προστασία (SPF ${parsed.spf}) ενάντια σε UVB και UVA ακτινοβολία.`);
    else if (n >= 30) bits.push(`Υψηλή αντηλιακή προστασία (SPF ${parsed.spf}).`);
    else bits.push(`Αντηλιακή προστασία SPF ${parsed.spf}.`);
  }
  if (parsed.types.length) bits.push(`Σε υφή ${parsed.types.join(" / ").toLowerCase()}${parsed.volume ? ", συσκευασία " + parsed.volume : ""}.`);
  else if (parsed.volume) bits.push(`Συσκευασία ${parsed.volume}.`);
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

// ===== Cosmetics descriptions =====

const COS_INTROS = {
  vichy: "Από τη Vichy, με την αποκλειστική θερμομεταλλική σύνθεση Vichy Mineralizing Water εμπλουτισμένη με 15 ιχνοστοιχεία.",
  laroche: "Από τη La Roche-Posay με δερματολογικά ελεγμένη σύνθεση και την La Roche-Posay Thermal Spring Water.",
  cerave: "Από τη CeraVe, με 3 βασικά κεραμίδια και την τεχνολογία MVE για ενίσχυση του δερματικού φραγμού επί 24 ώρες."
};
const COS_LINE_NOTES = {
  "Liftactiv": "Από τη γραμμή Liftactiv — anti-aging με βιταμίνη C και ρετινόλη.",
  "Neovadiol": "Από τη Neovadiol — εξειδικευμένη anti-aging φροντίδα για ώριμο δέρμα.",
  "Mineral 89": "Από τη Mineral 89 — daily booster με υαλουρονικό οξύ και 89% θερμομεταλλικό νερό Vichy.",
  "Purete Thermale": "Από τη Purete Thermale — προϊόντα καθαρισμού & demaquillage.",
  "Vichy Homme": "Από τη γραμμή Vichy Homme για άνδρες.",
  "Dercos": "Από τη γραμμή Dercos — εξειδικευμένη φροντίδα τριχωτής κεφαλής & μαλλιών.",
  "Dermablend": "Από τη γραμμή Dermablend — υψηλής κάλυψης corrective makeup.",
  "Capital Soleil": "Από τη Capital Soleil — αντηλιακή και αντι-φωτογηραντική προστασία.",
  "Effaclar": "Από τη γραμμή Effaclar — λιπαρό δέρμα με τάση ακμής.",
  "Toleriane": "Από τη γραμμή Toleriane — εξαιρετικά ευαίσθητο δέρμα.",
  "Toleriane Makeup": "Από τη Toleriane Makeup — υποαλλεργικό makeup για ευαίσθητο δέρμα.",
  "Cicaplast": "Από τη Cicaplast — επανορθωτική φροντίδα με Panthenol και Madecassoside.",
  "Lipikar": "Από τη Lipikar — ξηρό προς ατοπικό δέρμα.",
  "LIPIKAR": "Από τη Lipikar — ξηρό προς ατοπικό δέρμα.",
  "Hyalu B5": "Από τη Hyalu B5 — anti-aging φόρμουλα με υαλουρονικό οξύ και Β5.",
  "Mela B3": "Από τη Mela B3 — στοχευμένη φροντίδα κατά των πανάδων και δυσχρωμιών με Melasyl™.",
  "Retinol LRP": "Από τη γραμμή Retinol — pure retinol για ανανέωση επιδερμίδας.",
  "Anthelios": "Από την Anthelios — υψηλή αντηλιακή προστασία UVMune 400.",
  "Pure Vitamin C": "Από τη Pure Vitamin C — antioxidant brightening με 10% καθαρή Βιταμίνη C.",
  "Hyaluronic Acid Serum": "Hydrating serum με υαλουρονικό για ενυδάτωση και αναπλήρωση.",
  "Hydrating Cleanser": "Καθαρισμός χωρίς να αφυδατώνει — με κεραμίδια και υαλουρονικό.",
  "Hydrating Sunscreen": "Αντηλιακή προστασία με ενυδάτωση 24 ωρών.",
  "Moisturizing Cream + Lotion": "Πλούσια ενυδάτωση επί 24 ώρες με 3 κεραμίδια.",
  "Facial Moisturizers": "Καθημερινή ενυδάτωση προσώπου με κεραμίδια.",
  "Skin Renewal Anti-Aging": "Anti-aging φροντίδα με ρετινόλη και κεραμίδια.",
  "SA": "Με σαλικυλικό οξύ — απολέπιση και smoothing για τραχύ δέρμα.",
  "Acne": "Στοχευμένη φροντίδα για δέρμα με τάση ακμής."
};

function cosmeticDescription(p, brand) {
  const bits = [COS_INTROS[p.brand] || `Προϊόν από τη γκάμα της ${brand.name}.`];
  if (p.line && COS_LINE_NOTES[p.line]) bits.push(COS_LINE_NOTES[p.line]);
  else if (p.line) bits.push(`Από τη γραμμή ${p.line}.`);
  return bits.join(" ");
}

// ===== CSV helpers =====

function csvCell(v) {
  let s = String(v ?? "");
  s = s.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (/[";]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function fmtCsv(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v.toFixed(2).replace(".", ",");
  return v;
}
const BOM = "﻿";

function emitCsv(file, headers, rows) {
  const lines = [
    headers.map(csvCell).join(";"),
    ...rows.map(row => row.map(c => csvCell(fmtCsv(c))).join(";"))
  ];
  return fs.writeFile(file, BOM + lines.join("\r\n"), "utf8");
}

// ===== Load context =====

async function loadContext() {
  const ctx = {
    window: {},
    console, Math, JSON, RegExp, Array, Object, String, Map, Set,
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: () => Promise.resolve({ ok: false })
  };
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(path.join(ROOT, "js/data.js"), "utf8")
    + "\nglobalThis.PRODUCTS=PRODUCTS;globalThis.BRANDS=BRANDS;", ctx);
  vm.runInContext(await fs.readFile(path.join(ROOT, "images/manifest.js"), "utf8"), ctx);
  vm.runInContext(await fs.readFile(path.join(ROOT, "js/utils.js"), "utf8")
    + "\nglobalThis.parseProduct=parseProduct;", ctx);
  try {
    vm.runInContext(await fs.readFile(path.join(ROOT, "js/cosmetics-data.js"), "utf8")
      + "\nglobalThis.COSMETICS_PRODUCTS=COSMETICS_PRODUCTS;globalThis.COSMETICS_BRANDS=COSMETICS_BRANDS;", ctx);
  } catch {}
  try {
    vm.runInContext(await fs.readFile(path.join(ROOT, "js/cosmetics-enrichment.js"), "utf8"), ctx);
  } catch {}
  try {
    vm.runInContext(await fs.readFile(path.join(ROOT, "js/seasonal-data.js"), "utf8")
      + "\nglobalThis.SEASONAL_PRODUCTS=SEASONAL_PRODUCTS;globalThis.SEASONAL_BRANDS=SEASONAL_BRANDS;globalThis.SEASONAL_SECTIONS=SEASONAL_SECTIONS;", ctx);
  } catch {}
  try {
    vm.runInContext(await fs.readFile(path.join(ROOT, "js/seasonal-enrichment.js"), "utf8"), ctx);
  } catch {}
  try {
    vm.runInContext(await fs.readFile(path.join(ROOT, "js/seasonal-overrides.js"), "utf8"), ctx);
  } catch {}
  try {
    vm.runInContext(await fs.readFile(path.join(ROOT, "js/vican-data.js"), "utf8"), ctx);
  } catch {}
  // Brand catalogs (Frezyderm, Lamberts, A-Derma, …): μητρώο + 4 αρχεία ανά brand
  vm.runInContext(await fs.readFile(path.join(ROOT, "js/brands.js"), "utf8"), ctx);
  for (const key of Object.keys(ctx.window.BRAND_CATALOGS)) {
    for (const suffix of ["supplier", "overrides", "supplemental", "sections"]) {
      try { vm.runInContext(await fs.readFile(path.join(ROOT, `js/${key}-${suffix}.js`), "utf8"), ctx); } catch {}
    }
  }
  return ctx;
}

// ===== Build sunscreens table =====

function buildSunscreensTable(ctx, manifest) {
  const headers = [
    "Όνομα", "Χονδρική τιμή (€)", "Περιγραφή",
    "Τύπος", "Περιοχή", "Χαρακτηριστικά",
    "Εταιρία", "Φωτογραφία", "Κωδικός",
    "Barcode (EAN)", "SPF", "Συσκευασία"
  ];
  const rows = ctx.PRODUCTS.map(p => {
    const brand = ctx.BRANDS[p.brand];
    const parsed = ctx.parseProduct(p);
    return [
      p.name, p.price, sunscreenDescription(p, parsed, brand),
      parsed.types.join(", "), parsed.areas.join(", "), parsed.audience.join(", "),
      brand.name, manifest[p.barcode] || "", p.id,
      p.barcode, parsed.spf || "", parsed.volume || ""
    ];
  });
  return { headers, rows, sheetName: "Αντηλιακά 2026", barcodeColIdx: 9,
    columnWidths: [50, 14, 70, 18, 18, 30, 18, 50, 12, 16, 8, 12] };
}

// ===== Seasonal descriptions =====

const SEASONAL_SECTION_INTROS = {
  slimming: "Συμπλήρωμα/προϊόν αδυνατίσματος για ολοκληρωμένη φροντίδα σώματος.",
  insectrepel: "Εποχιακό προϊόν για προστασία ή ανακούφιση κατά τις θερινές δραστηριότητες.",
  rodenticide: "Επαγγελματικό δόλωμα κατά τρωκτικών/εντόμων."
};

function seasonalDescription(p, brand, sectionInfo) {
  const bits = [];
  if (sectionInfo) bits.push(SEASONAL_SECTION_INTROS[p.section] || `Από την κατηγορία "${sectionInfo.name}".`);
  bits.push(`Προϊόν της σειράς ${brand ? brand.name : p.brand}${p.line ? " (" + p.line + ")" : ""}.`);
  return bits.join(" ");
}

function buildSeasonalTable(ctx, manifest) {
  if (!ctx.SEASONAL_PRODUCTS) return null;
  const enrich = (ctx.window && ctx.window.SEASONAL_ENRICHMENT) || {};
  const overrides = (ctx.window && ctx.window.SEASONAL_OVERRIDES) || {};
  const enrichmentFor = (bc) => overrides[bc] || enrich[bc] || {};
  const headers = [
    "Όνομα", "Χονδρική τιμή (€)", "Περιγραφή",
    "Ενότητα", "Γραμμή", "Εταιρία", "Φωτογραφία",
    "Κωδικός", "Barcode (EAN)", "Καταχώρηση προμηθευτή", "Πηγή περιγραφής"
  ];
  const rows = ctx.SEASONAL_PRODUCTS.map(p => {
    const brand = ctx.SEASONAL_BRANDS[p.brand];
    const sectionInfo = ctx.SEASONAL_SECTIONS && ctx.SEASONAL_SECTIONS[p.section];
    const e = enrichmentFor(p.barcode);
    const displayName = e.name || p.name;
    const description = e.description || seasonalDescription(p, brand, sectionInfo);
    return [
      displayName, p.price || "", description,
      sectionInfo ? sectionInfo.name : p.section,
      p.line || "", brand ? brand.name : p.brand, manifest[p.barcode] || "",
      p.id, p.barcode, p.rawName || "", e.source || ""
    ];
  });
  return { headers, rows, sheetName: "Εποχιακά 2026", barcodeColIdx: 8,
    columnWidths: [50, 14, 70, 22, 22, 22, 50, 14, 16, 45, 22] };
}

// ===== Vican =====

function buildVicanTable(ctx, manifest) {
  const products = (ctx.window && ctx.window.VICAN_PRODUCTS) || [];
  if (!products.length) return null;
  const sections = (ctx.window && ctx.window.VICAN_SECTIONS) || {};
  const headers = [
    "Όνομα", "Χονδρική τιμή (€)", "Περιγραφή",
    "Κατηγορία", "Barcode (EAN)", "Φωτογραφία", "URL επίσημου site"
  ];
  const rows = products.map(p => {
    const section = sections[p.section] || { name: p.section };
    const localImg = manifest[p.barcode] || "";
    return [
      p.name, p.price || "", p.description || "",
      section.name, p.barcode, localImg || p.image || "", p.url || ""
    ];
  });
  return { headers, rows, sheetName: "Vican", barcodeColIdx: 4,
    columnWidths: [50, 14, 70, 24, 16, 50, 50] };
}

// ===== Brand catalogs (Frezyderm, Lamberts, A-Derma, …) =====
//
// Ένας πίνακας ανά brand του js/brands.js. Σελίδα στο brand site (override)
// → μόνο αυτή· αλλιώς fallback φαρμακείου. Ίδιες στήλες με το κουμπί
// "⬇ XLSX" της σελίδας (js/catalog-export.js) — αν αλλάξουν εδώ, αλλάζουν κι εκεί.

const MATCH_LABEL = { manual: "Χειροκίνητο", exact: "Ακριβές (GTIN)", high: "Αυτόματο", review: "Για έλεγχο" };

function buildBrandTable(ctx, manifest, cfg) {
  const BU = ctx.window.BRAND_CATALOGS_UTIL;
  const data = BU.data(cfg, ctx.window);
  if (!data.supplier.length) return null;
  const enrichmentFor = (bc) => {
    const e = BU.enrichmentFor(cfg, bc, data);
    e.match = e.noBrandPage ? "Χωρίς σελίδα" : (MATCH_LABEL[e.matchType] || "Αυτόματο");
    return e;
  };
  const TAB_COLUMNS = cfg.exportSections;
  const headers = [
    "Όνομα", "Υπότιτλος", "Χονδρική τιμή (€)", "Λιανική τιμή (€)", "Περιγραφή", "Ιδιότητες", "Βασικά χαρακτηριστικά",
    ...TAB_COLUMNS, "Συσκευασία", "Χαρακτηριστικά", "Κατηγορία", "Barcode (EAN)", "Παραλλαγές (variants)",
    "Φωτογραφία", "URL επίσημου site", "Πηγή", "Match"
  ];
  const rows = data.supplier.map(p => {
    const e = enrichmentFor(p.barcode);
    const secKey = e.section || "diafora";
    const sectionLabel = (data.sections[secKey] && data.sections[secKey].name) || secKey;
    const displayName = BU.prettify(e.name || p.name, cfg);
    const desc = e.description || cfg.fallbackDesc.replace("{name}", p.name);
    const tabCols = TAB_COLUMNS.map(t => e.sections[t] || "");
    const otherAttrs = [
      ...Object.entries(e.attributes).filter(([k]) => k !== "Συσκευασία").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`),
      ...Object.entries(e.sections).filter(([k]) => !TAB_COLUMNS.includes(k)).map(([k, v]) => `${k}: ${v}`)
    ].join(" | ");
    const localImg = manifest[p.barcode] || "";
    const variants = (p.variants || []).filter(v => v !== p.barcode).join(", ");
    return [
      displayName, e.subtitle || "", p.wholesale || "", p.retail || "", desc, e.claims.join(" · "), e.highlights.join(" • "),
      ...tabCols, e.attributes["Συσκευασία"] || "", otherAttrs, sectionLabel, p.barcode, variants,
      localImg || e.image || "", e.url || "", e.source || "", e.match
    ];
  });
  return { headers, rows, sheetName: cfg.sheetName, barcodeColIdx: 13,
    columnWidths: [50, 40, 14, 14, 70, 40, 50, 60, 50, 40, 14, 40, 24, 16, 24, 50, 50, 18, 16] };
}

function buildCosmeticsTable(ctx, manifest) {
  if (!ctx.COSMETICS_PRODUCTS) return null;
  const enrich = (ctx.window && ctx.window.COSMETICS_ENRICHMENT) || {};
  const headers = [
    "Όνομα", "Χονδρική τιμή (€)", "Περιγραφή",
    "Γραμμή", "Εταιρία", "Φωτογραφία",
    "Κωδικός", "Barcode (EAN)", "ΦΠΑ", "Καταχώρηση προμηθευτή", "Πηγή περιγραφής"
  ];
  const rows = ctx.COSMETICS_PRODUCTS.map(p => {
    const brand = ctx.COSMETICS_BRANDS[p.brand];
    const e = enrich[p.barcode] || {};
    const displayName = e.name || p.name;
    const description = e.description || cosmeticDescription(p, brand);
    return [
      displayName, p.price, description,
      p.line, brand.name, manifest[p.barcode] || "",
      p.id, p.barcode, p.vat || 24, p.rawName || "", e.source || ""
    ];
  });
  return { headers, rows, sheetName: "Καλλυντικά 2026", barcodeColIdx: 7,
    columnWidths: [50, 14, 70, 22, 18, 50, 14, 16, 8, 45, 22] };
}

// ===== Emit XLSX/CSV for a table =====

async function emitTable(table, csvPath, xlsxPath, label) {
  if (!table) return;
  await emitCsv(csvPath, table.headers, table.rows);
  // Barcode column stored as text so Excel doesn't convert to scientific notation.
  const xlsxRows = table.rows.map(row => row.map((cell, i) =>
    (i === table.barcodeColIdx && cell != null && cell !== "") ? String(cell) : cell
  ));
  const xlsxBuf = buildXlsx({
    sheetName: table.sheetName,
    headers: table.headers,
    rows: xlsxRows,
    columnWidths: table.columnWidths
  });
  await fs.writeFile(xlsxPath, xlsxBuf);
  console.log(`Wrote ${label}: ${table.rows.length} προϊόντα — ${csvPath} + ${xlsxPath}`);
}

async function main() {
  const ctx = await loadContext();
  const manifest = ctx.window.IMAGE_MANIFEST || {};

  await emitTable(
    buildSunscreensTable(ctx, manifest),
    path.join(ROOT, "catalog.csv"),
    path.join(ROOT, "catalog.xlsx"),
    "Αντηλιακά"
  );
  await emitTable(
    buildCosmeticsTable(ctx, manifest),
    path.join(ROOT, "cosmetics-catalog.csv"),
    path.join(ROOT, "cosmetics-catalog.xlsx"),
    "Καλλυντικά"
  );
  await emitTable(
    buildSeasonalTable(ctx, manifest),
    path.join(ROOT, "seasonal-catalog.csv"),
    path.join(ROOT, "seasonal-catalog.xlsx"),
    "Εποχιακά"
  );
  await emitTable(
    buildVicanTable(ctx, manifest),
    path.join(ROOT, "vican-catalog.csv"),
    path.join(ROOT, "vican-catalog.xlsx"),
    "Vican"
  );
  for (const cfg of Object.values(ctx.window.BRAND_CATALOGS)) {
    const table = buildBrandTable(ctx, manifest, cfg);
    if (!table) { console.log(`Skip ${cfg.name}: κανένα προϊόν (js/${cfg.key}-supplier.js λείπει;)`); continue; }
    await emitTable(table, path.join(ROOT, `${cfg.key}-catalog.csv`), path.join(ROOT, `${cfg.key}-catalog.xlsx`), cfg.name);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
