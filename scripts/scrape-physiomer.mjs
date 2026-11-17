#!/usr/bin/env node
// scripts/scrape-physiomer.mjs
// Physiomer (Perrigo, ρινικά διαλύματα θαλασσινού νερού — ιατροτεχνολογικά) = physiomer.gr — Drupal (ίδιο CMS με lactacyd.gr),
// χωρίς EAN και χωρίς συσκευασία στη σελίδα. Λίστα: sitemap.xml (σελίδες μετά τις «άρθρα/κατηγορίες»: όσες έχουν product-images).
// Σελίδα (με τη σειρά): <h1> · «(6 ΕΤΩΝ +)» = ηλικία · εισαγωγικά <p> (→ περιγραφή) · «Γιατί να επιλέξετε PHYSIOMER®;» (li → χαρακτηριστικά) ·
//   «Ποιες είναι οι ενδείξεις του;» (li → Ενδείξεις) · «Για ποιον ενδείκνυται;» (li → Κατάλληλο για) ·
//   h2 «ΓΙΑΤΙ ΝΑ ΕΠΙΛΕΞΕΤΕ…» (→ Οφέλη) · h2 «Συνιστώμενη χρήση» (→ Χρήση, «Αντενδείξεις…» → Προφυλάξεις) ·
//   h2 «Συστατικά» (→ Συστατικά, «Προφυλάξεις: …» → Προφυλάξεις) · h2 «ΠΩΣ ΝΑ ΧΡΗΣΙΜΟΠΟΙΗΣΕΤΕ…» (βήματα → Τρόπος χρήσης).
//   Οι ενότητες «Αντιμετώπιση» / «Καθημερινή Υγιεινή και Πρόληψη» (προώθηση άλλων προϊόντων) παραλείπονται.
// Το «Σύστημα Ρινικών Πλύσεων και Φακελίσκοι» γίνεται 2 προϊόντα (σύστημα / ανταλλακτικοί φακελίσκοι 30 τεμ.).
// Κλειδί: "PY-<λατινικά/μεταγραφή του τίτλου>". Τιμές/συσκευασία με js/physiomer-manual-matches.json (barcode Medica → κλειδί).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-physiomer.mjs [--limit=3] [--delay=2000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/physiomer-site.json");
const BASE = "https://www.physiomer.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "2000"));
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const oneLine = s => htmlToText(decodeAll(String(s || "").replace(/<sup>[\s\S]*?<\/sup>/g, "").replace(/<br\s*\/?>/gi, " "))).replace(/[\s​]+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
// Ελληνικά → λατινικά για το κλειδί (ΥΠΕΡΤΟΝΟ → ypertono)
const G = { α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o" };
const translit = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[α-ω]/g, c => G[c] || "");
const isNote = t => /^\(\d\)|^\*|^Δεδομένα In vitro$|^Γενική σύσταση|^Σε ενήλικες \(\d\)/i.test(t) || t.length < 3;

export function extractPhysiomerDetails(url, html) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  html = String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  const a = html.indexOf("<h1");
  const body = html.slice(a < 0 ? 0 : a).split(/<footer class=|id="footer"|class="site-footer/)[0];
  let mode = null;
  const T = {}; const push = (k, v) => { (T[k] = T[k] || []).push(v); };
  const intro = [];
  for (const m of body.matchAll(/<(h1|h2|h3|li|p)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [, tag, attrs] = m; const t = oneLine(m[3]).replace(/\s\(\d\)\s.*$/, "");   // υποσημείωση «(1) Μέσω…» στο τέλος
    if (!t) continue;
    if (tag === "h1") { d.title = t; mode = "intro"; continue; }
    if (/^\((?:από|\d)[^)]*\)$/i.test(t) && !d.age) { d.age = t.replace(/^\(|\)$/g, ""); continue; }
    const head = tag === "h2" || /small-heading/.test(attrs) || (tag === "p" && /^<strong>[^<]+<\/strong>$/.test(m[3].trim()) && /;$/.test(t));
    if (head) {
      if (/^Γιατί να επιλέξετε PHYSIOMER/i.test(t)) mode = "why";
      else if (/ενδείξεις/i.test(t)) mode = "ind";
      else if (/Για ποιον ενδείκνυται/i.test(t)) mode = "who";
      else if (/^ΓΙΑΤΙ ΝΑ ΕΠΙΛΕΞΕΤΕ/i.test(t)) mode = "ben";
      else if (/^Συνιστώμενη χρήση/i.test(t)) mode = "use";
      else if (/^Συστατικά/i.test(t)) mode = "ing";
      else if (/^ΠΩΣ ΝΑ ΧΡΗΣΙΜΟΠΟΙΗΣΕΤΕ/i.test(t)) mode = "how";
      else mode = "skip";
      continue;
    }
    if (tag === "h3" && mode !== "how") continue;
    if (isNote(t) || /^Ανακαλύψτε/i.test(t)) continue;
    if (mode === "intro" && tag === "p") intro.push(t);
    else if (mode === "why" && tag === "li") d.keyFacts.push(t);
    else if (mode === "ind" && tag === "li") push("Ενδείξεις", t);
    else if (mode === "who" && tag === "li") push("Κατάλληλο για", t);
    else if (mode === "ben") push("Οφέλη", t);
    else if (mode === "use") push(/^Αντενδείξεις/i.test(t) ? "Προφυλάξεις" : "Χρήση", t);
    else if (mode === "ing") push(/^Προφυλάξεις/i.test(t) ? "Προφυλάξεις" : "Συστατικά", t.replace(/^Προφυλάξεις\s*:\s*/i, ""));
    else if (mode === "how") push("Τρόπος χρήσης", t);
  }
  for (const [k, v] of Object.entries(T)) d.tabs[k] = [...new Set(v)].join("\n");
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  d.description = intro.join("\n") || null;
  d.title = d.title.replace(/^PHYSIOMER®?\s*/i, "").trim();
  if (d.age) d.attributes["Ηλικία"] = d.age.replace(/ΕΤΩΝ/i, "ετών");
  const n = d.title;
  d.line = /^BABY/i.test(n) ? "Baby" : /KIDS/i.test(n) ? "Kids" : /ΣΥΣΤΗΜΑ|SORE|ALLERGY/i.test(n) ? "Ειδική φροντίδα" : "Ενήλικες";
  d.series = d.line; d.attributes["Σειρά"] = d.line;
  for (const u of html.match(/https:\/\/s3[^"'\s]+\/product-images\/[^"'\s]+/g) || []) { const c = decodeAll(u); if (!d.images.includes(c)) d.images.push(c); }
  d.handle = decodeURIComponent(url.replace(/\/+$/, "").split("/").pop());
  d.imageLarge = d.images[0] || null;
  d.gtin = `PY-${translit(n).replace(/[^a-z0-9]/g, "").slice(0, 50)}`;
  d.eans = [d.gtin];
  // ελληνικά ΚΕΦΑΛΑΙΑ χωρίς τόνους → κανονική γραφή (το κλειδί έχει ήδη υπολογιστεί από τον αρχικό τίτλο)
  const GR = { "ΥΠΕΡΤΟΝΟ": "Υπέρτονο", "ΙΣΟΤΟΝΟ": "Ισότονο", "ΕΥΚΑΛΥΠΤΟΣ": "Ευκάλυπτος", "ΑΜΠΟΥΛΕΣ": "Αμπούλες", "ΡΙΝΙΚΟΣ ΑΠΟΦΡΑΚΤΗΡΑΣ": "Ρινικός Αποφρακτήρας", "ΣΥΣΤΗΜΑ ΡΙΝΙΚΩΝ ΠΛΥΣΕΩΝ ΚΑΙ ΦΑΚΕΛΙΣΚΟΙ": "Σύστημα Ρινικών Πλύσεων και Φακελίσκοι" };
  d.title = d.title.replace(/[Α-Ω][Α-Ω ]*[Α-Ω]/g, w => GR[w] || w);
  d.sizes = [];
  d.shortDescription = null;
  return d;
}

async function main() {
  const sm = await fetchText(`${BASE}/sitemap.xml`);
  const urls = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1].trim());
  console.log(`physiomer.gr: ${urls.length} σελίδες στο sitemap`);
  const out = []; let err = 0, seen = 0;
  for (const u of urls) {
    if (seen >= LIMIT) break;
    const dec = decodeURIComponent(u);
    // μόνο σελίδες προϊόντων: «Physiomer-…», «Baby-…», «Express-Kids», «sore-troat», «Σύστημα-Ρινικών-Πλύσεων», «Νεογέννητο-Μωρό»
    if (!/\/(Physiomer-|Baby-|Express-Kids|sore-troat|Σύστημα-Ρινικών|Νεογέννητο-Μωρό)/i.test(dec)) continue;
    seen++;
    let html = null;
    try { html = await fetchText(u); } catch (e) { err++; console.log(`  ! ${dec}: ${e.message}`); continue; }
    if (!/product-images\//.test(html)) { console.log(`  - χωρίς εικόνα προϊόντος: ${dec}`); continue; }
    const d = extractPhysiomerDetails(u, html);
    const rec = { url: u, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: null, details: d, image: d.images[0] || null, gtin: d.gtin };
    if (/Σύστημα Ρινικών Πλύσεων/i.test(d.title)) {
      // σύστημα (συσκευή + φακελίσκοι) και ανταλλακτικοί φακελίσκοι = 2 κωδικοί στον τιμοκατάλογο
      const kit = JSON.parse(JSON.stringify(rec)), sach = JSON.parse(JSON.stringify(rec));
      kit.name = kit.details.title = "Σύστημα Ρινικών Πλύσεων"; kit.gtin = kit.details.gtin = "PY-systimarinikonplyseon"; kit.details.eans = [kit.gtin];
      sach.name = sach.details.title = "Φακελίσκοι για το Σύστημα Ρινικών Πλύσεων"; sach.gtin = sach.details.gtin = "PY-fakeliskoi"; sach.details.eans = [sach.gtin];
      out.push(kit, sach);
    } else out.push(rec);
    console.log(`[${seen}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(80)} ${(d.age || "-").padEnd(16)} ${d.gtin.padEnd(34)} | ${d.title}`);
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
