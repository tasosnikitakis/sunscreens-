#!/usr/bin/env node
// scripts/scrape-karabinis.mjs
// Karabinis Medical (ελληνικός διανομέας/παραγωγός: Microlife, HD Corner, Alfashield, Alfacheck, Alfaplastin, ESI, SON, Attends,
// Bionime, Mylife …) = karabinismedical.gr — WordPress + WooCommerce + Elementor, χωρίς τιμές.
// Λίστα: Store API /wp-json/wc/store/v1/products (247, κατηγορίες). Σελίδα: καρτέλες WooCommerce (#tab-description,
//   #tab-λεπτομέρειες, #tab-χρήση, #tab-γνωστοποιήσεις, #tab-χαρακτηριστικά, …) — ο πίνακας «Λεπτομέρειες» έχει μία γραμμή
//   ανά συσκευασία/μέγεθος με **Barcode** + Κωδικό (+ Διαστάσεις, Τμχ/Κουτί …) → μία εγγραφή ανά barcode (ακριβές match Medica).
//   Χωρίς πίνακα: «Barcode: …» στην περιγραφή. Μάρκα: εικόνα pwb-brand-image (alt) ή πρόθεμα του ονόματος.
// ΕΚΤΟΣ: τα 36 κενά «Microlife mains adapter», επαγγελματικά (WatchBP, Επαγγελματικά Πιεσόμετρα, Nipro, αναλώσιμα ιατρείου /
//   χειρουργείου: γάζες X-RAY & λαπαροτομίας, τολύπια, 100 μ. γάζας, σκούφιες, ποδιές, ποδονάρια, χειρουργικά γάντια, χαρτοβάμβακας)
//   και ανταλλακτικά (περιχειρίδες, μετασχηματιστές, σετ ανταλλακτικών).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-karabinis.mjs [--delay=1500]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/karabinis-site.json");
const BASE = "https://karabinismedical.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "1500"));
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
// ελληνικά κεφαλαία-«δίδυμα» μέσα σε λατινικές λέξεις (ΕSI, Νormolip, Yγειονομικό)
const G2L = { Α: "A", Β: "B", Ε: "E", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X", Ζ: "Z" };
const L2G = Object.fromEntries(Object.entries(G2L).map(([g, l]) => [l, g]));
const fixMixed = s => String(s).replace(/(?<![\p{L}])([ΑΒΕΗΙΚΜΝΟΡΤΥΧΖ])(?=[a-zA-Z])/gu, c => G2L[c]).replace(/(?<![\p{L}])([ABEHIKMNOPTYXZ])(?=[α-ωά-ώ])/gu, c => L2G[c]);
const toLines = h => decodeAll(String(h || "").replace(/<(br|\/?p|\/?div|\/?li|\/?ul|\/?h\d|\/tr)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "))
  .replace(/ /g, " ").split("\n").map(l => fixMixed(l.replace(/\s+/g, " ").replace(/\s+([.,;:!])/g, "$1").trim())).filter(Boolean);
const eanOk = s => { if (!/^\d{13}$/.test(s)) return /^\d{8}$/.test(s); const d = s.split("").map(Number); return (10 - d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0) % 10) % 10 === d[12]; };
const panel = (html, id) => {
  const i = html.indexOf(`id="tab-${id}"`); if (i < 0) return "";
  const s = html.indexOf(">", i) + 1; let depth = 1; const re = /<(\/?)div\b[^>]*>/g; re.lastIndex = s; let m;
  while ((m = re.exec(html))) { depth += m[1] ? -1 : 1; if (depth === 0) return html.slice(s, m.index); }
  return html.slice(s);
};

const EXCLUDE_NAME = /mains adapter|watch ?bp|nipro|wing-cath|x-ray|λαπαροτομ|τολύπια|100 μέτρα|σκούφιες|ποδιά μιας|ποδονάρια|χειρουργικά γάντια|χαρτοβάμβακας|περιχειρίδα|μετασχηματιστ|ανταλλακτικών|σύριγγες με υποδοχή luer/i;
const EXCLUDE_CAT = /Επαγγελματικά Πιεσόμετρα|Εξαρτήματα Ανταλλακτικά|Αναλώσιμα Ιατρείου|Nipro/i;
const BRANDS = [["HD Corner", /hd corner|h&d corner/i], ["Microlife", /microlife|^bp b1/i], ["Alfacheck", /alfacheck/i], ["Alfaplastin", /alfaplastin/i],
  ["Alfashield", /alfashield|alfa[- ]|κιτ πρώτων/i], ["ESI", /^[EΕ]SI\b|esi /i], ["SON", /^SON\b/], ["Attends", /attends/i], ["Bionime", /bionime/i],
  ["Mylife (Ypsomed)", /mylife/i], ["ProMag", /promag/i]];

export function cleanTitle(name) {
  let t = fixMixed(decodeAll(name)).replace(/\s*[\/|]\s*/g, " ").replace(/\s+[–-]\s+/g, " – ").replace(/′/g, "''").replace(/\s+/g, " ").trim();
  t = t.replace(/^ALFASHIELD\b/, "Alfashield").replace(/^ALFACHECK\b/, "Alfacheck").replace(/^ALFAPLASTIN DERMA – ΚΡΕΜΑ ΕΝΥΔΑΤΩΣΗΣ ΚΑΙ ΕΠΑΝΟΡΘΩΣΗΣ$/, "Alfaplastin Derma Κρέμα Ενυδάτωσης και Επανόρθωσης")
    .replace(/^BP B1 Standard$/, "Microlife BP B1 Standard").replace(/^Κιτ Πρώτων Βοηθειών Αυτοκινήτου$/, "Alfashield Κιτ Πρώτων Βοηθειών Αυτοκινήτου");
  return t;
}

export function extractKarabinisDetails(p, raw) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const html = String(raw || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "");
  d.title = cleanTitle(p.name);
  const brandAlt = (html.match(/class="pwb-brand-image[^"]*"[^>]*alt="([^"]+)"|alt="([^"]+)"[^>]*class="pwb-brand-image/) || []).slice(1).find(Boolean) || "";
  d.brand = (BRANDS.find(([, re]) => re.test(d.title)) || BRANDS.find(([, re]) => re.test(brandAlt)) || ["Karabinis Medical"])[0];
  d.line = d.brand; d.series = d.brand; d.attributes["Μάρκα"] = d.brand;
  const cats = (p.categories || []).map(c => fixMixed(decodeAll(c.name)));
  d.categories = cats; d.category = cats[cats.length - 1] || null;
  if (cats.length) d.attributes["Κατηγορία karabinismedical.gr"] = cats.join(" › ");
  // καρτέλες
  const tabIds = [...html.matchAll(/aria-controls="tab-([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)].map(m => [m[1], decodeAll(m[2]).trim()]);
  let rows = [];
  for (const [id, label] of tabIds) {
    const body = panel(html, id).replace(/<h2 class="yikes-custom-woo-tab-title[^"]*">[\s\S]*?<\/h2>/, "");
    if (/Λεπτομέρειες|Κωδικοί|Συσκευασίες/i.test(label) && /<table/i.test(body)) {
      const trs = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => toLines(c[1]).join(" ")));
      if (trs.length > 1) { const hdr = trs[0]; rows = trs.slice(1).filter(r => r.some(Boolean)).map(r => Object.fromEntries(hdr.map((h, i) => [h, r[i] || ""]))); }
      const rest = toLines(body.replace(/<table[\s\S]*?<\/table>/g, "")); if (rest.length) d.tabs["Λεπτομέρειες"] = rest.join("\n");
      continue;
    }
    const lines = toLines(body.replace(/<a[^>]*\.pdf[^>]*>[\s\S]*?<\/a>/gi, "")).filter(l => !/^Download PDF$/i.test(l));
    if (!lines.length) continue;
    const key = id === "description" ? "_desc" : /Χρήση|Οδηγίες|Δοσολογ/i.test(label) ? "Χρήση" : /Γνωστοποι|Πιστοποι/i.test(label) ? "Πιστοποιήσεις"
      : /Χαρακτηριστικ/i.test(label) ? "Χαρακτηριστικά" : /Συστατικ|Σύνθεση/i.test(label) ? "Συστατικά" : /Προφυλ|Προσοχ/i.test(label) ? "Προφυλάξεις" : label;
    if (key === "_desc") {
      const desc = [];
      for (const l of lines) {
        const bc = l.match(/Barcode\s*:?\s*(\d{8,14})/i); const code = l.match(/Κωδικός(?: προϊόντος)?\s*:?\s*([A-Z0-9-]{4,})/i);
        if (bc) d.ean = bc[1]; if (code) d.code = code[1];
        if (bc || code) { const rest = l.replace(/Κωδικός(?: προϊόντος)?\s*:?\s*[A-Z0-9-]+/i, "").replace(/Barcode\s*:?\s*\d+/i, "").trim(); if (rest.length > 3) desc.push(rest); continue; }
        const g = l.match(/Αρ\.?\s*Γνωστοποίησης(?: ΕΟΦ)?\s*:?\s*(.+?)\.?$/i); if (g) { d.attributes["Αρ. γνωστοποίησης ΕΟΦ"] = g[1]; continue; }
        if (/δεν υπόκειται σε διαδικασία αδειοδότησης/i.test(l)) continue;
        const dose = l.match(/^(Συνιστώμενη ημερήσια δόση|Δοσολογία|Τρόπος χρήσης|Οδηγίες χρήσης)\s*:\s*(.+)$/i); if (dose) { d.tabs["Χρήση"] = [d.tabs["Χρήση"], dose[2]].filter(Boolean).join("\n"); continue; }
        const ing = l.match(/^(Συστατικά|Έκδοχα|Σύνθεση)\s*:\s*(.+)$/i); if (ing) { d.tabs["Συστατικά"] = [d.tabs["Συστατικά"], (/Έκδοχα/i.test(ing[1]) ? "Έκδοχα: " : "") + ing[2]].filter(Boolean).join("\n"); continue; }
        const warn = l.match(/^(Προειδοποιήσεις|Προφυλάξεις|Προσοχή)\s*:\s*(.+)$/i); if (warn) { d.tabs["Προφυλάξεις"] = [d.tabs["Προφυλάξεις"], warn[2]].filter(Boolean).join("\n"); continue; }
        desc.push(l);
      }
      d.description = [...new Set(desc)].join("\n") || null;
    } else d.tabs[key] = [d.tabs[key], ...new Set(lines)].filter(Boolean).join("\n");
  }
  if (d.tabs["Χαρακτηριστικά"]) d.keyFacts = d.tabs["Χαρακτηριστικά"].split("\n");
  if ((d.description || "").length < 120 && d.keyFacts.length) d.description = [d.description, ...d.keyFacts.filter(l => !/^Τύπος$/i.test(l))].filter(Boolean).join("\n");
  if (/συμπλήρωμα διατροφής/i.test(d.description || "") || cats.some(c => /Συμπληρώματα/i.test(c))) d.attributes["Κατηγορία"] = "Συμπλήρωμα διατροφής";
  else if (/CE/.test([d.description, d.tabs["Πιστοποιήσεις"]].join(" "))) d.attributes["Κατηγορία"] = "Ιατροτεχνολογικό προϊόν (CE)";
  for (const im of p.images || []) { const u = String(im.src || "").split("?")[0]; if (u && !d.images.includes(u)) d.images.push(u); }
  d.imageLarge = d.images[0] || null;
  d.handle = decodeURIComponent(String(p.slug || p.id));
  d.rows = rows;
  return d;
}

// μία εγγραφή ανά barcode του πίνακα «Λεπτομέρειες»
export function karabinisRecords(p, d) {
  const out = [];
  const bcKey = r => Object.keys(r).find(k => /barcode|ean/i.test(k));
  const codeKey = r => Object.keys(r).find(k => /κωδικ|code/i.test(k));
  const rows = d.rows.filter(r => bcKey(r) && eanOk(String(r[bcKey(r)]).replace(/\s/g, "")));
  const base = (rec, gtin, sizeParts, code) => {
    const c = JSON.parse(JSON.stringify(rec)); delete c.rows;
    c.gtin = gtin; c.eans = [gtin]; if (code) c.attributes["Κωδικός Karabinis"] = code;
    const size = sizeParts.filter(Boolean).join(", ");
    if (size) { c.size = size; c.sizes = [size]; c.attributes["Συσκευασία"] = size; } else c.sizes = [];
    c.title = size && rows.length > 1 ? `${rec.title} ${size}` : rec.title;
    return c;
  };
  if (rows.length) {
    for (const r of rows) {
      const gtin = String(r[bcKey(r)]).replace(/\s/g, "");
      if (out.some(o => o.gtin === gtin)) continue;
      const parts = Object.entries(r).filter(([k, v]) => v && v !== "–" && v !== "-" && !/barcode|ean|κωδικ|code|κιβώτιο|κιβ\.|carton/i.test(k))
        .map(([k, v]) => /Τμχ|Τεμ|Ποσότητα|Κουτί|Συσκευασία/i.test(k) ? (/^\d+$/.test(v) ? `${v} τμχ` : v) : v);
      out.push(base(d, gtin, parts, codeKey(r) ? r[codeKey(r)] : null));
    }
  } else {
    const gtin = d.ean && eanOk(d.ean) ? d.ean : `KM-${(d.code || d.handle).replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 40)}`;
    out.push(base(d, gtin, [], d.code));
  }
  return out;
}

async function main() {
  const all = [];
  for (let pg = 1; pg < 10; pg++) { const a = JSON.parse(await fetchText(`${BASE}/wp-json/wc/store/v1/products?per_page=100&page=${pg}`)); all.push(...a); if (a.length < 100) break; }
  console.log(`karabinismedical.gr: ${all.length} εγγραφές`);
  const out = []; let err = 0; const skipped = []; const headers = {};
  for (const p of all) {
    const name = decodeAll(p.name); const cats = (p.categories || []).map(c => decodeAll(c.name)).join(" / ");
    if (EXCLUDE_NAME.test(name) || EXCLUDE_CAT.test(cats)) { skipped.push(`${name}  [${cats}]`); continue; }
    let html = null;
    try { html = await fetchText(p.permalink); } catch (e) { err++; console.log(`  ! ${p.permalink}: ${e.message}`); continue; }
    await sleep(DELAY_MS);
    const d = extractKarabinisDetails(p, html);
    for (const r of d.rows) headers[Object.keys(r).join(" | ")] = (headers[Object.keys(r).join(" | ")] || 0) + 1;
    for (const c of karabinisRecords(p, d)) {
      if (out.some(o => o.gtin === c.gtin)) { console.log(`  = διπλό ${c.gtin}: ${c.title}`); continue; }
      out.push({ url: p.permalink, section: "p", name: c.title, description: (c.description || "").slice(0, 700), longDescription: c.description, subtitle: null, details: c, image: c.images[0] || null, gtin: c.gtin });
      console.log(`  ${c.images.length ? "img+" : "img-"} ${c.brand.padEnd(12)} ${String(c.gtin).padEnd(16)} | ${c.title}`);
    }
  }
  console.log(`\nΚεφαλίδες πινάκων:\n  ` + Object.entries(headers).map(([k, v]) => `${v}× ${k}`).join("\n  "));
  console.log(`\nΕκτός (${skipped.length}):\n  ` + [...new Set(skipped)].join("\n  "));
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
