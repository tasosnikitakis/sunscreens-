#!/usr/bin/env node
// scripts/match-frezyderm.mjs
// Ταιριάζει κάθε προϊόν του supplier (js/frezyderm-supplier.js) με το πιο
// σχετικό προϊόν του frezyderm.gr (js/frezyderm-site.json) με βάση name
// token overlap. Παράγει js/frezyderm-overrides.js:
//   window.FREZYDERM_OVERRIDES = { <barcode>: { name, description, image,
//     url, source, score } }
//
// Δουλεύει σε 3 επίπεδα σιγουριάς:
//   score >= 6  → high confidence, override με name/description/image
//   score 3-5   → medium, μπαίνει με flag "review: true" (φαίνεται στο site)
//   score < 3   → skip (μένει με supplier name, χωρίς εικόνα από site)
//
// Χρήση:
//   node scripts/match-frezyderm.mjs                    # όλα
//   node scripts/match-frezyderm.mjs --debug            # δείχνει top-3 matches
//   node scripts/match-frezyderm.mjs --barcode=5202888227554

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
const MIN_SCORE = parseFloat(opt("min-score", "3"));
const HIGH_SCORE = parseFloat(opt("high-score", "6"));

// Stopwords: πολύ γενικές λέξεις που δεν βοηθούν στο match
const STOPWORDS = new Set([
  "frezyderm", "cream", "krema", "κρεμα", "cr", "gel", "τζελ", "lotion", "λοσιον",
  "spray", "foam", "wash", "shampoo", "σαμπουαν", "sh", "shower", "mask", "μασκα",
  "serum", "ορος", "the", "και", "of", "for", "gia", "με", "για", "και",
  "50ml", "100ml", "150ml", "200ml", "250ml", "300ml", "500ml", "1000ml",
  "ml", "gr", "kg", "mg", "iu", "l", "ρευστο", "λευκο", "μαυρο",
  // Πολύ γενικά — προκαλούν αντιστοιχία σε πολλά προϊόντα
  "moisturizing", "moisture", "rich", "plus", "care", "aid", "extra", "pro", "active",
  "kit", "set", "step", "day", "night", "eye", "face", "body", "hand",
  // Ελληνικά words που εμφανίζονται συχνά σε promo pack titles
  "δωρο", "δειγμα", "επιπλεον", "ποσοτητα", "νεσεσερ", "ειδικη", "συσκευασια", "με",
  "σε", "και",
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

// Volume/quantity numeric tokens ξεχωριστά — δεν στοπάρονται αλλά έχουν
// μικρότερο βάρος (specific number matches γίνονται bonus)
function extractTokens(s) {
  if (!s) return new Set();
  const lower = s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[+&\/\\.]/g, " ")
    .replace(/[^\w\sα-ωά-ώΑ-Ωa-z0-9]/gi, " ");
  const raw = lower.split(/\s+/).filter(Boolean);
  const toks = new Set();
  for (const t of raw) {
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    toks.add(t);
  }
  return toks;
}

// Volume tokens (πχ "150ml") παίρνουν bonus αν ταιριάξουν ακριβώς
function extractVolume(s) {
  if (!s) return null;
  const m = s.toLowerCase().match(/\b(\d{1,4})\s?(ml|gr|g|kg|l|iu|mg|caps|tabs|tablets|patch|φακελ|patch|x\d+|shots|τσιπς|amp|amps)\b/);
  return m ? m[1] + m[2] : null;
}

function scoreMatch(supplierTokens, supplierVol, supplierIsPromo, sitePr) {
  const siteName = sitePr.name || "";
  const siteUrl = sitePr.url || "";
  const nameTokens = extractTokens(siteName);
  const urlTokens = extractTokens(siteUrl.replace(/[\/\-\.]/g, " "));
  const siteVol = extractVolume(siteName);

  let score = 0;
  const matched = [];
  for (const t of supplierTokens) {
    if (nameTokens.has(t)) { score += 2; matched.push(t); }
    else if (urlTokens.has(t)) { score += 0.5; }
  }
  // Volume exact match bonus / penalty
  if (supplierVol && siteVol && supplierVol === siteVol) score += 3;
  else if (supplierVol && siteVol && supplierVol !== siteVol) score -= 1;
  // Penalty αν το site είναι promo pack αλλά ο supplier δεν είναι — μεγάλος
  // slug + πολλά common tokens μαγνητίζουν false matches
  if (isPromoPackSite(sitePr) && !supplierIsPromo) score -= 3;
  // Bonus αν και τα δύο είναι promo packs (τότε ταιριάζουν σαφώς)
  if (isPromoPackSite(sitePr) && supplierIsPromo) score += 2;
  return { score, matched };
}

function bestMatch(supplier, siteCatalog) {
  const st = extractTokens(supplier.name);
  const sv = extractVolume(supplier.name);
  const isPromo = isPromoPackSupplier(supplier);
  const scored = siteCatalog
    .map(sp => ({ site: sp, ...scoreMatch(st, sv, isPromo, sp) }))
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
               + "// Fuzzy-matched supplier products με frezyderm.gr catalog.\n"
               + "// score >= " + HIGH_SCORE + " = high confidence (χρησιμοποιείται στο site)\n"
               + "// score " + MIN_SCORE + "-" + HIGH_SCORE + " = review needed (μπαίνει με review:true)\n"
               + "// Ξαναγράφεται στην επόμενη εκτέλεση.\n";
  await fs.writeFile(OUT_FILE,
    banner + "window.FREZYDERM_OVERRIDES = " + JSON.stringify(overrides, null, 2) + ";\n", "utf8");
}

async function main() {
  const supplier = await loadSupplier();
  const site = await loadSite();
  if (!site.length) { console.error("Το frezyderm-site.json είναι κενό. Τρέξτε πρώτα scripts/scrape-frezyderm.mjs."); process.exit(1); }

  console.log(`Matching ${supplier.length} supplier products against ${site.length} site products…\n`);
  const overrides = {};
  let high = 0, review = 0, skip = 0;
  const pool = ONLY ? supplier.filter(p => p.barcode === ONLY || (p.variants || []).includes(ONLY)) : supplier;

  for (const p of pool) {
    const { top, top3 } = bestMatch(p, site);
    if (DEBUG) {
      console.log(`\n[${p.barcode}] ${p.name.slice(0, 60)}`);
      for (const c of top3) console.log(`  ${c.score.toFixed(1).padStart(5)} [${c.matched.join(",")}] ${(c.site.name || "").slice(0, 60)} — ${c.site.url}`);
    }
    if (!top || top.score < MIN_SCORE) { skip++; if (!DEBUG) console.log(`${p.barcode.padEnd(13)} SKIP  (best=${top ? top.score.toFixed(1) : "0"}) — ${p.name.slice(0, 55)}`); continue; }
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
  console.log(`\nDone. high=${high}  review=${review}  skip=${skip}  (of ${pool.length}).  Έγραψε js/frezyderm-overrides.js.`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
