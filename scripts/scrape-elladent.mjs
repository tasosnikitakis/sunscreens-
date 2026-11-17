#!/usr/bin/env node
// scripts/scrape-elladent.mjs
// Elladent (ελληνική εταιρία στοματικής υγιεινής) = www.elladent.gr — OpenCart (Journal2), χωρίς EAN.
// Προεπιλογή γλώσσας: αγγλικά → POST index.php?route=module/language (language_code=gr) με το cookie της συνεδρίας,
// όπως το κουμπί γλώσσας του site. Λίστα: index.php?route=information/sitemap (σύνδεσμοι προϊόντων).
// Σελίδα: <h1> τίτλος, og:image, #tab-description = γραμμές με επικεφαλίδες «Ιδανικό», «Περιέχει»/«Σύνθεση»,
//   «Πλεονεκτήματα», «Οδηγίες Χρήσης», «Συνδυάζεται» (+ ΚΕΦΑΛΑΙΑ για συσκευές: «5 ΠΡΟΓΡΑΜΜΑΤΑ», «ΜΟΝΑΔΙΚΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ»).
// Κλειδί: "ED-p<product_id>". Τιμές με js/elladent-manual-matches.json (barcode Medica → κλειδί).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-elladent.mjs [--limit=3] [--delay=2000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/elladent-site.json");
const BASE = "https://www.elladent.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "2000"));
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
let COOKIE = "";
function keepCookies(res) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const jar = Object.fromEntries(COOKIE.split("; ").filter(Boolean).map(c => [c.split("=")[0], c]));
  for (const c of set) { const kv = c.split(";")[0]; jar[kv.split("=")[0]] = kv; }
  COOKIE = Object.values(jar).join("; ");
}
async function req(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Cookie: COOKIE, ...(init.headers || {}) }, redirect: "manual", signal: AbortSignal.timeout(60000) });
  keepCookies(res);
  return res;
}
async function fetchText(url) {
  let res = await req(url);
  for (let i = 0; i < 3 && res.status >= 300 && res.status < 400; i++) res = await req(new URL(res.headers.get("location"), url).href);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const HEAD = [
  [/^Ιδανικ[όήά]( για)?\s*:?$/i, "Ενδείξεις"],
  [/^(Περιέχει|Σύνθεση|Δραστικά Συστατικά.*)\s*:?$/i, "Δραστικά συστατικά"],
  [/^(Πλεονεκτήματα|Κύρια Οφέλη.*)\s*:?$/i, "Πλεονεκτήματα"],
  [/^[OΟ]δηγίες Χρήσης\s*:?$/i, "Χρήση"],              // και με λατινικό «O»
  [/^Συνδυάζεται( ιδανικά με)?\s*:?$/i, "Συνδυάζεται"],
  [/^(Κατάλληλο για|Για ποιον είναι κατάλληλο;?)\s*:?$/i, "Κατάλληλο για"],
  [/^Η συσκευ[α]?σία περιλαμβάνει\s*:?$/i, "Περιεχόμενα συσκευασίας"],
  [/^Προσοχή\s*:?$/i, "Προφυλάξεις"]
];
const isCapsHead = l => l.length <= 40 && !/[.:,]$/.test(l) && /[Α-ΩA-Z]/.test(l) && l === l.toUpperCase() && !/^\d+$/.test(l);

export function extractElladentDetails(url, html) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  html = String(html || "");
  d.title = decodeAll((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  if (og) d.images.push(decodeAll(og));
  const i = html.indexOf('id="tab-description"');
  let desc = i < 0 ? "" : html.slice(html.indexOf(">", i) + 1, html.indexOf('<div class="social', i));
  desc = desc.replace(/<(br|\/div|\/p|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<[^>]+>/g, "");
  const lines = decodeAll(desc).replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").replace(/^[•·]\s*/, "").trim())
    .filter(l => l && !/^_{3,}$/.test(l) && !/^Ελληνικό Προϊόν$/i.test(l));
  let key = null, sub = null; const intro = [];
  for (const l of lines) {
    const h = HEAD.find(([re]) => re.test(l));
    if (h) { key = h[1]; sub = null; continue; }
    if (key && isCapsHead(l) || (!key && intro.length > 1 && isCapsHead(l))) { key = "Χαρακτηριστικά"; sub = l; d.tabs[key] = [d.tabs[key], sub + ":"].filter(Boolean).join("\n"); continue; }
    if (!key) { intro.push(l); continue; }
    d.tabs[key] = [d.tabs[key], (sub ? "• " : "") + l].filter(Boolean).join("\n");
  }
  // 1η γραμμή = «PERIO 020 Στοματικό Διάλυμα 250ml» (όνομα + συσκευασία)· οι υπόλοιπες = περιγραφή
  const sizeM = (intro[0] || "").match(/(\d+)\s?ml\b/i);
  if (sizeM) { d.size = `${sizeM[1]}ml`; d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; } else d.sizes = [];
  const descLines = intro.filter((l, k) => !(k === 0 && (sizeM || l.replace(/\W/g, "").toUpperCase() === d.title.replace(/\W/g, "").toUpperCase().slice(0, l.replace(/\W/g, "").length))));
  // συσκευές: «NOVAPULSE» / «Professional Sonic Toothbrush» ως πρώτες γραμμές = τίτλος, όχι περιγραφή
  while (descLines.length > 1 && descLines[0].length < 40 && !/[.!]$/.test(descLines[0])) descLines.shift();
  d.description = descLines.join("\n") || null;
  // μία μόνο φράση-σλόγκαν → μαζί με το «Ιδανικό για…» της σελίδας γίνεται η περιγραφή
  if ((d.description || "").length < 120 && d.tabs["Ενδείξεις"]) {
    d.description = [d.description, d.tabs["Ενδείξεις"]].filter(Boolean).join("\n");
    delete d.tabs["Ενδείξεις"];
  }
  // (τα πλεονεκτήματα μένουν μόνο ως ενότητα — όχι και ως «Βασικά χαρακτηριστικά»)
  const n = d.title;
  d.line = /NOVAPULSE|NOVAFLOSS|X-SOFT/i.test(n) ? "Συσκευές" : (n.match(/^(PERIO 020|CARE 012|PLUS 030|DAILY|SENSI ?•? ?D|PERIOXYGEN|DAYOXYGEN|SUCRA YL)/i) || [])[1] || null;
  if (d.line) { d.line = d.line.replace(/SENSI\W*D/i, "SENSI D"); d.series = d.line; d.attributes["Σειρά"] = d.line; }
  d.kind = /Στοματικό Διάλυμα/i.test(n) ? "mouthwash" : /Οδοντόπαστα/i.test(n) ? "toothpaste" : /Γέλη/i.test(n) ? "gel" : "device";
  const pid = (url.match(/product_id=(\d+)/) || [])[1] || url.split("/").pop().replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  d.handle = pid;
  d.imageLarge = d.images[0] || null;
  d.gtin = `ED-p${pid}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

async function main() {
  await fetchText(`${BASE}/`);
  await req(`${BASE}/index.php?route=module/language`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `language_code=gr&redirect=${encodeURIComponent(BASE + "/")}` });
  const sm = await fetchText(`${BASE}/index.php?route=information/sitemap`);
  const urls = [...new Set([...sm.matchAll(/<a href="([^"]+)"[^>]*>[^<]{2,80}<\/a>/g)].map(m => decodeAll(m[1]))
    .filter(u => /product_id=\d+/.test(u) || (/^https:\/\/www\.elladent\.gr\/[^?#]+$/.test(u) && /%CE|Γ/i.test(u))))];
  console.log(`elladent.gr: ${urls.length} σελίδες προϊόντων`);
  const out = []; let err = 0; const cap = Math.min(urls.length, LIMIT);
  for (let k = 0; k < cap; k++) {
    let html = null;
    try { html = await fetchText(urls[k]); } catch (e) { err++; console.log(`  ! ${urls[k]}: ${e.message}`); continue; }
    if (!/Στοματικό|Οδοντόπαστα|Γέλη|Περιγραφή/.test(html)) console.log(`  ! όχι ελληνικά: ${urls[k]}`);
    const d = extractElladentDetails(urls[k], html);
    out.push({ url: urls[k], section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: null, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${k + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(64)} ${(d.size || "-").padEnd(6)} ${d.gtin.padEnd(8)} | ${d.title}`);
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
