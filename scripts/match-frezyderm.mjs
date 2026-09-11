#!/usr/bin/env node
// scripts/match-frezyderm.mjs
// Ταιριάζει κάθε προϊόν του supplier (js/frezyderm-supplier.js) με το πιο
// σχετικό προϊόν του frezyderm.gr (js/frezyderm-site.json) με βάση
// **IDF-weighted token overlap**: γενικές λέξεις όπως "frezyderm/cream"
// ζυγίζουν λίγο, ενώ σπάνιες όπως "abd/reform/tensioner" πολύ. Έτσι το
// match είναι πολύ πιο ακριβές από απλό token overlap.
//
// Παράγει js/frezyderm-overrides.js:
//   window.FREZYDERM_OVERRIDES = { <barcode>: { name, description, image,
//     url, source, section, score, review } }
//
// 3 επίπεδα σιγουριάς (default thresholds — παραμετροποιήσιμα):
//   score >= HIGH_SCORE   → high confidence, override κανονικά
//   score >= MIN_SCORE    → medium, μπαίνει με review:true (Match? badge)
//   score <  MIN_SCORE    → skip (δεν βρέθηκε σελίδα — "Χωρίς Match" badge)
//
// Χρήση:
//   node scripts/match-frezyderm.mjs                  # όλα
//   node scripts/match-frezyderm.mjs --debug          # δείχνει top-3 matches
//   node scripts/match-frezyderm.mjs --barcode=5202888227554
//   node scripts/match-frezyderm.mjs --min-score=4 --high-score=8

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUPPLIER_FILE = path.join(ROOT, "js/frezyderm-supplier.js");
const SITE_FILE = path.join(ROOT, "js/frezyderm-site.json");
const OUT_FILE = path.join(ROOT, "js/frezyderm-overrides.js");

const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const flag = (k) => args.includes(`--${k}`);

const DEBUG = flag("debug");
const ONLY = opt("barcode", null);
// Με IDF weighting, τα scores είναι διαφορετικής κλίμακας — τα defaults
// έχουν καλιμπραριστεί εμπειρικά για το frezyderm dataset.
const MIN_SCORE = parseFloat(opt("min-score", "3.5"));
const HIGH_SCORE = parseFloat(opt("high-score", "7"));

// Stopwords: γενικές λέξεις που ΔΕΝ πρέπει καν να μπουν στο index/scoring.
// Το IDF θα φρόντιζε από μόνο του να πάρουν πολύ μικρό βάρος (πχ 0.2), αλλά
// τις πετάμε εντελώς για να μη μολύνουν το matched-list στο debug.
const STOPWORDS = new Set([
  "cr", "ml", "gr", "kg", "mg", "iu", "l",
  "the", "of", "for", "and", "with", "in", "on", "at", "to", "by",
  "και", "σε", "για", "με", "ή", "από", "στο", "στη", "στην", "του", "της",
  "gia", "me", "kai", "sto", "sthn", "tou", "ths",
  // Language markers
  "en", "gr", "fr", "es", "pt", "de", "it", "nl", "pl", "ro", "el"
]);

// Promo pack pages στο frezyderm.gr έχουν URL slug που περιέχει τη λέξη
// "δωρο" ή είναι κάτω από το section "proionta-prosfores". Αυτά κατά
// κανόνα δεν πρέπει να ταιριάζουν με απλά προϊόντα του supplier — έχουν
// πολλά common tokens και "μαγνητίζουν" false matches.
function isPromoPackSite(sp) {
  if (!sp) return false;
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

function tokenize(s) {
  if (!s) return [];
  // Splitting at case transitions: "AcNorm" → "Ac Norm", "SPFAdult" → "SPF Adult"
  // (πριν το lowercase, ενώ το casing είναι ακόμα διακριτό)
  const split = String(s).replace(/([a-z])([A-Z])/g, "$1 $2");
  const lower = split.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[+&\/\\.\-_]/g, " ")   // hyphens/underscores → space
    .replace(/[^\wα-ωά-ώΑ-Ωa-z0-9]/gi, " ");
  const raw = lower.split(/\s+/).filter(Boolean);
  const out = [];
  for (const t of raw) {
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    // volume tokens (150ml, 200gr) μένουν — παίρνουν bonus στο volume match
    out.push(t);
  }
  return out;
}

function tokenSet(s) { return new Set(tokenize(s)); }

// Volume tokens (πχ "150ml") παίρνουν bonus αν ταιριάξουν ακριβώς
function extractVolume(s) {
  if (!s) return null;
  const m = s.toLowerCase().match(/\b(\d{1,4})\s?(ml|gr|g|kg|l|iu|mg|caps|tabs|tablets|patch|amp|amps|shots|φακελ)\b/);
  return m ? m[1] + m[2] : null;
}

// Χτίζει IDF map από όλο το site catalog. Οι σπάνιες λέξεις παίρνουν
// μεγαλύτερο βάρος. Χρησιμοποιούμε log((N+1) / (df+1)) + 1 για smoothing
// (BM25-style) — έτσι ακόμα και μία λέξη που εμφανίζεται σε όλα τα docs
// έχει βάρος ~1, ενώ μία που εμφανίζεται σε 1/300 έχει βάρος ~7.
function buildIdf(sitePr) {
  const N = sitePr.length;
  const df = new Map();
  for (const sp of sitePr) {
    const nameToks = tokenSet(sp.name || "");
    const urlSlug = (sp.url || "").split("/").filter(Boolean).pop() || "";
    const urlToks = tokenSet(urlSlug.replace(/-/g, " "));
    const combined = new Set([...nameToks, ...urlToks]);
    for (const t of combined) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map();
  let maxIdf = 0;
  for (const [t, count] of df) {
    const w = Math.log((N + 1) / (count + 1)) + 1;
    idf.set(t, w);
    if (w > maxIdf) maxIdf = w;
  }
  idf._maxIdf = maxIdf;
  return idf;
}

function idfWeight(idf, token) {
  // Άγνωστες λέξεις (δεν εμφανίζονται στο site catalog) → οι πιο σπάνιες
  // δυνατές — δίνουμε το max weight ώστε η ΑΠΟΥΣΙΑ τους να λειτουργεί
  // σαν penalty στο τελικό score.
  return idf.get(token) ?? idf._maxIdf ?? 6;
}

// Consecutive-token bonus: αν 2+ tokens του supplier εμφανίζονται
// συνεχόμενα στο site name με την ίδια σειρά, δίνει bonus. Πχ
// "abd reform tensioner" ↔ "ABD REFORM SKIN TENSIONER" έχει το bigram
// "abd reform" και το bigram "reform+skip+tensioner" (μη συνεχόμενο).
function consecutiveBonus(supplierTokens, siteTokens, idf) {
  let bonus = 0;
  const supArr = supplierTokens; // ordered array
  const siteArr = siteTokens;    // ordered array
  for (let i = 0; i < supArr.length - 1; i++) {
    const a = supArr[i], b = supArr[i + 1];
    for (let j = 0; j < siteArr.length - 1; j++) {
      if (siteArr[j] === a && siteArr[j + 1] === b) {
        bonus += 0.5 * (idfWeight(idf, a) + idfWeight(idf, b));
        break;
      }
    }
  }
  return bonus;
}

function scoreMatch(supplier, supplierTokens, supplierVol, supplierIsPromo, sitePr, idf) {
  const siteName = sitePr.name || "";
  const siteUrl = sitePr.url || "";
  const siteNameToks = tokenize(siteName);
  const siteNameSet = new Set(siteNameToks);

  const urlSlug = siteUrl.split("/").filter(Boolean).pop() || "";
  const urlToks = tokenize(urlSlug.replace(/-/g, " "));
  const urlSet = new Set(urlToks);

  const siteVol = extractVolume(siteName) || extractVolume(urlSlug);

  let score = 0;
  const matched = [];
  const supplierSet = new Set(supplierTokens);
  let matchedWeight = 0;
  let totalWeight = 0;
  for (const t of supplierSet) {
    const w = idfWeight(idf, t);
    totalWeight += w;
    if (siteNameSet.has(t)) { score += w; matchedWeight += w; matched.push(t); }
    else if (urlSet.has(t)) { score += 0.7 * w; matchedWeight += 0.7 * w; matched.push(t + "·url"); }
  }
  // Recall penalty — για κάθε ΔΙΑΚΡΙΤΟ supplier token που ΔΕΝ ταιριάζει,
  // αφαιρούμε ένα κλάσμα του weight του. Χωρίς αυτό, ένα προϊόν όπως
  // "Tripleffect Cream Gel" ταιριάζει σε οποιοδήποτε "cream gel" προϊόν
  // (γενικές λέξεις) παρά το ότι το "tripleffect" δεν υπάρχει πουθενά.
  const missingWeight = totalWeight - matchedWeight;
  score -= 0.5 * missingWeight;

  // Consecutive-token bonus — αν βρεθούν σε συνεχόμενη σειρά, boost
  score += consecutiveBonus(supplierTokens, siteNameToks, idf);
  score += 0.5 * consecutiveBonus(supplierTokens, urlToks, idf);

  // Volume: exact match = big bonus, mismatch = big penalty (size variants
  // πρέπει να ξεχωρίζουν ξεκάθαρα)
  if (supplierVol && siteVol && supplierVol === siteVol) score += 3;
  else if (supplierVol && siteVol && supplierVol !== siteVol) score -= 2;

  // Promo pack asymmetry
  if (isPromoPackSite(sitePr) && !supplierIsPromo) score -= 4;
  if (isPromoPackSite(sitePr) && supplierIsPromo) score += 2;

  return { score, matched };
}

function bestMatch(supplier, siteCatalog, idf) {
  const supplierTokens = tokenize(supplier.name);
  const sv = extractVolume(supplier.name);
  const isPromo = isPromoPackSupplier(supplier);
  const scored = siteCatalog
    .map(sp => ({ site: sp, ...scoreMatch(supplier, supplierTokens, sv, isPromo, sp, idf) }))
    .sort((a, b) => b.score - a.score);
  return { top: scored[0], top3: scored.slice(0, 3) };
}

async function loadSupplier() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(SUPPLIER_FILE, "utf8"), ctx);
  return ctx.window.FREZYDERM_SUPPLIER || [];
}

async function loadSite() {
  return JSON.parse(await fs.readFile(SITE_FILE, "utf8"));
}

async function saveOverrides(overrides) {
  const banner = "// Auto-generated από το scripts/match-frezyderm.mjs.\n"
               + "// IDF-weighted fuzzy match supplier products ↔ frezyderm.gr catalog.\n"
               + "// score >= " + HIGH_SCORE + " = high confidence (χρησιμοποιείται κανονικά)\n"
               + "// score " + MIN_SCORE + "-" + HIGH_SCORE + " = review needed (μπαίνει με review:true)\n"
               + "// score < " + MIN_SCORE + " = skip (καμία εγγραφή — 'Χωρίς Match' badge στο UI)\n"
               + "// Ξαναγράφεται στην επόμενη εκτέλεση.\n";
  await fs.writeFile(OUT_FILE,
    banner + "window.FREZYDERM_OVERRIDES = " + JSON.stringify(overrides, null, 2) + ";\n", "utf8");
}

async function main() {
  const supplier = await loadSupplier();
  const site = await loadSite();
  if (!site.length) { console.error("Το frezyderm-site.json είναι κενό. Τρέξτε πρώτα scripts/scrape-frezyderm.mjs."); process.exit(1); }

  const idf = buildIdf(site);
  console.log(`IDF vocabulary: ${idf.size} tokens across ${site.length} site products.`);
  console.log(`Matching ${supplier.length} supplier products (min-score=${MIN_SCORE}, high-score=${HIGH_SCORE})…\n`);

  const overrides = {};
  let high = 0, review = 0, skip = 0;
  const skipped = [];
  const pool = ONLY ? supplier.filter(p => p.barcode === ONLY || (p.variants || []).includes(ONLY)) : supplier;

  for (const p of pool) {
    const { top, top3 } = bestMatch(p, site, idf);
    if (DEBUG) {
      console.log(`\n[${p.barcode}] ${p.name.slice(0, 60)}`);
      for (const c of top3) console.log(`  ${c.score.toFixed(1).padStart(5)} [${c.matched.join(",")}] ${(c.site.name || "").slice(0, 60)} — ${c.site.url}`);
    }
    if (!top || top.score < MIN_SCORE) {
      skip++;
      skipped.push({ barcode: p.barcode, name: p.name, bestScore: top ? Number(top.score.toFixed(1)) : 0, bestUrl: top?.site?.url || null });
      if (!DEBUG) console.log(`${p.barcode.padEnd(13)} SKIP  (best=${top ? top.score.toFixed(1) : "0"}) — ${p.name.slice(0, 55)}`);
      continue;
    }
    const s = top.site;
    const isHigh = top.score >= HIGH_SCORE;
    overrides[p.barcode] = {
      name: s.name,
      description: s.longDescription || s.description || null,
      image: s.image || null,
      url: s.url,
      source: "frezyderm.gr",
      section: s.section,
      score: Number(top.score.toFixed(1)),
      review: !isHigh
    };
    if (isHigh) { high++; if (!DEBUG) console.log(`${p.barcode.padEnd(13)} OK    ${top.score.toFixed(1).padStart(5)} — ${(s.name || "").slice(0, 55)}`); }
    else { review++; if (!DEBUG) console.log(`${p.barcode.padEnd(13)} REV   ${top.score.toFixed(1).padStart(5)} — ${(s.name || "").slice(0, 55)}`); }
  }
  await saveOverrides(overrides);

  // Επιπλέον: γράψε ένα report για τα skipped (χωρίς match) ώστε να είναι
  // εύκολο να δοθούν χειροκίνητα ή να ερευνηθούν.
  if (skipped.length) {
    const reportPath = path.join(ROOT, "js/frezyderm-unmatched.json");
    await fs.writeFile(reportPath, JSON.stringify(skipped, null, 2), "utf8");
    console.log(`\n${skipped.length} skipped → js/frezyderm-unmatched.json`);
  }

  console.log(`\nDone. high=${high}  review=${review}  skip=${skip}  (of ${pool.length}).  Έγραψε js/frezyderm-overrides.js.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
