#!/usr/bin/env node
// scripts/scrape-centrum.mjs
// Centrum (Haleon Hellas) = vitamins.centrum.gr — μία σελίδα (landing) με όλη την ελληνική γκάμα, χωρίς EAN.
// (Το haleonhealthpartner.com/el-gr ανακατευθύνει σε «service update», το haleon.com έχει bot challenge.)
// Κάθε προϊόν (samples/centrum-sample.html): <div class="pic"><img>, .iTitle (όνομα), .list <ul><li> (υπότιτλος, περιγραφή,
//   οφέλη, συσκευασία, δοσολογία), .prd-ref <p> (συσκευασία, δοσολογία, ΕΟΦ, υποσημειώσεις «*»), .item-type (ηλικία).
// Μεγέθη: «συσκευασία 30, 60 δισκίων και 20 αναβράζοντων» → variants με κλειδί ανά μέγεθος (CE-<slug><N>), ώστε κάθε
//   γραμμή του τιμοκαταλόγου να παίρνει τη δική της τιμή (manual matches → κλειδί).
// Κλειδί: "CE-<slug>". Τιμές με js/centrum-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-centrum.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/centrum-site.json");
const BASE = "https://vitamins.centrum.gr";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const oneLine = s => htmlToText(decodeAll(String(s || "").replace(/<br\s*\/?>/gi, " "))).replace(/\s+/g, " ").trim();
const lines = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n"))).split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
// Kids Gummies: δύο σελίδες με ίδιο λατινικό όνομα → slug από την εικόνα
const SLUG_FIX = [[/vatomouro/i, "kidsgummiesberry"], [/multifruit/i, "kidsgummiesmulti"]];
const FORM_OF = { "δισκίων": "δισκία", "δισκία": "δισκία", "αναβράζοντων": "αναβράζοντα δισκία" };

export function extractCentrumItems(html) {
  const out = [];
  const parts = html.split('<div class="pic">').slice(1);
  for (const raw of parts) {
    const blk = raw.slice(0, raw.indexOf('class="item-type"') + 400);
    const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
    d.title = oneLine((blk.match(/class="iTitle[^"]*">([\s\S]*?)<\/div>/) || [])[1] || "").replace(/^Centrum\s+/i, "Centrum ");
    if (!d.title) continue;
    const img = (blk.match(/<img src="([^"]+)"/) || [])[1];
    if (img) d.images.push(new URL(encodeURI(decodeURI(img)), BASE).href);
    d.imageLarge = d.images[0] || null;
    const age = oneLine((blk.match(/class="item-type">\s*<span>([\s\S]*?)<\/span>/) || [])[1] || "");
    if (age) { d.attributes["Ηλικία"] = age; d.keyFacts.push(age); }
    const els = [...blk.slice(0, blk.indexOf('class="item-type"')).matchAll(/<(li|p)[^>]*>([\s\S]*?)<\/\1>/g)].flatMap(m => lines(m[2]));
    const desc = [], ben = [], use = [], notes = [];
    for (const l of els) {
      if (/ΕΟΦ/.test(l)) { d.attributes["Γνωστοποίηση ΕΟΦ"] = (l.replace(/(\d)\s*-\s+(\d)/g, "$1-$2").match(/ΕΟΦ\s*:?\s*([0-9][0-9/\-.]*)/) || [])[1] || l; continue; }
      if (/^Διατίθεται σε/i.test(l) || (/^\d+\s+\S+/.test(l) && l.length < 45 && /(ζελεδάκια|δισκία|κάψουλες|φιαλίδια|φακελ)/i.test(l))) {
        const parts = l.split(/(?<=\.)\s+(?=Χρήση:)/);
        d.packaging = parts[0].replace(/^Διατίθεται σε\s*(συσκευασία\s*)?(που περιέχει\s*|των\s*)?/i, "").replace(/\.$/, "").trim();
        if (parts[1]) use.push(parts[1].replace(/^Χρήση:\s*/, ""));
        continue;
      }
      if (/^(Συνιστώμενη ημερήσια δόση|Χρήση:|Δοσολογία)/i.test(l)) { use.push(l.replace(/^Χρήση:\s*/, "").replace(/^Συνιστώμενη ημερήσια δόση:\s*/i, "")); continue; }
      if (/^\*/.test(l)) { notes.push(l); continue; }
      if (desc.length < 1 || (desc.length < 2 && /^Συμπλήρωμα διατροφής/i.test(l))) desc.push(l); else ben.push(l);
    }
    d.subtitle = desc[0] && desc[0].length <= 140 ? desc[0] : null;
    d.tabs["Περιγραφή"] = [...desc, ...notes].join("\n");
    if (ben.length) { d.advantages = ben; d.tabs["Οφέλη"] = ben.join("\n"); }
    if (use.length) d.tabs["Χρήση"] = use.join("\n");
    if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
    let slug = d.title.replace(/^Centrum\s+/i, "").replace(/:.*$/, "").replace(/\+/g, "plus").replace(/&/g, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    for (const [re, s] of SLUG_FIX) if (re.test(img || "")) slug = s;
    if (slug.length < 4) slug = "centrum" + slug;   // «Men» → centrummen (κλειδί ≥ 4 χαρακτήρες)
    d.handle = slug;
    // μεγέθη: «30, 60 δισκίων και 20 αναβράζοντων δισκίων», «των 30 και 60 δισκίων»
    const pk = d.packaging || "";
    const multi = [...pk.matchAll(/(\d+)(?=\s*(?:,|και|δισκίων|αναβράζοντων|μασώμενων))/g)].map(m => +m[1]);
    if (multi.length > 1) {
      const eff = (pk.match(/(\d+)\s+αναβράζοντ/) || [])[1];
      for (const n of multi) {
        const size = String(n) === eff ? `${n} αναβράζοντα δισκία` : `${n} δισκία`;
        d.variants.push({ ean: `CE-${slug}${n}${String(n) === eff ? "eff" : ""}`, size });
      }
      d.sizes = d.variants.map(v => v.size); d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", ");
    } else {
      d.size = pk.replace(/μασώμενων δισκίων/, "μασώμενα δισκία").replace(/^(\d+) δισκίων$/, "$1 δισκία") || null;
      d.sizes = d.size ? [d.size] : [];
      if (d.size) d.attributes["Συσκευασία"] = d.size;
    }
    d.size = d.size || d.sizes[0] || null;
    d.gtin = d.variants[0] ? d.variants[0].ean : `CE-${slug}`;
    d.eans = d.variants.length ? d.variants.map(v => v.ean) : [d.gtin];
    d.category = age || null; d.categories = age ? [age] : []; d.line = null;
    d.description = d.tabs["Περιγραφή"].replace(/\s+/g, " ").trim() || null;
    d.shortDescription = d.subtitle;
    out.push({ url: `${BASE}/#${slug}`, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
  }
  return out;
}

async function main() {
  const res = await fetch(BASE + "/", { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const out = extractCentrumItems(await res.text());
  for (const p of out) console.log(`${p.details.images.length ? "img+" : "img-"} ${Object.keys(p.details.tabs).length}tabs ${String(p.details.eans.length).padStart(2)}sz ${(p.details.size || "-").padEnd(28)} | ${p.name}`);
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
