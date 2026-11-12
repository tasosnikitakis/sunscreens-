#!/usr/bin/env node
// scripts/discontinued-report.mjs
// Σημείωση ελέγχου αποσυρμένων προϊόντων → reports/Αποσυρμένα προϊόντα.md
//
// Διαβάζει όλα τα js/<brand>-discontinued.json (brands του js/brands.js):
//   { "<barcode>": { name, retail, wholesale, status, checked, reason, successor, successorName, evidence[] } }
// Τα προϊόντα αυτά ΔΕΝ μπαίνουν στον κατάλογο (build-brand-supplier.mjs τα
// εξαιρεί). Η σημείωση είναι για να τα επιβεβαιώσετε με τον αντιπρόσωπο και
// να τα αφαιρέσετε από το Excel του προμηθευτή — ή, αν τελικά κυκλοφορούν,
// να σβήσετε την εγγραφή από το JSON και να ξανατρέξετε τα βήματα build → match.
//
// Χρήση:  node scripts/discontinued-report.mjs      (τρέχει και από το generate-catalog.mjs)

import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "reports", "Αποσυρμένα προϊόντα.md");

const money = v => (typeof v === "number" && v > 0) ? v.toFixed(2).replace(".", ",") + " €" : "—";
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export async function writeDiscontinuedReport() {
  const win = {};
  vm.runInNewContext(await fs.readFile(path.join(ROOT, "js/brands.js"), "utf8"), { window: win });
  const brands = Object.values(win.BRAND_CATALOGS || {});
  const sections = [];
  let total = 0, pending = 0;

  for (const cfg of brands) {
    let data;
    try { data = JSON.parse(await fs.readFile(path.join(ROOT, `js/${cfg.key}-discontinued.json`), "utf8")); } catch { continue; }
    const items = Object.entries(data).filter(([k]) => !k.startsWith("_")).map(([barcode, v]) => ({ barcode, ...v }));
    if (!items.length) continue;
    total += items.length;
    pending += items.filter(i => /επιβεβα[ίι]ωση/i.test(i.status || "")).length;

    const rows = items.map(i => {
      const succ = i.successor ? `${i.successorName || i.successor} (EAN ${i.successor})` : "—";
      const ev = (i.evidence || []).map(u => `[${host(u)}](${u})`).join(", ") || "—";
      return `| ${i.barcode} | ${i.name || ""} | ${money(i.wholesale)} | ${money(i.retail)} | ${i.status || "—"} | ${i.checked || "—"} | ${(i.reason || "").replace(/\|/g, "/")} | ${succ} | ${ev} |`;
    });
    sections.push([
      `## ${cfg.name} (${cfg.host}) — ${items.length} ${items.length === 1 ? "προϊόν" : "προϊόντα"}`,
      "",
      "| Barcode | Όνομα (Excel προμηθευτή) | Χονδρική | Λιανική | Κατάσταση | Έλεγχος | Αιτιολόγηση | Αντικαταστάθηκε από | Πηγές |",
      "|---|---|---|---|---|---|---|---|---|",
      ...rows,
      ""
    ].join("\n"));
  }

  const md = [
    "# Αποσυρμένα προϊόντα — σημείωση ελέγχου",
    "",
    `> Παράγεται από το \`scripts/discontinued-report.mjs\` από τα αρχεία \`js/<brand>-discontinued.json\`. Μην το επεξεργάζεστε χειροκίνητα — αλλάξτε το JSON και ξανατρέξτε \`node scripts/generate-catalog.mjs\`.`,
    "",
    `Σύνολο: **${total}** ${total === 1 ? "προϊόν" : "προϊόντα"} εκτός καταλόγου, από τα οποία **${pending}** προς επιβεβαίωση.`,
    "",
    "**Τι είναι:** προϊόντα που υπάρχουν στο Excel (τιμοκατάλογο) του προμηθευτή αλλά δεν υπάρχουν πλέον στο επίσημο site της εταιρίας και τα ηλεκτρονικά φαρμακεία τα δείχνουν εξαντλημένα ή αποσυρμένα. Έχουν αφαιρεθεί από τον κατάλογο του site και από τα xlsx.",
    "",
    "**Τι κάνετε:**",
    "",
    "1. Επιβεβαιώστε με τον αντιπρόσωπο της εταιρίας αν το προϊόν έχει πράγματι αποσυρθεί ή αν απλώς δεν έχει σελίδα στο site.",
    "2. Αν αποσύρθηκε: αφαιρέστε τη γραμμή από το Excel του προμηθευτή και αλλάξτε το `status` σε `επιβεβαιωμένο` στο JSON. Αν υπάρχει διάδοχο προϊόν, είναι ήδη στον κατάλογο (στήλη «Αντικαταστάθηκε από»).",
    "3. Αν τελικά κυκλοφορεί: σβήστε την εγγραφή από το `js/<brand>-discontinued.json` και ξανατρέξτε `build-brand-supplier.mjs` → `match-<brand>.mjs` → `fill-brand-missing.mjs` → `generate-catalog.mjs`.",
    "",
    "**Πώς εντοπίζονται νέα υποψήφια:** στη σελίδα κάθε brand, φίλτρο «⛔ Μόνο χωρίς σελίδα …» — όσα δεν βρίσκει ούτε το `fill-brand-missing.mjs` σε φαρμακεία είναι πιθανώς αποσυρμένα.",
    "",
    ...sections
  ].join("\n");

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, md, "utf8");
  return { total, pending, file: OUT };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeDiscontinuedReport().then(r => console.log(`Έγραψε ${path.relative(ROOT, r.file)} (${r.total} προϊόντα, ${r.pending} προς επιβεβαίωση).`))
    .catch(err => { console.error("FATAL:", err); process.exit(1); });
}
