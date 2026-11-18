# Scripts

## fetch-images.mjs — Κατέβασμα εικόνων προϊόντων

Κατεβάζει αυτόματα εικόνες από Skroutz και Open Beauty Facts στον φάκελο
`/images` και δημιουργεί / ενημερώνει το `images/manifest.json` που χρησιμοποιεί
το site για να δείχνει τις εικόνες.

### Προαπαιτούμενα

- **Node.js 18+** (χρειάζεται το built-in `fetch`)
  - Έλεγχος έκδοσης: `node --version`
  - Αν είναι παλιότερο: εγκατάσταση από [nodejs.org](https://nodejs.org/) ή μέσω `nvm`.

### Χρήση

Από τη ρίζα του repository:

```bash
# Δοκιμή με 10 προϊόντα πρώτα
node scripts/fetch-images.mjs --limit=10

# Όλη η γκάμα (παίρνει 5-10 λεπτά λόγω rate-limiting)
node scripts/fetch-images.mjs

# Μόνο μία εταιρία
node scripts/fetch-images.mjs --brand=apivita
node scripts/fetch-images.mjs --brand=frezyderm
node scripts/fetch-images.mjs --brand=korres
# (δείτε js/data.js για όλα τα brand keys)

# Ξαναπροσπάθεια ακόμα και για αρχεία που υπάρχουν
node scripts/fetch-images.mjs --force

# Πιο γρήγορα (λιγότερο πολιτικό για τους servers)
node scripts/fetch-images.mjs --delay=400
```

### Τι κάνει για κάθε προϊόν

Δοκιμάζει με τη σειρά:

1. **Manual override** από `images/urls.json` (αν υπάρχει).
2. **Brand-direct**: Bing `site:apivita.com {barcode|name}` (και ανάλογα για τις άλλες εταιρίες) → ανοίγει τη σελίδα του προϊόντος → παίρνει το `og:image`.
3. **Bing Image Search**.
4. **DuckDuckGo** + Greek pharmacy retailers (vita4you, pharm24, fr.com, kosmas, farmasi κλπ).
5. **Skroutz** (συχνά μπλοκάρει bots).
6. **Open Beauty Facts API**.

Όταν βρει εικόνα, την κατεβάζει στο `images/{barcode}.{jpg|png|webp}` και ενημερώνει το `images/manifest.json` αμέσως (resumable).

### Manual URLs override

Για όσα προϊόντα δεν βρει αυτόματα, μπορείτε να βάλετε χειροκίνητα direct URLs στο
`images/urls.json`:

```json
{
  "5201279080198": "https://www.apivita.com/.../bee-sun-safe-cream.jpg",
  "5202888400131": "https://www.frezyderm.com/.../acnorm.jpg"
}
```

Σε νέο run του script, αυτά κατεβαίνουν πρώτα.

### Debug / Test

Για να δείτε τι ακριβώς αποτυγχάνει σε ένα συγκεκριμένο προϊόν:

```bash
node scripts/fetch-images.mjs --test=5201279080198 --debug
```

Αυτό τρέχει όλες τις πηγές για το ένα EAN και εκτυπώνει αναλυτικά τι έγινε σε κάθε βήμα (HTTP status, αν βρήκε ή όχι, ποιο URL κατέβηκε).

### Έπειτα

```bash
git add images/
git commit -m "Add product images"
git push
```

Σε λίγα δευτερόλεπτα το GitHub Pages θα ανανεωθεί με τις εικόνες.

### Manual upload (συμπληρωματικά)

Για όσα προϊόντα δεν βρει αυτόματα το script:

1. Αποθηκεύστε την εικόνα ως `images/{barcode}.jpg` — π.χ. `images/5201279080198.jpg`.
2. Προσθέστε χειροκίνητα στο `images/manifest.json`:
   ```json
   {
     "5201279080198": "5201279080198.jpg"
   }
   ```
3. Commit & push.

### Troubleshooting

- **403 / blocked errors:** Το Skroutz μπορεί προσωρινά να μπλοκάρει αν τρέξετε
  πολλές φορές γρήγορα. Αυξήστε το `--delay=2000` ή περιμένετε λίγη ώρα.
- **Παλιά Node:** Το script θα δώσει `fetch is not defined`. Αναβαθμίστε σε
  Node 18+.
- **Πολλά MISS:** Φυσιολογικό για νέα προϊόντα 2026 — μπορείτε να τα προσθέσετε
  manually όπως παραπάνω.

## Brand catalogs (Frezyderm, Lamberts, A-Derma, …) — ενότητα ανά εταιρία

Κάθε εταιρία με δική της ενότητα ορίζεται στο `js/brands.js` (όνομα, site, χρώμα,
στήλες xlsx). Τα δεδομένα της ζουν σε 4 αρχεία `js/<brand>-{supplier,overrides,
supplemental,sections}.js`, η σελίδα `<brand>.html` φορτώνει το γενικό
`js/brand-app.js`, και το `product.html` τα διαβάζει αυτόματα.

Δύο αφετηρίες: (α) από το Excel του προμηθευτή (A-Derma) ή (β) **από το site**
(Ducray): `build-brand-supplier.mjs --brand=ducray --with-site` χωρίς `--xlsx` φτιάχνει
τον κατάλογο μόνο από τις σελίδες του brand (όλα `listed:false`, χωρίς τιμές)· όταν
έρθει ο τιμοκατάλογος, ξανά με `--xlsx=… --with-site` και οι τιμές συμπληρώνονται.
Τα brands της Pierre Fabre (A-Derma, Ducray, …) μοιράζονται το ίδιο template, άρα και
τον ίδιο extractor (`scripts/lib-aderma.mjs`).

Sites χωρίς κοινό template έχουν δικό τους scraper/extractor: `scripts/lib-lrp.mjs`
(La Roche-Posay, Sitecore/Vue), `scripts/scrape-korres.mjs` (Korres, Shopify:
products.json + <handle>.js για barcodes + σελίδα για τα ελληνικά κείμενα) και
`scripts/scrape-apivita.mjs` (Apivita, Magento/ScandiPWA πίσω από Cloudflare: οι
σελίδες είναι κέλυφος, τα δεδομένα από GraphQL GET μέσω Playwright/Chromium με νέο
context ανά αίτημα· ένα ερώτημα ανά προϊόν γιατί οι λίστες δεν δίνουν τα κείμενα·
χωρίς EAN στο site → κλειδιά `AP-<sku>`, οι τιμές/barcodes θα μπουν από τον τιμοκατάλογο
με manual matches). Τα δωρεάν δείγματα (`is_free`) μένουν εκτός στο build. Οι εικόνες του
assets.apivita.com δίνουν 403 στο fetch → `sync-brand-images.mjs --brand=apivita --browser`
(λήψη μέσω headless Chromium).
`scripts/lib-vichy.mjs` (Vichy, L'Oréal/Sitecore με άλλο theme από LRP: JSON-LD Product + accordions +
επιλογέας μεγεθών/αποχρώσεων). `scripts/lib-beiersdorf.mjs` (Beiersdorf NiveaX/Sitecore: liposan.gr και
μελλοντικά nivea.gr, eucerin.gr, hansaplast — EAN από τα 13 πρώτα ψηφία του article id στο URL,
εικόνες img.nivea.com, κάθε μέγεθος/έκδοση έχει δική της σελίδα). Ο ίδιος extractor αναγνωρίζει
αυτόματα και τα άλλα δύο templates της Beiersdorf: nivea.gr (React/Tailwind, JSON-LD Product +
accordions, εικόνες assets.beiersdorf.com με υποχρεωτικό hash στο URL) και hansaplast.gr / eucerin.gr
(«cookpit», Next.js RSC payload με JSON-LD Product, NART, benefits· χωρίς sitemap → `listPages` στο
scrape-brand για συλλογή συνδέσμων από σελίδες κατηγοριών).

Σε cloud session (proxy) τα scripts που βγαίνουν στο internet θέλουν
`NODE_USE_ENV_PROXY=1` μπροστά (Node fetch).

Πλήρης ροή για νέα εταιρία (παράδειγμα A-Derma, site aderma.gr):

```bash
# 1. Δείγμα σελίδας για μελέτη του template (sanitized, μπορεί να γίνει commit)
node scripts/scrape-brand.mjs --brand=aderma --inspect="https://www.aderma.gr/<σελίδα προϊόντος>" --dump=samples/aderma-sample.html

# 2. Scrape όλων των σελίδων προϊόντων (sitemap → JSON-LD + template extractor scripts/lib-<brand>.mjs) → js/aderma-site.json
node scripts/scrape-brand.mjs --brand=aderma

# 2b. Excel προμηθευτή → supplier.js  [στήλες: κωδικός, barcode, όνομα, λιανική, χονδρική, variants]
#     --with-site: προσθέτει ΚΑΙ τα προϊόντα του site που λείπουν από το Excel (listed:false, χωρίς τιμές —
#     badge "Χωρίς Τιμή" / φίλτρο "χωρίς τιμή προμηθευτή" / στήλη xlsx "Τιμοκατάλογος"), ώστε ο κατάλογος
#     να δείχνει όλη τη γκάμα του brand. Τρέχει ΜΕΤΑ το scrape.
node scripts/build-brand-supplier.mjs --brand=aderma --xlsx=Aderma.xlsx --with-site

# 3. Match supplier ↔ σελίδες (manual → GTIN → fuzzy) → overrides + aderma-match-report.csv + unmatched
node scripts/match-aderma.mjs            # --debug για top-3 ανά προϊόν

# 4. Επίσημες εικόνες τοπικά (images/aderma/) + fallback φαρμακείων για όσα δεν έχουν σελίδα
node scripts/sync-brand-images.mjs --brand=aderma
node scripts/fill-brand-missing.mjs --brand=aderma
node scripts/clean-frezyderm-descriptions.mjs --brand=aderma   # καθαρίζει suffix φαρμακείων

# 5. xlsx/csv
node scripts/generate-catalog.mjs
```

Όλα τα brands (και Frezyderm / Lamberts) χτίζουν τον supplier με το ίδιο script —
η διάταξη στηλών των Excel Frezyderm/Lamberts (barcode, όνομα, λιανική, χονδρική,
variants) είναι προεπιλεγμένη:

```bash
node scripts/build-brand-supplier.mjs --brand=frezyderm --xlsx=Frezyderm.xlsx   # εφαρμόζει js/frezyderm-exclusions.json + discontinued
node scripts/build-brand-supplier.mjs --brand=lamberts  --xlsx=Lamberts.xlsx
```

Κανόνες αποκλεισμού με βάση το όνομα (promo πακέτα, νεσεσέρ, boosters 5ml):
`js/<brand>-exclusions.json` `{ "rules": [{ "name", "pattern", "reason" }] }` — το
`pattern` είναι JavaScript RegExp (flags i).

Αποσυρμένα προϊόντα (στο Excel αλλά όχι πια στο site / εξαντλημένα στα φαρμακεία):
`js/<brand>-discontinued.json` (barcode → όνομα, τιμές, αιτιολόγηση, διάδοχος,
πηγές). Εξαιρούνται από τον κατάλογο στο βήμα build και μπαίνουν στη σημείωση
ελέγχου `reports/Αποσυρμένα προϊόντα.md` (`scripts/discontinued-report.mjs`,
τρέχει και από το generate-catalog) για επιβεβαίωση με τον αντιπρόσωπο.

Προϊόντα χωρίς σελίδα που δεν τα βρίσκει ούτε η αναζήτηση barcode:
`js/<brand>-manual-pharmacy.json` (barcode → URL ή λίστα URL ελληνικών
φαρμακείων) και ξανά το `fill-brand-missing.mjs` — διαβάζει τις σελίδες απευθείας.

Διορθώσεις match: `js/<brand>-manual-matches.json` (barcode → URL, ή `null` =
δεν έχει σελίδα), μετά ξανά το βήμα 3. Για το A-Derma το Excel είναι στα γαλλικά
και οι σελίδες στα ελληνικά, άρα το fuzzy match είναι αναξιόπιστο: βασιζόμαστε
στο GTIN (13ψήφιο = το 14ψήφιο του site χωρίς το αρχικό 0) και στα manual
matches για άλλα μεγέθη του ίδιου προϊόντος (η σελίδα καλύπτει όλα τα μεγέθη).
Με `--with-site` το build διαβάζει τα manual matches και περνά το EAN της
σελίδας ως variant του προϊόντος του τιμοκαταλόγου (σε σελίδες με πολλά μεγέθη
μόνο το μέγεθος του ονόματος), ώστε να μην μπει δεύτερη, άτιμη εγγραφή για
την ίδια σελίδα. Σελίδες Shopify με όλες τις παραλλαγές σε τιμή 0 (δώρα,
Mystery Box, κρυφές/παλιές σελίδες — Korres) δεν προστίθενται ως νέα προϊόντα,
και οι κανόνες `js/<brand>-exclusions.json` ισχύουν και για τα προϊόντα του site.

`scripts/scrape-intermed.mjs` (Intermed, Rails site χωρίς EAN/JSON-LD): λίστα από το
`sitemap.xml.gz`, brand κάθε προϊόντος από τις σελίδες `/el/brands/<slug>`, κείμενα από τα tabs
(Περιγραφή/Ενδείξεις/Οδηγίες χρήσης/Σύνθεση), κλειδιά `IM-<slug>`. Διπλές σελίδες («…-2» με ίδιο τίτλο
και συσκευασία) σημειώνονται `duplicateOf` και μένουν εκτός. Φάρμακα και οδοντιατρικά επαγγελματικής
χρήσης εξαιρούνται με κανόνες κατηγορίας (`"field": "category"` στο `js/intermed-exclusions.json`).
Τιμές: γραμμές INTERMED του `Medica.tsv` → `js/intermed-manual-matches.json` (αντιστοίχιση ονόματος).

`scripts/scrape-uriage.mjs` (Uriage, www.uriage.com/GR/el — το uriage.gr δεν απαντά): λίστα από το
`/GR/el/site-map.xml`, κείμενα από τα `.c-product__*` (περιγραφή, Αποτελέσματα, Ενεργά συστατικά + INCI,
Συμβουλή), μέγεθος από το «Μέγεθος». Χωρίς EAN: κλειδιά `UR-<slug>` (ελληνικά slugs με μεταγραφή σε λατινικά).
Τιμές: γραμμές URIAGE του `Medica.tsv` (`Uriage.tsv`) → `js/uriage-manual-matches.json` (όνομα + μέγεθος·
σελίδες με πολλά μεγέθη παίρνουν την τιμή ενός μεγέθους, promo/σετ και παλιοί κωδικοί → null).

`scripts/scrape-helenvita.mjs` (Helenvita/Pharmex, www.helenvita.com — WordPress, όχι WooCommerce): λίστα και
κατηγορίες από το WP REST (`/wp-json/wp/v2/product`, `/product_category`), κείμενα από τη σελίδα (περιγραφή,
Προδιαγραφές, Συστατικά, Χρήση/Συμβουλές), σειρά = κατηγορία «Brands › …» (→ ενότητα με `LINE_MAP` στο
`match-helenvita.mjs`). Κλειδιά `HV-<slug>`. Τα συμπληρώματα διατροφής (κατηγορία «Συμπληρώματα Διατροφής»)
μπαίνουν σε δύο ενότητες (ενήλικες / βρέφη & παιδιά)· η δοκιμαστική σελίδα και το απολυμαντικό εργαλείων μένουν
εκτός (`js/helenvita-exclusions.json`). Τιμές: γραμμές HELENVITA του `Medica.tsv`
(`Helenvita.tsv`) → `js/helenvita-manual-matches.json`.

`scripts/scrape-cerave.mjs` (CeraVe, www.cerave.gr — L'Oréal/Sitecore, χωρίς sitemap): BFS στις σελίδες
`/peripoihsh-dermatos/*`· σελίδα προϊόντος = div.product-details + JSON-LD Product. Κείμενα από περιγραφή, accordions
(Συστατικά/Οφέλη/Χρήση/Προφυλάξεις), κάρτες χαρακτηριστικών και FAQ (JSON-LD), κατηγορίες = οι σελίδες λίστας που
δείχνουν το προϊόν. Το site δίνει σε μερικές σελίδες το EAN άλλου προϊόντος: EAN που εμφανίζεται σε >1 σελίδα
αντικαθίσταται από κλειδί `CV-<slug>`. Τιμές: όσα EAN ταιριάζουν με το `Medica.tsv` αυτόματα, τα υπόλοιπα (νέα 3606000…
στο site / παλιά 3337875… στον τιμοκατάλογο) με `js/cerave-manual-matches.json`.

`scripts/scrape-mustela.mjs` (Mustela, www.mustela.com.gr — Shopify πολλαπλών αγορών, το mustela.gr ανακατευθύνει
εδώ): λίστα από το `sitemap_products_1.xml` (μόνο ελληνικά προϊόντα· το `/products.json` ανακατεύει όλες τις αγορές),
`/products/<handle>.js` για τίτλο/περιγραφή/εικόνες και η σελίδα για ετικέτα κατηγορίας + ενότητες Ιδιότητες /
Οδηγίες Χρήσης / Συστατικά (INCI). Χωρίς EAN: κλειδιά `MU-<handle>`, τιμές με `js/mustela-manual-matches.json`.

`scripts/scrape-solgar.mjs` (Solgar, www.solgar.gr — Nestlé Health Science, Drupal): το Akamai απορρίπτει αιτήματα
χωρίς πλήρη headers browser, οπότε ο scraper κάνει τα αιτήματα με `curl` και headers Chrome. Λίστα από το
`/sitemap.xml` (`/proionta/<slug>`), κείμενα από JSON-LD (περιγραφή, κατηγορίες, εικόνα) και τη σελίδα
(πιστοποιήσεις Vegan/Gluten Free…, Διαθέσιμο σε, Προτεινόμενη χρήση, Συστατικά, Προφυλάξεις). Κάθε διαθέσιμο μέγεθος
είναι variant με κλειδί `SG-<slug>V<πλήθος><μορφή>` (π.χ. `…V60t` = 60 ταμπλέτες). Στο `js/solgar-manual-matches.json`
η τιμή κάθε barcode είναι το κλειδί του μεγέθους: το `build-brand-supplier.mjs` δέχεται πλέον ως τιμή manual match
είτε url σελίδας είτε συνθετικό κλειδί variant (σελίδες με πολλά μεγέθη χωρίς EAN, όπου κάθε μέγεθος έχει δική του τιμή).
Ενότητα = είδος συμπληρώματος (`solgarSection` στο `match-solgar.mjs`), γιατί οι κατηγορίες «ανά ανάγκη» επικαλύπτονται.

`scripts/scrape-healthaid.mjs` (HealthAid, www.healthaid.co.uk — επίσημο site της μάρκας, Shopify, **αγγλικά**· ελληνικό
site δεν υπάρχει): `/products.json` + σελίδα (Product Benefits, Nutritional Information, Ingredients, Recommended Daily
Intake, Free From). Κρατά μόνο συμπληρώματα (εκτός Body Care/Aromatherapy/Essential Oils και τα Combo Pack). Κλειδί
ανά μέγεθος `HA-<SKU>` (variant του Shopify)· τιμές με `js/healthaid-manual-matches.json` (barcode → κλειδί SKU).
Τα αγγλικά κείμενα αποδίδονται στα ελληνικά (ελεύθερη απόδοση, όχι κατά λέξη) στο `js/healthaid-translations.json`
(handle → subtitle + tabs), που εφαρμόζει το `match-healthaid.mjs`· μεγέθη και χαρακτηριστικά (Χωρίς γλουτένη…) μεταφράζονται εκεί
με σταθερό λεξικό. Τα πρωτότυπα μένουν στο `js/healthaid-site.json`· κάθε προϊόν έχει χαρακτηριστικό «Κείμενα: Ελληνική απόδοση…».

`scripts/scrape-powerhealth.mjs` (Power Health, www.powerhealth.gr — WordPress/WPBakery, custom post type «proionta»,
χωρίς REST/EAN): λίστα από το `/proionta-sitemap.xml`, κείμενα από τη σελίδα (όνομα, μορφή, περιγραφή, tabs ΣΥΝΘΕΣΗ /
ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ, από τα οποία βγαίνουν «Χωρίς», «Περιεχόμενο», «Κατάλληλο για…», προφυλάξεις, αρ. ΕΟΦ). Οι σελίδες
κατηγοριών φορτώνουν προϊόντα με Ajax Load More· προαιρετικός χάρτης κατηγοριών με `--catmap=<json>` (Playwright στο
scratch), αλλιώς η ενότητα βγαίνει από το όνομα (`solgarSection` στο `match-powerhealth.mjs`). Κλειδιά `PH-<slug>`·
τιμές με `js/powerhealth-manual-matches.json`.

`scripts/scrape-quest.mjs` (Quest Vitamins, **www.douni.gr** — Douni Health Products, αντιπρόσωπος Quest στην Ελλάδα, Umbraco):
λίστα από το `/sitemap` (`/etairies/quest/<σειρά>/<προϊόν>/`, σελίδα προϊόντος = `div.detail-page`), ελληνικά κείμενα από την
περιγραφή και το accordion (Χαρακτηριστικά, Δοσολογία & οδηγίες, Θρεπτική αξία, Συστατικά, Αλλεργίες, αρ. ΕΟΦ). Προϊόν σε δύο σειρές
→ μία εγγραφή. Το site δεν δίνει EAN ούτε μέγεθος: τα μεγέθη της ελληνικής αγοράς (από τον τιμοκατάλογο) είναι στο
`js/quest-sizes.json` και γίνονται variants `QV-<slug>V<πλήθος>`· τιμές με `js/quest-manual-matches.json` (barcode → κλειδί).

`scripts/scrape-vitabiotics.mjs` (Vitabiotics, vitabiotics.gr — WooCommerce, robots.txt Crawl-Delay 20 → 20s ανά σελίδα):
λίστα και βασικά στοιχεία από το Store API (`/wp-json/wc/store/v1/products`: περιγραφή, μέγεθος + bullets στο short description,
μορφή, διατροφικές συνήθειες, εικόνες). Οι σελίδες έχουν bot check («One moment…») → Playwright για τα tabs (διατροφικός
πίνακας + συστατικά, οδηγίες, συχνές ερωτήσεις· τα slugs των tabs διαφέρουν ανά προϊόν). Κλειδιά `VB-<slug>`·
τιμές με `js/vitabiotics-manual-matches.json` (Wellman/Wellwoman/Jointace κ.ά. δεν κυκλοφορούν στο ελληνικό site).

`scripts/scrape-unipharma.mjs` (Uni-Pharma, www.uni-pharma.gr — WordPress, post type «nonprescriptive»): λίστα από το REST
(`/wp-json/wp/v2/nonprescriptive` + brands/κατηγορίες· τα links του REST είναι χαλασμένα → `/el/nonprescriptive/<slug>/`).
**Τα φάρμακα (μη συνταγογραφούμενα/συνταγογραφούμενα) μένουν εκτός**· κρατά συμπληρώματα, ιατροτεχνολογικά, αντικουνουπικά,
δερμοκαλλυντικά. Κείμενα από .product-description (περιγραφή, χαρακτηριστικά, δοσολογία, συσκευασία, προειδοποιήσεις, ΕΟΦ) και
.product-info. Κλειδιά `UP-<slug>`· τιμές με `js/unipharma-manual-matches.json`.

`scripts/scrape-superfoods.mjs` (Superfoods, superfoods.eu/el — WordPress με δικό τους theme + Polylang, το post type «product» δεν είναι στο REST):
λίστα από το `/product-sitemap.xml` (μόνο `/el/product/*`). Κείμενα: περιγραφή, «Πληροφορίες» (bullets → Οφέλη), πίνακας συστατικών,
ΠΡΟΤΕΙΝΕΤΑΙ ΣΕ / ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ / ΧΩΡΙΣ, προειδοποιήσεις, ΕΟΦ, «Η υπερτροφή». Κλειδιά `SF-<slug>`· τιμές με
`js/superfoods-manual-matches.json` (Herbatuss → Anasa, Slim Detox → S Detox· Cod Liver Oil/Omegadvance/SForm/Your Bar δεν έχουν σελίδα).

`scripts/scrape-centrum.mjs` (Centrum / Haleon Hellas, vitamins.centrum.gr — μία landing σελίδα με όλη την ελληνική γκάμα· το
haleonhealthpartner.com/el-gr ανακατευθύνει σε «service update» και το haleon.com έχει bot challenge): κάθε `<div class="pic">` =
προϊόν (.iTitle, `<li>` περιγραφή/οφέλη, .prd-ref συσκευασία/δοσολογία/ΕΟΦ, .item-type ηλικία). Πολλά μεγέθη («30, 60 δισκίων και 20
αναβράζοντων») → variants `CE-<slug><N>`· τιμές με `js/centrum-manual-matches.json` (νεότερο barcode ανά μέγεθος, Select 50+ = Silver 50+).
Το site δεν έχει συστατικά/προειδοποιήσεις → πολλά προϊόντα βγαίνουν «ανεπαρκής περιγραφή».

`scripts/scrape-pharmasept.mjs` (Pharmasept, pharmasept.gr/el — WooCommerce + Elementor, χωρίς EAN): λίστα από το Store API
(`/wp-json/wc/store/v1/products`· εκτός προσφορές/promo/gift sets/mini essentials/διπλά πακέτα), κείμενα από το accordion της σελίδας
(Περιγραφή → Οφέλη, Οδηγίες χρήσης, Συστατικά). Μεγέθη (variations «Μέγεθος») → κλειδιά `PS-<τίτλος><μέγεθος>`· διπλή σελίδα
«Baby Mild Bath 500ml» εκτός. Τιμές με `js/pharmasept-manual-matches.json` (μετονομασίες Aid/Hygienic)· το site δεν γράφει
μέγεθος στα απλά προϊόντα → το match το παίρνει από το όνομα της γραμμής του `Pharmasept.tsv`.

`scripts/scrape-caudalie.mjs` (Caudalie, gr.caudalie.com — Nuxt 3 SSR πάνω από Magento, με EAN): λίστα από το `/sitemap.xml` (/p/…),
δεδομένα από το payload `__NUXT_DATA__` (`scripts/lib-nuxt.mjs`, devalue unflatten) → `state["$spdp-product"]`: περιγραφή, ενεργά
συστατικά, οδηγίες, INCI, συχνές ερωτήσεις, χαρακτηριστικά φόρμουλας, σειρά, μέγεθος. Πολλά μεγέθη: η σελίδα δίνει μόνο το EAN του πρώτου
→ ξανά η σελίδα με `?<attribute_uid>=<value uid>` ανά μέγεθος. Εκτός σετ/duo/trio/gift sets. Εικόνες από caudalie-europe.imgix.net.
Το Medica έχει παλιούς κωδικούς (πριν τις νέες συσκευασίες) → `js/caudalie-manual-matches.json` παλιό barcode → **νέο EAN σελίδας**
(μόνο ίδιο προϊόν & ίδιο μέγεθος· το build-brand-supplier δέχεται πλέον και EAN ως τιμή manual match).

`scripts/scrape-bioderma.mjs` (Bioderma, www.bioderma.gr — Drupal Commerce, με EAN): λίστα από το `/sitemap.xml` (/ta-proionta-mas/<σειρά>/<προϊόν>),
μεγέθη από το `<option data-ean>` της φόρμας, κείμενα από περιγραφή / «Detailed description» (Οφέλη) / «Τι συμβαίνει στο δέρμα σου» (Δράση) /
Οδηγίες χρήσης / Αποτελεσματικότητα / Σύνθεση (ενεργά συστατικά + INCI). Σελίδες χωρίς EAN → κλειδί `BI-<σειρά><προϊόν>`· διπλές σελίδες
(Sébium Mat Control / Pore Refiner παλιά-νέα συσκευασία) → μόνο η πρώτη. Τιμές απευθείας με EAN + `js/bioderma-manual-matches.json`.

`scripts/scrape-sebamed.mjs` (Sebamed, www.intramed-pharma.gr — ο Έλληνας αντιπρόσωπος· WordPress, post type «products», χωρίς EAN):
λίστα από τη σελίδα της μάρκας `/brands/sebamed/` (μόνο σελίδες με class `brands-sebamed`, εκτός «ΚΑΤΑΡΓΗΜΕΝΟ»). Κείμενα από τη «Σύντομη
περιγραφή» (μπλοκ «Γιατί να επιλέξετε…» / «Χαρακτηριστικά» / «Ενδείξεις» / «Χρήση») και «Συστατικά». «Μέγεθος συσκευασίας: 200ml, 300ml
(με αντλία), 400ml (Refill)» → ένα κλειδί ανά μέγεθος `SB-<slug><μέγεθος>`. Ο server επιστρέφει πού και πού άλλη σελίδα → ξαναζητείται.
Τιμές με `js/sebamed-manual-matches.json`.

`scripts/scrape-froika.mjs` (Froika, froika.com — WooCommerce + Elementor, ελληνικά, SKU = EAN· το Store API είναι κλειστό): λίστα από το
`/product-sitemap.xml` (μόνο /product/…, όχι /en/), κείμενα από τη σύντομη περιγραφή και τα tabs ΕΝΔΕΙΞΕΙΣ / ΙΔΙΟΤΗΤΕΣ / ΣΥΝΘΕΣΗ / ΣΥΣΤΑΤΙΚΑ /
ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ· σειρά = κατηγορία «Σειρές προϊόντων». Εκτός σετ και Froisept 4-5L (επαγγελματικά). Τιμές απευθείας με EAN.

`scripts/scrape-mollers.mjs` (Möller's, www.mollersomega3.com — διεθνές WooCommerce site, αγγλικά, χωρίς EAN· το ελληνικό mollers.gr δεν απαντά
σε TLS): 11 προϊόντα από το Store API. Τα ελληνικά κείμενα (ελεύθερη απόδοση) στο `js/mollers-translations.json` (handle → name/subtitle/size/tabs)·
τα αγγλικά μένουν στο `details.sourceEn`. Κλειδιά `MO-<slug>`· τιμές με `js/mollers-manual-matches.json`.

`scripts/scrape-lanes.mjs` (Lanes / Γρ. Σαράντης, www.laneshealth.gr — WordPress, post type «product» στο REST, χωρίς EAN): 50 προϊόντα από
`/wp-json/wp/v2/product?_embed`· το content σπάει στις επικεφαλίδες h2-h4 (Περιγραφή / Ιδιότητες / Συνιστάται σε / Σύνθεση / Πίνακας / Δοσολογία /
Μορφή – Συσκευασία / Προειδοποιήσεις). Κουκκίδες «• 200 ταμπλέτες / • 400 …» ή «50 ή 100 κάψουλες» → κλειδί ανά μέγεθος `LA-<slug><N>`·
ίδιο όνομα (PropolCare καραμέλες) → γεύση από το excerpt. Τιμές με `js/lanes-manual-matches.json` (νεότερος κωδικός όπου υπάρχουν δύο).

`scripts/scrape-eubos.mjs` (Eubos, www.eubos.gr — WordPress, post type «product» στο REST χωρίς content, χωρίς EAN): λίστα από το REST,
κείμενα από τη σελίδα (.product__short-desc → Περιγραφή + «Οι κύριοι ενεργοί παράγοντες», tabs Προδιαγραφές / Χρήση / Συστατικά, μέγεθος από
.product__extra-field-aroma· «75ml & 150ml» → κλειδί ανά μέγεθος). Κλειδιά `EU-<slug>`· τιμές με `js/eubos-manual-matches.json`.

`scripts/scrape-vencil.mjs` (Vencil Pharmaceuticals, www.vencil.gr — nopCommerce, ελληνικά στο /el/, χωρίς EAN): λίστα από το `/sitemap.xml`
(σελίδα προϊόντος = έχει .product-essential), κείμενα από .short-description και τις <h3> ενότητες της .full-description (ΣΥΣΤΑΤΙΚΑ / ΕΝΔΕΙΞΕΙΣ /
ΠΡΟΤΕΙΝΟΜΕΝΗ ΧΡΗΣΗ…). Τίτλοι με πολλά μεγέθη («Tired Legs Gel 100 & 200ml», «Hairnail 30 & Extra 90 Caps») → κλειδί ανά μέγεθος. Εκτός
τα προϊόντα αισθητικής ιατρικής (επαγγελματικά). Κλειδιά `VE-<slug>`· τιμές με `js/vencil-manual-matches.json`.

`scripts/scrape-curaprox.mjs` (Curaprox, curaprox.gr — PrestaShop με e-shop, EAN + **λιανική τιμή**): λίστα από το `/sitemap-el-only-images.xml`
(σελίδες «…-p<id>»), JSON-LD Product (gtin13, offers.price, εικόνες) + accordion «Περιγραφή / Χρήση / Χαρακτηριστικά» (κόβεται ανά κάρτα· μπορεί
να βρίσκεται μετά τα «σχετικά προϊόντα»). Τα χρώματα οδοντόβουρτσας είναι επιλογές της ίδιας σελίδας → μία καρτέλα με το EAN της
προεπιλογής. Εκτός ταξιδιωτικά σετ, σετ φροντίδας, CS 5460 Box. **`build-brand-supplier --site-retail`**: η λιανική του site (`details.retailPrice`)
γράφεται στο `p.retail` (retailSource "site")· η χονδρική μένει από το Medica. Η κάρτα δείχνει «Λιαν. X €» όταν δεν υπάρχει χονδρική και
η σελίδα προϊόντος «Λιανική (curaprox.gr)». `keepCaps: true` στο brands.js → το prettify δεν κάνει «CS» → «Cs».

Pierre Fabre Oral Care (Elgydium, Eludril — pierrefabre-oralcare.com/gr-gr, ίδιο template με ducray.com/klorane.com): `scrape-brand.mjs --brand=pforal`
(sitemap `/gr-gr/product.xml`, Crawl-delay 5s, EAN στο URL/JSON-LD) και μετά `node scripts/fix-pforal-site.mjs` (καθαρίζει « | Oral Care» από τους
τίτλους, πετάει τη διπλή σελίδα Antiplaque «…-7044702c2», βάζει «(νέα έκδοση)» στο νεότερο EAN όταν το site έχει παλιά + νέα σύνθεση με ίδιο όνομα).
Build χωρίς Excel: `build-brand-supplier --brand=pforal --with-site --prices=Medica.tsv` → 99 προϊόντα, 40 με τιμή (32 με EAN + 8 παλιοί κωδικοί
Medica → νέα EAN στο `js/pforal-manual-matches.json`). `Pforal.tsv` = οι γραμμές ELGYDIUM/ELUDRIL του Medica (αναφορά). `noNamePrefix: true` στο
brands.js → τα ονόματα έχουν ήδη Elgydium/Eludril και δεν προτάσσεται «Pierre Fabre Oral Care».

`scripts/scrape-placcontrol.mjs` (TePe & Plac Control, placcontrol.gr — WordPress + Elementor, ο αντιπρόσωπος της TePe με Apagard/Apadent,
Forhans, Megasonex, Brush Baby, Plac Aid, Epic, ProxySoft, bioXtra, Protexin, Durimplant): οι σελίδες HTML έχουν anti-bot (SiteGround), οπότε
όλα από το REST `/wp-json/wp/v2/pages` (σελίδες-παιδιά των λιανικών κατηγοριών `/proionta/<κατηγορία>/`· εκτός είδη οδοντιατρείου, αφίσες,
βιβλία, εκμαγεία). Κείμενο εκτός toggles → Περιγραφή/Χαρακτηριστικά, toggles → ενότητες. Δεν υπάρχουν EAN/τιμές στις σελίδες· το EAN
βγαίνει από το όνομα αρχείου της φωτογραφίας όταν υπάρχει (24 προϊόντα), αλλιώς κλειδί `TP-<slug>`. Μεσοδόντια xsoft/Angle → μία κάρτα ανά
μέγεθος (λίστα «0.6 mm – Μπλε»), Nova / Select Compact → μία ανά σκληρότητα. Διπλές σελίδες (Plac Aid Fresh Μέντα/Mint, Apagard Deep Care)
αφαιρούνται. Οι «τιμοκατάλογοι» του site είναι κατάλογοι issuu χωρίς τιμές → χονδρική από το Medica (`Tepe.tsv` = γραμμές TePe/PLAC AID,
`js/tepe-manual-matches.json`). `match-tepe.mjs`: ενότητα από την κατηγορία του site (`details.catSlug`), τα παιδικά από όλες τις κατηγορίες στο «kids».

`scripts/scrape-gum.mjs` (GUM / Sunstar, www.sunstargum.com/gr-el — Adobe AEM + CIF, ελληνικά): λίστα από το `/gr-el/sitemap.xml`
(`/proionta/<κατηγορία>/<προϊόν>.html`, εκτός `/lysi/`). h1, περιγραφή (role=description), teaser «ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ & ΟΦΕΛΗ» → Οφέλη, υπόλοιπα
teasers → Πληροφορίες, εικόνες από το `data-gallery-items`. Χωρίς EAN: ο κωδικός GUM (6070, 1312, 690…) βγαίνει από το όνομα της φωτογραφίας
και γίνεται κλειδί `GU-gum<κωδικός>`· οι γραμμές του Medica έχουν τον ίδιο κωδικό («GUM 1312 TRAV-LER …») → `js/gum-manual-matches.json`.
Trav-ler / Soft-Picks / Soft-Picks Pro / Bi-Direction / Easy-Flossers = variants ανά μέγεθος (`FAMILIES`). Promo 40+10 και Soft-Picks Advanced
(χωρίς σελίδα) μένουν εκτός.

`scripts/scrape-gehwol.mjs` (GEHWOL, αντιπρόσωπος naturapharm.gr — WordPress + Beaver Builder): λίστα από το REST `/wp-json/wp/v2/b2c-products`
(Classic / med / Fusskraft / Soft Feet / Gerlasan – Gerlavit από την ταξινομία `katigoria_proiontos`) και `/wp-json/wp/v2/products`
(επιθέματα ποδιών). Gerlasan & Gerlavit (ίδια εταιρία, Eduard Gerlach) σε δική τους ενότητα «gerlach». Σελίδα: «Διατίθεται σε: 75ml 125ml» και ετικέτες κωδικών «11. 26. 931 Small …» → variants ανά μέγεθος, accordion
Περιγραφή / Συστατικά / Οδηγίες χρήσης, φωτογραφία fl-photo. Χωρίς EAN (μόνο κωδικοί Gehwol) → τιμές Medica με
`js/gehwol-manual-matches.json` (όνομα + μέγεθος).

`scripts/scrape-podia.mjs` (Podia footcare, www.podiafootcare.com — WordPress + Elementor, θέμα «artware»): λίστα από το `/pproducts-sitemap.xml`
(εκτός `/en/`). Τα widgets διαβάζονται με τη σειρά: product-features (h1 + χαρακτηριστικά → Οφέλη), content-toggle (Περιγραφή, ή κείμενο της
προηγούμενης επικεφαλίδας title-tagline → Δράση / Χρήση / Πληροφορίες), steps-carousel (Βήματα → Χρήση), nested-repeater (Συστατικά),
notice (Αντενδείξεις → Προφυλάξεις). Video/στατιστικά/ρουτίνες/blog/ερωτήσεις παραλείπονται. «Διαθέσιμα μεγέθη: Small … Large» και
`FAMILIES` (κάλυμμα/κύλινδρος γέλης S/M/L, ανατομικοί πάτοι Νο 39/44) → variants. Χωρίς EAN → τιμές Medica με `js/podia-manual-matches.json`
(τα PODIAKRO είναι άλλη εταιρία).

Corega (Haleon) — χωρίς ελληνικό επίσημο site (το corega.com ανακατευθύνει στο αμερικανικό mydenturecare.com, το haleonhealthpartner.com/el-gr
είναι εκτός λειτουργίας). Ο κατάλογος χτίζεται από τον τιμοκατάλογο: `build-brand-supplier --brand=corega --xlsx=Corega.tsv
--cols=idx,barcode,code,name,retail,wholesale --prices=Medica.tsv` (κενό `js/corega-site.json`, promo εκτός, ίδια προϊόντα με άλλο barcode
στο `js/corega-discontinued.json`), μετά `fill-brand-missing --brand=corega` (σελίδες pharm24.gr, `js/corega-manual-pharmacy.json` για όσα δεν
βρίσκει η αναζήτηση) και **`scripts/enrich-pharmacy-text.mjs --brand=corega`**: προσθέτει τις καρτέλες της pharm24 (Περιγραφή / Οδηγίες - Χρήσης
/ Συστατικά) ως `sections` στο supplemental — το `brands.js enrichmentFor` τις εμφανίζει πλέον και για προϊόντα χωρίς επίσημη σελίδα.

Sensodyne & parodontax (Haleon, κλειδί `sensodyne`) — ίδια διαδικασία με την Corega (`Sensodyne.tsv`, `js/sensodyne-manual-pharmacy.json`,
`js/sensodyne-discontinued.json` για διπλά barcodes και όσα δεν βρίσκονται σε προσβάσιμο ελληνικό φαρμακείο, `enrich-pharmacy-text.mjs`).

`scripts/scrape-bepanthol.mjs` (Bepanthol / Bayer, www.bepanthol.gr/el — Drupal + Cohesion): το site μπλοκάρει τα απλά HTTP requests
(«bot rated as harmful», 403), οπότε crawl με Playwright (Chromium) από το `/el/proionta/`, με cache HTML. Ενότητες από τα
`data-anchor-link` (ΠΕΡΙΓΡΑΦΗ / ΕΠΙΣΚΟΠΗΣΗ / ΠΛΗΡΟΦΟΡΙΕΣ ΠΡΟΪΟΝΤΟΣ / ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ / ΣΥΣΚΕΥΑΣΙΑ, σύγκριση χωρίς τόνους), «Συστατικά:» και
«Οδηγίες χρήσης» μέσα σε άλλες ενότητες → δικές τους, παραπομπές `<sup>` εκτός. Derma γαλακτώματα 200/400 ml και Γαλάκτωμα Σώματος (FAMILIES)
→ variants. Τιμές Medica με `js/bepanthol-manual-matches.json`. Εικόνες: **`sync-brand-images --browser --warmup=https://www.bepanthol.gr/el/`**
— ένα κοινό browser context που πρώτα ανοίγει το site και μετά κατεβάζει κάθε εικόνα με `fetch` μέσα από τη σελίδα (Accept χωρίς AVIF).

`scripts/scrape-eviol.mjs` (EVIOL, συμπληρώματα διατροφής, eviol.gr — WordPress + Elementor): όλα τα προϊόντα με ένα αίτημα στο WP REST
(`/wp-json/wp/v2/product`, cloud: `NODE_USE_ENV_PROXY=1`). Ενότητες από τις επικεφαλίδες της σελίδας (Σε τι μας βοηθάει → Δράση, Ποιοι το έχουν
ανάγκη → Για ποιους, Δοσολογία, Συσκευασία, Μην ξεχνάς → Προειδοποιήσεις)· ο πίνακας «Διατροφικές πληροφορίες» (UAEL price list ή ζεύγη γραμμών)
→ Συστατικά ως «• ΣΥΣΤΑΤΙΚΟ — ποσότητα». Χωρίς EAN στο site → κλειδιά `EV-…`· «30 & 60 κάψουλες» και Vitamin D3 1200/2200/4000IU (με δικό
τους packshot) → variants. Τιμές Medica με `js/eviol-manual-matches.json` (build `--with-site --prices=Medica.tsv`), `keepCaps` για να μένει «IU».

`scripts/scrape-nuk.mjs` (NUK / MAPA, βρεφικά, www.nuk.gr — Magento 2): η σελιδοποίηση (`?p=`) απαγορεύεται στο robots.txt, οπότε
διαβάζεται η 1η σελίδα κάθε φύλλου-κατηγορίας + σελίδες ανακάλυψης (phases-of-life, νέα, συλλογές) → 184 URL. Λήψη με **curl χωρίς
`Accept-Language`**: με αυτό, σε cache-MISS, το Magento απαντά 302 προς `/stores/store/redirect/…` με κενό σώμα (μοιάζει με «όριο
ρυθμού» αλλά δεν είναι). Σελίδες που αποτυγχάνουν ξαναδοκιμάζονται σε επόμενους γύρους· cache HTML με `--cache=<dir>`. Ενότητα από την
κατηγορία του site, διορθωμένη με κανόνες ονόματος (π.χ. μπιμπερό που εμφανίζονται στις «Θηλές»). Πακέτα πολλών προϊόντων (Starter Set,
Multipack, Σετ μπιμπερό, αποστειρωτής «includes» μπιμπερό) εκτός· μένουν τα «σετ» που είναι το ίδιο το προϊόν (βούρτσα-χτένα, δακτύλιοι).
Διπλές σελίδες (ίδιο προϊόν) → μία· ίδιος τίτλος για διαφορετικά προϊόντα → ξεχωριστό όνομα (σιλικόνη / καουτσούκ). Γερμανικοί/αγγλικοί
τίτλοι και κείμενα → ελληνικά (`TITLE_FIX`, `LINE_FIX`, `GREEK_TEXT`). Χωρίς EAN στο site → κλειδιά `NUK-<κωδικός NUK>`· τιμές Medica με
`js/nuk-manual-matches.json` (build `--with-site --prices=Medica.tsv`), μία γραμμή τιμοκαταλόγου ανά σελίδα.

`scripts/scrape-chicco.mjs` (Chicco / Artsana, βρεφικά φαρμακείου, **www.chicco.it** — Salesforce Commerce Cloud): ο Έλληνας διανομέας
(ascompany.gr) έχει Cloudflare challenge που απορρίπτει κάθε αυτόματη λήψη — δεν παρακάμπτεται — οπότε πηγή είναι το επίσημο ιταλικό
site (το chicco.co.uk έχει μόνο έπιπλα/καρότσια). Μόνο οι κατηγορίες που αντιστοιχούν στις «Θηλασμός & Γέννα», «Πιπίλες & Αξεσουάρ»,
«Φροντίδα & Υγιεινή Μωρού» (λίστα `CATEGORIES`, `?sz=200` = όλα σε μία σελίδα)· εκτός σετ δώρου, ρούχα/πετσέτες, μπανιέρες, παιχνίδια,
ζυγαριά, πιστολάκι, κάδος πανών. Λήψη με curl και απλό UA (το site απαντά 403 σε «browser» UA από script). Το **EAN είναι στο URL**
(`…-8058664156351-00071037410000.html`) → τιμές Medica με barcode· `js/chicco-manual-matches.json` μόνο για ίδιο προϊόν με παλιότερο
ελληνικό barcode. Κάθε χρώμα/συσκευασία είναι ξεχωριστό EAN· ίδιο όνομα → variants με ετικέτα «συσκευασία · χρώμα» (επιλεγμένο
`size` του select + «Cod. Prodotto … χρώμα»). Τα κείμενα είναι ιταλικά: ελληνική απόδοση στο **`js/chicco-translations.json`**
(ιταλικό κείμενο → ελληνικό· κενή τιμή = παράλειψη γραμμής, π.χ. ιταλικές εγκρίσεις διαφήμισης). Ό,τι λείπει γράφεται στο
`<cache>/chicco-untranslated.json` για μετάφραση. Εικόνες από `cdn.artsana.com`.

`scripts/scrape-hydrovit.mjs` (Hydrovit, **targetpharma.gr** — ο διανομέας Target Pharma, WooCommerce χωρίς EAN): λίστα από το Store API,
μόνο η κατηγορία HYDROVIT + τα «HYDROVIT Intimcare Colpo-…» (ιατροτεχνολογικά, όχι φάρμακα· τα άλλα φάρμακα/μάρκες του διανομέα εκτός).
Σελίδα: `div.ml` = συσκευασία, accordion (Οφέλη / Συστατικά / Χρήση / Προφυλάξεις), `.characteristics` → Χαρακτηριστικά.
Κλειδιά `HY-<τίτλος>`, τιμές Medica μέσω `js/hydrovit-manual-matches.json` (18 γραμμές). Χωρίς καθαρό λογότυπο (μόνο μέσα σε φωτογραφία)
→ αρχικά στη σελίδα «Εταιρίες». Σειρά: `scrape-hydrovit` → `build-brand-supplier --brand=hydrovit --with-site --prices=Medica.tsv`
→ `match-hydrovit` → `sync-brand-images` → `generate-catalog` → `build-brand-stats`.

`scripts/scrape-lactacyd.mjs` (Lactacyd / Perrigo, **www.lactacyd.gr** — Drupal, χωρίς EAN και χωρίς συσκευασία): 16 σελίδες από το
sitemap (`/product/…`, καθυστέρηση 2s). Σειρά στοιχείων: h1 · υπότιτλος · «Χαρακτηριστικά» (li) · h2 + p (Περιγραφή) · «Συνιστώμενη χρήση»
(p → Χρήση, li → Προφυλάξεις)· τα εικονίδια h3 είναι ίδια παντού και παραλείπονται. Κλειδιά `LC-<τίτλος>`, 11 γραμμές Medica στο
`js/lactacyd-manual-matches.json` (Daily Lotion = Classic, Pharma Ultra Moisturizing = Pharma 40+)· η συσκευασία (250ml / 300ml /
15 τεμ.) έρχεται από το όνομα της Medica στο `match-lactacyd`. Εικόνες από S3 (`s3.eu-west-3.amazonaws.com`, ~1,5MB PNG) →
μικραίνουν σε 900px με `convert -resize '900x900>' -strip` μετά το `sync-brand-images`.
**Προσοχή:** μην περνάτε την έξοδο του `generate-catalog` σε `| head` — κόβεται η εγγραφή των CSV (άδειασε το vican-catalog.csv).

`scripts/scrape-elladent.mjs` (Elladent, **www.elladent.gr** — OpenCart/Journal2, χωρίς EAN): η προεπιλογή γλώσσας είναι αγγλικά →
POST `index.php?route=module/language` (`language_code=gr`) με το cookie της συνεδρίας, όπως το κουμπί γλώσσας. Λίστα από
`index.php?route=information/sitemap` (17 προϊόντα, μαζί οδοντόβουρτσες/water flosser). Περιγραφή = γραμμές του `#tab-description` με
επικεφαλίδες «Ιδανικό» / «Περιέχει»·«Σύνθεση» / «Πλεονεκτήματα» / «Οδηγίες Χρήσης» / «Συνδυάζεται» (+ ΚΕΦΑΛΑΙΑ στις συσκευές)·
πρώτη γραμμή = όνομα + συσκευασία. Κλειδιά `ED-p<product_id>`, 11 γραμμές Medica στο `js/elladent-manual-matches.json`.

`scripts/scrape-physiomer.mjs` (Physiomer / Perrigo, **www.physiomer.gr** — Drupal, ίδιο CMS με το lactacyd.gr, χωρίς EAN/συσκευασία):
14 σελίδες από το sitemap· ενότητες «Γιατί να επιλέξετε» (→ χαρακτηριστικά), «Ποιες είναι οι ενδείξεις», «Για ποιον ενδείκνυται»,
«ΓΙΑΤΙ ΝΑ ΕΠΙΛΕΞΕΤΕ…» (→ Οφέλη), «Συνιστώμενη χρήση», «Συστατικά», «ΠΩΣ ΝΑ ΧΡΗΣΙΜΟΠΟΙΗΣΕΤΕ»· οι ενότητες προώθησης παραλείπονται.
Το «Σύστημα Ρινικών Πλύσεων και Φακελίσκοι» γίνεται 2 προϊόντα. Κλειδιά `PY-<μεταγραφή τίτλου>`.
**Πολλά barcode Medica σε ένα κλειδί** (νέα GR/IT + παλιά συσκευασία): το `build-brand-supplier` δέχεται πλέον στο
`manual-matches.json` πολλές γραμμές με την ίδια τιμή-κλειδί — η τιμή από την πρώτη που υπάρχει στη Medica, όλα μπαίνουν στα variants.

`scripts/scrape-neilmed.mjs` (NeilMed, **www.sinusrinse.gr** — WordPress του Έλληνα διανομέα, χωρίς EAN): 9 προϊόντα από το
`product-sitemap.xml`· περιγραφή, «ΓΙΑ ΝΗΠΙΑ/ΠΑΙΔΙΑ/ΕΝΗΛΙΚΕΣ», «Δοσολογία», «Συστατικά» (ΚΕΦΑΛΑΙΑ → πεζά με τόνους μέσω λεξικού),
PDF φύλλου οδηγιών. Τα Refill παίρνουν και την περιγραφή του αντίστοιχου kit (το site έχει μία φράση). Κλειδιά `NM-<slug>`,
9 γραμμές Medica (Kit 10/60 ενηλίκων = «SINUSRINSE KIT FESS 10/60»)· NasaMist, PediaMist, Airmax κ.ά. δεν έχουν σελίδα.

`scripts/scrape-bausch.mjs` (Bausch + Lomb, **www.bausch.gr** — Episerver, χωρίς EAN): μόνο προϊόντα φαρμακείου χωρίς συνταγή —
εκτός οι φακοί επαφής (`/fakoi-epafis/`) και ό,τι η σελίδα γράφει «Κατηγορία: Συνταγογραφούμενο / ΜΗ.ΣΥ.ΦΑ / νοσοκομειακή χρήση»
(+ λίστα slugs φαρμάκων για ασφάλεια). Accordion `<p onclick="toggle(this)"><b>…`· ο πίνακας «ΔΙΑΘΕΣΙΜΕΣ ΣΥΣΚΕΥΑΣΙΕΣ» δίνει
μία εγγραφή ανά συσκευασία (π.χ. Artelac drops / μονοδόσεις)· πίνακας άλλου προϊόντος (Desosept/Recugel → «Corneregel 15gr»,
λάθος του site) αγνοείται. Πίνακας θρεπτικών (Ocuvite) → «συστατικό: ανά δισκίο …». Εικόνες ~600KB PNG → 900px με `convert`.
**Όνομα brand με «+»** (Bausch + Lomb): οι regex του ονόματος (`js/brands.js`, `sync-brand-images`, `fill-brand-missing`)
κάνουν πλέον escape τους ειδικούς χαρακτήρες και το «+» ταιριάζει και με «&» (Medica: «BAUSCH & LOMB …»).

`scripts/scrape-alcon.mjs` (Alcon): το myalcon.com/gr/consumer/ παραπέμπει για τα προϊόντα φαρμακείου στο
**systane.myalcon.com/gr/products/** (Drupal Site Studio, 6 σελίδες Systane)· τα διαλύματα φακών (Opti-Free) δεν έχουν ελληνική σελίδα
(«coming soon») και οι φακοί επαφής (total.myalcon.com) είναι οπτικά → εκτός. Γραμμές κειμένου με ενότητες «Βασικά Οφέλη»,
«πληροφοριεσ προϊοντοσ», «οδηγιεσ χρησησ», «… ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ», «Συστατικά», «Ασφάλεια»· «Διαθέσιμα μεγέθη: φιάλη των 10mL &
30 φιαλίδια μιας χρήσης» → 2 εγγραφές. Οι γραμμές Medica με συντηρητικό (Systane Complete/Ultra 10ml) μένουν εκτός — το site έχει
μόνο τις εκδόσεις χωρίς συντηρητικά. Λογότυπο: το λευκό PNG του site χρωματισμένο με ImageMagick (`images/logos/alcon.png`).

## Τιμές από γενικό τιμοκατάλογο προμηθευτή (`--prices`)

Ο προμηθευτής στέλνει έναν ενιαίο τιμοκατάλογο για όλες τις εταιρίες (`Medica.tsv`,
στήλες α/α, Barcode, Κωδικός είδους, Όνομα, Λιανική, Χονδρική). Το
`build-brand-supplier.mjs --prices=Medica.tsv` τον εφαρμόζει σε ΟΛΑ τα προϊόντα του brand
(και σε όσα ήρθαν μόνο από το site) με βάση το barcode ή τα variants/EAN σελίδας, υπερισχύει
των τιμών του `--xlsx` της εταιρίας (νεότερος) και σημειώνει `priceSource`/`supplierCode`.
Για sites χωρίς EAN (Apivita) το barcode του τιμοκαταλόγου έρχεται από το
`js/<brand>-manual-matches.json` (barcode → url, αντιστοίχιση με το όνομα — scratch
apivita-apply.mjs/apivita-pricematch.mjs). Παράδειγμα πλήρους pass:

```bash
P=--prices=Medica.tsv
node scripts/build-brand-supplier.mjs --brand=korres --xlsx=Korres.tsv --with-site $P && node scripts/match-korres.mjs
node scripts/build-brand-supplier.mjs --brand=apivita --with-site $P && node scripts/match-apivita.mjs
node scripts/build-brand-supplier.mjs --brand=frezyderm --xlsx=Frezyderm.xlsx $P && node scripts/match-frezyderm.mjs
node scripts/generate-catalog.mjs
```

### Συσκευασία barcode ≠ συσκευασία σελίδας

Μια σελίδα του site καλύπτει συχνά πολλές συσκευασίες και δείχνει μία (π.χ. σελίδα 200ml, barcode τιμοκαταλόγου 150ml).
Το `BRAND_CATALOGS_UTIL.enrichmentFor` (js/brands.js) συγκρίνει τη συσκευασία στο όνομα του τιμοκαταλόγου (`supplierName`)
με τη «Συσκευασία»/«Χωρητικότητα» της σελίδας (ml / g / τεμάχια, «30 & 60 caps», «10x11ML», «59 2ML» = 59,2 ml)· αν δεν
ταιριάζει, εμφανίζεται η συσκευασία του barcode (και στο όνομα), σε σελίδα προϊόντος, κάρτες και export (`sizeFromList: true`).
Λάθος σελίδα που ταιριάστηκε → `null` (ή σωστό URL) στο `js/<brand>-manual-matches.json`· γραμμές προσφοράς του τιμοκαταλόγου
(«-25%», «σε προνομιακή τιμή», «& ΔΩΡΟ», σετ δώρου) → κανόνες στο `js/<brand>-exclusions.json`.

### Άκυρα barcode των τιμοκαταλόγων

Το `build-brand-supplier.mjs` κρατά στα επιπλέον barcode (στήλη variants του Excel/TSV) μόνο έγκυρα EAN-8/UPC/EAN-13
(σωστό ψηφίο ελέγχου, όχι «1111111…»). Αν το **κύριο** barcode είναι άκυρο και η γραμμή έχει έγκυρο δεύτερο, γίνεται
αυτό κύριο (προτιμάται το πιο κοντινό, π.χ. 8055148408848 → 5055148408848)· το άκυρο χρησιμοποιείται μόνο για να βρεθεί
η τιμή στο Medica.tsv (όπου είναι καταχωρημένο έτσι) και δεν εμφανίζεται. Μετά: match, μετονομασία εικόνας/manifest στο
νέο barcode, generate-catalog, build-brand-stats. Τα barcode της Medica σε προϊόντα με συνθετικό κλειδί (AP-, HA-, IM-…)
μένουν ως έχουν, ακόμη κι αν είναι άκυρα — είναι ο κωδικός με τον οποίο τα ξέρει ο προμηθευτής.
Επιβεβαιωμένες διορθώσεις χωρίς δεύτερο barcode στη γραμμή: `js/<brand>-barcode-fixes.json` (`{ "άκυρο": "σωστό" }`)·
αν το σωστό υπάρχει ήδη ως γραμμή, οι δύο ενώνονται και η τιμή έρχεται από το Medica για το σωστό barcode.
Έλεγχος σε ανοιχτές βάσεις (Open Beauty / Open Food Facts) γίνεται με το API v2 ανά barcode — τα ελληνικά e-shop
και οι μηχανές αναζήτησης μπλοκάρουν την αυτόματη αναζήτηση barcode.

## Σελίδα «Εταιρίες» (brands.html) και λογότυπα

Το nav έχει πλέον μόνο Αντηλιακά / Καλλυντικά / Εποχιακά / Vican / **Εταιρίες** / Αγορά. Όλα τα brand catalogs φαίνονται στη
`brands.html` ως κάρτες (λογότυπο, όνομα, πλήθος προϊόντων / με τιμή, αναζήτηση & ταξινόμηση — `js/brands-page.js`).
Στις σελίδες brand το «Εταιρίες» είναι ενεργό, πάνω από τον τίτλο υπάρχει breadcrumb «Εταιρίες › Brand» και το `brand-app.js`
δείχνει το λογότυπο σε λευκή κάρτα δίπλα στον τίτλο.

- `scripts/fetch-brand-logos.mjs [--only=key] [--force]`: ανοίγει την αρχική κάθε brand σε Playwright, βρίσκει το στοιχείο-λογότυπο
  (img/svg/link με «logo» ψηλά στη σελίδα, χωρίς icons/cookie banners) και κρατά στιγμιότυπό του σε διάφανο PNG → `images/logos/<key>.png`
  και `js/brand-logos.js`. `LOGO_SRC`: σελίδα ή απευθείας εικόνα ανά brand (π.χ. Sebamed / Quest / TePe από διανομείς). `NO_LOGO`: brands
  χωρίς δικό τους λογότυπο στην πηγή (Gehwol, Corega, Sensodyne) → η κάρτα δείχνει τα αρχικά (`initials`/`accent` του brands.js).
- `scripts/build-brand-stats.mjs` → `js/brand-stats.js` (προϊόντα / με τιμή / ενότητες ανά brand). Τρέχει μετά από κάθε build.
- `scripts/restructure-nav.py`: η μετατροπή του nav (μία φορά). **Νέο brand:** καταχώριση στο `js/brands.js` + σελίδα `<key>.html`
  (αντιγραφή από υπάρχουσα σελίδα brand — το nav της είναι ήδη το σωστό), μετά `fetch-brand-logos --only=<key>` και `build-brand-stats`.

### Μαζική λήψη XLSX (brands.html → «Λήψη καταλόγου σε XLSX»)

Επιλογή εταιριών (όλες / καμία / μόνο όσες έχουν τιμές / μία-μία), φίλτρο ίδιο με τις σελίδες brand (Όλα · Όλα ΟΚ · Με κάποιο θέμα ·
Πλήρης / ανεπαρκής περιγραφή · Χωρίς σελίδα · Χωρίς / με τιμή προμηθευτή) και διάταξη: ένα φύλλο ανά εταιρία (στήλες όπως η λήψη της
εταιρίας) ή όλα σε ένα φύλλο με στήλη «Εταιρία» (ένωση των ενοτήτων όλων). Προαιρετικό φύλλο «Περίληψη». Τα δεδομένα κάθε εταιρίας
φορτώνονται μόνο τη στιγμή της λήψης. Η λογική των φίλτρων είναι κοινή (`CatalogExport.flags/passes` στο `js/catalog-export.js`) για
τις κάρτες των σελίδων brand, τη μαζική λήψη και το `build-brand-stats.mjs` (πλήθη ανά φίλτρο στο `js/brand-stats.js`).
