#!/usr/bin/env node
// scripts/fix-pforal-site.mjs — καθάρισμα του js/pforal-site.json μετά το scrape-brand.mjs --brand=pforal
//   · fullTitle χωρίς « | Oral Care» (SEO <title>)
//   · ίδια σελίδα δύο φορές (URL …-7044702c και …-7044702c2, ίδιο EAN) → κρατάμε αυτή με τις περισσότερες ενότητες
//   · ίδιο όνομα με διαφορετικό EAN (παλιά/νέα σύνθεση στο site) → «(νέα έκδοση)» στο μεγαλύτερο EAN
// Χρήση: node scripts/fix-pforal-site.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../js/pforal-site.json");
let a = JSON.parse(await fs.readFile(FILE, "utf8"));
const tabsN = p => Object.keys(p.details.tabs || {}).length;
for (const p of a) {
  const d = p.details;
  d.title = d.title.replace(/\s*\|\s*Oral Care\s*$/i, "").replace(/\bOδοντ/g, "Οδοντ").trim();   // λατινικό O → ελληνικό Ο
  d.fullTitle = d.title; p.name = d.title;
  delete d.duplicateOf;
}
const byEan = {};
for (const p of a) (byEan[p.details.gtin] ||= []).push(p);
let dup = 0;
for (const g of Object.values(byEan)) if (g.length > 1) {
  g.sort((x, y) => tabsN(y) - tabsN(x));
  for (const p of g.slice(1)) { p.details.duplicateOf = g[0].url; dup++; }
}
a = a.filter(p => !p.details.duplicateOf);
const byName = {};
for (const p of a) (byName[p.details.title.toLowerCase().replace(/\s+/g, " ")] ||= []).push(p);
let ren = 0;
for (const g of Object.values(byName)) if (g.length > 1) {
  g.sort((x, y) => x.details.gtin.localeCompare(y.details.gtin));
  for (const p of g.slice(1)) { p.details.fullTitle = `${p.details.title} (νέα έκδοση)`; ren++; }
}
await fs.writeFile(FILE, JSON.stringify(a, null, 2), "utf8");
console.log(`pforal-site.json: ${a.length} σελίδες (μετά τις διπλές) · διπλές ${dup} · «νέα έκδοση» ${ren}`);
