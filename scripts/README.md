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
με manual matches).

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
