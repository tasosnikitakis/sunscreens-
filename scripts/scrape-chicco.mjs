#!/usr/bin/env node
// Κατάλογος Chicco (Artsana, βρεφικά φαρμακείου) από το επίσημο www.chicco.it → js/chicco-site.json.
//
// Ο Έλληνας διανομέας (ascompany.gr) έχει προστασία Cloudflare που απορρίπτει κάθε αυτόματη λήψη, οπότε πηγή είναι
// το ιταλικό επίσημο site (Salesforce Commerce Cloud). Μόνο οι κατηγορίες φαρμακείου που αντιστοιχούν στις
// «Θηλασμός & Γέννα», «Πιπίλες & Αξεσουάρ», «Φροντίδα & Υγιεινή Μωρού» του ascompany — όχι καρότσια, καθίσματα, κρεβάτια.
//
//   node scripts/scrape-chicco.mjs [--cache=<dir>] [--delay=2000]
//
// Το URL κάθε προϊόντος περιέχει το EAN (…-8058664156351-00071037410000.html) → αντιστοίχιση τιμών Medica με barcode.
// Κάθε χρώμα είναι ξεχωριστό προϊόν/EAN· προϊόντα με ίδιο όνομα ομαδοποιούνται σε variants (χρώμα → EAN, packshot).
// Τα κείμενα είναι ιταλικά· η ελληνική απόδοση (ελεύθερη μετάφραση) βρίσκεται στο js/chicco-translations.json
// (κλειδί = ιταλικό κείμενο). Ό,τι λείπει από εκεί γράφεται στο <cache>/untranslated.json για μετάφραση.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "js/chicco-site.json");
const TR_FILE = path.join(ROOT, "js/chicco-translations.json");
const opt = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const CACHE = opt("cache", null);
const DELAY = parseInt(opt("delay", "2000"), 10);
const BASE = "https://www.chicco.it";
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";

// κατηγορία chicco.it → ενότητα καταλόγου
const CATEGORIES = [
  ["allattamento-e-suzione/allattamento/tiralatte", "breastfeeding"],
  ["allattamento-e-suzione/allattamento/coppette-assorbilatte", "breastfeeding"],
  ["allattamento-e-suzione/allattamento/accessori-allattamento", "breastfeeding"],
  ["gravidanza-e-nascita/intimo-gravidanza/assorbenti-e-slip", "birth"],
  ["allattamento-e-suzione/suzione/succhietti", "soothers"],
  ["allattamento-e-suzione/suzione/catenelle-e-portasucchietti", "soother-acc"],
  ["igiene-e-benessere/bagnetto/shampoo-e-bagnoschiuma", "bath"],
  ["igiene-e-benessere/bagnetto/creme-e-oli", "bath"],
  ["igiene-e-benessere/bagnetto/cura-e-accessori-bagnetto", "care"],
  ["igiene-e-benessere/cambio/salviettine", "changing"],
  ["igiene-e-benessere/cambio/accessori-cambio", "changing"],
  ["igiene-e-benessere/primi-dentini/igiene-orale", "oral"],
  ["igiene-e-benessere/primi-dentini/massaggiagengive", "oral"],
  ["igiene-e-benessere/salute-e-protezione/pulizia-naso", "nose"],
];
// εκτός: σετ/δώρα/πακέτα, ρούχα-πετσέτες-μπουρνούζια, έπιπλα/μπανιέρες, παιχνίδια
const EXCLUDE = /\b(set|kit regalo|gift|bundle|confezione regalo|cofanetto|accappatoio|asciugamano|telo|poncho|vaschetta|bagnetto|fasciatoio|gioco|giochi|pupazzo|bavaglin|boppy|bilancia|asciugacapelli|mangiapannolini|quadrato di spugna)\b/i;
const EXCLUDE_OK = /oral care set|set igiene orale|kit aspirazione/i;   // «σετ» που είναι το ίδιο το προϊόν

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", deg: "°", reg: "®", trade: "™", times: "×",
  agrave: "à", egrave: "è", eacute: "é", igrave: "ì", ograve: "ò", ugrave: "ù", Agrave: "À", Egrave: "È", Eacute: "É", ograve_: "ò", laquo: "«", raquo: "»", euro: "€", middot: "·", ordm: "º", ordf: "ª" };
const unescape = s => String(s || "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? ENT[n.toLowerCase()] ?? m);
const text = s => unescape(String(s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " "))
  .split("\n").map(l => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");

async function get(url) {
  const key = url.replace(BASE, "").replace(/[^a-z0-9.-]+/gi, "_").slice(0, 200);
  if (CACHE) { try { return await fs.readFile(path.join(CACHE, key), "utf8"); } catch {} }
  let html, lastErr;
  for (const wait of [0, 15000, 60000]) {
    await sleep(DELAY + wait);
    try {
      const { stdout } = await execFileP("curl", ["-sS", "--fail", "--compressed", "--max-time", "60", "-A", UA, url], { maxBuffer: 64 << 20 });
      if (stdout.length < 5000) throw new Error(`κενή απάντηση (${stdout.length} bytes)`);
      html = stdout; break;
    } catch (e) { lastErr = e; }
  }
  if (html === undefined) throw new Error(`${url} → ${lastErr?.message}`);
  if (CACHE) { await fs.mkdir(CACHE, { recursive: true }); await fs.writeFile(path.join(CACHE, key), html); }
  return html;
}
const productLinks = html => [...new Set([...html.matchAll(/href="(\/prodotti\/[^"?#]+-(\d{13})-(\d{14})\.html)"/g)].map(m => m[1]))];

function parseProduct(html, url) {
  const d = { tabs: {}, attributes: {}, images: [], advantages: [], features: [], warnings: [] };
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
  const prod = ld.find(x => x["@type"] === "Product") || {};
  d.title = unescape(prod.name || "").replace(/\s+/g, " ").trim();
  d.sku = prod.sku || null;
  const m = url.match(/-(\d{13})-(\d{14})\.html$/); d.ean = m ? m[1] : null;
  d.images = [...new Set([...(prod.image || []), ...[...html.matchAll(/https:\/\/cdn\.artsana\.com\/assets\/chicco\/images\/[^"'\s?]+_1280x1280\.jpg/g)].map(x => x[0])]
    .map(u => u.replace(/\?.*$/, "")).filter(u => d.sku && u.includes(d.sku)))];
  const bl = (html.match(/<ul class="list-style description-section">([\s\S]*?)<\/ul>/) || [])[1] || "";
  d.advantages = [...bl.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(x => text(x[1])).filter(Boolean);
  const spec = (html.match(/specification-section">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1] || "";
  for (const p of spec.matchAll(/<p[^>]*>\s*<strong>([^<]+)<\/strong>\s*:?\s*([\s\S]*?)<\/p>/g)) {
    const k = text(p[1]).replace(/:$/, ""), v = text(p[2]).replace(/^:\s*/, "");
    if (/Cod\. Prodotto/i.test(k)) { const c = v.match(/^(\d+)\s*(.*)$/); if (c) { d.code = c[1]; d.color = c[2] || null; } }
    else if (/Dimensioni confezione/i.test(k)) d.attributes._dims = v;
    else if (/Peso/i.test(k)) d.attributes._weight = v;
    else if (/Età|Eta/i.test(k)) d.attributes._age = v;
    else if (/Capacit|Contenuto|Formato/i.test(k)) d.attributes._size = v;
  }
  const warn = (html.match(/warn-instruction-section">([\s\S]*?)<div class="pdf-list"/) || [])[1] || "";
  d.warnings = [...warn.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(x => text(x[1])).filter(l => l && !/^Prima dell'utilizzo, ti invitiamo/i.test(l));
  const grid = (html.match(/<div class="grid-features">([\s\S]*?)<div class="(?:compontentTabListati|container mb-60-50[^"]*" data-section="body\/(?!features))/) || [])[1] || "";
  for (const b of grid.split('<div class="singleBlock">').slice(1)) {
    const t = text((b.match(/<p class="h4[^"]*">([\s\S]*?)<\/p>/) || [])[1]);
    const body = text((b.match(/<div class="font-sm">([\s\S]*?)<\/div>/) || [])[1]);
    if (t || body) d.features.push({ t, body });
  }
  d.breadcrumb = ((ld.find(x => x["@type"] === "BreadcrumbList") || {}).itemListElement || []).map(x => unescape(x.name));
  return d;
}

async function main() {
  let tr = {}; try { tr = JSON.parse(await fs.readFile(TR_FILE, "utf8")); } catch {}
  const missing = new Set();
  const T = s => { if (!s) return s; const k = s.trim(); if (tr[k]) return tr[k]; missing.add(k); return k; };

  const section = new Map(), cat = new Map(), urls = [];
  for (const [c, sec] of CATEGORIES) {
    const html = await get(`${BASE}/prodotti/${c}?sz=200`);
    for (const u of productLinks(html)) if (!section.has(u)) { section.set(u, sec); cat.set(u, c.split("/").pop()); urls.push(u); }
  }
  console.log(`${urls.length} σελίδες προϊόντων.`);

  const items = [];
  for (const u of urls) {
    let html; try { html = await get(BASE + u); } catch (e) { console.warn("  !", e.message); continue; }
    const d = parseProduct(html, BASE + u);
    if (!d.title || !d.ean) { console.warn("  ! χωρίς τίτλο/EAN:", u); continue; }
    if (EXCLUDE.test(d.title) && !EXCLUDE_OK.test(d.title)) { console.log(`   (εκτός: σετ/ρούχο/έπιπλο/παιχνίδι) ${d.title}`); continue; }
    if (!d.images.length) { console.log(`   (χωρίς εικόνα — εκτός) ${d.title}`); continue; }
    d.section = section.get(u); d.category = cat.get(u); d.url = BASE + u;
    items.push(d);
  }

  // ομαδοποίηση χρωμάτων: ίδιο όνομα + ίδια ενότητα → ένα προϊόν με variants
  const groups = new Map();
  // κλειδί: όνομα χωρίς «(2 pcs)/2 pz», σημεία στίξης και πεζά/κεφαλαία (ίδιο προϊόν σε παλιό και νέο κωδικό)
  const gkey = d => d.section + "|" + d.title.toLowerCase().replace(/\(?\b2\s?(pcs|pz)\b\)?|soother/g, "").replace(/[^a-z0-9à-ù]+/g, " ").trim();
  for (const d of items) { const k = gkey(d); (groups.get(k) || groups.set(k, []).get(k)).push(d); }
  const out = [];
  for (const g of groups.values()) {
    const d = g[0];
    const name = "Chicco " + T(d.title).replace(/^Chicco\s+/i, "");
    const det = {
      section: d.section, title: name, sku: d.sku, ean: d.ean,
      advantages: d.advantages.map(T),
      tabs: {}, attributes: {}, images: d.images,
      variants: g.length > 1 ? g.map(x => ({ ean: x.ean, size: x.color ? T(x.color) : x.sku, packshot: x.images[0] })) : [],
    };
    const desc = d.features.map(f => [f.t && T(f.t), f.body && T(f.body)].filter(Boolean).join("\n")).filter(Boolean);
    if (det.advantages.length) det.tabs["Χαρακτηριστικά"] = det.advantages.map(a => "• " + a).join("\n");
    if (desc.length) det.tabs["Περιγραφή"] = desc.join("\n");
    const w = d.warnings.map(T); if (w.length) det.tabs["Οδηγίες & προειδοποιήσεις"] = w.map(a => "• " + a).join("\n");
    if (d.attributes._dims) det.attributes["Διαστάσεις συσκευασίας"] = d.attributes._dims;
    if (d.attributes._weight) det.attributes["Βάρος συσκευασίας"] = d.attributes._weight;
    if (g.length === 1 && d.color) det.attributes["Χρώμα"] = T(d.color);
    det.attributes["Κωδικός Chicco"] = g.map(x => x.sku).join(", ");
    const description = (det.advantages.join(" ") || desc.join(" ")).replace(/\s+/g, " ").trim();
    out.push({ url: d.url, section: "p", name, description: description.slice(0, 700), longDescription: description, details: det, image: d.images[0], gtin: d.ean });
    console.log(`${String(d.images.length).padStart(2)} img ${d.section.padEnd(13)} ${d.ean} ${g.length > 1 ? `(${g.length} χρώματα)` : ""} | ${name}`);
  }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\n${out.length} προϊόντα (${items.length} EAN) → js/chicco-site.json`);
  if (missing.size) {
    const f = path.join(CACHE || ROOT, "chicco-untranslated.json");
    await fs.writeFile(f, JSON.stringify([...missing], null, 1));
    console.log(`${missing.size} ιταλικά κείμενα χωρίς μετάφραση → ${f}`);
  }
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
