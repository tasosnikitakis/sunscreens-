#!/usr/bin/env node
// scripts/scrape-bausch.mjs
// Bausch + Lomb = www.bausch.gr — Episerver, ελληνικά, χωρίς EAN. Λίστα: sitemap.xml (/ta-proionta-mas/<κατηγορία>/…/<προϊόν>/).
// ΜΟΝΟ προϊόντα φαρμακείου που πωλούνται ελεύθερα (και σε ηλεκτρονικά φαρμακεία): διαλύματα/σταγόνες φακών επαφής,
// ιατροτεχνολογικά (Artelac, Desodrop, Desosept, Recugel, Countercool…), συμπληρώματα (Ocuvite, Cebrolux).
// ΕΚΤΟΣ: φακοί επαφής (οπτικά), φάρμακα — «Κατηγορία: Συνταγογραφούμενο / ΜΗ.ΣΥ.ΦΑ / νοσοκομειακή χρήση» της σελίδας.
// Σελίδα: <h1> · εισαγωγή (μπλοκ επαναλαμβάνονται για mobile/desktop → αφαιρούνται διπλές γραμμές) · «Κατηγορία: …» ·
//   accordion (<p onclick="toggle(this)"><b>ΤΙΤΛΟΣ</b>): «ΒΑΣΙΚΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ ΚΑΙ ΟΦΕΛΗ» (με υπο-επικεφαλίδες ΣΥΣΤΑΤΙΚΑ /
//   ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ / ΕΝΔΕΙΞΕΙΣ), «ΔΙΑΘΕΣΙΜΕΣ ΣΥΣΚΕΥΑΣΙΕΣ [- ΤΙΜΗ]» = πίνακας Προϊόν | Συσκευασία [| Προτεινόμενη Λιανική]
//   → μία εγγραφή ανά συσκευασία (κλειδί BL-<slug>-<συσκευασία>).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-bausch.mjs [--delay=2000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/bausch-site.json");
const BASE = "https://www.bausch.gr";
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
const ENT = { micro: "µ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", deg: "°", plusmn: "±", times: "×", laquo: "«", raquo: "»", middot: "·", bull: "•", alpha: "α", beta: "β", gamma: "γ" };
const dec = s => decodeAll(s).replace(/&([a-z]+);/gi, (m, n) => ENT[n] || ENT[n.toLowerCase()] || m);
const toLines = h => dec(String(h || "").replace(/<sup>[\s\S]*?<\/sup>/g, m => /®|™|&reg;|&trade;|&#xAE;/.test(m) ? m.replace(/<[^>]+>/g, "") : "")
  .replace(/<(br|\/div|\/p|\/li|\/h\d|\/tr|\/td)[^>]*>/gi, "\n").replace(/<[^>]+>|<[a-z][^>]*$/gi, ""))
  .replace(/ /g, " ").split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(l => l && l !== "-->" && !/^\d{1,2}(,\d{1,2})*$|^\*?\d(,\d)*$/.test(l));
const EXCLUDE_CAT = /Συνταγογραφούμεν|ΜΗ\.?\s?ΣΥ\.?\s?ΦΑ|νοσοκομειακή/i;
// φάρμακα (ασφάλεια αν λείπει το «Κατηγορία:» από τη σελίδα)
const RX_SLUGS = /\/(tropicamide|dexamytrex|lotemax|lumify|miochol|vizidor-duo|yellox|visiolatan|kivizidiale|liposic|corneregel|vidilac|viscoter|vividrin|counterpain|niflamol|ezixin)\/$/i;

export function extractBauschDetails(url, raw) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  let html = String(raw || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "");
  d.title = toLines((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]).join(" ").replace(/\s*®\s*/g, "® ").replace(/\s+/g, " ").trim();
  d.title = d.title.replace(/ΟΦΘΑΛΜΙΚΗ ΑΛΟΙΦΗ/g, "Οφθαλμική αλοιφή").replace(/ΟΦΘΑΛΜΙΚΟ ΔΙΑΛΥΜΑ/g, "Οφθαλμικό διάλυμα").replace(/ΤΕΧΝΗΤΑ ΔΑΚΡΥΑ/g, "Τεχνητά δάκρυα").replace(/\bNEUROFACTOR\b/g, "Neurofactor");
  const h1 = html.indexOf("<h1");
  const ACC_RE = /<p[^>]*onclick="toggle\(this\)"[^>]*>/g;
  const accM = [...html.slice(h1).matchAll(ACC_RE)][0];
  const acc = accM ? h1 + accM.index : -1;
  const related = html.search(/class="card-deck|Μάθετε περισσότερα στο|Ανακατευθύνεστε σε σελίδα/);
  // εισαγωγή: γραμμές μετά το h1 ως το accordion (χωρίς διπλότυπα)
  const intro = [];
  for (const l of toLines(html.slice(html.indexOf("</h1>", h1), acc > 0 ? acc : related))) {
    if (intro.includes(l)) continue;
    const c = l.match(/^Κατηγορία(?: Προϊόντος)?\s*:\s*(.+)$/i);
    if (c) { d.category = c[1].replace(/\.$/, ""); continue; }
    intro.push(l);
  }
  // περιγραφή: παράγραφοι· σύντομες γραμμές-λίστες (μετά από «Κατάλληλες για:») → Ενδείξεις/Κατάλληλο για
  const desc = [], suit = [], ind = [];
  let into = null, heads = 0;
  for (const l of intro) {
    if (/^Κατάλληλ\S* για\s*:?$/i.test(l)) { into = /^Κατάλληλες/i.test(l) && !heads++ ? ind : suit; continue; }
    if (into && (l.length < 140 && !/[.!]$/.test(l) || /^(Χρήστες|Παιδιά|Γυναίκες|Ενήλικ)/.test(l))) { into.push(l.replace(/,$/, "")); continue; }
    into = null; desc.push(l);
  }
  d.description = desc.join("\n") || null;
  if (ind.length) d.tabs["Ενδείξεις"] = ind.join("\n");
  if (suit.length) d.tabs["Κατάλληλο για"] = suit.join("\n");
  // accordion
  const parts = acc > 0 ? html.slice(acc, related > acc ? related : undefined).split(/<p[^>]*onclick="toggle\(this\)"[^>]*>/) : [];
  let pack = null;
  for (const p of parts.slice(1)) {
    const title = toLines((p.match(/<b\b[^>]*>([\s\S]*?)<\/b>/) || [])[1]).join(" ");
    if (/ΔΙΑΘΕΣΙΜΕΣ ΣΥΣΚΕΥΑΣΙΕΣ/i.test(title)) {
      const rows = [...p.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => toLines(c[1]).join(" ")));
      pack = rows.filter(r => r.length >= 2 && !/^προ[ιϊ]ον$/i.test(r[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
      // ο πίνακας ανήκει σε άλλο προϊόν (copy-paste του site: Desosept/Recugel → «Corneregel® 15gr») → αγνοείται
      const brandWord = (d.title.match(/^[A-Za-z]+/) || [""])[0].toLowerCase();
      if (brandWord && pack.length && !pack.some(r => r[0].toLowerCase().includes(brandWord))) { d.packMismatch = pack.map(r => r.join(" ")).join("; "); pack = []; }
      continue;
    }
    let key = /ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ|ΟΦΕΛΗ/i.test(title) ? "Οφέλη" : /ΕΝΔΕΙΞΕΙΣ/i.test(title) ? "Ενδείξεις" : /ΧΡΗΣΗ/i.test(title) ? "Χρήση" : /ΣΥΣΤΑΤΙΚΑ/i.test(title) ? "Συστατικά" : /ΠΡΟΦΥΛΑΞ|ΠΡΟΣΟΧΗ|ΑΝΤΕΝΔΕΙΞ/i.test(title) ? "Προφυλάξεις" : title ? title[0] + title.slice(1).toLowerCase() : "Περισσότερα";
    const body = p.slice(p.indexOf("</b>") + 4);
    // πίνακας θρεπτικών (Ocuvite) → γραμμές «συστατικό: ποσότητα»
    for (const l of toLines(body.replace(/<table[\s\S]*?<\/table>/g, t => {
      const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => toLines(c[1]).join(" ")));
      if (rows.length > 1 && /^Συστατικά/i.test(rows[0][0] || "")) {   // θρεπτικά (Ocuvite): στήλες = συστατικά
        const out = ["<p>ΣΥΣΤΑΤΙΚΑ</p>"];
        for (let j = 1; j < rows[0].length; j++) out.push(`<p>${rows[0][j]}: ${rows.slice(1).map(r => `${r[0]} ${r[j] || "-"}`).join(" · ")}</p>`);
        return out.join("");
      }
      return rows.map(r => `<p>${r.filter(Boolean).join(" · ")}</p>`).join("");
    }))) {
      const inl = l.match(/^(ΔΡΑΣΤΙΚΕΣ ΟΥΣΙΕΣ|ΣΥΣΤΑΤΙΚΑ|ΤΡΟΠΟΣ ΧΡΗΣΗΣ|ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ|ΠΡΟΦΥΛΑΞΕΙΣ|ΕΝΔΕΙΞΕΙΣ|ΠΡΟΣΟΧΗ)\s*:\s*(.+)$/);
      if (inl) { const k = /ΧΡΗΣΗΣ/.test(inl[1]) ? "Χρήση" : /ΟΥΣΙΕΣ|ΣΥΣΤΑΤΙΚΑ/.test(inl[1]) ? "Συστατικά" : /ΕΝΔΕΙΞΕΙΣ/.test(inl[1]) ? "Ενδείξεις" : "Προφυλάξεις"; d.tabs[k] = [d.tabs[k], inl[2]].filter(Boolean).join("\n"); continue; }
      if (/^(ΣΥΣΤΑΤΙΚΑ|Συστατικά)$/.test(l)) { key = "Συστατικά"; continue; }
      if (/^(ΟΔΗΓΙΕΣ|ΤΡΟΠΟΣ) ΧΡΗΣΗΣ$/i.test(l)) { key = "Χρήση"; continue; }
      if (/^ΕΝΔΕΙΞΕΙΣ$/i.test(l)) { key = "Ενδείξεις"; continue; }
      if (/^(ΠΡΟΦΥΛΑΞΕΙΣ|ΠΡΟΣΟΧΗ)$/i.test(l)) { key = "Προφυλάξεις"; continue; }
      if (/^ΚΑΡΤΑ B[OΟ]NUS|^Συλλέξτε και κολλήστε/i.test(l)) { key = null; continue; }
      if (!key) continue;
      const k2 = /^Αντενδείκνυται|^Μην το χρησιμοποιείτε/i.test(l) ? "Προφυλάξεις" : key;
      d.tabs[k2] = [d.tabs[k2], l].filter(Boolean).join("\n");
    }
  }
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  if (d.category) d.attributes["Κατηγορία"] = d.category;
  const img = [...html.slice(h1).matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]).find(u => /\/siteassets\//.test(u) && !/icon|logo|banner/i.test(u));
  if (img) d.images.push(new URL(decodeAll(img), BASE).href);
  d.handle = decodeURIComponent(url.replace(/\/+$/, "").split("/").pop()).toLowerCase();
  d.imageLarge = d.images[0] || null;
  d.packs = pack || [];
  d.gtin = `BL-${d.handle.replace(/[^a-z0-9]/g, "")}`;
  d.eans = [d.gtin];
  d.shortDescription = null;
  return d;
}

const LENSES = /\/fakoi-epafis\//;
async function main() {
  const sm = await fetchText(`${BASE}/sitemap.xml`);
  const urls = [...sm.matchAll(/<loc>([^<]*\/ta-proionta-mas\/[^<]+\/[^<]+\/)<\/loc>/g)].map(m => m[1].trim()).filter(u => !LENSES.test(u));
  console.log(`bausch.gr: ${urls.length} σελίδες υπό /ta-proionta-mas/ (χωρίς φακούς επαφής)`);
  const out = []; let err = 0, skipped = [];
  for (const u of urls) {
    let html = null;
    try { html = await fetchText(u); } catch (e) { err++; console.log(`  ! ${u}: ${e.message}`); continue; }
    await sleep(DELAY_MS);
    const d = extractBauschDetails(u, html);
    // σελίδες κατηγορίας (χωρίς accordion/πίνακα και με λίστα προϊόντων) → εκτός
    if (!/onclick="toggle\(this\)"/.test(html)) { skipped.push(`κατηγορία: ${d.title}`); continue; }
    if (d.category && EXCLUDE_CAT.test(d.category) || RX_SLUGS.test(u) || /Συνταγογραφούμενο φάρμακο/.test(decodeAll(html))) { skipped.push(`φάρμακο (${(d.category || "").slice(0, 30)}): ${d.title}`); continue; }
    if (d.packMismatch) console.log(`  ! πίνακας συσκευασιών άλλου προϊόντος στη σελίδα ${d.title}: ${d.packMismatch} — αγνοήθηκε`);
    const base = { url: u, section: "p", details: d };
    const packs = d.packs.length ? d.packs : [[d.title, ""]];
    for (let [name, size] of packs) {
      const dd = JSON.parse(JSON.stringify(d));
      const sz = (String(size).match(/\d+(?:[.,]\d+)?\s?(?:ml|g|gr|tabs|caps)\b/i) || [size])[0].replace(/\s/g, "").replace(/gr$/i, "g").replace(/mL$/, "ml");
      const sk = (/αμπούλ|μονοδ/i.test(size) ? "sdu" + (String(size).match(/\d+/) || [""])[0] : /flight/i.test(size) ? "flight" + (String(size).match(/\d+/) || [""])[0] : sz).toLowerCase().replace(/[^a-z0-9]/g, "");
      size = /αμπούλ|μονοδ|flight|φακελ|tabs|caps/i.test(size) ? String(size).replace(/\.$/, "") : sz;
      dd.title = (d.packs.length ? name : d.title).replace(/\s*®\s*/g, "® ").replace(/\s+/g, " ").trim();
      if (size) { dd.size = size; dd.sizes = [size]; dd.attributes["Συσκευασία"] = size; } else dd.sizes = [];
      dd.gtin = d.packs.length > 1 ? `${d.gtin}${sk}`.slice(0, 60) : d.gtin; dd.eans = [dd.gtin];
      out.push({ ...base, details: dd, name: dd.title, description: (dd.description || "").slice(0, 700), longDescription: dd.description, subtitle: null, image: dd.images[0] || null, gtin: dd.gtin });
      console.log(`  ${dd.images.length ? "img+" : "img-"} ${Object.keys(dd.tabs).join(",").padEnd(50)} ${(size || "-").padEnd(22)} ${dd.gtin.padEnd(40)} | ${dd.title}`);
    }
  }
  console.log(`\nΕκτός (${skipped.length}):\n  ` + skipped.join("\n  "));
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
