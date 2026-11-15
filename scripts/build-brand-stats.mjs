#!/usr/bin/env node
// scripts/build-brand-stats.mjs
// Ανά brand (js/brands.js): πλήθος προϊόντων, με τιμή, ενότητες και πλήθος ανά φίλτρο ποιότητας (CatalogExport.flags/passes —
// ίδια λογική με τις σελίδες brand) → js/brand-stats.js (window.BRAND_STATS) για τη σελίδα «Εταιρίες» (κάρτες + μαζική λήψη XLSX).
// Τα αρχεία του browser (brands.js, manifest, utils.js, catalog-export.js, <brand>-*.js) τρέχουν σε vm context. Ξανατρέχει μετά από κάθε build.
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx; vm.createContext(ctx);
const run = async f => vm.runInContext((await fs.readFile(path.join(ROOT, f), "utf8")).replace(/^(const|let) /gm, "var "), ctx, { filename: f });
for (const f of ["js/brands.js", "images/manifest.js", "js/utils.js", "js/catalog-export.js"]) await run(f);
const B = ctx.BRAND_CATALOGS, BU = ctx.BRAND_CATALOGS_UTIL, CE = ctx.CatalogExport;
const out = {};
for (const [key, cfg] of Object.entries(B)) {
  for (const part of ["supplier", "overrides", "supplemental", "sections"]) { try { await run(`js/${key}-${part}.js`); } catch {} }
  const data = BU.data(cfg, ctx);
  const sup = data.supplier;
  const modes = Object.fromEntries(CE.MODES.map(([m]) => [m, 0]));
  const sections = new Set();
  for (const p of sup) {
    const e = BU.enrichmentFor(cfg, p.barcode, data);
    if (e.section) sections.add(e.section);
    const f = CE.flags(p, e);
    for (const m of Object.keys(modes)) if (CE.passes(f, m)) modes[m]++;
  }
  out[key] = { products: sup.length, priced: modes.priced, sections: sections.size, modes };
}
await fs.writeFile(path.join(ROOT, "js/brand-stats.js"), "// Auto-generated (scripts/build-brand-stats.mjs): πλήθος προϊόντων ανά brand και ανά φίλτρο για τη σελίδα «Εταιρίες».\nwindow.BRAND_STATS = " + JSON.stringify(out, null, 2) + ";\n", "utf8");
console.log(Object.entries(out).map(([k, v]) => `${k}:${v.products}/${v.priced}/ok${v.modes.ok}`).join(" "));
