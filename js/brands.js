// Μητρώο εταιριών με δική τους ενότητα καταλόγου (brand catalogs).
//
// Κάθε brand έχει: supplier Excel → js/<key>-supplier.js, σελίδες του
// επίσημου site → js/<key>-site.json → js/<key>-overrides.js (matcher),
// fallback φαρμακείων → js/<key>-supplemental.js, ετικέτες ενοτήτων →
// js/<key>-sections.js. Τα window variables παράγονται από το key:
// <KEY>_SUPPLIER, <KEY>_OVERRIDES, <KEY>_SUPPLEMENTAL, <KEY>_SECTION_LABELS.
//
// Supplier entries μπορεί να έχουν `listed: false` = προϊόν που υπάρχει στο brand
// site αλλά ΟΧΙ στον τιμοκατάλογο του προμηθευτή (χωρίς χονδρική τιμή).
//
// Το αρχείο φορτώνεται και στον browser (brand-app.js, product.js,
// catalog-export.js) και στα Node scripts (generate-catalog, sync, fill).
window.BRAND_CATALOGS = {
  frezyderm: {
    key: "frezyderm", name: "Frezyderm", host: "frezyderm.gr", page: "frezyderm.html",
    icon: "🧪", initials: "FZ", accent: "#0d9488",
    sheetName: "Frezyderm", imageDir: "frezyderm", sourceKey: "_frezSource",
    fallbackDesc: "Προϊόν Frezyderm — {name}",
    // Οι καρτέλες της σελίδας προϊόντος που παίρνουν δική τους στήλη στο xlsx
    exportSections: ["Κατάλληλο για", "Χρήση", "Δράση – Ενεργά συστατικά"]
  },
  lamberts: {
    key: "lamberts", name: "Lamberts", host: "lamberts.gr", page: "lamberts.html",
    icon: "💊", initials: "LB", accent: "#7c3aed",
    sheetName: "Lamberts", imageDir: "lamberts", sourceKey: "_lambSource",
    fallbackDesc: "Συμπλήρωμα διατροφής Lamberts — {name}",
    exportSections: ["Απόδοση & Συστατικά", "Χρήση", "Προφυλάξεις"]
  },
  aderma: {
    key: "aderma", name: "A-Derma", host: "aderma.gr", page: "aderma.html",
    icon: "🌾", initials: "AD", accent: "#65a30d",
    sheetName: "A-Derma", imageDir: "aderma", sourceKey: "_adermaSource",
    fallbackDesc: "Προϊόν A-Derma (Pierre Fabre) — {name}",
    exportSections: ["Οφέλη", "Χρήση", "Συστατικά"]
  },
  ducray: {
    key: "ducray", name: "Ducray", host: "ducray.com", page: "ducray.html",
    icon: "💆", initials: "DU", accent: "#1d4ed8",
    sheetName: "Ducray", imageDir: "ducray", sourceKey: "_ducraySource",
    fallbackDesc: "Προϊόν Ducray (Pierre Fabre) — {name}",
    exportSections: ["Οφέλη", "Χρήση", "Συστατικά"]
  },
  klorane: {
    key: "klorane", name: "Klorane", host: "klorane.com", page: "klorane.html",
    icon: "🌿", initials: "KL", accent: "#15803d",
    sheetName: "Klorane", imageDir: "klorane", sourceKey: "_kloraneSource",
    fallbackDesc: "Προϊόν Klorane (Pierre Fabre) — {name}",
    exportSections: ["Οφέλη", "Χρήση", "Συστατικά"]
  }
};

// Βοηθητικά κοινά για browser + Node (vm context).
window.BRAND_CATALOGS_UTIL = {
  vars(cfg) {
    const K = cfg.key.toUpperCase();
    return { supplier: K + "_SUPPLIER", overrides: K + "_OVERRIDES", supplemental: K + "_SUPPLEMENTAL", sections: K + "_SECTION_LABELS" };
  },
  // "A-DERMA EXOMEGA CONTROL BAUME 400ML" → "A-Derma Exomega Control Baume 400ML"
  // Το brand name μπαίνει μπροστά αν δεν υπάρχει ήδη (κάθε γραφή: "ADERMA", "A-Derma").
  prettify(raw, cfg) {
    if (!raw) return "";
    const titled = String(raw)
      .replace(/[A-Z]{2,}/g, m => m[0] + m.slice(1).toLowerCase())
      .replace(/(\d)(Ml|Gr|Mg|Iu|Kg|L|G)\b/g, (m, d, u) => d + u.toLowerCase());   // 400Ml → 400ml
    const trimmed = titled.replace(/\s+/g, " ").trim();
    const brandRe = new RegExp("^" + cfg.name.replace(/[-\s]/g, "[-\\s]?") + "\\b", "i");
    if (brandRe.test(trimmed)) return trimmed.replace(brandRe, cfg.name);
    return cfg.name + " " + trimmed;
  },
  // Σελίδα στο brand site (override) → ΜΟΝΟ αυτή· αλλιώς fallback φαρμακείου.
  // Ποτέ μείγμα πεδίων από τις δύο πηγές.
  enrichmentFor(cfg, barcode, data) {
    const o = data.overrides[barcode];
    if (o) {
      return {
        name: o.name || null, subtitle: o.subtitle || null, description: o.description || null, image: o.image || null,
        url: o.url || null, source: cfg.host, section: o.section || null,
        claims: o.claims || [], highlights: o.highlights || [], attributes: o.attributes || {}, sections: o.sections || {},
        matchType: o.matchType || null, review: !!o.review, official: true, noBrandPage: false
      };
    }
    const s = data.supplemental[barcode] || {};
    return {
      name: s.name || null, subtitle: null, description: s.description || null, image: s.image || null,
      url: s.url || null, source: s.source || null, section: s.section || null,
      claims: [], highlights: [], attributes: {}, sections: {}, matchType: null, review: false, official: false, noBrandPage: true
    };
  },
  data(cfg, scope) {
    const v = this.vars(cfg);
    const w = scope || window;
    return { supplier: w[v.supplier] || [], overrides: w[v.overrides] || {}, supplemental: w[v.supplemental] || {}, sections: w[v.sections] || {} };
  }
};
