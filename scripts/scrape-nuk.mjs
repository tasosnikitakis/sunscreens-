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
  ["sets", /\bΣετ\b|Set\b|Δώρο/i], ["teats", /Θηλ(ή|ές)/i], ["soothers", /Πιπίλ/i], ["cups", /Cup|ποτηράκι|παγουράκι|Εκπαιδευτικό/i],
  ["bottles", /Μπιμπερό/i], ["breastfeeding", /Θήλαστρ|στήθους|θηλασ/i], ["teething", /Δακτύλι|οδοντ/i], ["electric", /Αποστειρωτ|Θερμαντ|Ενδοεπικοινων/i]
];

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
  // το nuk.gr κατά διαστήματα απαντά κενό σώμα (12 bytes) ή 302 → μία γρήγορη νέα προσπάθεια εδώ·
  // όσες αποτύχουν ξαναδοκιμάζονται σε επόμενους γύρους από τη main() (το crawl δεν «κολλάει» σε μία σελίδα).
  const BACKOFF = [0, 15000];
  let html, lastErr;
  for (let attempt = 0; attempt < BACKOFF.length && html === undefined; attempt++) {
    if (attempt) console.warn(`  … ${lastErr?.message} — αναμονή ${BACKOFF[attempt] / 1000}s`);
    await sleep(DELAY + BACKOFF[attempt]);
    try {
      // curl αντί για fetch: το fetch της Node μέσω proxy κόβεται συχνά σε αυτό το site
      const { stdout } = await execFileP("curl", ["-sS", "--fail", "--compressed", "--max-time", "60", "--max-redirs", "0",
        "-A", UA, "-H", "Accept-Language: el-GR,el;q=0.9", url], { maxBuffer: 64 << 20 });
      // περιορισμός ρυθμού: 302 με σώμα ~35 bytes → αποτυχία, όχι cache
      if (stdout.length < 2000) throw new Error(`περιορισμός ρυθμού (${stdout.length} bytes)`);
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
  let lines = strip(desc).split("\n").filter(l => !/^MAPA GmbH|^\*{0,3}$/.test(l));
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
  d.gtin = d.sku ? `NUK-${d.sku}` : `NUK-${url.replace(/^.*\/nuk-|\.html$/g, "").replace(/[^a-z0-9]/gi, "").slice(0, 40)}`;
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
    if (!d.title) { console.warn("  ! χωρίς τίτλο:", u); continue; }
    d.category = category.get(u) || null;
    d.section = section.get(u) || (NAME_SECTION.find(([, re]) => re.test(d.title)) || ["diafora"])[0];
    // Σετ/δώρα εκτός καταλόγου (πολιτική: μόνο βασικά προϊόντα)· τα απλά προϊόντα της «Σετ & δώρα» → ενότητα από το όνομα
    if (/\bΣετ\b|\bSet\b|Feeding Set|Δώρο|Gift/i.test(d.title)) { console.log(`   (σετ/δώρο — εκτός καταλόγου) ${d.title}`); continue; }
    if (d.section === "sets") d.section = (NAME_SECTION.find(([k, re]) => k !== "sets" && re.test(d.title)) || ["diafora"])[0];
    if (d.category) d.attributes["Κατηγορία nuk.gr"] = d.category;
    out.push({ url: u, section: "p", name: d.title, description: d.description.slice(0, 700), longDescription: d.description, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`${String(d.images.length).padStart(2)} img ${d.section.padEnd(13)} ${d.gtin.padEnd(14)} | ${d.title}`);
  }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\n${out.length} προϊόντα → js/nuk-site.json`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
