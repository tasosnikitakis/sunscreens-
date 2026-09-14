// scripts/lib-match.mjs
// Κοινός πυρήνας fuzzy matching supplier ↔ brand site (Frezyderm, Lamberts…).
//
// IDF-weighted token overlap: σπάνιες λέξεις ζυγίζουν πολύ, γενικές λίγο.
// Recall penalty για διακριτά query tokens που λείπουν, bonus για συνεχόμενα
// tokens, σύγκρουση μορφής/δοσολογίας/SPF, αποκλεισμός promo packs, λεξικό
// συντομογραφιών, λέξεις συσκευασίας που δεν τιμωρούν, δεύτερο query από το
// όνομα φαρμακείου (με σήμανση "disputed" αν διαφωνεί με το πρωτεύον).
//
// createMatcher(config) → { tokenize, buildIdf, rank, fuzzyMatch, extractVolume }
//
// config:
//   stopwords    Set   λέξεις εκτός scoring
//   packaging    Set   μετράνε αν ταιριάξουν, δεν τιμωρούν αν λείπουν
//   abbrev       {}    συντομογραφία → πλήρης λέξη (πριν το stemming)
//   formGroups   [[]]  ομάδες συνωνύμων μορφής· διαφορετική ομάδα = ποινή
//   volumeToken  RegExp  token που είναι ποσότητα (κρίνεται χωριστά, όχι στο overlap)
//   extractVolume(name) → κανονικοποιημένη ποσότητα ή null (ίδια = bonus, άλλη = ποινή)
//   extractSpf(name)    → SPF ή null (προαιρετικό)
//   isPromoSite(sp), isPromoSupplier(p)   (προαιρετικά)
//   penalties: { miss, form, spf, volumeMismatch, volumeMatch, promoExclude, promoBoth }

export function createMatcher(cfg) {
  const STOP = cfg.stopwords || new Set();
  const PACK = cfg.packaging || new Set();
  const ABBREV = cfg.abbrev || {};
  const VOL = cfg.volumeToken || /$^/;
  const P = Object.assign({ miss: 0.75, form: 10, spf: 8, volumeMismatch: 2, volumeMatch: 3, promoExclude: -99, promoBoth: 2, extraSite: 0 }, cfg.penalties || {});
  const isPromoSite = cfg.isPromoSite || (() => false);
  const isPromoSupplier = cfg.isPromoSupplier || (() => false);
  const extractVolume = cfg.extractVolume || (() => null);
  const extractSpf = cfg.extractSpf || (() => null);

  const stem = t => (/^[a-z]{4,}s$/.test(t) && !t.endsWith("ss")) ? t.slice(0, -1) : t;
  const normalize = cfg.normalize || (s => s);   // brand-specific pre-normalization (π.χ. "B-12" → "B12")

  function tokenize(s) {
    if (!s) return [];
    const src = normalize(String(s));
    // camelCase ("MagAsorb", "AcNorm"): κρατάμε ΚΑΙ την ενωμένη μορφή, ώστε να
    // ταιριάζει είτε ο άλλος το γράφει "MAGASORB" είτε "AC-NORM".
    const joined = (src.match(/\b[A-Za-z]+[a-z][A-Z][a-z]+\b/g) || []).map(w => w.toLowerCase()).join(" ");
    const split = src
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Za-zα-ωΑ-Ω]{2})(\d)/g, "$1 $2") + " " + joined;
    const lower = split.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[+&\/\\.\-_']/g, " ")
      .replace(/[^\wα-ωά-ώΑ-Ωa-z0-9]/gi, " ");
    return lower.split(/\s+/)
      .filter(t => t && !STOP.has(t))          // stopwords ΠΡΙΝ το stemming ("lamberts" → "lambert" θα ξέφευγε)
      .map(t => ABBREV[t] || t)
      .map(stem)
      .filter(t => (t.length >= 2 || /^\d$/.test(t) || (cfg.keepSingleLetters && /^[a-z]$/.test(t))) && !STOP.has(t));
  }

  const slugOf = url => (url || "").split("/").filter(Boolean).pop() || "";
  const slugTokens = sp => tokenize(slugOf(sp.url).replace(/-/g, " "));

  function buildIdf(site) {
    const N = site.length;
    const df = new Map();
    for (const sp of site) {
      const toks = new Set([...tokenize(sp.name), ...slugTokens(sp)]);
      for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
    }
    const idf = new Map();
    let max = 0;
    for (const [t, c] of df) { const w = Math.log((N + 1) / (c + 1)) + 1; idf.set(t, w); if (w > max) max = w; }
    idf._max = max;
    return idf;
  }

  const idfWeight = (idf, t) => idf.get(t) ?? (/^\d+$/.test(t) ? 1 : /[α-ω]/.test(t) ? 1.5 : (idf._max ?? 6));

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

  const FORM_OF = new Map();
  (cfg.formGroups || []).forEach((g, i) => g.forEach(w => FORM_OF.set(w, i)));
  function formsOf(name) {
    const raw = String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/([a-z]{2})(\d)/g, "$1 $2").split(/[^a-z0-9α-ω]+/).filter(Boolean);
    const toks = [...raw];
    for (let i = 0; i < raw.length - 1; i++) toks.push(raw[i] + raw[i + 1]);
    const forms = new Set();
    for (const t of toks) { const f = FORM_OF.get(t) ?? FORM_OF.get(stem(t)); if (f !== undefined) forms.add(f); }
    return forms;
  }
  const siteCache = new Map();
  function siteInfo(sp) {
    if (!siteCache.has(sp.url)) {
      const nameToks = tokenize(sp.name);
      const urlToks = slugTokens(sp);
      siteCache.set(sp.url, {
        nameToks, nameSet: new Set(nameToks), urlToks, urlSet: new Set(urlToks),
        vol: extractVolume(sp.name) || extractVolume(slugOf(sp.url)),
        spf: extractSpf(sp.name) || extractSpf(slugOf(sp.url).replace(/-/g, " ")),
        forms: formsOf(sp.name), promo: isPromoSite(sp)
      });
    }
    return siteCache.get(sp.url);
  }

  function scoreMatch(q, sp, idf) {
    const s = siteInfo(sp);
    if (s.promo && !q.promo) return { score: P.promoExclude, matched: [] };

    let score = 0, matchedW = 0, totalW = 0;
    const matched = [];
    for (const t of new Set(q.toks)) {
      if (VOL.test(t)) continue;
      const w = idfWeight(idf, t);
      const hit = s.nameSet.has(t) ? 1 : s.urlSet.has(t) ? 0.7 : 0;
      if (hit) { score += hit * w; matched.push((hit === 1 ? t : t + "·url") + "(" + w.toFixed(1) + ")"); }
      if (!PACK.has(t)) { totalW += w; matchedW += hit * w; }
    }
    if (totalW - matchedW > 0.05) matched.push("miss(-" + (P.miss * (totalW - matchedW)).toFixed(1) + ")");
    score -= P.miss * (totalW - matchedW);
    // Προαιρετικά: λέξεις της σελίδας που ΔΕΝ υπάρχουν στο query ("Vitamin D3
    // 2000iu & K2" για query "Vitamin D3 2000iu") — μικρή ποινή ώστε να
    // προτιμάται η πιο "στενή" σελίδα.
    if (P.extraSite) {
      const qSet = new Set(q.toks);
      let extra = 0;
      for (const t of s.nameSet) if (!qSet.has(t) && !VOL.test(t) && !PACK.has(t)) extra += idfWeight(idf, t);
      score -= P.extraSite * extra;
      if (extra) matched.push("extra(-" + (P.extraSite * extra).toFixed(1) + ")");
    }
    const big = consecutiveBonus(q.toks, s.nameToks, idf) + 0.5 * consecutiveBonus(q.toks, s.urlToks, idf);
    if (big) matched.push("bigram(+" + big.toFixed(1) + ")");
    score += big;

    if (q.vol && s.vol && q.vol === s.vol) { score += P.volumeMatch; matched.push("vol=" + q.vol); }
    else if (q.vol && s.vol && q.vol !== s.vol) { score -= P.volumeMismatch; matched.push("vol≠(" + q.vol + "/" + s.vol + ")"); }

    if (q.forms.size && s.forms.size && ![...q.forms].some(f => s.forms.has(f))) { score -= P.form; matched.push("form≠"); }
    if (q.spf && s.spf && s.spf.replace("+", "") !== q.spf.replace("+", "")) { score -= P.spf; matched.push("spf≠"); }
    if (s.promo && q.promo) score += P.promoBoth;
    return { score, matched };
  }

  function rank(queryName, site, idf, promo, { knownOnly = false } = {}) {
    let toks = tokenize(queryName);
    // Ονόματα φαρμακείων: πετάμε μόνο τα ΕΛΛΗΝΙΚΑ άγνωστα (περιγραφικά) — τα
    // λατινικά άγνωστα είναι ένδειξη ότι το προϊόν δεν υπάρχει στο site.
    if (knownOnly) toks = toks.filter(t => idf.has(t) || VOL.test(t) || /^[a-z0-9]+$/.test(t));
    toks = addJoinedBigrams(toks, idf);
    const q = { toks, vol: extractVolume(queryName), spf: extractSpf(queryName), forms: formsOf(queryName), promo };
    return site.map(sp => ({ site: sp, ...scoreMatch(q, sp, idf) })).sort((a, b) => b.score - a.score);
  }

  function fuzzyMatch(p, altName, site, idf) {
    const promo = isPromoSupplier(p);
    const primary = rank(p.name, site, idf, promo);
    let best = { query: p.name, ranked: primary, viaAlt: false };
    if (altName) {
      const alt = rank(altName, site, idf, promo, { knownOnly: true });
      if ((alt[0]?.score ?? -Infinity) > (primary[0]?.score ?? -Infinity)) best = { query: altName, ranked: alt, viaAlt: true };
    }
    const primaryTop = primary[0]?.site?.url || null;
    const disputed = best.viaAlt && primaryTop !== (best.ranked[0]?.site?.url || null);
    return { query: best.query, top: best.ranked[0] || null, top3: best.ranked.slice(0, 3), disputed };
  }

  return { tokenize, buildIdf, rank, fuzzyMatch, extractVolume, slugOf };
}

export const STATUS_LABEL = {
  "manual":      "Χειροκίνητο",
  "exact":       "Ακριβές (GTIN)",
  "high":        "Αυτόματο (σίγουρο)",
  "review":      "Αυτόματο (για έλεγχο)",
  "skip":        "Χωρίς σελίδα",
  "manual-skip": "Χωρίς σελίδα (χειροκίνητα)"
};

export function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportCsv(headers, rows) {
  return "﻿" + [headers, ...rows].map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export const normUrl = u => String(u || "").trim().replace(/\/+$/, "").toLowerCase();
