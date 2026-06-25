#!/usr/bin/env node
// scripts/parse-cosmetics-xlsx.mjs
// One-shot script: reads the supplier's cosmetics XLSX and emits a JSON file
// with the products in a clean shape that the website can consume.

import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";

const IN_XLSX = process.argv[2];
if (!IN_XLSX) { console.error("Usage: node parse-cosmetics-xlsx.mjs <path/to/file.xlsx>"); process.exit(1); }
const OUT_JSON = path.resolve("/tmp/cosmetics-raw.json");
const TMP_DIR = "/tmp/_xlsx_unzip_" + Date.now();

execSync(`rm -rf "${TMP_DIR}" && mkdir -p "${TMP_DIR}" && unzip -q -o "${IN_XLSX}" -d "${TMP_DIR}"`);

const sst = await fs.readFile(`${TMP_DIR}/xl/sharedStrings.xml`, "utf8");
const sheet = await fs.readFile(`${TMP_DIR}/xl/worksheets/sheet1.xml`, "utf8");

// Parse shared strings
const strings = [];
for (const m of sst.matchAll(/<si>(.*?)<\/si>/gs)) {
  // <si><t>foo</t></si>  or  <si><r>...</r><r>...</r></si>
  const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]);
  strings.push(texts.join("").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}
console.log(`Shared strings: ${strings.length}`);

// Parse rows
const rows = [];
for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
  const cellsMap = {};
  for (const cm of rm[1].matchAll(/<c\s+r="([A-Z]+)\d+"(?:[^>]*?\s+t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?<\/c>/g)) {
    const col = cm[1];
    const type = cm[2];
    let v = cm[3] ?? cm[4] ?? "";
    if (type === "s") v = strings[parseInt(v)] ?? "";
    cellsMap[col] = v;
  }
  rows.push(cellsMap);
}
console.log(`Rows: ${rows.length}`);

await fs.writeFile(OUT_JSON, JSON.stringify(rows, null, 2));
console.log(`Wrote ${OUT_JSON}`);
console.log("\nFirst 3 data rows:");
rows.slice(0, 5).forEach(r => console.log(JSON.stringify(r)));
