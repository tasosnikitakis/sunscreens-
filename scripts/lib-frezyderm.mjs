// scripts/lib-frezyderm.mjs
// Κοινές βοηθητικές για τα Frezyderm scripts (match / sync / fill / clean).
// Δεν κάνει network — μόνο καθαρισμό κειμένων και φόρτωση window.* αρχείων.

import fs from "node:fs/promises";
import vm from "node:vm";

export async function loadWindowFile(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  try { vm.runInContext(await fs.readFile(file, "utf8"), ctx); } catch {}
  return ctx.window;
}

export function decodeHtml(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Όνομα προϊόντος όπως έρχεται από το JSON-LD/og:title του frezyderm.gr
// ("PLAQUE &amp; TARTAR TOOTHPASTE ", "AC-NORM ACTIVE FOAM PLUS ")
export function cleanSiteName(name) {
  return decodeHtml(name).replace(/\s+/g, " ").trim();
}

// Ονόματα από φαρμακεία έχουν suffix με το όνομα του site:
// "… 50g - oFarmakopoiosMou.gr", "… - Pharm24.gr", "… - Online Pharmacy Ofarmakopoiosmou.gr"
const PHARMACY_NAME_SUFFIX = /\s*[-|–—]\s*(Online\s+Pharmacy\s+)?(Skroutz|BestPrice|Vita4you|Pharm24|Kosmas|Fr|Blinkshop|Pharmacy295|BestPharmacy|MyPharmacy|Smile\s*Pharmacy|oFarmakopoiosmou|LifePharmacy|Pharmaplaza|myomorfia|Omorfia|1010|Galinos)(\.gr)?\s*\.?\s*$/i;

export function cleanPharmacyName(name) {
  let s = String(name || "").replace(/\s+/g, " ").trim();
  // Μπορεί να υπάρχουν δύο suffixes ("… | Skroutz.gr - Pharm24.gr") — loop
  for (let i = 0; i < 3; i++) {
    const next = s.replace(PHARMACY_NAME_SUFFIX, "").trim();
    if (next === s) break;
    s = next;
  }
  return s || null;
}

// Αρχεία εικόνων που κατέβηκαν από φαρμακεία (όχι από frezyderm.gr) —
// το slug τους περιέχει το host του φαρμακείου.
export const PHARMACY_IMAGE_MARKER = /(pharm24|ofarmakopoiosmou|online-pharmacy|skroutz|bestprice|vita4you|kosmas|blinkshop|bestpharmacy|mypharmacy|pharmacy295|smilepharmacy|lifepharmacy|pharmaplaza|galinos)/i;

// ----- Long description cleanup + claims -----
//
// Το <div class="product-text"><div class="text"> του frezyderm.gr περιέχει
// την περιγραφή ΚΑΙ boilerplate (expand/collapse "More"/"Less", links
// "Δείτε εδώ…", "Επισκεφθείτε τη Frezyland…", στοιχεία διανομέα) ΚΑΙ
// μονογραμμές-badges ("Δερματολογικά ελεγμένο", "Χωρίς parabens",
// "Κατάλληλο για…"). Κρατάμε την πρόζα ως description και μαζεύουμε τα
// badges σε claims[] για να εμφανίζονται ως ιδιότητες.

const DROP_LINE = [
  /^(More|Less)$/i,
  /Frezyland/i,                                                   // κάθε CTA προς το Frezyland blog
  /^(Δε[ίι]τε|Μ[άα]θετε|Διαβ[άα]στε|Ανακαλ[ύυ]ψτε)\s+(εδ[ώω]|στη|στο|περισσ[όο]τερα)/i,
  /blog!?\s*$/i,
  /Διαν[έε]μεται απ[όο]/i,                                        // στοιχεία διανομέα/κατασκευαστή (και μέσα στη γραμμή)
  /^(Παρ[άα]γεται|Παρασκευ[άα]ζεται|Κατασκευ[άα]ζεται)\s+(απ[όο]|για)/i,
  /^Manufactured\s+(by|for)/i,
  /^.{0,80}Technical\s+data\.?$/i,                               // footnotes "*Active Ingredients – Technical data", "1.D.V.D. crosspolymer- Technical data."
  /^(\d+\.\s*[^.]{0,60}Technical\s+data\.?\s*){2,}$/i,           // "1. Plant extracts - Technical Data. 2. Lipopeptide - Technical Data…"
  /^Μπε[ίι]τε στο site/i,
  /^Ανακαλ[ύυ]ψτε περισσ[όο]τερα/i,
];

const cap = s => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
const stripDot = s => s.replace(/\s*[.·]\s*$/, "").trim();

const CLAIM_PATTERNS = [
  { re: /^(Δερματολογικ[άα]|Κλινικ[άα]|Οφθαλμολογικ[άα]|Παιδιατρικ[άα]|Γυναικολογικ[άα]|Οδοντιατρικ[άα]|Μικροβιολογικ[άα]|Αλλεργιολογικ[άα])\s+(ελεγμ[έε]ν[οα]|δοκιμασμ[έε]ν[οα])\.?$/i,
    norm: m => cap(m[1]) + " " + m[2].toLowerCase() },
  { re: /^Τοξικολογικ[όοάα]\s+(τεστ|[έε]λεγχος)(\s+ασφ[άα]λειας)?\.?$/i, norm: () => "Τοξικολογικό τεστ ασφάλειας" },
  { re: /^parabens?\s*[- ]?\s*free\.?$/i, norm: () => "Χωρίς parabens" },
  { re: /^(Vegan|Hypoallergenic|Υποαλλεργικ[όο]|Non[- ]?comedogenic|Μη φαγεσωρογ[όο]νο|Fragrance[- ]?free|Χωρ[ίι]ς [άα]ρωμα|Cruelty[- ]?free|Gluten[- ]?free|Alcohol[- ]?free|Χωρ[ίι]ς αλκο[όο]λη|Silicone[- ]?free|Sulfate[- ]?free|SLS[- ]?free)\.?$/i,
    norm: m => stripDot(m[0]) },
  { re: /^Χωρ[ίι]ς\s+.{3,70}$/i, norm: m => stripDot(m[0]) },
  { re: /^Κατ[άα]λληλο\s+(για|απ[όο])\s+.{3,80}$/i, norm: m => stripDot(m[0]) },
  { re: /^Ιδανικ[όο]\s+για\s+.{3,80}$/i, norm: m => stripDot(m[0]) },
  { re: /^Συνιστ[άα]ται απ[όο]\s+.{3,90}$/i, norm: m => stripDot(m[0]) },
  // Cluster "Μελέτες / Αποτελεσματικότητας / Αξιολόγησης ασφάλειας"
  { re: /^Μελ[έε]τες$/i, drop: true },
  { re: /^Αποτελεσματικ[όο]τητας$/i, norm: () => "Μελέτες αποτελεσματικότητας" },
  { re: /^Αξιολ[όο]γησης\s+ασφ[άα]λειας$/i, norm: () => "Μελέτες αξιολόγησης ασφάλειας" },
  { re: /^Ασφ[άα]λειας$/i, norm: () => "Μελέτες ασφάλειας" },
];

export function cleanLongDescription(text) {
  const claims = [];
  const seen = new Set();
  const kept = [];
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  for (const raw of lines) {
    const line = raw.replace(/[ \t]+/g, " ").trim();
    if (!line) { kept.push(""); continue; }
    if (DROP_LINE.some(re => re.test(line))) continue;
    let handled = false;
    for (const cp of CLAIM_PATTERNS) {
      const m = line.match(cp.re);
      if (!m) continue;
      handled = true;
      if (!cp.drop) {
        const c = cp.norm(m);
        const key = c.toLowerCase();
        if (!seen.has(key)) { seen.add(key); claims.push(c); }
      }
      break;
    }
    if (!handled) kept.push(line);
  }
  const description = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim() || null;
  return { description, claims };
}

// Volume tokens τύπου 150ml / 200gr / 30caps / 2x50ml
export const VOLUME_TOKEN = /^\d+([.,]\d+)?(ml|gr|g|kg|mg|l|iu|caps|tabs|tablets|sachets|amp|amps|x\d+)$/i;

// ----- Δομή σελίδας προϊόντος frezyderm.gr -----
//
//   <div class="product">
//     <div class="media"> <div class="img"><img src="…/ProductDetail/…"> <span class="Measurement">50g</span></div>
//                         <div class="extra-icons"><a class="extra-icon …"><span class="text">ΝΕΟ</span></a></div>
//     <div class="details">
//       <h2 class="cat">Κατηγορία</h2>
//       <h1>ΟΝΟΜΑ - Ελληνικός υπότιτλος</h1>
//       <p class="strong-desc"><strong><p>pH7<br>Ιατροτεχνολογικό προϊόν<br>CE 2803<br>50g</p></strong></p>
//       <div class="desc"> <div class="sku_code">SKU : 422755</div>
//                          <div class="product-text"><div class="text">…περιγραφή…</div></div>
//     <div class="tabs-wrap"> <div class="header"><div>ΚΑΤΑΛΛΗΛΟ ΓΙΑ</div><div>ΧΡΗΣΗ</div><div>ΔΡΑΣΗ - ΕΝΕΡΓΑ ΣΥΣΤΑΤΙΚΑ</div></div>
//                             <div class="tabs"><div>…</div><div>…</div><div>…</div></div>

export function htmlToText(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(?:div|li|h[1-6]|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/\r/g, "")
    .split("\n").map(l => l.replace(/[ \t ]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Inner HTML του πρώτου <tag class="…cls…"> με σωστό μέτρημα εμφωλευμένων
// tags (τα regex δεν αντέχουν <div> μέσα σε <div>).
export function innerOfClass(html, cls, tag = "div") {
  const open = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "i");
  const m = html.match(open);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  for (const t of html.slice(start).matchAll(new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi"))) {
    depth += t[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, start + t.index);
  }
  return null;
}

// Τα άμεσα παιδιά <tag> ενός inner HTML (ως inner HTML το καθένα).
// Inner HTML από ένα offset (αμέσως μετά το opening tag) μέχρι το ταίρι του.
export function balancedInner(html, start, tag = "div") {
  let depth = 1;
  for (const t of html.slice(start).matchAll(new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi"))) {
    depth += t[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, start + t.index);
  }
  return null;
}

export function directChildren(inner, tag = "div") {
  const out = [];
  let depth = 0, cur = null;
  for (const t of inner.matchAll(new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, "gi"))) {
    if (!t[0].startsWith("</")) { if (depth === 0) cur = t.index + t[0].length; depth++; }
    else { depth--; if (depth === 0 && cur !== null) { out.push(inner.slice(cur, t.index)); cur = null; } }
  }
  return out;
}

const oneLine = s => htmlToText(s).replace(/\s+/g, " ").trim();

export function extractProductDetails(html) {
  const d = {};
  const details = innerOfClass(html, "details") || html;

  const h1 = details.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = oneLine(h1[1]);
    const parts = t.split(/\s+[-–—]\s+/);
    d.title = parts[0].trim();
    if (parts.length > 1) d.subtitle = parts.slice(1).join(" - ").trim();
  }
  const cat = details.match(/<h2[^>]*class="[^"]*\bcat\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
  if (cat) d.category = oneLine(cat[1]);

  const sd = innerOfClass(details, "strong-desc", "p");
  if (sd) d.keyFacts = htmlToText(sd).split("\n").map(s => s.trim()).filter(Boolean);

  const sku = details.match(/class="sku_code"[^>]*>\s*SKU\s*:?\s*([A-Za-z0-9\-\.]+)/i);
  if (sku) d.sku = sku[1];

  const meas = html.match(/class="Measurement"[^>]*>([^<]+)</i);
  if (meas) d.size = meas[1].trim();

  const badges = [...html.matchAll(/class="extra-icon[^"]*"[^>]*>\s*<span class="text">\s*([^<]+?)\s*<\/span>/gi)].map(m => m[1].trim());
  if (badges.length) d.badges = [...new Set(badges)];

  const img = html.match(/<div class="img">[\s\S]*?<img[^>]+src="([^"]+)"/i);
  if (img) d.imageLarge = decodeHtml(img[1]);
  // Η μεγέθυνση (lightbox) χρησιμοποιεί το preset ProductLarge — ίδιο αρχείο,
  // μεγαλύτερη ανάλυση.
  const zoom = html.match(/https?:\/\/[^"'\s)]+\/Images\/f\/ProductLarge\/[^"'\s)]+/i);
  if (zoom) d.imageZoom = decodeHtml(zoom[0]);

  const wrap = innerOfClass(html, "tabs-wrap");
  if (wrap) {
    const header = innerOfClass(wrap, "header");
    const tabs = innerOfClass(wrap, "tabs");
    if (header && tabs) {
      const titles = directChildren(header).map(oneLine);
      const bodies = directChildren(tabs).map(x => htmlToText(x));
      d.tabs = {};
      titles.forEach((t, i) => { if (t && bodies[i]) d.tabs[t] = bodies[i]; });
    }
  }
  return d;
}

// Οι εικόνες του frezyderm.gr σερβίρονται από image-resizer route
// /Images/f/<preset>/<path>: FacebookPresetSmall (og:image) < ProductDetail
// (κύρια εικόνα σελίδας) < ProductLarge (μεγέθυνση). Ίδιο αρχείο, άλλο preset.
export function toLargePreset(url) {
  if (!url) return null;
  return url.replace(/\/Images\/f\/[A-Za-z0-9_]+\//, "/Images/f/ProductLarge/");
}

// Ετικέτες καρτελών όπως θέλουμε να εμφανίζονται (η σελίδα τις έχει ΚΕΦΑΛΑΙΑ).
const TAB_LABELS = {
  "ΚΑΤΑΛΛΗΛΟ ΓΙΑ": "Κατάλληλο για",
  "ΧΡΗΣΗ": "Χρήση",
  "ΔΡΑΣΗ - ΕΝΕΡΓΑ ΣΥΣΤΑΤΙΚΑ": "Δράση – Ενεργά συστατικά",
  "ΔΡΑΣΗ": "Δράση",
  "ΕΝΕΡΓΑ ΣΥΣΤΑΤΙΚΑ": "Ενεργά συστατικά",
  "ΣΥΣΤΑΤΙΚΑ": "Συστατικά",
  "ΠΡΟΕΙΔΟΠΟΙΗΣΕΙΣ": "Προειδοποιήσεις",
  "ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ": "Οδηγίες χρήσης",
  // lamberts.gr expandable sections
  "ΑΠΟΔΟΣΗ & ΣΥΣΤΑΤΙΚΑ": "Απόδοση & Συστατικά",
  "ΠΡΟΦΥΛΑΞΕΙΣ": "Προφυλάξεις",
  "ΜΟΡΦΗ & ΣΥΣΚΕΥΑΣΙΑ": "Μορφή & Συσκευασία",
  "ΠΕΡΙΓΡΑΦΗ": "Περιγραφή",
  // Λίγες σελίδες του lamberts.gr έχουν τις ενότητες στα αγγλικά
  "DOSAGE & INGREDIENTS": "Απόδοση & Συστατικά",
  "DIRECTIONS": "Χρήση",
  "PRECAUTIONS": "Προφυλάξεις",
  "FORM & PACKAGING": "Μορφή & Συσκευασία",
  "DESCRIPTION": "Περιγραφή",
  "SUITABLE FOR": "Κατάλληλο για",
  "USE": "Χρήση",
  "ACTION - ACTIVE INGREDIENTS": "Δράση – Ενεργά συστατικά"
};
const stripAccents = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const TAB_LABELS_KEYED = Object.fromEntries(Object.entries(TAB_LABELS).map(([k, v]) => [stripAccents(k), v]));
export function tabLabel(raw) {
  const clean = String(raw || "").replace(/\s+/g, " ").trim();
  const key = stripAccents(clean).toUpperCase();
  if (TAB_LABELS_KEYED[key]) return TAB_LABELS_KEYED[key];
  if (clean !== clean.toUpperCase()) return clean;   // ήδη σε κανονική γραφή (lamberts.gr) — κρατάμε ως έχει
  const s = clean.toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
