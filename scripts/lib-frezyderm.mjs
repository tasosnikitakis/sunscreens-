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
