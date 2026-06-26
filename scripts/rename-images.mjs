#!/usr/bin/env node
// scripts/rename-images.mjs
// Μετονομάζει τις εικόνες από {barcode}.{ext} σε {slug-από-όνομα}-{barcode}.{ext},
// όπου το slug είναι το όνομα του προϊόντος χωρίς ελληνικά / ειδικούς χαρακτήρες.
// Ενημερώνει το images/manifest.json + images/manifest.js αντίστοιχα.
//
// Χρήση: node scripts/rename-images.mjs [--dry-run]

import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "images");
const MANIFEST_FILE = path.join(IMG_DIR, "manifest.json");
const MANIFEST_JS_FILE = path.join(IMG_DIR, "manifest.js");

const DRY_RUN = process.argv.includes("--dry-run");

export function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")                 // strip Latin combining accents (è→e)
    .replace(/[Ͱ-Ͽἀ-῿]/g, " ")   // strip Greek
    .replace(/[+]/g, "")                              // SPF50+ -> SPF50
    .replace(/[&]/g, " ")                             // strip & (usually connects Greek words removed)
    .replace(/[\/\\]/g, "-")                          // F/B -> F-B
    .replace(/[^\w\s-]/g, " ")                        // strip other punct
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
}

// Expand cryptic cosmetic SKU descriptions before slugifying so the file
// name reflects what the product actually is. Mirrors expandCosmeticName
// in scripts/fetch-images.mjs.
function expandCosmeticName(p) {
  const base = (p.rawName || p.name || "").toString();
  let s = " " + base + " ";
  const abbr = [
    [/\bPT\b/gi, "Purete Thermale"],
    [/\bM\.?89\b/gi, "Mineral 89"],
    [/\bMIN\.?\s?89\b/gi, "Mineral 89"],
    [/\bLFT\b/gi, "Liftactiv"],
    [/\bLIFT\b(?!ACT)/gi, "Liftactiv"],
    [/\bNEO\b/gi, "Neovadiol"],
    [/\bDB\b/gi, "Dermablend"],
    [/\bDEM\b/gi, "Dermablend"],
    [/\bEFF\b/gi, "Effaclar"],
    [/\bTOL\b/gi, "Toleriane"],
    [/\bCICA\b/gi, "Cicaplast"],
    [/\bLIP\b/gi, "Lipikar"],
    [/\bHOM\b/gi, "Homme"],
    [/\bWAT\b/gi, "Water"],
    [/\bMIC\b/gi, "Micellar"],
    [/\bSENS\b/gi, "Sensitive"],
    [/\bCRM?\b/gi, "Cream"],
    [/\bLOT\b/gi, "Lotion"],
    [/\bSPR\b/gi, "Spray"],
    [/\bSH\b/gi, "Shampoo"],
    [/\bM-?UP\b/gi, "Make-up"],
    [/\bREM\b/gi, "Remover"],
    [/\bSOOT\b/gi, "Soothing"],
    [/\bPERFEC\b/gi, "Perfecting"],
    [/\bMOUS\b/gi, "Mousse"],
    [/\bINV\b/gi, "Invisible"],
    [/\bHYDRA\b/gi, "Hydra"],
    [/\bMAT\b(?!CH)/gi, "Mat"],
    [/\bANTI[- ]?TR\b/gi, "Anti-Transpirant"],
    [/\bDEO\b/gi, "Deodorant"]
  ];
  for (const [re, rep] of abbr) s = s.replace(re, rep);
  s = s.replace(/\b[FJTBSP](\d+(?:\.\d+)?)\s*(ml|gr|kg|g)\b/gi, "$1$2");
  s = s.replace(/\b(?:GR|EN|FR|ES|PT|RU|EL|PL|DE|IT|NL|DU|DA|SCAN|GB|CH|CZ|HU|SK|RO|HR|BG|TR)\b/gi, "");
  return s.replace(/\s+/g, " ").trim();
}

function slugSourceFor(product) {
  // Cosmetics records carry .line, .rawName and 3 fixed brand keys.
  const isCosmetic = product.line && ["vichy", "laroche", "cerave"].includes(product.brand);
  if (!isCosmetic) return product.name;
  const expanded = expandCosmeticName(product);
  const brandName = ({ vichy: "Vichy", laroche: "La Roche-Posay", cerave: "CeraVe" })[product.brand] || "";
  function reEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  const lineRe = product.line ? new RegExp(`\\b${reEscape(product.line)}\\b`, "i") : null;
  const linePart = (product.line && !lineRe.test(expanded)) ? product.line + " " : "";
  const brandRe = brandName ? new RegExp(`\\b${reEscape(brandName)}\\b`, "i") : null;
  const head = linePart + expanded;
  const brandPart = (brandName && !brandRe.test(head)) ? brandName + " " : "";
  return (brandPart + head).replace(/\s+/g, " ").trim();
}

export function makeNewName(product, ext) {
  const slug = slugify(slugSourceFor(product)) || product.brand;
  return `${slug}-${product.barcode}.${ext}`;
}

async function loadProducts() {
  const ctx = { console, Math, JSON, RegExp, Array, Object, String, Map, Set };
  vm.createContext(ctx);
  const data = await fs.readFile(path.join(ROOT, "js/data.js"), "utf8");
  vm.runInContext(data + "\nglobalThis.PRODUCTS=PRODUCTS;", ctx);
  const products = [...ctx.PRODUCTS];

  // Also include cosmetics
  try {
    const ccode = await fs.readFile(path.join(ROOT, "js/cosmetics-data.js"), "utf8");
    const cctx = {};
    vm.createContext(cctx);
    vm.runInContext(ccode + "\nglobalThis.COSMETICS=COSMETICS_PRODUCTS;", cctx);
    products.push(...(cctx.COSMETICS || []));
  } catch {}

  return products;
}

async function main() {
  const products = await loadProducts();
  const productByBarcode = new Map(products.map(p => [p.barcode, p]));
  const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8"));
  const newManifest = {};

  let renamed = 0, unchanged = 0, missing = 0, orphan = 0;

  for (const [barcode, oldFile] of Object.entries(manifest)) {
    if (barcode.startsWith("_")) continue;  // skip _comment entries
    const product = productByBarcode.get(barcode);
    if (!product) {
      console.log(`  ORPHAN ${barcode} -> ${oldFile} (no product in catalog)`);
      orphan++;
      continue;
    }
    const ext = path.extname(oldFile).slice(1).toLowerCase() || "jpg";
    const newBase = makeNewName(product, ext);
    // Preserve the existing subfolder layout (e.g. "sunscreens/foo.jpg" → "sunscreens/<newBase>")
    const subfolder = path.dirname(oldFile).replace(/\\/g, "/");
    const newFile = (subfolder && subfolder !== ".") ? `${subfolder}/${newBase}` : newBase;
    newManifest[barcode] = newFile;

    if (oldFile === newFile) { unchanged++; continue; }

    const oldPath = path.join(IMG_DIR, oldFile);
    const newPath = path.join(IMG_DIR, newFile);

    try {
      if (!DRY_RUN) await fs.rename(oldPath, newPath);
      console.log(`  ${oldFile.padEnd(45)} -> ${newFile}`);
      renamed++;
    } catch (e) {
      if (e.code === "ENOENT") {
        // Maybe already renamed in a previous run
        try {
          await fs.access(newPath);
          console.log(`  (already at) ${newFile}`);
          unchanged++;
        } catch {
          console.log(`  MISSING source: ${oldFile}`);
          missing++;
        }
      } else throw e;
    }
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] no files actually moved, no manifest written.");
  } else {
    await fs.writeFile(MANIFEST_FILE, JSON.stringify(newManifest, null, 2) + "\n", "utf8");
    const clean = Object.fromEntries(Object.entries(newManifest).filter(([k]) => !k.startsWith("_")));
    const js = "// Auto-generated από το scripts/rename-images.mjs / fetch-images.mjs.\n"
             + "// Συγχρονισμένο με images/manifest.json — μην το επεξεργαστείτε χειροκίνητα.\n"
             + "window.IMAGE_MANIFEST = " + JSON.stringify(clean, null, 2) + ";\n";
    await fs.writeFile(MANIFEST_JS_FILE, js, "utf8");
  }

  console.log(`\nDone. renamed=${renamed}  unchanged=${unchanged}  missing=${missing}  orphan=${orphan}`);
}

main().catch(err => { console.error(err); process.exit(1); });
