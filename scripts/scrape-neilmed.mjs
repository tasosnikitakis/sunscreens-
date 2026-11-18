#!/usr/bin/env node
// scripts/scrape-neilmed.mjs
// NeilMed (Sinus Rinse, ρινικές πλύσεις) = www.sinusrinse.gr — WordPress (ελληνικός διανομέας), χωρίς EAN.
// Λίστα: product-sitemap.xml (9 προϊόντα). Σελίδα: <h1> · παράγραφοι περιγραφής · «ΓΙΑ ΝΗΠΙΑ/ΠΑΙΔΙΑ/ΕΝΗΛΙΚΕΣ» (→ Κατάλληλο για) ·
//   «Δοσολογία» (→ Χρήση) · «Συστατικά» · σύνδεσμος PDF «ΚΑΤΕΒΑΣΤΕ ΤΟ ΦΥΛΛΟ ΟΔΗΓΙΩΝ» · τέλος στο «Σχετικά Προϊόντα».
// Εικόνα: og:image. Κλειδί: "NM-<slug URL>". Τιμές με js/neilmed-manual-matches.json (barcode Medica → κλειδί).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-neilmed.mjs [--delay=2000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/neilmed-site.json");
const BASE = "https://www.sinusrinse.gr";
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
// ΚΕΦΑΛΑΙΑ χωρίς τόνους (οδηγίες/συστατικά του site) → πεζά με πρώτο κεφαλαίο, τόνοι σε συχνές λέξεις
const ACC = { "φακελακι": "φακελάκι", "νερου": "νερού", "ρινικη": "ρινική", "πλυση": "πλύση", "φορες": "φορές", "ημερα": "ημέρα", "χρησιμοποιειται": "χρησιμοποιείται", "εως": "έως", "εξι": "έξι", "ημερησιως": "ημερησίως", "οπως": "όπως", "απαιτειται": "απαιτείται", "συμφωνα": "σύμφωνα", "οδηγιες": "οδηγίες", "ιατρου": "ιατρού", "χλωριουχο": "χλωριούχο", "νατριο": "νάτριο", "φαρμακευτικου": "φαρμακευτικού", "βαθμου": "βαθμού", "διττανθρακικο": "διττανθρακικό", "κεκαθαρμενο": "κεκαθαρμένο", "υδωρ": "ύδωρ", "ενηλικες": "ενήλικες", "παιδια": "παιδιά", "νηπια": "νήπια", "ηλικιας": "ηλικίας", "ετων": "ετών", "ανω": "άνω", "ψεκασμοι": "ψεκασμοί", "ανα": "ανά", "ρουθουνι": "ρουθούνι", "γλυκερινη": "γλυκερίνη", "εκχυλισμα": "εκχύλισμα", "φυλλων": "φύλλων", "αλλαντοϊνη": "αλλαντοΐνη", "βενζολκονιο": "βενζαλκόνιο", "υαλουρονικο": "υαλουρονικό", "διαττανθρακικο": "διττανθρακικό", "ψεκασμος": "ψεκασμός", "μυτη": "μύτη", "την": "την", "σε": "σε", "για": "για", "ή": "ή", "η": "ή" };
const sentence = l => {
  if (l !== l.toUpperCase() || !/[Α-Ω]/.test(l)) return l;
  const s = l.toLowerCase().replace(/[α-ωάέήίόύώϊϋΐΰ]+/g, w => ACC[w] || w)
    .replace(/\b(mg|ml)\b/gi, m => m.toUpperCase()).replace(/\(usp grade\)/i, "(USP grade)").replace(/\bmg\/ml\b/i, "mg/ml");
  return s[0].toUpperCase() + s.slice(1);
};

export function extractNeilmedDetails(url, html) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  html = String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  d.title = decodeAll((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  if (og) d.images.push(decodeAll(og));
  const pdf = (html.match(/href="([^"]+\.pdf)"/i) || [])[1];
  if (pdf) d.attributes["Φύλλο οδηγιών (PDF)"] = decodeAll(pdf);
  const a = html.indexOf("<h1");
  let seg = html.slice(a);
  const end = seg.search(/>\s*Σχετικά\s*</); if (end > 0) seg = seg.slice(0, seg.lastIndexOf("<", end));
  seg = seg.replace(/<sup>[\s\S]*?<\/sup>/g, "").replace(/(ΓΙΑ (?:ΝΗΠΙΑ|ΠΑΙΔΙΑ|ΕΝΗΛΙΚΕΣ|ΒΡΕΦΗ))/g, "\n$1\n");
  const lines = decodeAll(seg.replace(/<(br|\/div|\/p|\/li|\/h\d|\/span)[^>]*>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  let mode = "desc"; const desc = [], who = [], use = [], ing = [];
  for (const l of lines.slice(1)) {
    if (/^ΓΙΑ (ΝΗΠΙΑ|ΠΑΙΔΙΑ|ΕΝΗΛΙΚΕΣ|ΒΡΕΦΗ)/i.test(l)) { who.push(sentence(l).replace(/^Για /, "")); mode = "who"; continue; }
    if (/^ΤΟ ΠΡΟΪΟΝ ΒΡΙΣΚΕΤΑΙ|^ΚΑΤΑΣΚΕΥΑΣΤΗΣ|^ΚΑΤΕΒΑΣΤΕ|^ΔΕΙΤΕ ΤΟ /i.test(l)) continue;
    if (/^Δοσολογία$/i.test(l)) { mode = "use"; continue; }
    if (/^Συστατικά$/i.test(l)) { mode = "ing"; continue; }
    if (mode === "desc") desc.push(l); else if (mode === "use") use.push(sentence(l)); else if (mode === "ing") ing.push(sentence(l));
  }
  d.description = desc.join("\n") || null;
  if (who.length) d.tabs["Κατάλληλο για"] = who.map(w => w[0].toUpperCase() + w.slice(1)).join("\n");
  if (use.length) d.tabs["Χρήση"] = use.join("\n").replace(/\b1-42 ψεκασμοί/, "1-2 ψεκασμοί");   // τυπογραφικό του site (NasoGel: 1-2 ψεκασμοί/ρουθούνι)
  if (ing.length) d.tabs["Συστατικά"] = ing.join("\n");
  d.title = d.title.replace(/\s+by NeilMed/i, "").trim();
  const n = d.title;
  const size = n.match(/(?:Kit|Refill)\s+(\d+)|(\d+)\s+Refill/i);
  if (size) { const k = size[1] || size[2]; d.size = /Kit/i.test(n) ? `Φιάλη + ${k} φακελάκια` : `${k} φακελάκια`; d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; }
  else if (/NasaDrops/i.test(n)) { d.size = "15 αμπούλες × 15ml"; d.attributes["Συσκευασία"] = d.size; d.sizes = [d.size]; }
  else d.sizes = [];
  d.line = /Παιδιά/i.test(n) ? "Παιδιά" : /Sinus Rinse/i.test(n) ? "Sinus Rinse" : "Ρινική φροντίδα";
  d.series = d.line; d.attributes["Σειρά"] = d.line;
  d.handle = decodeURIComponent(url.replace(/\/+$/, "").split("/").pop());
  d.imageLarge = d.images[0] || null;
  d.gtin = `NM-${d.handle.replace(/-?by-neilmed/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

async function main() {
  const sm = await fetchText(`${BASE}/product-sitemap.xml`);
  const urls = [...sm.matchAll(/<loc>([^<]*\/product\/[^<]*)<\/loc>/g)].map(m => m[1].trim());
  console.log(`sinusrinse.gr: ${urls.length} προϊόντα`);
  const out = []; let err = 0;
  for (const [k, u] of urls.entries()) {
    let html = null;
    try { html = await fetchText(u); } catch (e) { err++; console.log(`  ! ${u}: ${e.message}`); continue; }
    const d = extractNeilmedDetails(u, html);
    out.push({ url: u, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: null, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${k + 1}/${urls.length}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(30)} ${d.gtin.padEnd(26)} | ${d.title}`);
    await sleep(DELAY_MS);
  }
  // Ανταλλακτικά (Refill): μία φράση στο site → + η περιγραφή του συστήματος από τη σελίδα του αντίστοιχου kit
  const kitAdult = out.find(p => /^Sinus Rinse Kit \d+$/i.test(p.name)), kitKids = out.find(p => /Kit \d+ για Παιδιά/i.test(p.name));
  for (const p of out) {
    if (!/Refill/i.test(p.name) || (p.details.description || "").length >= 120) continue;
    const kit = /Παιδιά/i.test(p.name) ? kitKids : kitAdult; if (!kit) continue;
    p.details.description = [p.details.description, kit.details.description].filter(Boolean).join("\n");
    p.longDescription = p.details.description; p.description = p.details.description.slice(0, 700);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
