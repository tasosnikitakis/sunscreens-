#!/usr/bin/env node
// scripts/scrape-sostar.mjs
// Sostar (ελληνική εταιρία, καλλυντικά με γάλα γαϊδούρας κ.ά.) = www.sostar.gr — OpenCart 3 + Journal3, χωρίς EAN.
// Δεν έχει sitemap προϊόντων → λίστα από τις σελίδες σειρών («κατασκευαστές» του OpenCart, με ?page=N):
//   Το Γάλα, Focus, Mornin Glow, Cannabisoil, Ανδρική σειρά, Παιδική σειρά, Sostar Med. Διπλότυπα (ίδιο προϊόν σε 2 σειρές) → μία φορά.
// Σελίδα: <h1>, «Κωδικός: 89-704», σειρά (breadcrumb), τιμή λιανικής, καρτέλα «ΠΕΡΙΓΡΑΦΗ» (παράγραφοι· υπο-ενότητα
//   «Το γαϊδουρινό γάλα» κ.λπ.), καρτέλα «ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ» = πίνακας (Εφαρμογή, Συσκευασία, Συστατικά …).
// Εικόνα: image/cache/catalog/products/…-1000x1000h.jpg. Κλειδί: "SO-<κωδικός>". Τιμές Medica με js/sostar-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-sostar.mjs [--delay=2000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/sostar-site.json");
const BASE = "https://www.sostar.gr";
const LINES = ["Το-Γάλα", "Focus", "Mornin-Glow", "Cannabisoil", "ΑΝΔΡΙΚΗ-ΣΕΙΡΑ", "ΠΑΙΔΙΚΗ-ΣΕΙΡΑ", "Sostar-Med"];
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "2000"));
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
const toLines = h => decodeAll(String(h || "").replace(/<(br|\/?p|\/?div|\/?li|\/?h\d|\/tr)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "))
  .replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").trim()).filter(Boolean);

export function extractSostarDetails(url, raw) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const html = String(raw || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "");
  d.title = toLines((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]).join(" ");
  d.code = toLines((html.match(/product-model"><b>[^<]*<\/b>\s*<span>([^<]+)<\/span>/) || [])[1]).join("");
  const crumbs = [...(html.match(/<ul class="breadcrumb">([\s\S]*?)<\/ul>/) || ["", ""])[1].matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map(m => decodeAll(m[1]).trim()).filter(Boolean);
  d.line = crumbs.length >= 3 ? crumbs[crumbs.length - 2] : null;
  if (d.line) { d.series = d.line; d.attributes["Σειρά"] = d.line; }
  const price = (html.match(/class="product-price[^"]*">\s*([\d.,]+)\s*€/) || html.match(/"price":\s*"?([\d.]+)/) || [])[1];
  if (price) d.retailPrice = parseFloat(String(price).replace(/\./g, "").replace(",", ".")) || parseFloat(price);
  // καρτέλες
  const tabs = [...html.matchAll(/<a href="#(product_tabs-[a-z0-9]+)" data-toggle="tab">([^<]+)<\/a>/g)].map(m => [m[1], decodeAll(m[2]).trim()]);
  for (const [id, title] of tabs) {
    const i = html.indexOf(`id="${id}"`); if (i < 0) continue;
    const next = tabs.map(([x]) => html.indexOf(`id="${x}"`)).filter(x => x > i).sort((a, b) => a - b)[0];
    const end = Math.min(...[next, html.indexOf('id="bottom"', i), html.indexOf("ΑΠΟ ΤΗΝ ΙΔΙΑ", i)].filter(x => x > i));
    const body = html.slice(html.indexOf(">", i) + 1, end);
    if (/ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ/i.test(title)) {
      for (const r of body.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)) {
        const k = toLines(r[1]).join(" "), v = toLines(r[2]).join("\n"); if (!k || !v) continue;
        if (/^Συσκευασία/i.test(k)) { d.size = v.replace(/\s+/g, "").replace(/(\d)gr$/i, "$1g"); d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; continue; }
        const key = /Εφαρμογή|Χρήση|Οδηγίες/i.test(k) ? "Χρήση" : /Συστατικά|Σύνθεση|INCI/i.test(k) ? "Συστατικά" : /Προσοχή|Προφυλ/i.test(k) ? "Προφυλάξεις" : /Ενδεί|Κατάλληλ|Τύπος/i.test(k) ? "Κατάλληλο για" : k;
        d.tabs[key] = [d.tabs[key], v].filter(Boolean).join("\n");
      }
    } else {
      const lines = toLines(body);
      // υπο-ενότητα «Το γαϊδουρινό γάλα» / «Το έλαιο …» (σύντομη γραμμή-τίτλος) → «Βασικό συστατικό»
      const desc = []; let sub = null;
      for (const l of lines) {
        if (l.length < 45 && !/[.!]$/.test(l) && desc.length) { sub = l; continue; }
        if (sub) d.tabs["Βασικό συστατικό"] = [d.tabs["Βασικό συστατικό"], (d.tabs["Βασικό συστατικό"] ? "" : sub + ": ") + l].filter(Boolean).join("\n");
        else desc.push(l);
      }
      d.description = desc.join("\n") || null;
    }
  }
  if (!d.sizes) d.sizes = [];
  // κύρια εικόνα = og:image (…-600x315w.jpg) → η μεγαλύτερη παραλλαγή του ίδιου αρχείου (1000x1000 ή 1080x1625)
  const og = decodeAll((String(raw).match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || "");
  const stem = og.replace(/-\d+x\d+[wh]\.(jpg|jpeg|png|webp)$/i, "");
  const all = [...String(raw).matchAll(/https:\/\/www\.sostar\.gr\/image\/cache\/catalog\/[^"' ]+?\.(?:jpg|jpeg|png|webp)/gi)].map(m => decodeAll(m[0]));
  const pick = re => all.find(u => u.startsWith(stem + "-") && re.test(u));
  const main = stem && (pick(/-1000x1000[hw]\.\w+$/) || pick(/-1080x16\d\dw\.\w+$/) || og);
  if (main) d.images.push(main);
  // 2η εικόνα του ίδιου προϊόντος (…-2-1000x1000h.jpg)
  const second = all.find(u => u.startsWith(stem + "-2-1000x1000"));
  if (second) d.images.push(second);
  d.handle = decodeURIComponent(url.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop());
  d.imageLarge = d.images[0] || null;
  d.gtin = `SO-${(d.code || d.handle).replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

async function main() {
  const seen = new Map();   // product_id ή slug → url
  for (const line of LINES) {
    for (let pg = 1; pg < 10; pg++) {
      const u = `${BASE}/${encodeURIComponent(line)}${pg > 1 ? `?page=${pg}` : ""}`;
      const html = await fetchText(u); await sleep(DELAY_MS);
      for (const m of html.matchAll(/<div class="name"><a href="([^"]+)"/g)) {
        const href = decodeAll(m[1]).replace(/\?page=\d+$/, "").replace(/&page=\d+$/, "");
        const pid = (href.match(/product_id=(\d+)/) || [])[1];
        const key = pid || decodeURIComponent(href.split("/").pop());
        if (!seen.has(key)) seen.set(key, href);
      }
      const tot = html.match(/Εμφάνιση \d+ έως (\d+) από (\d+)/);
      if (!tot || +tot[1] >= +tot[2]) break;
    }
  }
  console.log(`sostar.gr: ${seen.size} προϊόντα σε ${LINES.length} σειρές`);
  const out = []; let err = 0;
  for (const u of seen.values()) {
    let html = null;
    try { html = await fetchText(u); } catch (e) { err++; console.log(`  ! ${u}: ${e.message}`); continue; }
    await sleep(DELAY_MS);
    const d = extractSostarDetails(u, html);
    if (out.some(o => o.gtin === d.gtin)) { console.log(`  = διπλό (${d.code}): ${d.title}`); continue; }
    out.push({ url: u, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: null, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`  ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(40)} ${(d.size || "-").padEnd(8)} ${String(d.retailPrice || "-").padEnd(6)} ${(d.line || "-").padEnd(14)} ${d.gtin.padEnd(12)} | ${d.title}`);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
