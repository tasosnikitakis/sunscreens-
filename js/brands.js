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
    key: "quest", name: "Quest", host: "douni.gr", page: "quest.html",
    icon: "🧬", initials: "QV", accent: "#0e7490",
    sheetName: "Quest", imageDir: "quest", sourceKey: "_questSource",
    fallbackDesc: "Συμπλήρωμα διατροφής Quest — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Συστατικά", "Προφυλάξεις"]
  },
  vitabiotics: {
    key: "vitabiotics", name: "Vitabiotics", host: "vitabiotics.gr", page: "vitabiotics.html",
    icon: "🤰", initials: "VB", accent: "#16a34a",
    sheetName: "Vitabiotics", imageDir: "vitabiotics", sourceKey: "_vitabioticsSource",
    fallbackDesc: "Συμπλήρωμα διατροφής Vitabiotics — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Συστατικά", "Προφυλάξεις", "Συχνές ερωτήσεις"]
  },
  unipharma: {
    key: "unipharma", name: "Uni-Pharma", host: "uni-pharma.gr", page: "unipharma.html",
    icon: "🏥", initials: "UP", accent: "#0f766e",
    sheetName: "UniPharma", imageDir: "unipharma", sourceKey: "_unipharmaSource",
    fallbackDesc: "Προϊόν Uni-Pharma — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Συστατικά", "Προφυλάξεις"]
  },
  superfoods: {
    key: "superfoods", name: "Superfoods", host: "superfoods.eu", page: "superfoods.html",
    icon: "🌿", initials: "SF", accent: "#ea580c",
    sheetName: "Superfoods", imageDir: "superfoods", sourceKey: "_superfoodsSource",
    fallbackDesc: "Προϊόν Superfoods — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Συστατικά", "Προφυλάξεις"]
  },
  centrum: {
    key: "centrum", name: "Centrum", host: "vitamins.centrum.gr", page: "centrum.html",
    icon: "💊", initials: "CE", accent: "#b91c1c",
    sheetName: "Centrum", imageDir: "centrum", sourceKey: "_centrumSource",
    fallbackDesc: "Προϊόν Centrum — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Χαρακτηριστικά"]
  },
  pharmasept: {
    key: "pharmasept", name: "Pharmasept", host: "pharmasept.gr", page: "pharmasept.html",
    icon: "🧴", initials: "PS", accent: "#1d4ed8",
    sheetName: "Pharmasept", imageDir: "pharmasept", sourceKey: "_pharmaseptSource",
    fallbackDesc: "Προϊόν Pharmasept — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Συστατικά", "Χαρακτηριστικά"]
  },
  caudalie: {
    key: "caudalie", name: "Caudalie", host: "gr.caudalie.com", page: "caudalie.html",
    icon: "🍇", initials: "CA", accent: "#7e22ce",
    sheetName: "Caudalie", imageDir: "caudalie", sourceKey: "_caudalieSource",
    fallbackDesc: "Προϊόν Caudalie — {name}",
    exportSections: ["Περιγραφή", "Ενεργά συστατικά", "Χρήση", "Συστατικά", "Χαρακτηριστικά"]
  },
  bioderma: {
    key: "bioderma", name: "Bioderma", host: "bioderma.gr", page: "bioderma.html",
    icon: "🧪", initials: "BI", accent: "#0369a1",
    sheetName: "Bioderma", imageDir: "bioderma", sourceKey: "_biodermaSource",
    fallbackDesc: "Προϊόν Bioderma — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Ενεργά συστατικά", "Συστατικά"]
  },
  sebamed: {
    key: "sebamed", name: "Sebamed", host: "intramed-pharma.gr", page: "sebamed.html",
    icon: "🫧", initials: "SB", accent: "#be123c",
    sheetName: "Sebamed", imageDir: "sebamed", sourceKey: "_sebamedSource",
    fallbackDesc: "Προϊόν Sebamed — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Ενδείξεις", "Χρήση", "Συστατικά"]
  },
  froika: {
    key: "froika", name: "Froika", host: "froika.com", page: "froika.html",
    icon: "🩺", initials: "FR", accent: "#0e7490",
    sheetName: "Froika", imageDir: "froika", sourceKey: "_froikaSource",
    fallbackDesc: "Προϊόν Froika — {name}",
    exportSections: ["Περιγραφή", "Ενδείξεις", "Οφέλη", "Χρήση", "Συστατικά"]
  },
  mollers: {
    key: "mollers", name: "Möller’s", host: "mollersomega3.com", page: "mollers.html",
    icon: "🐟", initials: "MO", accent: "#0369a1",
    sheetName: "Mollers", imageDir: "mollers", sourceKey: "_mollersSource",
    fallbackDesc: "Προϊόν Möller’s — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Συστατικά", "Προφυλάξεις"]
  },
  lanes: {
    key: "lanes", name: "Lanes", host: "laneshealth.gr", page: "lanes.html",
    icon: "🍋", initials: "LA", accent: "#c2410c",
    sheetName: "Lanes", imageDir: "lanes", sourceKey: "_lanesSource",
    fallbackDesc: "Προϊόν Lanes — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Ενδείξεις", "Χρήση", "Συστατικά"]
  },
  eubos: {
    key: "eubos", name: "Eubos", host: "eubos.gr", page: "eubos.html",
    icon: "🧼", initials: "EU", accent: "#b91c1c",
    sheetName: "Eubos", imageDir: "eubos", sourceKey: "_eubosSource",
    fallbackDesc: "Προϊόν Eubos — {name}",
    exportSections: ["Περιγραφή", "Ενεργά συστατικά", "Χρήση", "Συστατικά", "Χαρακτηριστικά"]
  },
  vencil: {
    key: "vencil", name: "Vencil", host: "vencil.gr", page: "vencil.html",
    icon: "🌱", initials: "VE", accent: "#15803d",
    sheetName: "Vencil", imageDir: "vencil", sourceKey: "_vencilSource",
    fallbackDesc: "Προϊόν Vencil — {name}",
    exportSections: ["Περιγραφή", "Ενεργά συστατικά", "Ενδείξεις", "Χρήση", "Προφυλάξεις"]
  },
  curaprox: {
    key: "curaprox", name: "Curaprox", host: "curaprox.gr", page: "curaprox.html",
    icon: "🪥", initials: "CP", accent: "#e11d48", keepCaps: true,
    sheetName: "Curaprox", imageDir: "curaprox", sourceKey: "_curaproxSource",
    fallbackDesc: "Προϊόν Curaprox — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Χαρακτηριστικά"]
  },
  pforal: {
    key: "pforal", name: "Pierre Fabre Oral Care", host: "pierrefabre-oralcare.com", page: "pforal.html",
    icon: "🦷", initials: "PF", accent: "#0369a1", noNamePrefix: true,
    sheetName: "PierreFabreOral", imageDir: "pforal", sourceKey: "_pforalSource",
    fallbackDesc: "Προϊόν Pierre Fabre Oral Care (Elgydium / Eludril) — {name}",
    exportSections: ["Οφέλη", "Χρήση", "Συστατικά"]
  },
  tepe: {
    key: "tepe", name: "TePe & Plac Control", host: "placcontrol.gr", page: "tepe.html",
    icon: "🧵", initials: "TP", accent: "#1e3a8a", noNamePrefix: true,
    sheetName: "TePe", imageDir: "tepe", sourceKey: "_tepeSource",
    fallbackDesc: "Προϊόν στοματικής υγιεινής (Plac Control) — {name}",
    exportSections: ["Περιγραφή", "Χαρακτηριστικά", "Χρήση", "Συστατικά"]
  },
  gum: {
    key: "gum", name: "GUM (Sunstar)", host: "sunstargum.com", page: "gum.html",
    icon: "🪥", initials: "GU", accent: "#0b4ea2", noNamePrefix: true,
    sheetName: "GUM", imageDir: "gum", sourceKey: "_gumSource",
    fallbackDesc: "Προϊόν GUM (Sunstar) — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Πληροφορίες"]
  },
  gehwol: {
    key: "gehwol", name: "GEHWOL", host: "naturapharm.gr", page: "gehwol.html",
    icon: "🦶", initials: "GW", accent: "#b91c1c", noNamePrefix: true,
    sheetName: "GEHWOL", imageDir: "gehwol", sourceKey: "_gehwolSource",
    fallbackDesc: "Προϊόν περιποίησης ποδιών GEHWOL — {name}",
    exportSections: ["Περιγραφή", "Συστατικά", "Χρήση", "Χαρακτηριστικά"]
  },
  podia: {
    key: "podia", name: "Podia", host: "podiafootcare.com", page: "podia.html",
    icon: "👣", initials: "PD", accent: "#0e7490",
    sheetName: "Podia", imageDir: "podia", sourceKey: "_podiaSource",
    fallbackDesc: "Προϊόν περιποίησης ποδιών Podia — {name}",
    exportSections: ["Περιγραφή", "Δράση", "Χρήση", "Συστατικά", "Προφυλάξεις"]
  },
  corega: {
    key: "corega", name: "Corega", host: "corega.com", page: "corega.html",
    icon: "😁", initials: "CO", accent: "#0369a1",
    sheetName: "Corega", imageDir: "corega", sourceKey: "_coregaSource",
    fallbackDesc: "Προϊόν φροντίδας τεχνητής οδοντοστοιχίας Corega (Haleon) — {name}",
    exportSections: ["Περιγραφή"]
  },
  sensodyne: {
    key: "sensodyne", name: "Sensodyne & parodontax", host: "pharm24.gr", page: "sensodyne.html",
    icon: "🦷", initials: "SP", accent: "#1d4ed8", noNamePrefix: true,
    sheetName: "Sensodyne-parodontax", imageDir: "sensodyne", sourceKey: "_sensodyneSource",
    fallbackDesc: "Προϊόν στοματικής υγιεινής Haleon — {name}",
    exportSections: ["Περιγραφή", "Χρήση", "Συστατικά"]
  },
  bepanthol: {
    key: "bepanthol", name: "Bepanthol", host: "bepanthol.gr", page: "bepanthol.html",
    icon: "🧴", initials: "BP", accent: "#0e7490", noNamePrefix: true,
    sheetName: "Bepanthol", imageDir: "bepanthol", sourceKey: "_bepantholSource",
    fallbackDesc: "Προϊόν Bepanthol (Bayer) — {name}",
    exportSections: ["Περιγραφή", "Δράση", "Χρήση", "Συστατικά"]
  },
  eviol: {
    key: "eviol", name: "Eviol", host: "eviol.gr", page: "eviol.html",
    icon: "💊", initials: "EV", accent: "#ea580c", keepCaps: true,
    sheetName: "Eviol", imageDir: "eviol", sourceKey: "_eviolSource",
    fallbackDesc: "Συμπλήρωμα διατροφής EVIOL — {name}",
    exportSections: ["Περιγραφή", "Δράση", "Δοσολογία", "Συστατικά"]
  },
  nuk: {
    key: "nuk", name: "NUK", host: "nuk.gr", page: "nuk.html",
    icon: "🍼", initials: "NUK", accent: "#0369a1", keepCaps: true,
    sheetName: "NUK", imageDir: "nuk", sourceKey: "_nukSource",
    fallbackDesc: "Βρεφικό προϊόν NUK — {name}",
    exportSections: ["Περιγραφή", "Χαρακτηριστικά", "Σημειώσεις"]
  },
  chicco: {
    key: "chicco", name: "Chicco", host: "chicco.it", page: "chicco.html",
    icon: "🐣", initials: "CH", accent: "#dc2626", keepCaps: true,
    sheetName: "Chicco", imageDir: "chicco", sourceKey: "_chiccoSource",
    fallbackDesc: "Βρεφικό προϊόν Chicco — {name}",
    exportSections: ["Χαρακτηριστικά", "Περιγραφή", "Οδηγίες & προειδοποιήσεις"]
  },
  hydrovit: {
    key: "hydrovit", name: "Hydrovit", host: "targetpharma.gr", page: "hydrovit.html",
    icon: "💧", initials: "HY", accent: "#0e7490",
    sheetName: "Hydrovit", imageDir: "hydrovit", sourceKey: "_hydrovitSource",
    fallbackDesc: "Προϊόν Hydrovit — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χρήση", "Συστατικά", "Χαρακτηριστικά"]
  },
  lactacyd: {
    key: "lactacyd", name: "Lactacyd", host: "lactacyd.gr", page: "lactacyd.html",
    icon: "🌸", initials: "LC", accent: "#be185d",
    sheetName: "Lactacyd", imageDir: "lactacyd", sourceKey: "_lactacydSource",
    fallbackDesc: "Προϊόν Lactacyd — {name}",
    exportSections: ["Περιγραφή", "Χαρακτηριστικά", "Χρήση", "Προφυλάξεις"]
  },
  elladent: {
    key: "elladent", name: "Elladent", host: "elladent.gr", page: "elladent.html",
    icon: "🦷", initials: "ED", accent: "#dc2626",
    sheetName: "Elladent", imageDir: "elladent", sourceKey: "_elladentSource",
    fallbackDesc: "Προϊόν στοματικής υγιεινής Elladent — {name}",
    exportSections: ["Περιγραφή", "Ενδείξεις", "Δραστικά συστατικά", "Πλεονεκτήματα", "Χρήση", "Χαρακτηριστικά"]
  },
  physiomer: {
    key: "physiomer", name: "Physiomer", host: "physiomer.gr", page: "physiomer.html",
    icon: "🌊", initials: "PH", accent: "#0369a1", keepCaps: true,
    sheetName: "Physiomer", imageDir: "physiomer", sourceKey: "_physiomerSource",
    fallbackDesc: "Ρινικό διάλυμα Physiomer — {name}",
    exportSections: ["Περιγραφή", "Ενδείξεις", "Κατάλληλο για", "Οφέλη", "Χρήση", "Συστατικά", "Προφυλάξεις"]
  },
  neilmed: {
    key: "neilmed", name: "NeilMed", host: "sinusrinse.gr", page: "neilmed.html",
    icon: "💦", initials: "NM", accent: "#1d4ed8", keepCaps: true,
    sheetName: "NeilMed", imageDir: "neilmed", sourceKey: "_neilmedSource",
    fallbackDesc: "Προϊόν ρινικής φροντίδας NeilMed — {name}",
    exportSections: ["Περιγραφή", "Κατάλληλο για", "Χρήση", "Συστατικά"]
  },
  bausch: {
    key: "bausch", name: "Bausch + Lomb", host: "bausch.gr", page: "bausch.html",
    icon: "👁️", initials: "B+L", accent: "#0e7490", keepCaps: true,
    sheetName: "Bausch + Lomb", imageDir: "bausch", sourceKey: "_bauschSource",
    fallbackDesc: "Προϊόν Bausch + Lomb — {name}",
    exportSections: ["Περιγραφή", "Ενδείξεις", "Κατάλληλο για", "Οφέλη", "Χρήση", "Συστατικά", "Προφυλάξεις"]
  },
  alcon: {
    key: "alcon", name: "Alcon", host: "systane.myalcon.com", page: "alcon.html",
    icon: "👁️", initials: "AL", accent: "#1e3a8a", keepCaps: true,
    sheetName: "Alcon", imageDir: "alcon", sourceKey: "_alconSource",
    fallbackDesc: "Προϊόν Alcon — {name}",
    exportSections: ["Περιγραφή", "Οφέλη", "Χαρακτηριστικά", "Χρήση", "Συστατικά", "Προφυλάξεις"]
  },
  zwitter: {
    key: "zwitter", name: "Zwitter", host: "zwitter.gr", page: "zwitter.html",
    icon: "👁️", initials: "ZW", accent: "#0f766e", keepCaps: true,
    sheetName: "Zwitter", imageDir: "zwitter", sourceKey: "_zwitterSource",
    fallbackDesc: "Προϊόν Zwitter — {name}",
    exportSections: ["Περιγραφή", "Χαρακτηριστικά", "Οφέλη", "Χρήση", "Προφυλάξεις"]
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
      .replace(/[A-ZÀ-ÖØ-Þ]{2,}/g, m => cfg.keepCaps ? m : m[0] + m.slice(1).toLowerCase())              // CRÈME → Crème (εκτός cfg.keepCaps: CS 5460, CPS, UHS)
      .replace(/(\d)\s?(Ml|Gr|Mg|Iu|Kg|L|G)\b/g, (m, d, u) => d + " " .trim() + u.toLowerCase())    // 400Ml / 30 ML → 400ml / 30ml
      // Γνωστά ακρωνύμια μένουν κεφαλαία: SPF, UV/UVA/UVB, XL, BB/CC, HA, B3/B5, KA, DP, AP+M, PP+, A.D, DS, AC, PSO, SOS, AHA/BHA, INCI
      .replace(/\b(Spf|Uva|Uvb|Uv|Xl|Bb|Cc|Ha|Ka|Dp|Ap|Pp|Ad|Ds|Ac|Pso|Sos|Aha|Bha|Inci|Lrp|Med|Defi|Nf|Rp|Nc|Cica)(?![a-zà-ÿ])/g, m => m.toUpperCase());
    const trimmed = titled.replace(/\s+/g, " ").trim();
    const brandRe = new RegExp("^" + cfg.name.replace(/[.*?^${}()|[\]\\]/g, "\\$&").replace(/\+/g, "[+&]").replace(/[-\s]/g, "[-\\s]?").replace(/è/g, "[èe]") + "\\b", "i");
    if (brandRe.test(trimmed)) return trimmed.replace(brandRe, cfg.name);
    if (cfg.key === "lrp" && /^L\s?R\s+Posay\b/i.test(trimmed)) return trimmed.replace(/^L\s?R\s+Posay\b/i, cfg.name);
    if (cfg.noNamePrefix) return trimmed;   // π.χ. Pierre Fabre Oral Care: τα ονόματα έχουν ήδη Elgydium / Eludril
    return cfg.name + " " + trimmed;
  },
  // Σελίδα στο brand site (override) → ΜΟΝΟ αυτή· αλλιώς fallback φαρμακείου.
  // Ποτέ μείγμα πεδίων από τις δύο πηγές.
  // Συσκευασία από όνομα: «150ml», «30 & 60 caps», «250 gr» → [{ unit, nums }] (ml / g / τεμάχια)
  sizesOf(s) {
    const out = [];
    const re = /((?:\d+(?:[.,]\d+)?\s*(?:&|\/|,|και|ή)\s*)*\d+(?:[.,]\d+)?)\s*(ml|gr|g|γρ|caps?|capsules|κάψ\w*|καψ\w*|tabs?|tablets|ταμπλ\w*|δισκ\w*|softgels?)(?![\p{L}])/giu;
    // «59 2ML» / «4 8gr» (τιμοκατάλογος χωρίς υποδιαστολή) → 59.2 / 4.8
    const str = String(s || "").replace(/(\d+)\s(\d)(?=\s?(?:ml|gr?)(?![\p{L}]))/giu, "$1.$2");
    for (const m of str.matchAll(re)) {
      const u = /^(ml)$/i.test(m[2]) ? "ml" : /^(gr|g|γρ)$/i.test(m[2]) ? "g" : "n";
      out.push({ unit: u, nums: m[1].split(/[^\d.,]+/).filter(Boolean).map(x => parseFloat(x.replace(",", "."))), raw: m[0].trim() });
    }
    return out;
  },
  // Σελίδα που ταιριάστηκε με το όνομα αλλά είναι άλλης συσκευασίας (τιμοκατάλογος 150ml, σελίδα 200ml):
  // η «Συσκευασία» της σελίδας αντικαθίσταται από αυτήν του barcode, και το μέγεθος μπαίνει στο όνομα.
  _sizeFix(cfg, barcode, data, o) {
    // (ισχύει και για σελίδες με το ίδιο barcode: συχνά η σελίδα καλύπτει πολλές συσκευασίες και δείχνει μία)
    const attrs = o.attributes || {};
    const pageSize = attrs["Συσκευασία"] || attrs["Χωρητικότητα"] || "";
    if (!pageSize) return null;
    if (!data._byBc) data._byBc = new Map((data.supplier || []).map(p => [String(p.barcode), p]));
    const p = data._byBc.get(String(barcode)); if (!p) return null;
    const own = this.sizesOf(p.supplierName || p.name), page = this.sizesOf(pageSize);
    for (const a of own) {
      const pn = page.filter(x => x.unit === a.unit).flatMap(x => x.nums);   // όλες οι συσκευασίες που αναφέρει η σελίδα
      if (pn.length && !a.nums.some(n => pn.includes(n))) {
        const src = String(p.supplierName || p.name), i = src.toLowerCase().indexOf(a.raw.toLowerCase());
        const mult = i > 0 ? (src.slice(Math.max(0, i - 6), i).match(/(\d+)\s?[x×*]\s?$/i) || [])[1] : null;   // «10x11ML» → «10 x 11 ml»
        return (mult ? `${mult} x ` : "") + a.raw.replace(/\s*(ml|gr|g)$/i, " $1").replace(/(\d)\s(\d)/, "$1,$2").toLowerCase();
      }
    }
    return null;
  },
  enrichmentFor(cfg, barcode, data) {
    const o = data.overrides[barcode];
    if (o) {
      let attributes = o.attributes || {}, name = o.name || null;
      const fixed = this._sizeFix(cfg, barcode, data, o);
      if (fixed) {
        attributes = { ...attributes, "Συσκευασία": fixed };
        if (attributes["Χωρητικότητα"]) delete attributes["Χωρητικότητα"];
        if (name) {
          const unit = this.sizesOf(fixed)[0]?.unit, inName = this.sizesOf(name).find(s => s.unit === unit);
          name = inName ? name.replace(inName.raw, fixed) : `${name} ${fixed}`;
        }
      }
      return {
        name, subtitle: o.subtitle || null, description: o.description || null, image: o.image || null,
        url: o.url || null, source: cfg.host, section: o.section || null,
        claims: o.claims || [], highlights: o.highlights || [], attributes, sections: o.sections || {},
        matchType: o.matchType || null, review: !!o.review, official: true, noBrandPage: false, sizeFromList: !!fixed
      };
    }
    const s = data.supplemental[barcode] || {};
    return {
      name: s.name || null, subtitle: s.subtitle || null, description: s.description || null, image: s.image || null,
      url: s.url || null, source: s.source || null, section: s.section || null,
      // ενότητες κειμένου από τη σελίδα του φαρμακείου (scripts/enrich-pharmacy-text.mjs), όταν δεν υπάρχει επίσημο site
      claims: [], highlights: s.highlights || [], attributes: {}, sections: s.sections || {}, matchType: null, review: false, official: false, noBrandPage: true
    };
  },
  data(cfg, scope) {
    const v = this.vars(cfg);
    const w = scope || window;
    return { supplier: w[v.supplier] || [], overrides: w[v.overrides] || {}, supplemental: w[v.supplemental] || {}, sections: w[v.sections] || {} };
  }
};
