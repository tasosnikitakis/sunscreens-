#!/usr/bin/env node
// scripts/build-brand-stats.mjs
// Μετρά ανά brand (js/brands.js) τα προϊόντα του καταλόγου, όσα έχουν χονδρική τιμή και τις ενότητες → js/brand-stats.js
// (window.BRAND_STATS) για τις κάρτες της σελίδας «Εταιρίες» (brands.html). Ξανατρέχει μετά από κάθε build-brand-supplier.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWindowFile } from "./lib-frezyderm.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const B = (await loadWindowFile(path.join(ROOT, "js/brands.js"))).BRAND_CATALOGS;
const out = {};
for (const [key, cfg] of Object.entries(B)) {
  const K = key.toUpperCase();
  let sup = [], ov = {}, supl = {};
  try { sup = (await loadWindowFile(path.join(ROOT, `js/${key}-supplier.js`)))[`${K}_SUPPLIER`] || []; } catch {}
  try { ov = (await loadWindowFile(path.join(ROOT, `js/${key}-overrides.js`)))[`${K}_OVERRIDES`] || {}; } catch {}
  try { supl = (await loadWindowFile(path.join(ROOT, `js/${key}-supplemental.js`)))[`${K}_SUPPLEMENTAL`] || {}; } catch {}
  const sections = new Set(sup.map(p => (ov[p.barcode] || supl[p.barcode] || {}).section).filter(Boolean));
  out[key] = { products: sup.length, priced: sup.filter(p => p.wholesale > 0 || p.retail > 0).length, sections: sections.size };
}
await fs.writeFile(path.join(ROOT, "js/brand-stats.js"), "// Auto-generated (scripts/build-brand-stats.mjs): πλήθος προϊόντων ανά brand για τη σελίδα «Εταιρίες».\nwindow.BRAND_STATS = " + JSON.stringify(out, null, 2) + ";\n", "utf8");
console.log(Object.entries(out).map(([k, v]) => `${k}:${v.products}/${v.priced}`).join(" "));
