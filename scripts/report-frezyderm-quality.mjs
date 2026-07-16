#!/usr/bin/env node
// scripts/report-frezyderm-quality.mjs
// Αναλύει την τρέχουσα κατάσταση των Frezyderm περιγραφών (overrides +
// supplemental cascade) και τυπώνει στατιστικά + λίστα με τα προβληματικά.
// Γράφει και _debug/frezyderm-quality-report.json για downstream χρήση
// (πχ fill-frezyderm-missing --retry-flagged).
//
// Χρήση:
//   node scripts/report-frezyderm-quality.mjs
//   node scripts/report-frezyderm-quality.mjs --reason=pharmacy-fluff

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUPPLIER_FILE = path.join(ROOT, "js/frezyderm-supplier.js");
const OVERRIDES_FILE = path.join(ROOT, "js/frezyderm-overrides.js");
const SUPPLEMENTAL_FILE = path.join(ROOT, "js/frezyderm-supplemental.js");
const OUT_FILE = path.join(ROOT, "_debug", "frezyderm-quality-report.json");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const REASON_FILTER = opt("reason", null);

// Duplicate function of js/utils.js so scripts don't depend on browser env.
function frezydermDescriptionQuality(desc) {
  const reasons = [];
  const s = (desc || "").trim();
  if (!s) return { ok: false, reasons: ["missing"] };
  if (s.length < 120) reasons.push("too-short");
  if (/(σε προσφορά στο\s+Pharm24|Δωρε[άα]ν μεταφορικ[άα]|σε αγορ[έε]ς [άα]νω των|Online\s+Pharmacy|Ofarmakopoiosmou)/i.test(s)) reasons.push("pharmacy-fluff");
  const greekChars = (s.match(/[α-ωΑ-Ωά-ώΆ-Ώ]/g) || []).length;
  const latinChars = (s.match(/[a-zA-Z]/g) || []).length;
  if (latinChars > 30 && greekChars < latinChars / 3) reasons.push("english-only");
  if (s.length < 220 && /(\.{3,}|…)\s*$/.test(s)) reasons.push("truncated");
  return { ok: reasons.length === 0, reasons };
}

const REASON_LABELS = {
  "missing":        "Λείπει περιγραφή",
  "too-short":      "Πολύ κοντή περιγραφή",
  "pharmacy-fluff": "Pharmacy filler",
  "english-only":   "Αγγλικά αντί Ελληνικά",
  "truncated":      "Truncated (…)"
};

async function loadJs(filePath, globalName) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  try { vm.runInContext(await fs.readFile(filePath, "utf8"), ctx); } catch {}
  return ctx.window[globalName] || (Array.isArray(ctx.window[globalName]) ? [] : {});
}

async function main() {
  const supplier = await loadJs(SUPPLIER_FILE, "FREZYDERM_SUPPLIER");
  const overrides = await loadJs(OVERRIDES_FILE, "FREZYDERM_OVERRIDES");
  const supplemental = await loadJs(SUPPLEMENTAL_FILE, "FREZYDERM_SUPPLEMENTAL");

  const flagged = [];
  const reasonCounts = {};
  let okCount = 0, totalWithDesc = 0;

  for (const p of supplier) {
    const o = overrides[p.barcode] || {};
    const s = supplemental[p.barcode] || {};
    const desc = o.description || s.description || null;
    const source = o.source || s.source || "(none)";
    const name = o.name || s.name || p.name;
    const url = o.url || s.url || null;

    const q = frezydermDescriptionQuality(desc);
    if (q.ok) { okCount++; totalWithDesc++; continue; }
    if (desc) totalWithDesc++;

    for (const r of q.reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;

    if (REASON_FILTER && !q.reasons.includes(REASON_FILTER)) continue;

    flagged.push({
      barcode: p.barcode,
      name,
      source,
      url,
      reasons: q.reasons,
      descLength: (desc || "").length
    });
  }

  console.log(`Frezyderm description quality report`);
  console.log(`====================================`);
  console.log(`Total products:  ${supplier.length}`);
  console.log(`With description: ${totalWithDesc}`);
  console.log(`OK descriptions: ${okCount}`);
  console.log(`Flagged:         ${supplier.length - okCount}\n`);
  console.log(`By reason:`);
  for (const [r, n] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${r.padEnd(18)} ${REASON_LABELS[r] || r}   ${n}`);
  }

  if (REASON_FILTER) {
    console.log(`\nFiltered: only "${REASON_FILTER}" (${flagged.length})\n`);
  } else {
    console.log(`\nAll flagged (${flagged.length}):\n`);
  }

  for (const f of flagged) {
    console.log(`  ${f.barcode.padEnd(13)} [${f.reasons.join(",")}] (${f.descLength}c ${f.source})  ${(f.name || "").slice(0, 60)}`);
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, JSON.stringify({
    totals: { products: supplier.length, ok: okCount, flagged: supplier.length - okCount, reasonCounts },
    flagged
  }, null, 2), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, OUT_FILE)} (${flagged.length} flagged entries).`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
