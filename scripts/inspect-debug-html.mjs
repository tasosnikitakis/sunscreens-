#!/usr/bin/env node
// scripts/inspect-debug-html.mjs
// Σαρώνει τα HTML αρχεία που έσωσε το fetch-descriptions.mjs --save-html
// και τυπώνει σύνοψη: τίτλο σελίδας, μέγεθος, αν περιέχει vichy.gr / προϊοντικά
// pattern, και αν είναι actual search results ή κάποιο interstitial.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "images", "_debug_descriptions");

async function main() {
  let files;
  try { files = await fs.readdir(DIR); }
  catch { console.log(`No debug folder at ${DIR}`); return; }
  files = files.filter(f => f.endsWith(".html")).sort();
  console.log(`Found ${files.length} HTML files in ${DIR}\n`);

  for (const f of files) {
    const html = await fs.readFile(path.join(DIR, f), "utf8");
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.slice(0, 80) || "<no title>";
    const size = html.length;
    const vichyCount = (html.match(/vichy\.(gr|com)/g) || []).length;
    const larocheCount = (html.match(/laroche-posay\.(gr|com)/g) || []).length;
    const ceraveCount = (html.match(/cerave\.(gr|com)/g) || []).length;
    const h2Count = (html.match(/<h2/g) || []).length;
    const bAlgoCount = (html.match(/b_algo/g) || []).length;
    const resultAClass = (html.match(/result__a/g) || []).length;
    const looksCookie = /cookie|consent|gdpr|onetrust|cookiebot/i.test(html) && size < 80000;
    const looksRegion = /select.{0,20}(region|country|location|language)/i.test(html) && size < 50000;
    const looksRecaptcha = /g-recaptcha|recaptcha\/api\.js/.test(html);
    const looksCloudflare = /cf-browser-verification|just a moment|checking your browser|attention required/i.test(html);
    const flags = [];
    if (looksCookie) flags.push("COOKIE");
    if (looksRegion) flags.push("REGION");
    if (looksRecaptcha) flags.push("reCAPTCHA");
    if (looksCloudflare) flags.push("CF-WALL");
    console.log(`=== ${f}`);
    console.log(`  title:     ${title}`);
    console.log(`  size:      ${size.toLocaleString()} bytes`);
    console.log(`  brand hits: vichy=${vichyCount}  laroche=${larocheCount}  cerave=${ceraveCount}`);
    console.log(`  parsing:   <h2>=${h2Count}  b_algo=${bAlgoCount}  result__a=${resultAClass}`);
    console.log(`  flags:     ${flags.length ? flags.join(" ") : "none"}`);
    console.log("");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
