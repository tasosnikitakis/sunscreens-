#!/usr/bin/env node
// scripts/migrate-images-to-subfolders.mjs
// One-shot migration: μετακινεί τα ήδη υπάρχοντα αρχεία εικόνων από το
// images/ στο images/sunscreens/ ή images/cosmetics/ ανάλογα με τη
// κατηγορία του προϊόντος (με βάση το barcode στο js/data.js και στο
// js/cosmetics-data.js). Ενημερώνει αντίστοιχα το images/manifest.json
// και το images/manifest.js ώστε οι σελίδες να δείχνουν τις σωστές
// διαδρομές.
//
// Χρήση:  node scripts/migrate-images-to-subfolders.mjs [--dry-run]

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

async function loadCatalogs() {
  const ctx = { console, Math, JSON, RegExp, Array, Object, String, Map, Set };
  vm.createContext(ctx);
  const sun = await fs.readFile(path.join(ROOT, "js/data.js"), "utf8");
  vm.runInContext(sun + "\nglobalThis.SUN=PRODUCTS;", ctx);
  let cosmetics = [];
  try {
    const cos = await fs.readFile(path.join(ROOT, "js/cosmetics-data.js"), "utf8");
    vm.runInContext(cos + "\nglobalThis.COS=COSMETICS_PRODUCTS;", ctx);
    cosmetics = ctx.COS || [];
  } catch {}
  return { sunscreens: ctx.SUN || [], cosmetics };
}

function classifyBarcode(barcode, sunSet, cosSet) {
  if (sunSet.has(barcode)) return "sunscreens";
  if (cosSet.has(barcode)) return "cosmetics";
  return null;
}

async function main() {
  const { sunscreens, cosmetics } = await loadCatalogs();
  const sunSet = new Set(sunscreens.map(p => p.barcode));
  const cosSet = new Set(cosmetics.map(p => p.barcode));

  if (!DRY_RUN) {
    await fs.mkdir(path.join(IMG_DIR, "sunscreens"), { recursive: true });
    await fs.mkdir(path.join(IMG_DIR, "cosmetics"), { recursive: true });
  }

  const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8"));
  const newManifest = {};
  let moved = 0, already = 0, missing = 0, orphan = 0;

  for (const [barcode, filename] of Object.entries(manifest)) {
    if (barcode.startsWith("_")) continue;
    const subfolder = classifyBarcode(barcode, sunSet, cosSet);
    if (!subfolder) {
      console.log(`  ORPHAN ${barcode} -> ${filename} (no product)`);
      orphan++;
      continue;
    }

    // Already in subfolder?
    if (filename.startsWith(subfolder + "/")) {
      newManifest[barcode] = filename;
      already++;
      continue;
    }

    const baseName = path.basename(filename);
    const newRel = `${subfolder}/${baseName}`;
    const oldAbs = path.join(IMG_DIR, filename);
    const newAbs = path.join(IMG_DIR, newRel);

    try {
      if (!DRY_RUN) await fs.rename(oldAbs, newAbs);
      console.log(`  ${filename.padEnd(75)} -> ${newRel}`);
      newManifest[barcode] = newRel;
      moved++;
    } catch (e) {
      if (e.code === "ENOENT") {
        // Maybe already migrated; check destination
        try {
          await fs.access(newAbs);
          newManifest[barcode] = newRel;
          already++;
        } catch {
          console.log(`  MISSING ${filename}`);
          missing++;
        }
      } else throw e;
    }
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] no files moved, no manifest written.");
  } else {
    await fs.writeFile(MANIFEST_FILE, JSON.stringify(newManifest, null, 2) + "\n", "utf8");
    const clean = Object.fromEntries(Object.entries(newManifest).filter(([k]) => !k.startsWith("_")));
    const js = "// Auto-generated από το scripts/migrate-images-to-subfolders.mjs / fetch-images.mjs.\n"
             + "// Συγχρονισμένο με images/manifest.json — μην το επεξεργαστείτε χειροκίνητα.\n"
             + "window.IMAGE_MANIFEST = " + JSON.stringify(clean, null, 2) + ";\n";
    await fs.writeFile(MANIFEST_JS_FILE, js, "utf8");
  }

  console.log(`\nDone. moved=${moved}  already-in-subfolder=${already}  missing=${missing}  orphan=${orphan}`);
}

main().catch(err => { console.error(err); process.exit(1); });
