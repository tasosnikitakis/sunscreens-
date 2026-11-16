#!/usr/bin/env node
// scripts/scrape-eviol.mjs
// Κατάλογος EVIOL (συμπληρώματα διατροφής) από το eviol.gr → js/eviol-site.json.
// Το site είναι WordPress + Elementor· τα προϊόντα είναι custom post type «product»
// και διαβάζονται όλα με ένα αίτημα στο WP REST (/wp-json/wp/v2/product).
// Η σελίδα δεν έχει EAN → συνθετικά κλειδιά EV-<slug>[<μέγεθος>], που αντιστοιχίζονται
// στα barcodes της Medica μέσω js/eviol-manual-matches.json.
// Παραλλαγές: «συσκευασία 30 & 60 μαλακών καψουλών» → δύο μεγέθη· Vitamin D3 → τρεις
// περιεκτικότητες (1200/2200/4000IU), η καθεμία με το δικό της packshot.
//
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-eviol.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "js/eviol-site.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const API = "https://eviol.gr/wp-json/wp/v2/product?per_page=100";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", deg: "°", micro: "μ" };
const unescape = s => String(s || "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const tidy = s => s.split("\n").map(l => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");
const strip = s => tidy(unescape(String(s || "")
  .replace(/<(br|\/p|\/li|\/div|\/h\d|\/summary|\/tr)[^>]*>/gi, "\n")
  .replace(/<li[^>]*>/gi, "\n• ")
  .replace(/<[^>]+>/g, " ")));
const stripAccents = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

// Ενότητα του site → καρτέλα του καταλόγου
function tabFor(h) {
  const k = stripAccents(h).toUpperCase();
  if (/ΔΙΑΤΡΟΦΙΚΕΣ ΠΛΗΡΟΦΟΡΙΕΣ|ΣΤΕΛΕΧΗ|ΕΠΙΠΛΕΟΝ ΣΥΣΤΑΤΙΚΑ/.test(k)) return "Συστατικά";
  if (/ΣΕ ΤΙ ΜΑΣ ΒΟΗΘΑΕΙ/.test(k)) return "Δράση";
  if (/ΠΟΙΟΙ ΤΟ ΕΧΟΥΝ/.test(k)) return "Για ποιους";
  if (/ΔΟΣΟΛΟΓΙΑ/.test(k)) return "Δοσολογία";
  if (/ΣΥΣΚΕΥΑΣΙΑ/.test(k)) return "Συσκευασία";
  if (/ΜΗΝ ΞΕΧΝΑΣ|ΑΛΛΗΛΕΠΙΔΡΑΣΕΙΣ|ΠΡΟΕΙΔΟΠΟΙΗΣ/.test(k)) return "Προειδοποιήσεις";
  return null;
}
const FORM = [
  [/μαλακ(ών|ές) καψουλ/i, "μαλακές κάψουλες"],
  [/επικαλυμμένων δισκίων|δισκί/i, "δισκία"],
  [/καψουλ/i, "κάψουλες"]
];
const SECTION = [
  ["multi",    /MultiVitamin/i],
  ["vitamins", /Vitamin D3|Vitamin B12|B-Complex/i],
  ["immune",   /Echinacea/i],
  ["nervous",  /Brain|Calm|Sleep/i],
  ["minerals", /Magnesium|Omega/i],
  ["gut",      /Lacto/i]
];

function parse(p) {
  let c = p.content.rendered;
  c = c.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, "");
  // Πίνακας διατροφικών πληροφοριών (UAEL price list): «ΒΙΤΑΜΙΝΗ Β1 — 1mg»
  // (η τιμή υπάρχει δύο φορές — «inner» για desktop, «outer» για κινητό — κρατάμε μία)
  c = c.replace(/<span class="uael-price-wrapper uael-pl-price-outer">\s*<span[^>]*>[\s\S]*?<\/span>\s*<\/span>/g, "");
  c = c.replace(/<a class="uael-price-list-title"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span class="uael-price-list-price[^"]*">([\s\S]*?)<\/span>/g,
    (_, t, v) => `\n• ${strip(t).replace(/\n/g, " ")}${strip(v) ? " — " + strip(v).replace(/\n/g, " ") : ""}\n`);
  // Επικεφαλίδες (h1-h6 και τίτλοι accordion) → δείκτης ενότητας
  c = c.replace(/<h\d[^>]*>([\s\S]*?)<\/h\d>/gi, (_, t) => `\n@@H@@${strip(t).replace(/\n/g, " ")}\n`);
  c = c.replace(/<div class="e-n-accordion-item-title-text">([\s\S]*?)<\/div>/gi, (_, t) => `\n@@H@@${strip(t)}\n`);
  const text = strip(c);
  const segs = [];
  let cur = { h: null, lines: [] };
  for (const l of text.split("\n")) {
    if (l.startsWith("@@H@@")) { segs.push(cur); cur = { h: l.slice(5).trim(), lines: [] }; }
    else if (!/^Δες όλα τα συμπληρώματα$/i.test(l)) cur.lines.push(l);
  }
  segs.push(cur);

  const title = unescape(p.title.rendered).replace(/\s+/g, " ").trim();
  const d = { title, tabs: {}, attributes: {}, images: [], variants: [], advantages: [] };
  const ti = segs.findIndex(s => s.h && s.h.toUpperCase() === title.toUpperCase());
  const strengths = ti >= 0 ? segs[ti].lines.join(" ").replace(/\.$/, "").trim() : "";
  const tag = segs[ti + 1];
  const descLines = [];
  if (tag && !tabFor(tag.h)) { d.subtitle = tag.h.replace(/\s+/g, " ").trim(); descLines.push(...tag.lines); }
  for (const s of segs.slice(ti + 2)) {
    const t = tabFor(s.h || "");
    if (!t) { if (s.h) descLines.push(s.h); descLines.push(...s.lines); continue; }
    const body = (t === "Συστατικά" ? [s.h, ...s.lines] : s.lines).join("\n");
    d.tabs[t] = [d.tabs[t], body].filter(Boolean).join("\n");
  }
  // Η περιγραφή σταματά στις διατροφικές πληροφορίες· οι δηλώσεις EFSA (*) πάνε στη Δράση
  d.tabs = Object.assign({ "Περιγραφή": tidy(descLines.join("\n")) }, d.tabs);
  // Πίνακες σε δύο γραμμές («ΒΙΤΑΜΙΝΗ B12» / «1000μg») → «• ΒΙΤΑΜΙΝΗ B12 — 1000μg»
  if (d.tabs["Συστατικά"]) {
    const isAmount = l => /^[<≥]?\s?\d[\d.,]*\s?(mg|μg|mcg|g|iu|δισ|ml|%|cfu)/i.test(l);
    const out = [];
    for (const l of d.tabs["Συστατικά"].split("\n")) {
      const last = out.length - 1;
      if (isAmount(l) && last >= 0 && !out[last].includes(" — ") && !/^Διατροφικές/i.test(out[last])) out[last] = `• ${out[last].replace(/^•\s*/, "")} — ${l}`;
      else if (/^&/.test(l) && last >= 0 && !out[last].includes(" — ")) out[last] += " " + l;
      else out.push(l);
    }
    d.tabs["Συστατικά"] = out.join("\n");
  }
  for (const k of Object.keys(d.tabs)) if (!d.tabs[k]) delete d.tabs[k];
  d.description = (d.tabs["Περιγραφή"] || d.subtitle || "").replace(/\s+/g, " ").trim();

  const pack = d.tabs["Συσκευασία"] || "";
  for (const m of pack.matchAll(/(Δεν περιέχει[^.\n]*|Κατάλληλο για[^\n]*?ετών|Κατάλληλο για[^.\n]*)/gi)) d.advantages.push(m[1].trim().replace(/\s*&\s*/g, " & "));
  const form = (FORM.find(([re]) => re.test(pack)) || [, "κάψουλες"])[1];
  const counts = (pack.match(/συσκευασία(?:\s+των)?\s+(\d+)(?:\s*&\s*(\d+))?/i) || []).slice(1).filter(Boolean);
  d.attributes["Μορφή"] = form[0].toUpperCase() + form.slice(1);
  if (strengths) d.attributes["Περιεκτικότητα"] = strengths.replace(/,\s*/g, ", ");
  const slug = p.slug.replace(/^eviol-/, "").replace(/-/g, "");

  // Εικόνες: packshot «EVIOL-…_L_Caps/Tabs/icon.jpg» πρώτα, μετά οι φωτογραφίες
  const imgs = [...new Set([...p.content.rendered.matchAll(/(?:src|data-src)="(https:\/\/eviol\.gr\/wp-content\/uploads\/[^"]+?\.(?:png|jpe?g|webp))"/gi)].map(m => m[1]))]
    .filter(u => !/icon_\d|Clinical_icon/i.test(u));
  const packshots = imgs.filter(u => /\/EVIOL-[^/]*_L_/i.test(u));
  d.images = [...packshots, ...imgs.filter(u => !packshots.includes(u))];

  const strengthList = (strengths.match(/\d+\s?IU/gi) || []).map(s => s.replace(/\s/, ""));
  if (strengthList.length > 1) {
    const n = counts[0] || "60";
    d.variants = strengthList.map(st => ({
      ean: `EV-${slug}${st.replace(/\D/g, "")}`,
      size: `${st} · ${n} ${form}`,
      packshot: packshots.find(u => u.includes(st.replace(/\D/g, ""))) || packshots[0] || null
    }));
  } else if (counts.length > 1) {
    d.variants = counts.map(n => ({ ean: `EV-${slug}${n}`, size: `${n} ${form}`, packshot: packshots[0] || null }));
  }
  if (d.variants.length) d.attributes["Διαθέσιμες συσκευασίες"] = d.variants.map(v => v.size).join(", ");
  else if (counts[0]) d.size = d.attributes["Συσκευασία"] = `${counts[0]} ${form}`;
  d.gtin = d.variants.length ? d.variants[0].ean : `EV-${slug}`;
  d.eans = d.variants.map(v => v.ean);
  d.section = (SECTION.find(([, re]) => re.test(title)) || ["diafora"])[0];
  const eof = pack.match(/Αρ\.?\s*Γνωστοποίησης ΕΟΦ:?\s*([^\n]+)/i) || (d.tabs["Προειδοποιήσεις"] || "").match(/Αρ\.?\s*Γνωστοποίησης ΕΟΦ:?\s*([^\n]+)/i);
  if (eof) d.attributes["Αρ. γνωστοποίησης ΕΟΦ"] = eof[1].replace(/\s*Ο αριθμός[\s\S]*$/, "").trim();
  return d;
}

async function main() {
  const res = await fetch(API, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${API} → HTTP ${res.status}`);
  const list = await res.json();
  const out = [];
  for (const p of list) {
    if (p.status !== "publish") continue;
    const d = parse(p);
    out.push({ url: p.link, section: "p", name: d.title, description: d.description.slice(0, 700), longDescription: d.description, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`${String(d.images.length).padStart(2)} img  ${Object.keys(d.tabs).join(",").padEnd(62)} ${d.variants.map(v => v.ean).join(" ") || d.gtin}  | ${d.title}`);
  }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\n${out.length} προϊόντα → js/eviol-site.json`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
