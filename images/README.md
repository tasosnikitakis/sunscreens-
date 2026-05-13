# images/

Φάκελος με τις εικόνες των προϊόντων.

- **Naming convention:** `{barcode}.{jpg|png|webp}` — π.χ. `5201279080198.jpg`.
- Το `manifest.json` κρατάει την αντιστοίχιση `barcode → filename` που χρησιμοποιεί
  το site για να δείξει σωστά την εικόνα.
- Για αυτόματο γέμισμα: τρέξτε `node scripts/fetch-images.mjs` από τη ρίζα.
  Δείτε [scripts/README.md](../scripts/README.md) για οδηγίες.
