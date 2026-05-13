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
