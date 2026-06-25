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

export function makeNewName(product, ext) {
  const slug = slugify(product.name) || product.brand;
  return `${slug}-${product.barcode}.${ext}`;
}

async function loadProducts() {
  const ctx = { console, Math, JSON, RegExp, Array, Object, String, Map, Set };
  vm.createContext(ctx);
  const data = await fs.readFile(path.join(ROOT, "js/data.js"), "utf8");
  vm.runInContext(data + "\nglobalThis.PRODUCTS=PRODUCTS;", ctx);
  return ctx.PRODUCTS;
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
    const newFile = makeNewName(product, ext);
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
