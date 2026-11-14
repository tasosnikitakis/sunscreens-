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
