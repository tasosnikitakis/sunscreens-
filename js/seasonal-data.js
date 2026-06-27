// Κατάλογος εποχιακών (Καλοκαίρι 2026)
// Πηγή: ΠΡΟ.ΣΥ.Φ.Α.Π.Ε. Προσφορά Εποχιακών Ειδών — Καλοκαίρι 2026
// Sections: Αδυνατιστικά / Εντομοαπωθητικά & εποχιακά / Τρωκτικοκτόνα

const SEASONAL_SECTIONS = {
  slimming: {
    name: "Αδυνατιστικά",
    icon: "💪",
    accent: "#10b981",
    tagline: "Συμπληρώματα διατροφής & κρέμες σύσφιξης σώματος"
  },
  insectrepel: {
    name: "Εντομοαπωθητικά & Διάφορα Εποχιακά",
    icon: "🦟",
    accent: "#0ea5e9",
    tagline: "Sprays, ρολά, μετά το τσίμπημα, επιθέματα, ωτοασπίδες και είδη ταξιδιού"
  },
  rodenticide: {
    name: "Τρωκτικοκτόνα",
    icon: "🐭",
    accent: "#737373",
    tagline: "Δολώματα ποντικιών & μυρμηγκιών"
  }
};

const SEASONAL_BRANDS = {
  elancyl:    { name: "Elancyl",                     accent: "#c9419e" },
  frezyderm:  { name: "Frezyderm",                   accent: "#e30613" },
  powerhealth:{ name: "Power Health",                 accent: "#0e4d92" },
  slimdetox:  { name: "Superfood Slim Detox",         accent: "#5dc26d" },
  solgar:     { name: "Solgar",                       accent: "#aa742c" },
  korres:     { name: "Korres",                       accent: "#6b8e23" },
  jungle:     { name: "Jungle Formula",               accent: "#3b8132" },
  cer8:       { name: "CER-8",                        accent: "#1e88e5" },
  repel:      { name: "Repel",                        accent: "#0288d1" },
  galesyn:    { name: "Galesyn",                      accent: "#43a047" },
  son:        { name: "Science of Nature",            accent: "#7cb342" },
  autan:      { name: "Autan",                        accent: "#fdd835" },
  moshield:   { name: "Mo-Shield",                    accent: "#5c6bc0" },
  realcare:   { name: "RealCare",                     accent: "#26a69a" },
  esi:        { name: "ESI",                          accent: "#66bb6a" },
  aboca:      { name: "Aboca",                        accent: "#8d6e63" },
  compeed:    { name: "Compeed",                      accent: "#fb8c00" },
  earplugs:   { name: "Ωτοασπίδες",                   accent: "#90a4ae" },
  pharmalead: { name: "Pharmalead",                   accent: "#5d4037" },
  travelfix:  { name: "Travel Fix",                   accent: "#00897b" },
  hangover:   { name: "Hangover Oral Films",          accent: "#7e57c2" },
  klerat:     { name: "Klerat",                       accent: "#616161" },
  storm:      { name: "Storm Ultra",                  accent: "#424242" },
  addict:     { name: "Addict Gel",                   accent: "#37474f" }
};

const SEASONAL_PRODUCTS = [
  // ===== ΑΔΥΝΑΤΙΣΤΙΚΑ =====
  // Elancyl
  { id: "2200044982", barcode: "3282770143867", brand: "elancyl",   line: "My Coach",       section: "slimming", name: "Elancyl Gel Douche My Coach 200ml",                            rawName: "ELANCYL GEL DOUCHE MY COACH 200ML",   price: 7.90 },
  { id: "2200047454", barcode: "3282770206449", brand: "elancyl",   line: "My Coach",       section: "slimming", name: "Elancyl My Coach Cellulite Cream 200ml",                      rawName: "ELANCYL MY COACH CELLUL.CR.200ML",     price: 19.93 },
  { id: "2200046085", barcode: "3282770113143", brand: "elancyl",   line: "Slim Design",    section: "slimming", name: "Elancyl Slim Design Huile Minceur 2-in-1 150ml",              rawName: "ELANCYL SLIMDES.HUILE MINC.2IN1 150",  price: 18.50 },
  // Frezyderm Slimming
  { id: "2200041535", barcode: "5202888227400", brand: "frezyderm", line: "Body Sculpt",    section: "slimming", name: "Frezyderm Confid Up Bust Cream/Gel 200ml",                     rawName: "FREZYDERM CONFID.UP CR/GEL BUST 200",  price: 15.98 },
  { id: "2200041538", barcode: "5202888227394", brand: "frezyderm", line: "Body Sculpt",    section: "slimming", name: "Frezyderm Reform Abdominal Cream/Gel 200ml",                   rawName: "FREZYDERM REFORM ABD CR/GEL 200ML",    price: 15.92 },
  { id: "2200041540", barcode: "5202888227417", brand: "frezyderm", line: "Body Sculpt",    section: "slimming", name: "Frezyderm Triple Effect Frost Gel 200ml",                      rawName: "FREZYDERM TRIPL EFFECT FROS.GEL200M",  price: 20.53 },
  // Power Health
  { id: "2200045247", barcode: "5200321012705", brand: "powerhealth", line: "Cla Max",       section: "slimming", name: "Power Health Cla Max 1900mg x60 Platinum",                    rawName: "CLA MAX CAPS 1900MG X60 PLATINUM",     price: 22.67 },
  { id: "2200048577", barcode: "5200321011159", brand: "powerhealth", line: "Flat Belly",    section: "slimming", name: "Power Health Flat Belly Effervescent x10 Stevia",             rawName: "FLAT BELLY EFF.TABL X10 STEVIA",       price: 11.30 },
  { id: "2200040897", barcode: "5200321013825", brand: "powerhealth", line: "Lipolean",      section: "slimming", name: "Power Health Lipolean Formula x30 Platinum",                  rawName: "LIPOLEAN FORMULA CAPS X30 PLAT.",      price: 11.92 },
  { id: "2200040270", barcode: "5200321012538", brand: "powerhealth", line: "Lipolean",      section: "slimming", name: "Power Health Lipolean Formula x60 Platinum",                  rawName: "LIPOLEAN FORMULA CAPS X60 PLAT.",      price: 20.28 },
  { id: "2200045508", barcode: "5200321011166", brand: "powerhealth", line: "Water Shape",   section: "slimming", name: "Power Health Water Shape Effervescent x14 Stevia",            rawName: "WATER SHAPE X14 EFF.TABL STEV.",       price: 10.87 },
  // Slim Detox
  { id: "2200032078", barcode: "5213006870002", brand: "slimdetox", line: "Slim Detox",     section: "slimming", name: "Superfood Slim Detox Liquid 300ml",                            rawName: "SUPERF.SLIM DETOX LIQUID 300ML",       price: 12.16 },
  // Solgar
  { id: "2200035799", barcode: "33984015814",   brand: "solgar",    line: "Lipotropic Factors", section: "slimming", name: "Solgar Lipotropic Factors x100 Tablets",                  rawName: "SOLGAR LIPOTROPIC FACTORS TABLX100",   price: 26.85 },
  { id: "2200036096", barcode: "33984015807",   brand: "solgar",    line: "Lipotropic Factors", section: "slimming", name: "Solgar Lipotropic Factors x50 Tablets",                   rawName: "SOLGAR LIPOTROPIC* FACTORS TABL X50",  price: 16.10 },

  // ===== ΕΝΤΟΜΟΑΠΩΘΗΤΙΚΑ & ΔΙΑΦΟΡΑ ΕΠΟΧΙΑΚΑ =====
  // Frezyderm Crilen
  { id: "2200046979", barcode: "5202888224263", brand: "frezyderm", line: "Crilen",         section: "insectrepel", name: "Frezyderm Crilen After Nip Gel 30ml",                       rawName: "FREZYD.CRILEN AFTER NIP GEL 30ML CE",  price: 5.46 },
  { id: "2200037838", barcode: "5202888224317", brand: "frezyderm", line: "Crilen",         section: "insectrepel", name: "Frezyderm Crilen Effective Protection Wipes x20",            rawName: "FREZYD.CRILEN EFFEC.PROT.WIPES X20",   price: 5.46 },
  { id: "2200004119", barcode: "5202888010989", brand: "frezyderm", line: "Crilen",         section: "insectrepel", name: "Frezyderm Crilen Lait Εντομοαπωθητικό 50ml",                 rawName: "FREZYD.CRILEN LAIT ΕΝΤΟΜΟΑΠΩΘ. 50ML", price: 7.60 },
  { id: "2200001865", barcode: "5202888010996", brand: "frezyderm", line: "Crilen",         section: "insectrepel", name: "Frezyderm Crilen Lait Εντομοαπωθητικό 125ml",                rawName: "FREZYD.CRILEN LAIT ΕΝΤΟΜΟΑΠΩΘ.125ML", price: 10.86 },
  { id: "2200047930", barcode: "5202888224348", brand: "frezyderm", line: "Crilen",         section: "insectrepel", name: "Frezyderm Crilen Lait A-Mosquito 10% 150ml",                 rawName: "FREZYD.CRILEN LAIT A-MOSQ.10% 150ML",  price: 9.52 },
  { id: "2200048929", barcode: "5202888224300", brand: "frezyderm", line: "Crilen",         section: "insectrepel", name: "Frezyderm Crilen Lait Adult Plus 125ml",                     rawName: "FREZYD.CRILEN LAIT ADULT PLUS 125ML",  price: 10.83 },
  { id: "2200010759", barcode: "5202888102219", brand: "frezyderm", line: "Crilen",         section: "insectrepel", name: "Frezyderm Crilen Mousse Εντομοαπωθητικό 150ml",              rawName: "FREZYD.CRILEN MOUSSE ΕΝΤΟΜΟΑΠ.150ML", price: 12.47 },
  { id: "2200047462", barcode: "5202888224324", brand: "frezyderm", line: "Crilen",         section: "insectrepel", name: "Frezyderm Crilen Roll-On Εντομοαπωθητικό 50ml",              rawName: "FREZYD.CRILEN ROLLON ΕΝΤΟΜΟΑ. 50ML",  price: 8.54 },
  { id: "2200047931", barcode: "5202888224355", brand: "frezyderm", line: "Crilen",         section: "insectrepel", name: "Frezyderm Crilen Spray A-Mosquito 20% Plus 100ml",           rawName: "FREZYD.CRILEN SPR.A-MOSQ.20%PLUS100",  price: 8.87 },
  // Korres
  { id: "2200042772", barcode: "5203069063893", brand: "korres",    line: "Insect Repellent", section: "insectrepel", name: "Korres Ευκάλυπτος & Μύρτο Εντομοαπωθητικό Γαλάκτωμα 100ml", rawName: "KORRES ΕΥΚΑΛ+ΜΥΡΤ.EMULS.ΕΝΤΟ/ΚΟ100Μ", price: 8.06 },
  { id: "2200042766", barcode: "5203069064708", brand: "korres",    line: "After Bite",     section: "insectrepel", name: "Korres Stick Μελισσόχορτο για Τσίμπημα 15ml",                rawName: "KORRES STICK ΜΕΛΙΣΣΟΧΟΡΤΟ ΤΣΙΜΠΗ.15", price: 4.48 },
  // Jungle Formula
  { id: "2200030923", barcode: "5391520948275", brand: "jungle",    line: "Bite & Sting",   section: "insectrepel", name: "Jungle Formula Bite & Sting Roll-On 15ml",                   rawName: "JUNGLE FORM.BITE &STING ROLLON 15ML", price: 5.37 },
  { id: "2200049647", barcode: "8413224044590", brand: "jungle",    line: "Family",         section: "insectrepel", name: "Jungle Formula Family Spray 100ml",                          rawName: "JUNGLE FORM.FAMILY SPRAY 100ML",      price: 8.30 },
  { id: "2200035422", barcode: "5206469006989", brand: "jungle",    line: "Maximum",        section: "insectrepel", name: "Jungle Formula Maximum Original Liquid 75ml",                rawName: "JUNGLE FORM.MAXIM.ORIG.LIQ.75ML",     price: 9.25 },
  { id: "2200042317", barcode: "5400951991030", brand: "jungle",    line: "Maximum",        section: "insectrepel", name: "Jungle Formula Maximum Roll-On Απωθητικό 50ml",              rawName: "JUNGLE FORM.MAXIM.ROLLON ΑΠΩΘ.50M",   price: 7.46 },
  { id: "2200035420", barcode: "5206469007009", brand: "jungle",    line: "Strong",         section: "insectrepel", name: "Jungle Formula Strong Original Liquid 75ml",                 rawName: "JUNGLE FORM.STRONG ORIG.LIQ.75ML",    price: 7.64 },
  { id: "2200035423", barcode: "5206469007023", brand: "jungle",    line: "Strong",         section: "insectrepel", name: "Jungle Formula Strong Soft Liquid 75ml",                     rawName: "JUNGLE FORM.STRONG SOFT LIQ.75ML",    price: 7.64 },
  { id: "2200045629", barcode: "5400951990026", brand: "jungle",    line: "Strong",         section: "insectrepel", name: "Jungle Formula Strong Soft Spray 125ml",                     rawName: "JUNGLE FORM.STRONG SOFT SPR.125ML",   price: 10.09 },
  // CER-8
  { id: "2200012654", barcode: "5204559030012", brand: "cer8",      line: "Kids",           section: "insectrepel", name: "CER-8 Παιδικό Εντομοαπωθητικό Strips x24",                   rawName: "CER 8 ΠΑΙΔ.ΕΝΤΟΜΟΑΠ.STRIPS X24STR",   price: 6.50 },
  { id: "2200040879", barcode: "5204559030319", brand: "cer8",      line: "Anti-Mosquito",  section: "insectrepel", name: "CER-8 Anti-Mosquito Spray Άοσμο 100ml",                      rawName: "CER-8 ANTI-MOSQ.SPRAY ΑΟΣΜΟ 100ML",   price: 7.90 },
  { id: "2200047171", barcode: "5204559030074", brand: "cer8",      line: "Lotion",         section: "insectrepel", name: "CER-8 Εντομοαπωθητικό Lotion 125ml",                          rawName: "CER-8 ΕΝΤΟΜΟΑΠΩΘ. LOTION 125ML",      price: 7.50 },
  { id: "2200005252", barcode: "5204559030005", brand: "cer8",      line: "Strips",         section: "insectrepel", name: "CER-8 Εντομοαπωθητικά Strips x24",                            rawName: "CER-8 ΕΝΤΟΜΟΑΠΩΘ. STRIPS X24 STRI",   price: 6.50 },
  { id: "2200041576", barcode: "5204559030166", brand: "cer8",      line: "Ultra Protect",  section: "insectrepel", name: "CER-8 Ultra Protect Spray Άοσμο 30ml",                        rawName: "CER-8 ULTRA PROTECT.SPR.ΑΟΣΜ.MIN30",  price: 3.90 },
  { id: "2200048569", barcode: "5204559030128", brand: "cer8",      line: "Ultra Protect",  section: "insectrepel", name: "CER-8 Ultra Protect Spray Άοσμο 100ml",                       rawName: "CER-8 ULTRA PROTECT.SPRAY ΑΟΣΜΟ100",  price: 8.00 },
  { id: "2200040337", barcode: "5204559009377", brand: "cer8",      line: "Junior",         section: "insectrepel", name: "CER-8 Cream Junior Άοσμο 150ml + Patch Δώρο",                 rawName: "CER-8 CREAM JUNIOR ΑΟΣΜΟ150+PATC.ΔΩ", price: 8.90 },
  { id: "2200041562", barcode: "5204559030111", brand: "cer8",      line: "Junior",         section: "insectrepel", name: "CER-8 Patch Junior Microcaps Εντομοαπωθητικά x48",            rawName: "CER-8 PATCH JUNIOR MICROC.ΕΝΤΟ/ΚΟ48", price: 11.40 },
  { id: "2200047173", barcode: "5204559030043", brand: "cer8",      line: "After Bite",     section: "insectrepel", name: "CER-8 Roll-On After Bite 10ml",                              rawName: "CER-8 ROLL-ON AFTER BITE 10ML",       price: 2.20 },
  { id: "2200047105", barcode: "5204559030098", brand: "cer8",      line: "After Bite",     section: "insectrepel", name: "CER-8 Stickers After Bite x30",                              rawName: "CER-8 STICKERS AFTER BITE X30",       price: 2.20 },
  // Repel
  { id: "2200043123", barcode: "5205152233800", brand: "repel",     line: "After Bite",     section: "insectrepel", name: "Repel After Bite Gel 20ml",                                  rawName: "REPEL AFTER BITE GEL 20ML",            price: 4.77 },
  { id: "2200037109", barcode: "5206938221509", brand: "repel",     line: "Foam Spray",     section: "insectrepel", name: "Repel Foam Spray Εντομοαπωθητικό 150ml",                     rawName: "REPEL FOAM SPRAY ΕΝΤΟΜ/ΚΟ 150ML",     price: 11.65 },
  { id: "2200048070", barcode: "5206938221301", brand: "repel",     line: "Foam Spray",     section: "insectrepel", name: "Repel Foam Spray Εντομοαπωθητικό 50ml",                      rawName: "REPEL FOAM SPRAY ΕΝΤΟΜ/ΚΟ 50ML",      price: 5.68 },
  { id: "2200036288", barcode: "5206938000531", brand: "repel",     line: "Myco Clean",     section: "insectrepel", name: "Repel Myco Clean Pen 3ml",                                    rawName: "REPEL MYCO CLEAN PEN 3ML",             price: 7.10 },
  { id: "2200049145", barcode: "5206938221400", brand: "repel",     line: "Spray",          section: "insectrepel", name: "Repel Spray Άοσμο Εντομοαπωθητικό 100ml",                    rawName: "REPEL SPRAY ΑΟΣΜΟ ΕΝΤΟΜ/ΚΟ 100ML",    price: 8.85 },
  { id: "2200046899", barcode: "5206938480708", brand: "repel",     line: "Spray",          section: "insectrepel", name: "Repel Spray Άοσμο Εντομοαπωθητικό 15ml",                     rawName: "REPEL SPRAY ΑΟΣΜΟ ΕΝΤΟΜ/ΚΟ 15ML",     price: 2.95 },
  // Galesyn
  { id: "2200030672", barcode: "5205056290275", brand: "galesyn",   line: "After Bite",     section: "insectrepel", name: "Galesyn After Nip Gel 30ml",                                  rawName: "GALESYN AFTER NIP GEL 30ML",           price: 4.80 },
  { id: "2200041800", barcode: "5202385021785", brand: "galesyn",   line: "Jellyfish",      section: "insectrepel", name: "Galesyn Spray Lotion After Bite Μέδουσας 125ml",             rawName: "GALESYN SPR.LOT.AFTERBITE ΜΕΔΟΥΣ125",  price: 4.50 },
  { id: "2200044478", barcode: "5205056455728", brand: "galesyn",   line: "Family Repellent", section: "insectrepel", name: "Galesyn Family Repellent Spray 20% IR3535 100ml",          rawName: "GALESYN SPR.REP.FAM.20%IR3535 100ML", price: 7.60 },
  { id: "2200040796", barcode: "5205056459955", brand: "galesyn",   line: "Family Repellent", section: "insectrepel", name: "Galesyn Family Repellent Spray IR3535 + Δώρο + Τσάντα",     rawName: "GALESYN SPR.REP.FAM.IP3535+ΔΩ+ΤΣΑ",    price: 11.34 },
  // Science of Nature
  { id: "2200043689", barcode: "5206355050737", brand: "son",       line: "After Bite",     section: "insectrepel", name: "Science of Nature After Bite Gel 30ml",                       rawName: "SCIENCE OF NAT.AFTER BITE GEL 30ML",   price: 4.80 },
  { id: "2200042187", barcode: "5206355050744", brand: "son",       line: "Mosquito",       section: "insectrepel", name: "Science of Nature Mosquito Diffuser 30",                      rawName: "SCIENCE OF NAT.MOSQUITO DIFFUSER 30",  price: 6.60 },
  { id: "2200042195", barcode: "5206355050782", brand: "son",       line: "Mosquito",       section: "insectrepel", name: "Science of Nature Mosquito Lotion Protection 100ml",          rawName: "SCIENCE OF NAT.MOSQUITO LOT.PROT100",  price: 8.80 },
  { id: "2200042191", barcode: "5206355050775", brand: "son",       line: "Mosquito",       section: "insectrepel", name: "Science of Nature Mosquito Spray Protection 100ml",           rawName: "SCIENCE OF NAT.MOSQUITO SPR.PROT100",  price: 8.80 },
  // Autan
  { id: "2200045425", barcode: "5000204176698", brand: "autan",     line: "Defence",        section: "insectrepel", name: "Autan Defence After Bite Gel 25ml",                           rawName: "AUTAN DEFEN. AFTER BITE GEL 25ML",     price: 5.01 },
  { id: "2200042597", barcode: "5000204435511", brand: "autan",     line: "Defence Extreme",section: "insectrepel", name: "Autan Defence Extreme Protection Spray 100ml",                rawName: "AUTAN DEFEN.EXTREME PR.ΕΝΤ/Κ.SPR100",  price: 9.55 },
  { id: "2200045427", barcode: "5000204184525", brand: "autan",     line: "Defence Long",   section: "insectrepel", name: "Autan Defence Long Protection Lotion/Spray 100ml",            rawName: "AUTAN DEFEN.LONG PR.ΕΝΤ/ΚΟ LO/SP100",  price: 8.84 },
  { id: "2200040039", barcode: "5000204176452", brand: "autan",     line: "Defence Plant",  section: "insectrepel", name: "Autan Defence Plant Spray 100ml ΝΕΟ",                          rawName: "AUTAN DEFEN.PLANT ΕΝΤ/ΚΟ SPR.100ΝΕΟ",  price: 8.73 },
  { id: "2200045424", barcode: "5000204176544", brand: "autan",     line: "Defence Kids",   section: "insectrepel", name: "Autan Defence Kids Gel 100ml",                                rawName: "AUTAN DEFEN. KIDS ΕΝΤ/ΚΟ GEL 100ML",   price: 8.95 },
  // Power Health Fleriana
  { id: "2200037132", barcode: "5200102460923", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana Εντομοαπωθητικές Tablets x20",                       rawName: "FLERIANA ΕΝΤΟΜ/ΚΕΣ TABL X20",          price: 3.29 },
  { id: "2200045791", barcode: "5200102460695", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana Εντομοαπωθητικές Tablets x30 + Ηλεκτρική Συσκευή",   rawName: "FLERIANA ΕΝΤΟΜ/ΚΕΣ TABLX30 +ΗΛ.ΣΥΣΚ",  price: 6.54 },
  { id: "2200037134", barcode: "5200102460930", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana Εντομοαπωθητικό Υγρό Plug-In 30ml",                  rawName: "FLERIANA ΕΝΤΟΜ/ΚΟ ΥΓΡΟ PLUG IN 30ML",  price: 5.35 },
  { id: "2200040978", barcode: "5200102460497", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana Κερί Εντομοαπωθητικό 130g",                          rawName: "FLERIANA ΚΕΡΙ ΕΝΤΟΜ/KO 130G",          price: 8.06 },
  { id: "2200040980", barcode: "5200102461050", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana Σπείρες Εντομοαπωθητικές x10",                       rawName: "FLERIANA ΣΠΕΙΡΕΣ ΕΝΤΟΜ/KO X10",        price: 3.29 },
  { id: "2200048628", barcode: "5200102460671", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana After Bite Spray 30ml",                              rawName: "FLERIANA AFTERBITE SPRAY 30ML",        price: 5.32 },
  { id: "2200041439", barcode: "5200102461555", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana Cream Body Εντομοαπωθητική 75ml",                    rawName: "FLERIANA CREAM BODY ΕΝΤΟΜ.75ML",       price: 6.54 },
  { id: "2200041459", barcode: "5200102461548", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana Roll-On Εντομοαπωθητικό 50ml",                       rawName: "FLERIANA ROLL-ON ΕΝΤΟΜ.50ML",          price: 5.35 },
  { id: "2200033117", barcode: "5200102460435", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana Spray Απωθητικό Έρποντα Έντομα 400ml",               rawName: "FLERIANA SPRAY ΑΠΩΘ.ΕΡΠΟΝΤΑ ΕΝΤ.400",  price: 5.68 },
  { id: "2200041460", barcode: "5200102461531", brand: "powerhealth", line: "Fleriana",      section: "insectrepel", name: "Fleriana Spray Εντομοαπωθητικό 75ml",                         rawName: "FLERIANA SPRAY ΕΝΤΟΜΟΑΠ. 75ML",        price: 6.54 },
  // Mo-Shield
  { id: "2200046388", barcode: "4897047470332", brand: "moshield",  line: "Bracelet",       section: "insectrepel", name: "Mo-Shield Βραχιόλι Αντικουνουπικό x1",                       rawName: "MO-SHIELD ΒΡΑΧΙΟΛΙ ΑΝΤΙΚΟΥΝΟΥΠ. Χ1",  price: 3.29 },
  // Real Care
  { id: "2200037446", barcode: "5212008500368", brand: "realcare",  line: "After Bite",     section: "insectrepel", name: "RealCare Roll-On Αμμωνία 25ml",                              rawName: "RC REALCARE ROLL-ON ΑΜΜΩΝΙΑ 25ML",     price: 1.28 },
  { id: "2200037396", barcode: "5212008500306", brand: "realcare",  line: "Panthenol",      section: "insectrepel", name: "RealCare Panthenol Cream 150ml (50% Δωρεάν)",                rawName: "RC PANTHENOL CREAM 150ML 50%ΔΩΡΕΑΝ",   price: 5.60 },
  // ESI Aloe Vera
  { id: "2200046346", barcode: "8008843132430", brand: "esi",       line: "Aloe Vera",      section: "insectrepel", name: "ESI Aloe Vera Gel 100% Pure 100ml",                          rawName: "ALOE VERA GEL 100,00% PURE ESI 100ML", price: 7.79 },
  { id: "2200048723", barcode: "8008843132447", brand: "esi",       line: "Aloe Vera",      section: "insectrepel", name: "ESI Aloe Vera Gel 100% Pure 200ml",                          rawName: "ALOE VERA GEL 100,00% PURE ESI 200ML", price: 9.30 },
  // Aboca Arnica
  { id: "2200035899", barcode: "8032472004608", brand: "aboca",     line: "Arnica",         section: "insectrepel", name: "Aboca Arnica Bio-Pomata 50ml",                                rawName: "ARNICA BIO-POMATA 50ML ABOCA",         price: 9.60 },
  // Compeed
  { id: "2200020395", barcode: "3574660559859", brand: "compeed",   line: "Φουσκάλες",      section: "insectrepel", name: "Compeed Επιθέματα Φουσκάλες Πέλματος Underfoot x5",          rawName: "COMPEED ΕΠΙΘ.ΦΟΥΣΚΑ ΠΕΛ.UNDERΧ5 673", price: 5.63 },
  { id: "2200024349", barcode: "3663555001457", brand: "compeed",   line: "Φουσκάλες",      section: "insectrepel", name: "Compeed Medium Φουσκάλες x5",                                 rawName: "COMPEED MEDIUM ΦΟΥΣΚΑΛ.X5 505/001",   price: 4.98 },
  { id: "2200025099", barcode: "3663555001679", brand: "compeed",   line: "Φουσκάλες",      section: "insectrepel", name: "Compeed Επιθέματα Φουσκάλες Δακτύλων x8",                     rawName: "COMPEED ΕΠΙΘ.ΦΟΥΣΚ.ΔΑ. Χ8 503",       price: 4.98 },
  { id: "2200027315", barcode: "3663555001969", brand: "compeed",   line: "Κάλοι",          section: "insectrepel", name: "Compeed Επίθεμα Medium Μικρών Δακτύλων (Corn) x10",          rawName: "COMPEED ΕΠΙΘΕΜΑ MED.ΜΙΚΡ.Δ.CORNΧ10",  price: 4.58 },
  { id: "2200027502", barcode: "3663555001440", brand: "compeed",   line: "Φουσκάλες",      section: "insectrepel", name: "Compeed Επίθεμα Small Μεγάλων Δακτύλων x6",                  rawName: "COMPEED ΕΠΙΘΕ SMALL ΜΕΓ.ΔΑ.Χ6/403",   price: 4.98 },
  { id: "2200027507", barcode: "3663555001938", brand: "compeed",   line: "Κότσια",         section: "insectrepel", name: "Compeed Επίθεμα Κότσια x5",                                   rawName: "COMPEED ΕΠΙΘΕΜΑ ΚΟΤΣΙΑ Χ5 /200",      price: 4.58 },
  { id: "2200027509", barcode: "3663555001549", brand: "compeed",   line: "Κάλοι",          section: "insectrepel", name: "Compeed Επίθεμα Large Σκληρύνσεις x2",                       rawName: "COMPEED ΕΠΙΘΕΜΑ LARGE ΣΚΛΗΡ. Χ2/302", price: 4.58 },
  { id: "2200027515", barcode: "3663555001945", brand: "compeed",   line: "Κάλοι",          section: "insectrepel", name: "Compeed Επίθεμα Medium Σκληρύνσεις x6",                      rawName: "COMPEED ΕΠΙΘΕΜΑ MEDΙ.ΣΚΛΗΡΥΝ.Χ6 300", price: 4.58 },
  { id: "2200027517", barcode: "3663555001952", brand: "compeed",   line: "Κάλοι",          section: "insectrepel", name: "Compeed Επίθεμα Medium Μεταξύ Δακτύλων x10",                 rawName: "COMPEED ΕΠΙΘ.ΜED.ΜΕΤΑΞΥ ΔΑΚ.Χ10 402", price: 4.58 },
  { id: "2200028115", barcode: "3663555002126", brand: "compeed",   line: "Επιχείλιος Έρπης", section: "insectrepel", name: "Compeed Patch Επιχείλιος Έρπης x15",                       rawName: "COMPEED PATCH ΕΠΙΧΕΙΛ.ΕΡΠΗΣ Χ15",     price: 8.84 },
  { id: "2200030099", barcode: "3663555002386", brand: "compeed",   line: "Φουσκάλες",      section: "insectrepel", name: "Compeed Extreme Medium Φουσκάλες x5",                        rawName: "COMPEED EXTREME MEDIUM ΦΟΥΣΚΑΛ.Χ5",   price: 5.63 },
  { id: "2200040503", barcode: "3663555005394", brand: "compeed",   line: "Stop Spots",     section: "insectrepel", name: "Compeed Patch Stop Spots x15",                               rawName: "COMPEED PATCH STOP SPOTS X15",         price: 8.66 },
  { id: "2200040505", barcode: "3663555005349", brand: "compeed",   line: "Stop Spots",     section: "insectrepel", name: "Compeed Plaster Stop Spots x7",                              rawName: "COMPEED PLASTER STOP SPOTS X7",        price: 5.68 },
  { id: "2200047305", barcode: "3663555002492", brand: "compeed",   line: "Κάλοι",          section: "insectrepel", name: "Compeed Επίθεμα Medium Moisturizing Corn x6",                rawName: "COMPEED ΕΠΙΘΕΜΑ MEDIUM.MOIS CORN X6", price: 4.84 },
  { id: "2200048154", barcode: "3663555002973", brand: "compeed",   line: "Φουσκάλες",      section: "insectrepel", name: "Compeed Medium Επιθέματα Φουσκάλες x10",                     rawName: "COMPEED MEDIUM ΕΠΙΘ. ΦΟΥΣΚΑΛ.X10",    price: 7.66 },
  { id: "2200048156", barcode: "3663555002652", brand: "compeed",   line: "Φουσκάλες",      section: "insectrepel", name: "Compeed Επίθεμα Φτέρνες x5 Τακούνι",                         rawName: "COMPEED ΕΠΙΘΕΜΑ ΦΤΕΡΝΕΣ Χ5 ΤΑΚΟΥΝ",   price: 5.63 },
  { id: "2200049122", barcode: "3663555002744", brand: "compeed",   line: "Φουσκάλες",      section: "insectrepel", name: "Compeed Επιθέματα Mix Pack 5 x 3 Μεγέθη",                    rawName: "COMPEED ΕΠΙΘΕΜ.MIX PACK 5-Χ3 ΜΕΓΕΘΗ",  price: 5.63 },
  // Earplugs
  { id: "2200003920", barcode: "",              brand: "earplugs",  line: "Earplus",        section: "insectrepel", name: "Ωτοασπίδες Σιλικόνης Earplus (Ζεύγος)",                      rawName: "ΩΤΟΑΣΠΙΔΕΣ ΣΙΛ/ΝΗΣ EARPLUS ΖΕΥΓΟΣ",   price: 1.55 },
  { id: "2200006172", barcode: "4003626060935", brand: "earplugs",  line: "Ohropax",        section: "insectrepel", name: "Ωτοασπίδες Σπογγώδεις Soft Ohropax (Ζεύγος)",                rawName: "ΩΤΟΑΣΠΙΔΕΣ ΣΠΟΓΓΩΔ.SOFT OHROPAX ΖΕΥ", price: 0.46 },
  // Pharmalead
  { id: "2200039118", barcode: "5203339000122", brand: "pharmalead", line: "Αιμοστατικό",   section: "insectrepel", name: "Pharmalead Αιμοστατικό Spray 60ml",                          rawName: "PHARMAL.ΑΙΜΟΣΤΑΤΙΚΟ SPRAY 60ML",      price: 11.30 },
  { id: "2200039119", barcode: "5203339000108", brand: "pharmalead", line: "Αιμοστατικό",   section: "insectrepel", name: "Pharmalead Αιμοστατικό Βαμβάκι 2g",                          rawName: "PHARMAL.ΑΙΜΟΣΤΑΤΙΚΟ ΒΑΜΒΑ 2GR",       price: 6.20 },
  // Travel Fix
  { id: "2200045776", barcode: "5206938002634", brand: "travelfix", line: "Travel Fix",     section: "insectrepel", name: "Travel Fix Films ODF x10",                                    rawName: "TRAVEL FIX FILMS ODF X10",             price: 4.06 },
  { id: "2200034197", barcode: "5206938000623", brand: "travelfix", line: "Travel Fix",     section: "insectrepel", name: "Travel Fix Tablets 500mg x10",                                rawName: "TRAVEL FIX TABL 500MG X10",            price: 4.06 },
  // Hangover
  { id: "2200047585", barcode: "5205152011262", brand: "hangover",  line: "Hangover",       section: "insectrepel", name: "Hangover Oral Films Disintegrating x6",                       rawName: "HANGOVER ORAL FILMS DISINTEGR. X6",    price: 5.00 },

  // ===== ΤΡΩΚΤΙΚΟΚΤΟΝΑ =====
  { id: "2200045807", barcode: "",              brand: "klerat",    line: "Pasta",          section: "rodenticide", name: "Klerat Pasta Ποντικιών 10x15g",                              rawName: "KLERAT PASTA ΠΟΝΤΙΚΙΩΝ 10X15GR",      price: 3.90 },
  { id: "2200040263", barcode: "",              brand: "storm",     line: "Cubes",          section: "rodenticide", name: "Storm Ultra Ποντικοκύβοι 150g",                              rawName: "STORM ULTRA ΠΟΝΤΙΚ. ΚΥΒΟΙ 150GR",     price: 7.38 },
  { id: "addict-gel-myrm", barcode: "5212047700064", brand: "addict", line: "Μυρμήγκια",    section: "rodenticide", name: "Addict Gel Μυρμήγκια 10g (ΝΕΟ)",                              rawName: "Addict Gel Μυρμήγκια 10g",            price: 0 }
];

if (typeof module !== 'undefined') module.exports = { SEASONAL_SECTIONS, SEASONAL_BRANDS, SEASONAL_PRODUCTS };
