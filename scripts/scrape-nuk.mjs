#!/usr/bin/env node
// scripts/scrape-nuk.mjs
// Κατάλογος NUK (MAPA GmbH, βρεφικά) από το www.nuk.gr → js/nuk-site.json.
// Το site είναι Magento 2 χωρίς δημόσιο GraphQL/REST και το robots.txt απαγορεύει τα URLs με «?»
// (σελιδοποίηση ?p=2) και το /catalog/. Γι' αυτό:
//   1. διαβάζουμε την 1η σελίδα κάθε κατηγορίας του μενού (οι «φύλλα» κατηγορίες έχουν ≤ 20 προϊόντα,
//      και η «Στάδια ανάπτυξης» με τις υποκατηγορίες της καλύπτει όλη τη γκάμα) → URLs προϊόντων + ενότητα·
//   2. κάθε σελίδα προϊόντος: τίτλος, κουκκίδες (overview), «Λεπτομέρειες», εικόνες gallery, SKU NUK.
// Η σελίδα δεν έχει EAN → κλειδί NUK-<sku>· αντιστοίχιση με τη Medica στο js/nuk-manual-matches.json.
//
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-nuk.mjs [--cache=<dir>] [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "js/nuk-site.json");
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const CACHE = opt("cache", null);
const DELAY = parseInt(opt("delay", "6000"), 10);
const BASE = "https://www.nuk.gr/";
const UA = "Mozilla/5.0 (compatible; catalog-fetch/1.0)";

// Κατηγορία του nuk.gr → ενότητα καταλόγου (η πρώτη που ταιριάζει κερδίζει, από τις πιο ειδικές)
const CATEGORIES = [
  ["replacement-parts.html", "parts"],
  ["bottles-accessories/teats.html", "teats"],
  ["bottles-accessories/bottles.html", "bottles"],
  ["bottles-accessories/baby-bottle-accessories.html", "bottle-acc"],
  ["soothers-accessories/latex-soothers.html", "soothers"],
  ["soothers-accessories/silicone-soothers.html", "soothers"],
  ["soothers-accessories/soother-chains-bands.html", "soother-acc"],
  ["learner-bottles-cups/learner-bottles.html", "cups"],
  ["learner-bottles-cups/evolution-cups.html", "cups"],
  ["learner-bottles-cups/first-choice-cups.html", "cups"],
  ["learner-bottles-cups/mini-me.html", "cups"],
  ["breastfeeding/breast-pumps.html", "breastfeeding"],
  ["breastfeeding/breast-pads.html", "breastfeeding"],
  ["breastfeeding/breastfeeding-aids.html", "breastfeeding"],
  ["oral-care-teething-rings/teething-rings.html", "teething"],
  ["oral-care-teething-rings/oral-care.html", "teething"],
  ["tableware-cutlery/tableware.html", "tableware"],
  ["tableware-cutlery/cutlery.html", "tableware"],
  ["preparation-storage/preparation.html", "tableware"],
  ["preparation-storage/storage.html", "tableware"],
  ["babycare-hygiene/babycare.html", "babycare"],
  ["babycare-hygiene/baby-hygiene.html", "babycare"],
  ["baby-monitors-safety/baby-monitors.html", "electric"],
  ["baby-monitors-safety/safety.html", "babycare"],
  ["electric-products/steam-sterilisers.html", "electric"],
  ["electric-products/baby-food-warmers.html", "electric"],
  ["electric-products/other.html", "electric"],
  ["household-hygiene/product-hygiene.html", "hygiene"],
  ["household-hygiene/household-hygiene-2.html", "hygiene"],
  // τελευταία: η «Σετ & δώρα» περιέχει και απλά προϊόντα (π.χ. μπιμπερό Monochrome Animals) → βλ. φίλτρο σετ στο main()
  ["sets-and-presents.html", "sets"]
];
// Σελίδες μόνο για εύρεση URLs (όλη η γκάμα + συλλογές/νέα)
const DISCOVERY = [
  "phases-of-life.html", "phases-of-life/pregnancy.html", "phases-of-life/0-6-months.html", "phases-of-life/6-18-months.html",
  "phases-of-life/18-plus-months.html", "what-s-new.html", "collections.html", "collections/perfect-match.html", "collections/mickey.html",
  "collections/winnie-the-pooh.html", "collections/frozen.html", "collections/disney-classics.html", "collections/beach-edition.html",
  "collections/snow.html", "collections/toy-story.html", "collections/hello-adventure.html", "collections/rose-blue.html",
  "bottles-accessories.html", "soothers-accessories.html", "learner-bottles-cups.html", "breastfeeding.html"
];
// Αν η σελίδα δεν βρέθηκε σε «φύλλο» κατηγορία (π.χ. 21ο προϊόν της κατηγορίας), ενότητα από το όνομα
const NAME_SECTION = [
  ["sets", /(^|\s)Σετ(\s|$)|Set\b|Δώρο/i], ["teats", /Θηλ(ή|ές)/i], ["soothers", /Πιπίλ/i], ["cups", /Cup|ποτηράκι|παγουράκι|Εκπαιδευτικό/i],
  ["bottles", /Μπιμπερό/i], ["breastfeeding", /Θήλαστρ|στήθους|θηλασ/i], ["teething", /Δακτύλι|οδοντ/i], ["electric", /Αποστειρωτ|Θερμαντ|Ενδοεπικοινων/i]
];

// Διορθώσεις τίτλων του nuk.gr (γερμανικά υπολείμματα, λατινικά γράμματα μέσα σε ελληνικές λέξεις, τυπογραφικά)
const TITLE_FIX = [
  [/Trinklernflasche/g, "Μπιμπερό εκπαίδευσης"], [/Silikon-Schnuller/g, "Πιπίλα σιλικόνης"],
  [/First Choice Soother 18-36 months/g, "First Choice Πιπίλα 18-36 μηνών"],
  [/ with με /g, " με "], [/\(ΡΡ\)/g, "(PP)"], [/(^|\s)Mπιμπερό/g, "$1Μπιμπερό"], [/Πόλυπροπυλενίου/g, "Πολυπροπυλενίου"],
  [/Τhermo/g, "Thermo"], [/EASY LEARNING/g, "Easy Learning"], [/\s{2,}/g, " "]
];
const fixTitle = t => TITLE_FIX.reduce((a, [re, to]) => a.replace(re, to), t).trim();
// Πακέτα πολλών διαφορετικών προϊόντων → εκτός (πολιτική: μόνο βασικά προϊόντα).
// Μένουν όσα «σετ» είναι το ίδιο το προϊόν (βούρτσα-χτένα, δακτύλιοι, οδοντόβουρτσες, καλύμματα στήθους, πολτοποίηση).
const BUNDLE = /(^|\s)Σετ(\s|$)|\bSet\b|Multipack|includes|Δώρο|Gift/i;
const BUNDLE_OK = /Σετ βούρτσα|Σετ δακτυλίων|Σετ στοματικής|Σετ εκπαιδευτικών οδοντοβουρτσών|Σετ καλυμμάτων|Σετ Πολτοποίησης/i;
// Η ενότητα από την κατηγορία του site δεν είναι πάντα σωστή (π.χ. μπιμπερό στις «Θηλές») → κανόνες ονόματος έχουν προτεραιότητα
const SECTION_FIX = [
  ["bottle-acc", /Βούρτσα μπιμπερό|Στεγνωτήρας|Δοσομετρητής/i],
  ["hygiene", /Υγρό καθαρισμού/i],
  ["parts", /Καπάκι για Μπιμπερό/i],
  ["electric", /Θερμαντήρας|Αποστειρωτής/i],
  ["babycare", /Θερμόμετρο/i],
  ["breastfeeding", /Θήλαστρ|μητρικού γάλακτος|Ασπίδες θηλής/i],
  ["cups", /Μπιμπερό εκπαίδευσης/i],
  ["bottles", /Μπιμπερό/i],
  ["teats", /Θηλή/i],
  ["tableware", /Snack Box/i],
];
// Διπλές σελίδες του site (ίδιο προϊόν, άλλο URL) → κρατάμε μία
const DROP_SKU = new Set(["10256361", "90255615", "10256495"]);
// Ίδιος τίτλος για διαφορετικά προϊόντα → ξεχωριστό όνομα
const RENAME_SKU = {
  "90125019": "NUK First Choice Plus Θηλή σιλικόνης", "10120013": "NUK First Choice Plus Θηλή καουτσούκ (latex)",
  "90175294": "NUK for Nature Πιπίλα σιλικόνης", "90171000": "NUK for Nature Πιπίλα καουτσούκ (latex)",
};
// Σελίδα του nuk.gr που είναι μόνο στα γερμανικά → ελεύθερη ελληνική απόδοση
const GREEK_TEXT = {
  "90175336": {
    subtitle: "NUK Perfect Match Πιπίλα σιλικόνης, 0-6 μηνών, 2 τεμάχια",
    advantages: [
      "Για υγιή ανάπτυξη των δοντιών και της γνάθου*",
      "Μοναδικά φιλική προς τον θηλασμό – το 98% των μητέρων λέει ότι ηρεμεί αξιόπιστα το μωρό χωρίς να επηρεάζει τη σχέση θηλασμού**",
      "Μαλακή και οικεία: η σιλικόνη με υφή δέρματος μιμείται το στήθος της μητέρας και ηρεμεί με φυσικό τρόπο",
      "Απαλή στο ευαίσθητο δέρμα του μωρού – ακουμπά μαλακά, χωρίς σημάδια πίεσης ή ερεθισμούς",
      "Κατασκευάζεται στη Γερμανία, 2 τεμάχια ανά συσκευασία, με ανθεκτική επαναχρησιμοποιούμενη θήκη",
    ],
    "Περιγραφή": "Η πιπίλα NUK Perfect Match*** μοιάζει με το στήθος της μητέρας\nΗ πιπίλα που «ταιριάζει» σωστά: εμπνευσμένη από την αίσθηση της μητέρας, προσφέρει ασφάλεια, εγγύτητα και σιγουριά – ό,τι χρειάζονται τα μωρά. Η φιλική προς το δέρμα σιλικόνη είναι μαλακή, εύκαμπτη και καταπραϋντική. Η φαρδιά βάση για τα χείλη υποστηρίζει τη φυσική εφαρμογή – όπως στον θηλασμό. Το επίπεδο, ορθοδοντικό σχήμα αφήνει χώρο στη γλώσσα και μειώνει την πίεση σε γνάθο και δόντια, υποστηρίζοντας από την αρχή την υγιή τους ανάπτυξη. Σε συγκριτική δοκιμή τεσσάρων σχημάτων πιπίλας η NUK είχε τα καλύτερα αποτελέσματα, με τη μικρότερη επίδραση σε γνάθο και δόντια.* Η πιπίλα ταιριάζει ιδανικά με το μπιμπερό NUK Perfect Match – μαζί προσφέρουν οικεία αίσθηση και προστατεύουν τη σχέση θηλασμού.\nΠρακτική για τις μετακινήσεις: με επαναχρησιμοποιούμενη θήκη\nΗ πιπίλα συνοδεύεται από ανθεκτική, επαναχρησιμοποιούμενη θήκη που την προστατεύει υγιεινά – ιδανική για έξω και κατάλληλη για αποστείρωση στον φούρνο μικροκυμάτων.",
    "Σημειώσεις": "*Επιστημονική σύγκριση τεσσάρων σχημάτων πιπίλας, Pharmawissen aktuell, 2022.\n**Γερμανία 2022: ανεξάρτητες έρευνες αγοράς.\n***Η Perfect Match (0-6 μηνών) σχεδιάστηκε ειδικά για την περίοδο του θηλασμού· μετά τον απογαλακτισμό προτιμήστε άλλο μοντέλο πιπίλας NUK.\nΟι πιπίλες NUK κατασκευάζονται 100% στη Γερμανία και πληρούν το ευρωπαϊκό πρότυπο ασφαλείας EN 1400. Για λόγους ασφάλειας και υγιεινής οι πιπίλες σιλικόνης πρέπει να αντικαθίστανται κάθε 1–2 μήνες. Διαβάστε προσεκτικά τις οδηγίες χρήσης και τις προειδοποιήσεις μέσα στη συσκευασία.",
  },
};
// Μεμονωμένες γερμανικές γραμμές μέσα σε ελληνικές περιγραφές → ελληνικά
const LINE_FIX = [
  [/^• Elterneinheit:.*$/m, "• Μονάδα γονέα: περιλαμβάνει φορτιστή και 1 επαναφορτιζόμενη μπαταρία (τύπος BYD SCD 530-1, έξοδος 3,7 V, 950 mAh [3,5 Wh])"],
  [/^• Babyeinheit:.*$/m, "• Μονάδα μωρού: λειτουργία με 4 αλκαλικές μπαταρίες AA 1,5 V ή με το παρεχόμενο τροφοδοτικό 230 V (βύσμα DC)"],
  [/^Carefully read warnings and instructions inside\. Please retain product information and article\/ LOT no\. for future use\. NUK Cups and Spouts are only compatible with the corresponding range\.$/m, "Διαβάστε προσεκτικά τις προειδοποιήσεις και τις οδηγίες μέσα στη συσκευασία. Φυλάξτε τις πληροφορίες του προϊόντος και τον αριθμό είδους/LOT για μελλοντική χρήση. Τα ποτηράκια και τα ρύγχη NUK είναι συμβατά μόνο με την αντίστοιχη σειρά."],
  [/^Carefully read warnings and instructions inside\. Please retain product information and article\/ LOT no\. for future use\.$/m, "Διαβάστε προσεκτικά τις προειδοποιήσεις και τις οδηγίες μέσα στη συσκευασία. Φυλάξτε τις πληροφορίες του προϊόντος και τον αριθμό είδους/LOT για μελλοντική χρήση."],
  [/^NUK baby bottles comply with the European safety standard EN14350\.$/m, "Τα μπιμπερό NUK πληρούν το ευρωπαϊκό πρότυπο ασφαλείας EN 14350."],
  [/^NUK Cups comply with the European safety standard EN14350\.$/m, "Τα ποτηράκια NUK πληρούν το ευρωπαϊκό πρότυπο ασφαλείας EN 14350."],
  [/^If your child’s condition is causing you concern, please consult a doctor\.$/m, "Αν η κατάσταση του παιδιού σας σας ανησυχεί, συμβουλευτείτε γιατρό."],
  [/^NUK Disney Winnie the Pooh Active Cup, Soft Spout Silicone, 300 ml, Age 12m\+, Leakproof, With Clip, BPA-free$/m, "NUK Disney Winnie the Pooh Active Cup, μαλακό ρύγχος σιλικόνης, 300 ml, από 12 μηνών, προστασία από διαρροές, με κλιπ, χωρίς BPA"],
  [/^• \*\*In accordance with applicable regulation\.$/m, "• **Σύμφωνα με την ισχύουσα νομοθεσία."],
  [/^NUK Fresh Foods TM Food Pots: letting fresh baby food be stacked away quickly and easily!$/m, "NUK Fresh Foods δοχεία φαγητού: η φρέσκια βρεφική τροφή αποθηκεύεται γρήγορα και εύκολα!"],
  [/^• Flexible, soft silicone shape$/m, "• Εύκαμπτο, μαλακό σχήμα από σιλικόνη"],
  [/^\* In accordance with EU regulations$/m, "* Σύμφωνα με τους κανονισμούς της ΕΕ"],
  [/\(ΡΡ\)/g, "(PP)"],
  [/^Beachten Sie bitte.*$/m, "Σημείωση: για χρήση με το NUK Easy Learning Cup Fun κόψτε λίγο από το κάτω μέρος του καλαμακιού, γιατί αλλιώς είναι πολύ μακρύ."],
];
GREEK_TEXT["10177250"] = {
  subtitle: "NUK First Choice ορθοδοντική πιπίλα σιλικόνης, 18-36 μηνών, με θήκη",
  advantages: ["Ορθοδοντική πιπίλα με μαλακή ζώνη και εξαιρετικά λεπτό λαιμό για υγιή ανάπτυξη του στόματος, σε μέγεθος 18-36 μηνών"],
  "Περιγραφή": "Η πιπίλα NUK First Choice έχει σχεδιαστεί για να καλύπτει την ανάγκη του μωρού για θηλασμό.\nΗ μοναδική ορθοδοντική θηλή της έχει μια ευχάριστη μαλακή ζώνη στο πάνω μέρος, που προσαρμόζεται απαλά στον ουρανίσκο. Το εξαιρετικά επίπεδο σχήμα αφήνει περισσότερο χώρο στη γλώσσα για φυσική κίνηση, ενώ ο πολύ λεπτός και στενός λαιμός επιτρέπει στα χειλάκια να κλείνουν σχεδόν πλήρως. Έτσι υποστηρίζεται η υγιής ανάπτυξη των δοντιών και της γνάθου*.\nΟι πιπίλες NUK First Choice συνοδεύουν το μωρό σε κάθε στάδιο και κυκλοφορούν σε μεγέθη 0-6, 6-18 και 18-36 μηνών, για τέλεια εφαρμογή καθώς μεγαλώνει.\nΤις εμπιστεύεται το 95% των μωρών**· κατασκευάζονται στη Γερμανία και συνοδεύονται από ανθεκτική, επαναχρησιμοποιούμενη θήκη για υγιεινή φύλαξη και εύκολη αποστείρωση.",
};
GREEK_TEXT["10255635"] = {
  subtitle: "NUK Mini Cups 3 σε 1: 1x Mini Trainer Cup, 1x Mini Magic Cup, 1x χείλος πόσης, 160 ml, χωρίς BPA",
  advantages: [
    "Πολύ μικρό και εύχρηστο – ενθαρρύνει το παιδί να πίνει μόνο του",
    "1x NUK Mini Trainer Cup, 1x NUK Mini Magic Cup, 1x NUK χείλος πόσης",
    "Τα στόμια συνδυάζονται ελεύθερα μεταξύ τους",
    "Χωρητικότητα 160 ml, από 6 μηνών",
    "Ανθεκτικό ποτηράκι από πολυπροπυλένιο",
  ],
  "Περιγραφή": "NUK Mini Trainer Cup με εργονομικές λαβές και καπάκι, από 6 μηνών\nΤο NUK Mini Trainer Cup διευκολύνει τη μετάβαση από το μπιμπερό στο ποτήρι. Το μαλακό ρύγχος είναι ιδιαίτερα απαλό για τον ουρανίσκο και τα ούλα, οι εργονομικές λαβές πιάνονται εύκολα από τα μικρά χεράκια και το ποτηράκι είναι 100% προστατευμένο από διαρροές.\nNUK Mini Magic Cup με χείλος πόσης 360° και καπάκι, από 6 μηνών\nΜε το NUK Mini Magic Cup και τα πιο μικρά παιδιά πίνουν «σαν μεγάλα»: το περιμετρικό χείλος 360° τα μαθαίνει να πίνουν από όλη την περίμετρο, σχεδόν όπως από κανονικό ποτήρι. Η μόνη «μαγική» διαφορά: ένας δίσκος σιλικόνης σφραγίζει το ποτήρι από μέσα, ώστε να μη χύνεται. Αρκεί το παιδί να ρουφήξει ελαφρά το χείλος. Είναι πολύ μικρό και εύχρηστο, και το καπάκι το κρατά καθαρό όπου κι αν βρίσκεστε.\nNUK χείλος πόσης, από 12 μηνών\nΤο χείλος πόσης ενθαρρύνει το παιδί να πίνει από ανοιχτό ποτήρι και ταιριάζει και με άλλα ποτηράκια της σειράς NUK Evolution Cup.\nΤα NUK Evolution Cups «μεγαλώνουν» μαζί με το παιδί: δύο μεγέθη και διαφορετικά στόμια για κάθε στάδιο εκμάθησης, που αλλάζουν εύκολα όσο αναπτύσσονται οι δεξιότητές του – όλα 100% χωρίς διαρροές.",
  "Σημειώσεις": "Διαβάστε προσεκτικά τις προειδοποιήσεις και τις οδηγίες μέσα στη συσκευασία. Φυλάξτε τις πληροφορίες του προϊόντος και τον αριθμό είδους/LOT για μελλοντική χρήση. Τα ποτηράκια και τα ρύγχη NUK είναι συμβατά μόνο με την αντίστοιχη σειρά.\nΤα ποτηράκια NUK πληρούν το ευρωπαϊκό πρότυπο ασφαλείας EN 14350.",
};
// Αγγλικοί υπότιτλοι → ελληνικά
const SUBTITLE_FIX = {
  "10255257": "NUK Fresh Foods θήκη κατάψυξης για βρεφικές τροφές, 9 μερίδες των 60 ml, που αφαιρούνται μεμονωμένα",
  "10255635": "NUK Mini Cups 3 σε 1: 1x Mini Trainer Cup, 1x Mini Magic Cup, 1x χείλος πόσης, 160 ml, χωρίς BPA",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", deg: "°", reg: "®", trade: "™", times: "×" };
const unescape = s => String(s || "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const tidy = s => s.split("\n").map(l => l.replace(/[ \t\u00a0]+/g, " ").trim()).filter(Boolean).join("\n");
const strip = s => tidy(unescape(String(s || "")
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
  .replace(/<(br|\/p|\/li|\/div|\/h\d|\/tr)[^>]*>/gi, "\n")
  .replace(/<li[^>]*>/gi, "\n• ")
  .replace(/<[^>]+>/g, " ")))
  // «First Choice\n+\n με …» (το + είναι <sup>) → «First Choice+ με …»
  .replace(/\n\+\n/g, "+ ").replace(/\n:\n/g, ":\n").replace(/\n:$/gm, ":");

async function get(url) {
  const key = url.replace(BASE, "").replace(/[^a-z0-9.-]+/gi, "__");
  if (CACHE) { try { return await fs.readFile(path.join(CACHE, key), "utf8"); } catch {} }
  // μία γρήγορη νέα προσπάθεια εδώ·
  // όσες αποτύχουν ξαναδοκιμάζονται σε επόμενους γύρους από τη main() (το crawl δεν «κολλάει» σε μία σελίδα).
  const BACKOFF = [0, 15000];
  let html, lastErr;
  for (let attempt = 0; attempt < BACKOFF.length && html === undefined; attempt++) {
    if (attempt) console.warn(`  … ${lastErr?.message} — αναμονή ${BACKOFF[attempt] / 1000}s`);
    await sleep(DELAY + BACKOFF[attempt]);
    try {
      // curl αντί για fetch: το fetch της Node μέσω proxy κόβεται συχνά σε αυτό το site
      const { stdout } = await execFileP("curl", ["-sS", "--fail", "--compressed", "--max-time", "60", "--max-redirs", "0",
        "-A", UA, url], { maxBuffer: 64 << 20 });
      // ΟΧΙ Accept-Language: σε cache-MISS το Magento απαντά 302 προς /stores/store/redirect/… (κενό σώμα).
      // Το nuk.gr είναι ήδη ελληνικό (el_GR). Ό,τι μικρό σώμα έρθει → αποτυχία, όχι cache.
      if (stdout.length < 2000) throw new Error(`κενή απάντηση (${stdout.length} bytes)`);
      html = stdout;
    } catch (e) { lastErr = e; }
  }
  if (html === undefined) throw new Error(`${url} → ${lastErr && (lastErr.cause?.code || lastErr.message)}`);
  if (CACHE) { await fs.mkdir(CACHE, { recursive: true }); await fs.writeFile(path.join(CACHE, key), html); }
  return html;
}
const productLinks = html => [...new Set([...html.matchAll(/href="(https:\/\/www\.nuk\.gr\/nuk-[a-z0-9-]+\.html)"/g)].map(m => m[1]))];

function parseProduct(html, url) {
  const d = { tabs: {}, attributes: {}, images: [], advantages: [], variants: [] };
  d.title = unescape((html.match(/itemprop="name">([\s\S]*?)<\/span>/) || [])[1] || "").replace(/\s+/g, " ").trim();
  d.sku = (html.match(/\bsku="([^"]+)"/) || [])[1] || null;
  const ov = (html.match(/c-product-attribute--overview[^>]*>\s*<div class="value"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "";
  d.advantages = strip(ov).split("\n").map(l => l.replace(/^•\s*/, "").trim()).filter(Boolean);
  const desc = (html.match(/c-product-attribute--description[^>]*>\s*<div class="value"\s*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/) || [])[1] || "";
  let lines = strip(desc).split("\n").filter(l => !/^MAPA GmbH|^Newell Brands|^\*{0,3}$|^.$/.test(l));
  // 1η γραμμή = πλήρης περιγραφή-τίτλος (μέγεθος, ηλικία, χρώμα) → υπότιτλος
  if (lines.length && /^NUK\b/i.test(lines[0])) d.subtitle = lines.shift();
  const notes = lines.filter(l => /^\*|EN\s?\d{4,5}|Διαβάστε προσεκτικά|For more information/i.test(l));
  lines = lines.filter(l => !notes.includes(l));
  d.tabs["Περιγραφή"] = lines.join("\n");
  if (d.advantages.length) d.tabs["Χαρακτηριστικά"] = d.advantages.map(a => "• " + a).join("\n");
  if (notes.length) d.tabs["Σημειώσεις"] = notes.join("\n");
  for (const k of Object.keys(d.tabs)) if (!d.tabs[k]) delete d.tabs[k];
  d.description = (lines.slice(0, 3).join(" ") || d.advantages.join(" ")).replace(/\s+/g, " ").trim();

  // Εικόνες: magento gallery JSON ("full"), χωρίς διπλά
  const imgs = [...html.matchAll(/"full":"(https:[^"]+?)"/g)].map(m => m[1].replace(/\\\//g, "/"));
  d.images = [...new Set(imgs)];
  // Μέγεθος / ηλικία / υλικό από τίτλο + υπότιτλο
  const all = `${d.title} ${d.subtitle || ""}`;
  const ml = all.match(/(\d{2,4})\s?ml\b/i); if (ml) d.size = d.attributes["Χωρητικότητα"] = `${ml[1]} ml`;
  const age = all.match(/(\d{1,2}\s?[-–]\s?\d{1,2}|\d{1,2}\+)\s?(μην|μηνών|m\b|M\b)/i);
  if (age) d.attributes["Ηλικία"] = age[1].replace(/\s/g, "").replace("–", "-") + " μηνών";
  if (/σιλικόνη|silicone/i.test(all)) d.attributes["Υλικό"] = "Σιλικόνη"; else if (/latex|καουτσούκ/i.test(all)) d.attributes["Υλικό"] = "Latex (καουτσούκ)";
  if (d.sku) d.attributes["Κωδικός NUK"] = d.sku;
  d.gtin = d.sku ? `NUK-${d.sku.replace(/[^a-z0-9]/gi, "")}` : `NUK-${url.replace(/^.*\/nuk-|\.html$/g, "").replace(/[^a-z0-9]/gi, "").slice(0, 40)}`;
  return d;
}

async function main() {
  const section = new Map(), category = new Map(), urls = new Set();
  for (const [c, sec] of CATEGORIES) {
    const html = await get(BASE + c);
    const label = unescape((html.match(/<h1[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/) || [])[1] || "").trim();
    for (const u of productLinks(html)) { urls.add(u); if (!section.has(u)) { section.set(u, sec); category.set(u, label); } }
  }
  for (const c of DISCOVERY) for (const u of productLinks(await get(BASE + c))) urls.add(u);
  console.log(`${urls.size} σελίδες προϊόντων (${section.size} με κατηγορία).`);

  const out = [];
  let todo = [...urls].sort();
  const pages = new Map();
  for (let pass = 1; pass <= 6 && todo.length; pass++) {
    if (pass > 1) { console.log(`\n— γύρος ${pass}: ${todo.length} σελίδες ξανά (μετά από 2΄) —`); await sleep(120000); }
    const failed = [];
    for (const u of todo) {
      try { pages.set(u, await get(u)); } catch (e) { console.warn("  !", e.message); failed.push(u); }
    }
    todo = failed;
  }
  if (todo.length) console.warn(`\n${todo.length} σελίδες δεν κατέβηκαν:\n  ` + todo.join("\n  "));
  for (const u of [...urls].sort()) {
    const html = pages.get(u);
    if (!html) continue;
    const d = parseProduct(html, u);
    if (DROP_SKU.has(d.sku)) { console.log(`   (διπλή σελίδα — παραλείπεται) ${d.title} ${u}`); continue; }
    d.title = RENAME_SKU[d.sku] || fixTitle(d.title);
    if (SUBTITLE_FIX[d.sku]) d.subtitle = SUBTITLE_FIX[d.sku];
    for (const k of Object.keys(d.tabs)) d.tabs[k] = LINE_FIX.reduce((t, [re, to]) => t.replace(re, to), d.tabs[k]);
    const gr = GREEK_TEXT[d.sku];
    if (gr) {
      d.subtitle = gr.subtitle; d.advantages = gr.advantages;
      d.tabs = { "Περιγραφή": gr["Περιγραφή"], "Χαρακτηριστικά": gr.advantages.map(a => "• " + a).join("\n") };
      if (gr["Σημειώσεις"]) d.tabs["Σημειώσεις"] = gr["Σημειώσεις"];
    }
    else d.advantages = d.advantages.map(a => LINE_FIX.reduce((t, [re, to]) => t.replace(re, to), "• " + a).replace(/^• /, ""));
    // περιγραφή-σύνοψη ξανά από τα διορθωμένα κείμενα
    d.description = ((d.tabs["Περιγραφή"] || "").split("\n").slice(0, 3).join(" ") || d.advantages.join(" ")).replace(/\s+/g, " ").trim();
    if (!d.title) { console.warn("  ! χωρίς τίτλο:", u); continue; }
    d.category = category.get(u) || null;
    d.section = section.get(u) || (NAME_SECTION.find(([, re]) => re.test(d.title)) || ["diafora"])[0];
    // Σετ/δώρα εκτός καταλόγου (πολιτική: μόνο βασικά προϊόντα)· τα απλά προϊόντα της «Σετ & δώρα» → ενότητα από το όνομα
    if (BUNDLE.test(d.title) && !BUNDLE_OK.test(d.title)) { console.log(`   (σετ/δώρο — εκτός καταλόγου) ${d.title}`); continue; }
    if (d.section === "sets") d.section = (NAME_SECTION.find(([k, re]) => k !== "sets" && re.test(d.title)) || ["diafora"])[0];
    const fix = SECTION_FIX.find(([, re]) => re.test(d.title)); if (fix) d.section = fix[0];
    if (d.category) d.attributes["Κατηγορία nuk.gr"] = d.category;
    out.push({ url: u, section: "p", name: d.title, description: d.description.slice(0, 700), longDescription: d.description, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`${String(d.images.length).padStart(2)} img ${d.section.padEnd(13)} ${d.gtin.padEnd(14)} | ${d.title}`);
  }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\n${out.length} προϊόντα → js/nuk-site.json`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
