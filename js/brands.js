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
  },
  avene: {
    key: "avene", name: "Avène", host: "eau-thermale-avene.gr", page: "avene.html",
    icon: "💧", initials: "AV", accent: "#ea580c",
    sheetName: "Avene", imageDir: "avene", sourceKey: "_aveneSource",
    fallbackDesc: "Προϊόν Eau Thermale Avène (Pierre Fabre) — {name}",
    exportSections: ["Οφέλη", "Χρήση", "Συστατικά"]
  },
  lrp: {
    key: "lrp", name: "La Roche-Posay", host: "larocheposay.gr", page: "lrp.html",
    icon: "🔬", initials: "LRP", accent: "#0369a1",
    sheetName: "La Roche-Posay", imageDir: "lrp", sourceKey: "_lrpSource",
    fallbackDesc: "Προϊόν La Roche-Posay (L'Oréal) — {name}",
    exportSections: ["Οφέλη", "Χρήση", "Συστατικά"]
  },
  korres: {
    key: "korres", name: "Korres", host: "gr.korres.com", page: "korres.html",
    icon: "🫒", initials: "KR", accent: "#b45309",
    sheetName: "Korres", imageDir: "korres", sourceKey: "_korresSource",
    fallbackDesc: "Προϊόν Korres — {name}",
    exportSections: ["Οφέλη", "Χρήση", "Περιγραφή (EN)"]
  },
  apivita: {
    key: "apivita", name: "Apivita", host: "apivita.com", page: "apivita.html",
    icon: "🐝", initials: "AV", accent: "#15803d",
    sheetName: "Apivita", imageDir: "apivita", sourceKey: "_apivitaSource",
    fallbackDesc: "Προϊόν Apivita — {name}",
    exportSections: ["Πληροφορίες", "Χρήση", "Συστατικά"]
  },
  vichy: {
    key: "vichy", name: "Vichy", host: "vichy.gr", page: "vichy.html",
    icon: "💠", initials: "VY", accent: "#0f766e",
    sheetName: "Vichy", imageDir: "vichy", sourceKey: "_vichySource",
    fallbackDesc: "Προϊόν Vichy (L'Oréal) — {name}",
    exportSections: ["Περιγραφή", "Χρήση", "Συστατικά"]
  },
  liposan: {
    key: "liposan", name: "Liposan", host: "liposan.gr", page: "liposan.html",
    icon: "💋", initials: "LP", accent: "#be123c",
    sheetName: "Liposan", imageDir: "liposan", sourceKey: "_liposanSource",
    fallbackDesc: "Προϊόν Liposan (Beiersdorf) — {name}",
    exportSections: ["Περιγραφή", "Χρήση", "Συστατικά"]
  },
  nivea: {
    key: "nivea", name: "Nivea", host: "nivea.gr", page: "nivea.html",
    icon: "🔵", initials: "NV", accent: "#1e3a8a",
    sheetName: "Nivea", imageDir: "nivea", sourceKey: "_niveaSource",
    fallbackDesc: "Προϊόν Nivea (Beiersdorf) — {name}",
    exportSections: ["Περιγραφή", "Χρήση", "Συστατικά"]
  },
  hansaplast: {
    key: "hansaplast", name: "Hansaplast", host: "hansaplast.gr", page: "hansaplast.html",
    icon: "🩹", initials: "HP", accent: "#b91c1c",
    sheetName: "Hansaplast", imageDir: "hansaplast", sourceKey: "_hansaplastSource",
    fallbackDesc: "Προϊόν Hansaplast (Beiersdorf) — {name}",
    exportSections: ["Περιγραφή", "Χαρακτηριστικά", "Συχνές ερωτήσεις"]
  },
  intermed: {
    key: "intermed", name: "Intermed", host: "intermed.com.gr", page: "intermed.html",
    icon: "💊", initials: "IM", accent: "#0e7490",
    sheetName: "Intermed", imageDir: "intermed", sourceKey: "_intermedSource",
    fallbackDesc: "Προϊόν Intermed — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Οδηγίες χρήσης"]
  },
  uriage: {
    key: "uriage", name: "Uriage", host: "uriage.com", page: "uriage.html",
    icon: "🏔️", initials: "UR", accent: "#0284c7",
    sheetName: "Uriage", imageDir: "uriage", sourceKey: "_uriageSource",
    fallbackDesc: "Προϊόν Uriage — {name}",
    exportSections: ["Περιγραφή", "Αποτελέσματα", "Συστατικά", "Χρήση"]
  },
  helenvita: {
    key: "helenvita", name: "Helenvita", host: "helenvita.com", page: "helenvita.html",
    icon: "🌼", initials: "HV", accent: "#4f46e5",
    sheetName: "Helenvita", imageDir: "helenvita", sourceKey: "_helenvitaSource",
    fallbackDesc: "Προϊόν Helenvita — {name}",
    exportSections: ["Περιγραφή", "Χαρακτηριστικά", "Συστατικά", "Χρήση"]
  },
  cerave: {
    key: "cerave", name: "CeraVe", host: "cerave.gr", page: "cerave.html",
    icon: "🧪", initials: "CV", accent: "#1d4ed8",
    sheetName: "CeraVe", imageDir: "cerave", sourceKey: "_ceraveSource",
    fallbackDesc: "Προϊόν CeraVe — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Συστατικά", "Χρήση", "Συχνές ερωτήσεις"]
  },
  mustela: {
    key: "mustela", name: "Mustela", host: "mustela.com.gr", page: "mustela.html",
    icon: "🍼", initials: "MU", accent: "#2563eb",
    sheetName: "Mustela", imageDir: "mustela", sourceKey: "_mustelaSource",
    fallbackDesc: "Προϊόν Mustela — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Συστατικά", "Χρήση"]
  },
  solgar: {
    key: "solgar", name: "Solgar", host: "solgar.gr", page: "solgar.html",
    icon: "💊", initials: "SG", accent: "#b45309",
    sheetName: "Solgar", imageDir: "solgar", sourceKey: "_solgarSource",
    fallbackDesc: "Συμπλήρωμα διατροφής Solgar — {name}",
    exportSections: ["Περιγραφή", "Χαρακτηριστικά", "Χρήση", "Συστατικά", "Προφυλάξεις"]
  },
  healthaid: {
    key: "healthaid", name: "Health Aid", host: "healthaid.co.uk", page: "healthaid.html",
    icon: "🌱", initials: "HA", accent: "#15803d",
    sheetName: "HealthAid", imageDir: "healthaid", sourceKey: "_healthaidSource",
    fallbackDesc: "Συμπλήρωμα διατροφής Health Aid — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Συστατικά", "Χωρίς"]
  },
  powerhealth: {
    key: "powerhealth", name: "Power Health", host: "powerhealth.gr", page: "powerhealth.html",
    icon: "⚡", initials: "PH", accent: "#b91c1c",
    sheetName: "PowerHealth", imageDir: "powerhealth", sourceKey: "_powerhealthSource",
    fallbackDesc: "Συμπλήρωμα διατροφής Power Health — {name}",
    exportSections: ["Περιγραφή", "Συστατικά", "Χρήση", "Χαρακτηριστικά", "Προφυλάξεις"]
  },
  quest: {
    key: "quest", name: "Quest", host: "qnutrapharma.com", page: "quest.html",
    icon: "🧬", initials: "QV", accent: "#0e7490",
    sheetName: "Quest", imageDir: "quest", sourceKey: "_questSource",
    fallbackDesc: "Συμπλήρωμα διατροφής Quest — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Συστατικά", "Χαρακτηριστικά"]
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
      .replace(/[A-ZÀ-ÖØ-Þ]{2,}/g, m => m[0] + m.slice(1).toLowerCase())              // CRÈME → Crème
      .replace(/(\d)\s?(Ml|Gr|Mg|Iu|Kg|L|G)\b/g, (m, d, u) => d + " " .trim() + u.toLowerCase())    // 400Ml / 30 ML → 400ml / 30ml
      // Γνωστά ακρωνύμια μένουν κεφαλαία: SPF, UV/UVA/UVB, XL, BB/CC, HA, B3/B5, KA, DP, AP+M, PP+, A.D, DS, AC, PSO, SOS, AHA/BHA, INCI
      .replace(/\b(Spf|Uva|Uvb|Uv|Xl|Bb|Cc|Ha|Ka|Dp|Ap|Pp|Ad|Ds|Ac|Pso|Sos|Aha|Bha|Inci|Lrp|Med|Defi|Nf|Rp|Nc|Cica)(?![a-zà-ÿ])/g, m => m.toUpperCase());
    const trimmed = titled.replace(/\s+/g, " ").trim();
    const brandRe = new RegExp("^" + cfg.name.replace(/[-\s]/g, "[-\\s]?").replace(/è/g, "[èe]") + "\\b", "i");
    if (brandRe.test(trimmed)) return trimmed.replace(brandRe, cfg.name);
    if (cfg.key === "lrp" && /^L\s?R\s+Posay\b/i.test(trimmed)) return trimmed.replace(/^L\s?R\s+Posay\b/i, cfg.name);
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
