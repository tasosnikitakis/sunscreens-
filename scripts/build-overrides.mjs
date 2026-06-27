#!/usr/bin/env node
// scripts/build-overrides.mjs
// Διαβάζει το χειροκίνητο js/seasonal-overrides.json (barcode → URL)
// και κατεβάζει από κάθε URL το og:title και το og:description ώστε να
// γράψει το τελικό js/seasonal-overrides.js (window.SEASONAL_OVERRIDES).
//
// Έτσι το mapping που συντηρούμε είναι σύντομο (barcode → URL), ενώ τα
// πραγματικά metadata παραμένουν φρέσκα: ξανατρέχουμε το script όποτε
// το brand site αλλάξει περιγραφές.
//
// Χρήση:
//   node scripts/build-overrides.mjs
//   node scripts/build-overrides.mjs --debug
//   node scripts/build-overrides.mjs --barcode=3663555001457

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IN_FILE = path.join(ROOT, "js/seasonal-overrides.json");
const OUT_FILE = path.join(ROOT, "js/seasonal-overrides.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const ONLY = opt("barcode", null);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = (...a) => { if (DEBUG) console.log("   ", ...a); };

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "el-GR,el;q=0.9"
    },
    redirect: "follow"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function decodeHtml(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function extractMeta(html) {
  const og = (...names) => {
    for (const n of names) {
      let m = html.match(new RegExp(`<meta[^>]+property=["']${n}["'][^>]+content=["']([^"']+)["']`, "i"));
      if (m) return decodeHtml(m[1]);
      m = html.match(new RegExp(`<meta[^>]+name=["']${n}["'][^>]+content=["']([^"']+)["']`, "i"));
      if (m) return decodeHtml(m[1]);
    }
    return null;
  };
  return {
    title: og("og:title", "twitter:title"),
    description: og("og:description", "description", "twitter:description")
  };
}

function cleanupTitle(t) {
  if (!t) return null;
  let s = t.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*[\|–\-—]\s*Compeed\s*®?\s*$/i, "").trim();
  return s || null;
}

function cleanupDescription(d) {
  if (!d) return null;
  let s = d.replace(/\s+/g, " ").trim();
  if (s.length > 600) s = s.slice(0, 597).replace(/\s+\S*$/, "") + "...";
  return s || null;
}

async function main() {
  const text = await fs.readFile(IN_FILE, "utf8");
  const json = JSON.parse(text);
  const overrides = json.overrides || {};
  const barcodes = Object.keys(overrides).filter(k => !ONLY || k === ONLY);

  if (barcodes.length === 0) {
    console.log(`Κανένα override${ONLY ? ` για barcode=${ONLY}` : ""}. Επεξεργαστείτε το ${path.relative(ROOT, IN_FILE)}.`);
    return;
  }

  console.log(`Building ${barcodes.length} overrides…\n`);
  const out = {};
  let ok = 0, fail = 0;
  for (const bc of barcodes) {
    const spec = overrides[bc];
    const url = spec.url;
    if (!url) { console.log(`${bc} (no URL — skip)`); fail++; continue; }
    try {
      dbg(`GET ${url}`);
      const html = await fetchText(url);
      const meta = extractMeta(html);
      const name = spec.name || cleanupTitle(meta.title);
      const description = spec.description || cleanupDescription(meta.description);
      const host = new URL(url).hostname.replace(/^www\./, "");
      out[bc] = { name, description, source: host, url };
      console.log(`${bc} OK ${host} — ${(name || "").slice(0, 70)}`);
      ok++;
    } catch (e) {
      console.log(`${bc} ERR ${e.message}`);
      fail++;
    }
    await sleep(400);
  }

  const banner = "// Auto-generated από το scripts/build-overrides.mjs.\n"
               + "// Πηγή: js/seasonal-overrides.json (χειροκίνητο mapping barcode → URL).\n"
               + "// Έχει προτεραιότητα πάνω από το seasonal-enrichment.js για 100%\n"
               + "// σωστά ονόματα/περιγραφές σε brands όπου το fuzzy match αποτυγχάνει.\n";
  await fs.writeFile(OUT_FILE,
    banner + "window.SEASONAL_OVERRIDES = " + JSON.stringify(out, null, 2) + ";\n", "utf8");
  console.log(`\nDone. built=${ok}  failed=${fail}.  Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
