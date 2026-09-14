#!/usr/bin/env node
// scripts/match-frezyderm.mjs
// Ταιριάζει κάθε προϊόν του supplier (js/frezyderm-supplier.js) με τη σελίδα
// του στο frezyderm.gr (js/frezyderm-site.json), με τρεις πηγές αλήθειας
// κατά σειρά προτεραιότητας:
//
//   1. js/frezyderm-manual-matches.json  — χειροκίνητες διορθώσεις (barcode → url,
//      ή null = "δεν έχει σελίδα")
//   2. GTIN                               — το JSON-LD πολλών σελίδων δίνει barcode·
//      αν ταιριάζει με barcode/variant του supplier είναι ακριβές match
//   3. Fuzzy (IDF-weighted tokens)        — για τα υπόλοιπα. Ζυγίζει σπάνιες λέξεις
//      (abd/reform/tensioner) πολύ και γενικές (cream/gel) λίγο, τιμωρεί τα
//      διακριτά supplier tokens που λείπουν, και δοκιμάζει ΚΑΙ το όνομα από
//      φαρμακείο (supplemental) ως δεύτερο query — συχνά πιο καθαρό από το
//      συντομογραφικό όνομα του supplier Excel.
//
// Τα GTIN matches χρησιμοποιούνται και ως ground truth: το script τυπώνει σε
// πόσα από αυτά ο fuzzy matcher θα έβγαζε το ίδιο αποτέλεσμα.
//
// Έξοδοι:
//   js/frezyderm-overrides.js      — name/description/claims/image/url ανά barcode
//   frezyderm-match-report.csv     — ένα-προς-ένα αναφορά για έλεγχο (Excel)
//   js/frezyderm-unmatched.json    — όσα δεν βρέθηκαν
//
// Χρήση:
//   node scripts/match-frezyderm.mjs
//   node scripts/match-frezyderm.mjs --debug                 # top-3 ανά προϊόν
//   node scripts/match-frezyderm.mjs --barcode=5202888227554 # μόνο ένα (δεν γράφει αρχεία)
//   node scripts/match-frezyderm.mjs --min-score=4 --high-score=8

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWindowFile, cleanSiteName, cleanLongDescription, cleanPharmacyName, tabLabel, toLargePreset, VOLUME_TOKEN } from "./lib-frezyderm.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUPPLIER_FILE = path.join(ROOT, "js/frezyderm-supplier.js");
const SITE_FILE = path.join(ROOT, "js/frezyderm-site.json");
const SUPPLEMENTAL_FILE = path.join(ROOT, "js/frezyderm-supplemental.js");
const MANUAL_FILE = path.join(ROOT, "js/frezyderm-manual-matches.json");
const OUT_FILE = path.join(ROOT, "js/frezyderm-overrides.js");
const REPORT_FILE = path.join(ROOT, "frezyderm-match-report.csv");
const UNMATCHED_FILE = path.join(ROOT, "js/frezyderm-unmatched.json");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const ONLY = opt("barcode", null);
const MIN_SCORE = parseFloat(opt("min-score", "7"));
const HIGH_SCORE = parseFloat(opt("high-score", "12"));
// Πόσο κοστίζει κάθε διακριτό query token που ΔΕΝ βρίσκεται στη σελίδα
// (ως ποσοστό του IDF βάρους του). 1.0 = μια λέξη που λείπει ακυρώνει μια
// ισοβαρή που ταίριαξε.
const MISS_PENALTY = parseFloat(opt("miss-penalty", "0.75"));
const FORM_PENALTY = parseFloat(opt("form-penalty", "10"));
const SPF_PENALTY = parseFloat(opt("spf-penalty", "8"));

// Λέξεις που δεν διακρίνουν προϊόντα μεταξύ τους — έξω από το scoring.
// Συντομογραφίες του supplier Excel → πλήρης λέξη (όπως στο site).
const ABBREV = {
  spr: "spray", sh: "shampoo", cr: "cream", cl: "cleaner", hyper: "hypertonic", iso: "isotonic",
  eucal: "eucalyptus", med: "medium", dandr: "dandruff", ef: "effect", vag: "vaginal", emuls: "emulsion",
  lot: "lotion", sol: "solution", susp: "suspension", tooth: "tooth", oint: "ointment", cond: "conditioner",
  moist: "moisturizing", sens: "sensitive", prot: "protective", hydr: "hydrating", ch: "chewable"
};

const STOPWORDS = new Set([
  "frezyderm", "ml", "gr", "kg", "mg", "iu", "l",
  "the", "of", "for", "and", "with", "in", "on", "at", "to", "by",
  "και", "σε", "για", "με", "ή", "από", "στο", "στη", "στην", "του", "της",
  "gia", "me", "kai", "sto", "sthn", "tou", "ths",
  "en", "fr", "es", "pt", "de", "it", "nl", "pl", "ro", "el"
]);

// Λέξεις συσκευασίας του supplier Excel: μετράνε υπέρ αν ταιριάξουν (HAIR
// FORCE TABS) αλλά ΔΕΝ τιμωρούν αν λείπουν από τη σελίδα (FERTI "box of 30
// sachets" → σελίδα "FERTI").
const PACKAGING = new Set([
  "box", "bottle", "sachet", "capsule", "caps", "tabs", "tablets", "tab", "pack", "stick",
  "τεμ", "τμχ", "τεμαχια", "φακ", "φακελακια", "φακελακι", "ατομ", "δισκια", "μασωμενα", "μασωμ"
]);

function isPromoPackSite(sp) {
  const url = (sp.url || "").toLowerCase();
  const name = (sp.name || "").toLowerCase();
  if (sp.section === "proionta-prosfores") return true;
  if (name.includes("δωρο") || name.includes("δώρο")) return true;
  if (url.includes("δωρο") || url.includes("me-doro") || url.includes("doro")) return true;
  return false;
}

function isPromoPackSupplier(p) {
  const n = (p.name || "").toLowerCase();
  return n.includes("δωρο") || n.includes("δώρο") || n.includes("νεσεσερ")
      || n.includes("νεσσεσαιρ") || n.includes("επιπλεον") || n.includes("δειγμα");
}

// Ελαφρύ singular ώστε kids/kid's/kid και girls/girl να ταυτίζονται.
const stem = t => (/^[a-z]{4,}s$/.test(t) && !t.endsWith("ss")) ? t.slice(0, -1) : t;

function tokenize(s) {
  if (!s) return [];
  const split = String(s)
    .replace(/([a-z])([A-Z])/g, "$1 $2")            // AcNorm → Ac Norm (ταιριάζει με AC-NORM)
    .replace(/([A-Za-zα-ωΑ-Ω]{2})(\d)/g, "$1 $2");  // SPF30 → SPF 30, PASTE100 → PASTE 100 (D3/B12 και 100ml μένουν ενιαία)
  const lower = split.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[+&\/\\.\-_']/g, " ")
    .replace(/[^\wα-ωά-ώΑ-Ωa-z0-9]/gi, " ");
  return lower.split(/\s+/)
    .map(t => ABBREV[t] || t)
    .map(stem)
    .filter(t => (t.length >= 2 || /^\d$/.test(t)) && !STOPWORDS.has(t));   // τα μονοψήφια νούμερα μένουν (STEP 2, EFFECT 1)
}

function extractVolume(s) {
  if (!s) return null;
  const m = s.toLowerCase().match(/\b(\d{1,4})\s?(ml|gr|g|kg|l|iu|mg|caps|tabs|tablets|patch|amp|amps|shots|φακελ)\b/);
  return m ? m[1] + m[2] : null;
}

// SPF 20 ≠ SPF 30 ≠ SPF 50+ — διαφορετικά προϊόντα ακόμα κι αν όλα τα άλλα ταιριάζουν.
function extractSpf(s) {
  const m = String(s || "").match(/\bspf\s*(\d{1,3})\s*(\+)?/i);
  return m ? m[1] + (m[2] || "") : null;
}

function slugOf(url) { return (url || "").split("/").filter(Boolean).pop() || ""; }

// IDF: log((N+1)/(df+1)) + 1 — γενικές λέξεις ~1, σπάνιες ~6-7.
function buildIdf(site) {
  const N = site.length;
  const df = new Map();
  for (const sp of site) {
    const toks = new Set([...tokenize(sp.name), ...tokenize(slugOf(sp.url).replace(/-/g, " "))]);
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map();
  let max = 0;
  for (const [t, c] of df) { const w = Math.log((N + 1) / (c + 1)) + 1; idf.set(t, w); if (w > max) max = w; }
  idf._max = max;
  return idf;
}

// Άγνωστες λέξεις = οι πιο σπάνιες δυνατές. Η απουσία τους από το site
// λειτουργεί ως penalty ("Tripleffect" δεν υπάρχει πουθενά → όχι match).
// Εξαιρέσεις με ελαφρύ βάρος: σκέτα νούμερα (ποσότητες "30", "2,5") και
// ελληνικές λέξεις (στον supplier είναι περιγραφικές — "Συμπλήρωμα Διατροφής",
// "Φυσιολογικός Ορός" — ενώ τα ονόματα του site είναι αγγλικά).
const idfWeight = (idf, t) => idf.get(t) ?? (/^\d+$/.test(t) ? 1 : /[α-ω]/.test(t) ? 1.5 : (idf._max ?? 6));

// "TOOTH PASTE" ↔ "TOOTHPASTE", "SENSI TEETH" ↔ "SENSITEETH": αν η ένωση δύο
// γειτονικών λέξεων υπάρχει στο λεξιλόγιο του site, την προσθέτουμε ως token.
function addJoinedBigrams(toks, idf) {
  const out = [...toks];
  for (let i = 0; i < toks.length - 1; i++) {
    const j = toks[i] + toks[i + 1];
    if (idf.has(j) && !toks.includes(j)) out.push(j);
  }
  return out;
}

function consecutiveBonus(supArr, siteArr, idf) {
  let bonus = 0;
  for (let i = 0; i < supArr.length - 1; i++) {
    const a = supArr[i], b = supArr[i + 1];
    for (let j = 0; j < siteArr.length - 1; j++) {
      if (siteArr[j] === a && siteArr[j + 1] === b) { bonus += 0.5 * (idfWeight(idf, a) + idfWeight(idf, b)); break; }
    }
  }
  return bonus;
}

// Μορφή προϊόντος. Ίδια σειρά αλλά άλλη μορφή (HYDRORAL XERO mouth spray vs
// toothpaste, Hair Force συμπλήρωμα vs shampoo) ΔΕΝ είναι το ίδιο προϊόν —
// αλλά οι λέξεις μορφής είναι κοινές (χαμηλό IDF) και χάνονται πίσω από το
// σπάνιο όνομα σειράς. Γι' αυτό ρητή ποινή όταν οι μορφές δεν τέμνονται.
const FORM_GROUPS = [
  ["cream", "cr", "krema", "κρεμα"], ["gel", "τζελ", "γελη"], ["lotion", "milk", "emulsion", "γαλακτωμα"],
  ["serum", "ορος"], ["oil", "λαδι"], ["spray", "spr", "mist", "σπρει"], ["foam", "mousse", "αφρος"],
  ["shampoo", "sh", "σαμπουαν"], ["conditioner"], ["mask", "μασκα"], ["toothpaste", "οδοντοκρεμα"],
  ["mouthwash", "στοματικο"], ["ointment", "αλοιφη"], ["balm", "butter"], ["stick"], ["wipes", "μαντηλακια"],
  ["powder", "πουδρα"], ["patch", "patches"], ["drops", "σταγονες"], ["wash", "cleanser", "cleaner", "καθαριστικο"],
  ["scrub"], ["deodorant", "deo"], ["douche"], ["ovules", "υποθετα"], ["soap", "σαπουνι"], ["fluid"],
  ["capsule", "capsules", "caps", "tabs", "tablets", "sachets", "sticks", "συμπληρωμα", "δισκια", "μασωμενα", "shots"],
  ["monodose", "monodoses", "ampoule", "ampoules", "vials", "αμπουλες"]
];
const FORM_OF = new Map();
FORM_GROUPS.forEach((g, i) => g.forEach(w => FORM_OF.set(w, i)));

function formsOf(name) {
  const raw = String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/([a-z]{2})(\d)/g, "$1 $2").split(/[^a-z0-9α-ω]+/).filter(Boolean);
  const toks = [...raw];
  for (let i = 0; i < raw.length - 1; i++) toks.push(raw[i] + raw[i + 1]);   // tooth+paste
  const forms = new Set();
  for (const t of toks) { const f = FORM_OF.get(t) ?? FORM_OF.get(stem(t)); if (f !== undefined) forms.add(f); }
  return forms;
}
const formCache = new Map();
function siteForms(sp) {
  if (!formCache.has(sp.url)) formCache.set(sp.url, formsOf(sp.name));
  return formCache.get(sp.url);
}

function scoreMatch(queryTokens, queryVol, supplierIsPromo, sp, idf, queryForms, querySpf) {
  // Ο supplier κατάλογος έχει ήδη φιλτραριστεί από promo packs — ένα απλό
  // προϊόν δεν ταιριάζει ΠΟΤΕ σε σελίδα "…ΜΕ ΔΩΡΟ" (αλλιώς το volume match
  // του pack κερδίζει τη σωστή σελίδα).
  if (isPromoPackSite(sp) && !supplierIsPromo) return { score: -99, matched: [] };
  const nameToks = tokenize(sp.name);
  const nameSet = new Set(nameToks);
  const urlToks = tokenize(slugOf(sp.url).replace(/-/g, " "));
  const urlSet = new Set(urlToks);
  const siteVol = extractVolume(sp.name) || extractVolume(slugOf(sp.url));

  let score = 0, matchedW = 0, totalW = 0;
  const matched = [];
  for (const t of new Set(queryTokens)) {
    if (VOLUME_TOKEN.test(t)) continue;  // τα volumes κρίνονται χωριστά (τα SPF/ppm νούμερα μετράνε)
    const w = idfWeight(idf, t);
    const hit = nameSet.has(t) ? 1 : urlSet.has(t) ? 0.7 : 0;
    if (hit) { score += hit * w; matched.push(hit === 1 ? t : t + "·url"); }
    if (!PACKAGING.has(t)) { totalW += w; matchedW += hit * w; }
  }
  // Recall penalty: διακριτά query tokens που δεν ταιριάζουν πουθενά
  score -= MISS_PENALTY * (totalW - matchedW);
  score += consecutiveBonus(queryTokens, nameToks, idf);
  score += 0.5 * consecutiveBonus(queryTokens, urlToks, idf);

  if (queryVol && siteVol && queryVol === siteVol) score += 3;
  else if (queryVol && siteVol && queryVol !== siteVol) score -= 2;

  if (queryForms && queryForms.size) {
    const sf = siteForms(sp);
    if (sf.size && ![...queryForms].some(f => sf.has(f))) { score -= FORM_PENALTY; matched.push("form≠"); }
  }
  if (querySpf) {
    const siteSpf = extractSpf(sp.name) || extractSpf(slugOf(sp.url).replace(/-/g, " "));
    if (siteSpf && siteSpf.replace("+", "") !== querySpf.replace("+", "")) { score -= SPF_PENALTY; matched.push("spf≠"); }
  }

  if (isPromoPackSite(sp) && supplierIsPromo) score += 2;
  return { score, matched };
}

function rank(queryName, site, idf, isPromo, { knownOnly = false } = {}) {
  let toks = tokenize(queryName);
  // Για ονόματα από φαρμακεία (πολύ φλύαρα, με ελληνικές περιγραφές) κρατάμε
  // μόνο λέξεις που υπάρχουν στο λεξιλόγιο του site — αλλιώς το recall penalty
  // τα θάβει.
  // Πετάμε μόνο τα ΕΛΛΗΝΙΚΑ άγνωστα (περιγραφικά: "Ενυδατική", "Γέλη") — τα
  // λατινικά άγνωστα ("tripleffect") είναι ένδειξη ότι το προϊόν δεν υπάρχει
  // στο site και πρέπει να συνεχίσουν να τιμωρούν.
  if (knownOnly) toks = toks.filter(t => idf.has(t) || VOLUME_TOKEN.test(t) || /^[a-z0-9]+$/.test(t));
  toks = addJoinedBigrams(toks, idf);
  const vol = extractVolume(queryName);
  const forms = formsOf(queryName);
  const spf = extractSpf(queryName);
  return site.map(sp => ({ site: sp, ...scoreMatch(toks, vol, isPromo, sp, idf, forms, spf) }))
             .sort((a, b) => b.score - a.score);
}

function fuzzyMatch(p, altName, site, idf) {
  const isPromo = isPromoPackSupplier(p);
  const primary = rank(p.name, site, idf, isPromo);
  let best = { query: p.name, ranked: primary, viaAlt: false };
  if (altName) {
    const alt = rank(altName, site, idf, isPromo, { knownOnly: true });
    if ((alt[0]?.score ?? -Infinity) > (primary[0]?.score ?? -Infinity)) best = { query: altName, ranked: alt, viaAlt: true };
  }
  // Το όνομα φαρμακείου μπορεί να είναι λάθος καταχώρηση (άλλο προϊόν στο
  // ίδιο barcode). Αν κέρδισε ΚΑΙ διαφωνεί με το όνομα του supplier, το
  // match δεν μπορεί να θεωρηθεί "σίγουρο" — μόνο "για έλεγχο".
  const primaryTop = primary[0]?.site?.url || null;
  const disputed = best.viaAlt && primaryTop !== (best.ranked[0]?.site?.url || null);
  return { query: best.query, top: best.ranked[0] || null, top3: best.ranked.slice(0, 3), disputed };
}

const normUrl = u => String(u || "").trim().replace(/\/+$/, "").toLowerCase();

const STATUS_LABEL = {
  "manual":      "Χειροκίνητο",
  "exact":       "Ακριβές (GTIN)",
  "high":        "Αυτόματο (σίγουρο)",
  "review":      "Αυτόματο (για έλεγχο)",
  "skip":        "Χωρίς σελίδα",
  "manual-skip": "Χωρίς σελίδα (χειροκίνητα)"
};

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const supplier = (await loadWindowFile(SUPPLIER_FILE)).FREZYDERM_SUPPLIER || [];
  const supplemental = (await loadWindowFile(SUPPLEMENTAL_FILE)).FREZYDERM_SUPPLEMENTAL || {};
  const site = JSON.parse(await fs.readFile(SITE_FILE, "utf8"));
  if (!site.length) { console.error("Το frezyderm-site.json είναι κενό. Τρέξτε πρώτα scripts/scrape-frezyderm.mjs."); process.exit(1); }
  for (const sp of site) sp.name = cleanSiteName(sp.name);   // "INTIMEO&#174;" → "INTIMEO®", trailing spaces
  let manual = {};
  try { manual = JSON.parse(await fs.readFile(MANUAL_FILE, "utf8")); } catch {}

  const idf = buildIdf(site);
  const byGtin = new Map();
  const byUrl = new Map();
  for (const sp of site) {
    if (sp.gtin) byGtin.set(String(sp.gtin).trim(), sp);
    byUrl.set(normUrl(sp.url), sp);
  }
  console.log(`Site: ${site.length} σελίδες (${byGtin.size} με GTIN), IDF λεξιλόγιο ${idf.size} tokens.`);
  console.log(`Supplier: ${supplier.length} προϊόντα · min-score=${MIN_SCORE} high-score=${HIGH_SCORE}\n`);

  const pool = ONLY ? supplier.filter(p => p.barcode === ONLY || (p.variants || []).includes(ONLY)) : supplier;
  const overrides = {};
  const counts = { manual: 0, exact: 0, high: 0, review: 0, skip: 0, "manual-skip": 0 };
  const report = [];
  const unmatched = [];
  let fuzzyChecked = 0, fuzzyAgree = 0;
  const disagreements = [];

  for (const p of pool) {
    const barcodes = [p.barcode, ...(p.variants || [])];
    let chosen = null, type = null, score = null;

    // 1. Χειροκίνητο
    if (Object.prototype.hasOwnProperty.call(manual, p.barcode) && !p.barcode.startsWith("_")) {
      const u = manual[p.barcode];
      if (u === null) type = "manual-skip";
      else {
        chosen = byUrl.get(normUrl(u));
        if (chosen) type = "manual";
        else console.warn(`  ! manual url δεν υπάρχει στο site.json για ${p.barcode}: ${u}`);
      }
    }
    // 2. GTIN
    if (!chosen && type !== "manual-skip") {
      for (const b of barcodes) { if (byGtin.has(b)) { chosen = byGtin.get(b); type = "exact"; break; } }
    }
    // 3. Fuzzy — υπολογίζεται πάντα (για την αναφορά και το validation)
    const altName = supplemental[p.barcode] ? cleanPharmacyName(supplemental[p.barcode].name) : null;
    const fz = fuzzyMatch(p, altName, site, idf);
    if (type === "exact" && fz.top) {
      fuzzyChecked++;
      if (fz.top.site.url === chosen.url && fz.top.score >= MIN_SCORE) fuzzyAgree++;
      else disagreements.push({ barcode: p.barcode, name: p.name, truth: chosen.name, fuzzy: fz.top.site.name, score: fz.top.score });
    }
    if (!chosen && type !== "manual-skip") {
      if (fz.top && fz.top.score >= MIN_SCORE) { chosen = fz.top.site; score = fz.top.score; type = (score >= HIGH_SCORE && !fz.disputed) ? "high" : "review"; }
      else type = "skip";
    }
    counts[type]++;

    if (DEBUG) {
      console.log(`\n[${p.barcode}] ${p.name.slice(0, 60)}  → ${STATUS_LABEL[type]}${altName ? `  (alt: ${altName.slice(0, 50)})` : ""}`);
      for (const c of fz.top3) console.log(`  ${c.score.toFixed(1).padStart(6)} [${c.matched.join(",")}] ${cleanSiteName(c.site.name).slice(0, 55)} — ${slugOf(c.site.url)}`);
    } else {
      const tag = { manual: "MAN ", exact: "GTIN", high: "OK  ", review: "REV ", skip: "SKIP", "manual-skip": "SKIP" }[type];
      console.log(`${p.barcode.padEnd(13)} ${tag} ${(score ?? (fz.top ? fz.top.score : 0)).toFixed(1).padStart(6)}  ${p.name.slice(0, 45).padEnd(45)} → ${chosen ? cleanSiteName(chosen.name).slice(0, 45) : "—"}`);
    }

    if (chosen) {
      const { description, claims } = cleanLongDescription(chosen.longDescription || chosen.description || "");
      const d = chosen.details || {};
      // Βασικά στοιχεία (strong-desc: "pH7", "Ιατροτεχνολογικό προϊόν", "CE 2803") και
      // badges ("ΝΕΟ") μπαίνουν στις ιδιότητες· η συσκευασία ("50g") έχει δικό της πεδίο.
      const extraClaims = [...(d.keyFacts || []), ...(d.badges || []).map(b => b === "ΝΕΟ" ? "Νέο" : b)]
        .filter(c => c && c !== d.size && !VOLUME_TOKEN.test(c.replace(/\s+/g, "")));
      const allClaims = [...claims];
      for (const c of extraClaims) if (!allClaims.some(x => x.toLowerCase() === c.toLowerCase())) allClaims.push(c);
      const attributes = {};
      if (d.size) attributes["Συσκευασία"] = d.size;
      if (d.category) attributes["Κατηγορία frezyderm.gr"] = d.category;
      if (d.sku) attributes["SKU"] = d.sku;
      const sections = {};
      for (const [t, text] of Object.entries(d.tabs || {})) if (text) sections[tabLabel(t)] = text;
      overrides[p.barcode] = {
        name: cleanSiteName(d.title || chosen.name),
        subtitle: d.subtitle || null,
        description,
        claims: allClaims,
        attributes,
        sections,
        // Μεγέθυνση (ProductLarge) για καλύτερη ανάλυση· το og:image μένει ως fallback
        // για το sync αν το μεγάλο preset δεν υπάρχει.
        image: d.imageZoom || toLargePreset(d.imageLarge || chosen.image) || null,
        imageFallback: d.imageLarge || chosen.image || null,
        url: chosen.url,
        source: "frezyderm.gr",
        section: chosen.section,
        matchType: type,
        score: score === null ? null : Number(score.toFixed(1)),
        review: type === "review"
      };
    } else {
      unmatched.push({ barcode: p.barcode, name: p.name, status: type, bestScore: fz.top ? Number(fz.top.score.toFixed(1)) : 0, bestName: fz.top ? cleanSiteName(fz.top.site.name) : null, bestUrl: fz.top?.site?.url || null });
    }

    const alt = i => fz.top3[i] ? [cleanSiteName(fz.top3[i].site.name), fz.top3[i].score.toFixed(1)] : ["", ""];
    report.push([
      p.barcode, p.name, STATUS_LABEL[type], score === null ? "" : score.toFixed(1),
      chosen ? cleanSiteName(chosen.name) : "", chosen ? chosen.url : "",
      ...alt(0), ...alt(1), ...alt(2)
    ]);
  }

  if (ONLY) { console.log("\n(--barcode: δεν γράφω αρχεία)"); return; }

  const banner = "// Auto-generated από το scripts/match-frezyderm.mjs — ΜΗΝ το επεξεργάζεστε χειροκίνητα.\n"
    + "// Πηγή: frezyderm.gr (js/frezyderm-site.json). Διορθώσεις match → js/frezyderm-manual-matches.json.\n"
    + "// matchType: manual | exact (GTIN) | high | review (score " + MIN_SCORE + "-" + HIGH_SCORE + ", φαίνεται ως 'Match?')\n"
    + "// Προϊόντα χωρίς εγγραφή εδώ = δεν βρέθηκε σελίδα ('Χωρίς Σελίδα' στο UI, λίστα στο js/frezyderm-unmatched.json).\n";
  await fs.writeFile(OUT_FILE, banner + "window.FREZYDERM_OVERRIDES = " + JSON.stringify(overrides, null, 2) + ";\n", "utf8");

  const headers = ["Barcode", "Όνομα supplier", "Κατάσταση", "Score", "Σελίδα frezyderm.gr", "URL",
    "Εναλλακτική 1", "Score 1", "Εναλλακτική 2", "Score 2", "Εναλλακτική 3", "Score 3"];
  const csv = "﻿" + [headers, ...report].map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
  await fs.writeFile(REPORT_FILE, csv, "utf8");
  await fs.writeFile(UNMATCHED_FILE, JSON.stringify(unmatched, null, 2) + "\n", "utf8");

  console.log(`\nΑποτέλεσμα (${pool.length}): manual=${counts.manual}  gtin=${counts.exact}  high=${counts.high}  review=${counts.review}  skip=${counts.skip + counts["manual-skip"]}`);
  console.log(`Fuzzy validation σε GTIN matches: ${fuzzyAgree}/${fuzzyChecked} συμφωνούν${disagreements.length ? " — διαφωνίες:" : "."}`);
  for (const d of disagreements.slice(0, 15)) console.log(`   ${d.barcode} "${d.name.slice(0, 40)}"  σωστό: ${cleanSiteName(d.truth).slice(0, 35)}  |  fuzzy: ${cleanSiteName(d.fuzzy).slice(0, 35)} (${d.score.toFixed(1)})`);
  console.log(`\nΈγραψε js/frezyderm-overrides.js, frezyderm-match-report.csv, js/frezyderm-unmatched.json.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
