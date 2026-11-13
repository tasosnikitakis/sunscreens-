// scripts/lib-vichy.mjs
// Σελίδα προϊόντος vichy.gr (πλατφόρμα L'Oréal / Sitecore + Vue, άλλο theme από larocheposay.gr).
// Πηγές (χαρτογραφημένες από samples/vichy-sample.html):
//   JSON-LD Product  { name, image, description (meta), sku, gtin13, additionalProperty[{name:"Ingredients", value}] }
//   JSON-LD BreadcrumbList (Αρχική › Προϊόντα › κατηγορία › υποκατηγορία › «Dercos Aminexil …» = πλήρης τίτλος)
//   JSON-LD HowTo (βήματα χρήσης / προφυλάξεις)
//   <h1> με τη σειρά σε προηγούμενο στοιχείο ("Dercos") και υπότιτλο στο επόμενο
//   <ul class="vchy-safety-wrap"><li class="vchy-safety-item"> claims (Υποαλλεργικό, Δερματολογικά ελεγμένο…)
//   <details class="vchy-details …"><summary><h2>Περιγραφή|Εφαρμογή…|Σύνθεση|Περιβαλλοντική Επίδραση</h2></summary><ul class="vchy-details__contents">…
//     (κείμενα με HTML named entities &Eta;&tau;… → decodeAll)
//   <details class="vchy-package-size-selector" data-ean="…"> μεγέθη (single-varient: <span class="text-small-em">6 ML</span>,
//     πολλαπλά: στοιχεία με data-ean + κείμενο μεγέθους)
//   <vch-media-gallery variant-media-items='{"<EAN>":[[{width,url}…]…]}'>  εικόνες ανά παραλλαγή (1073px)
//   <vch-image-carousel :images='[{src,alt}]'>  εικόνες της τρέχουσας παραλλαγής

import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const text = s => htmlToText(decodeAll(s)).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
const unesc = s => decodeAll(String(s || "")).replace(/\\u0026/g, "&");
const abs = (host, p) => !p ? null : /^https?:/i.test(p) ? p : `https://${host}${p.startsWith("/") ? "" : "/"}${p}`;
// Οι εικόνες έχουν crop/hash παραμέτρους· κρατάμε rev (cache) και πετάμε το crop ώστε να έρθει το πλήρες αρχείο
const cleanImg = u => { if (!u) return u; const [base, q] = u.split("?"); const rev = (q || "").split("&").find(x => x.startsWith("rev=")); return rev ? `${base}?${rev}` : base; };

function jsonLd(html) {
  const out = [];
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(b[1].trim()); (Array.isArray(j) ? j : [j]).forEach(x => out.push(x)); } catch {}
  }
  return out;
}
function attrJson(html, name) {
  const m = html.match(new RegExp(`\\s:?${name}=(?:'([^']*)'|"([^"]*)")`));
  if (!m) return null;
  try { return JSON.parse(unesc(m[1] ?? m[2])); } catch { return null; }
}
const sizeNorm = s => oneLine(s).replace(/\s+/g, "").toLowerCase().replace(/^(\d+)ml$/, "$1ml");

export function extractVichyDetails(html, url) {
  const host = (() => { try { return new URL(url).host; } catch { return "www.vichy.gr"; } })();
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [] };
  const lds = jsonLd(html);
  const prod = lds.find(n => n["@type"] === "Product") || {};
  const bc = lds.find(n => n["@type"] === "BreadcrumbList");
  const howto = lds.find(n => n["@type"] === "HowTo");

  // Τίτλος: <h1>, σειρά = τελευταίο κείμενο πριν το h1 (π.χ. "Dercos"), υπότιτλος = πρώτο κείμενο μετά
  const h1m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  d.title = h1m ? oneLine(h1m[1]) : oneLine(prod.name || "");
  if (h1m) {
    const before = html.slice(Math.max(0, h1m.index - 800), h1m.index).replace(/<script[\s\S]*?<\/script>/g, "");
    const texts = [...before.matchAll(/>([^<>]{2,60})</g)].map(m => oneLine(m[1])).filter(t => t && !/^\s*$/.test(t));
    const cand = texts.length ? texts[texts.length - 1] : "";
    if (cand && cand.length <= 40 && !/^(Αρχική|Προϊόντα|Selected|ΝΕΟ|NEW|Νέο|Best ?seller)/i.test(cand)) d.line = cand;
    const after = html.slice(h1m.index + h1m[0].length, h1m.index + h1m[0].length + 1200).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
    const sub = (after.match(/>([^<>]{6,200})</) || [])[1];
    if (sub && !/rating|κριτικ|αξιολογ/i.test(sub)) d.subtitle = oneLine(sub);
  }
  if (bc && Array.isArray(bc.itemListElement)) {
    d.breadcrumbs = bc.itemListElement.map(x => oneLine(x.name || "")).filter(Boolean);
    d.category = d.breadcrumbs.slice(2, -1).join(" › ") || null;       // χωρίς «Αρχική σελίδα › Προϊόντα» και το ίδιο το προϊόν
    const last = d.breadcrumbs[d.breadcrumbs.length - 1];
    if (last && last.length >= (d.title || "").length) d.fullTitle = last;   // «Dercos Aminexil Clinical 5 …» (με τη σειρά)
  }
  // Σειρά: ό,τι προηγείται του ονόματος του JSON-LD στον πλήρη τίτλο («Dercos» + «Aminexil Clinical 5 …»)
  const ldName = oneLine(prod.name || "");
  if (ldName && d.fullTitle && d.fullTitle.toLowerCase().endsWith(ldName.toLowerCase()) && d.fullTitle.length > ldName.length) d.line = d.fullTitle.slice(0, d.fullTitle.length - ldName.length).trim() || d.line;
  // Σειρά από το slug του URL όταν δεν προκύπτει αλλιώς (dercos-aminexil-… → Dercos)
  const LINES = { "dercos": "Dercos", "capital-soleil": "Capital Soleil", "ideal-soleil": "Idéal Soleil", "liftactiv": "Liftactiv", "mineral-89": "Minéral 89", "neovadiol": "Neovadiol", "normaderm": "Normaderm", "aqualia": "Aqualia Thermal", "dermablend": "Dermablend", "homme": "Vichy Homme", "deo": "Deo", "purete-thermale": "Pureté Thermale", "slow-age": "Slow Âge" };
  const slugL = (String(url).split("/").pop() || "").toLowerCase();
  const slugLine = Object.keys(LINES).find(k => slugL.startsWith(k + "-"));
  if ((!d.line || /^(ΝΕΟ|NEW|D[ée]odorant|Deodorant)$/i.test(d.line)) && slugLine) d.line = LINES[slugLine];
  if (d.line && /^D[ée]odorant$/i.test(d.line)) d.line = "Deo";
  if (d.fullTitle && d.line && !d.fullTitle.toLowerCase().includes(d.line.toLowerCase().replace(/^vichy\s+/, ""))) d.fullTitle = `${d.line} ${d.fullTitle}`;
  if (!d.fullTitle) d.fullTitle = d.line && d.title && !d.title.toLowerCase().startsWith(d.line.toLowerCase()) ? `${d.line} ${d.title}` : d.title;
  d.fullTitle = (d.fullTitle || "").replace(/\bSpf\b/g, "SPF").replace(/\bUv\b/g, "UV");

  // Μεγέθη / EAN
  const sel = html.match(/<details[^>]*vchy-package-size-selector[^>]*>([\s\S]*?)<\/details>/i);
  if (sel) {
    const block = sel[0];
    for (const m of block.matchAll(/data-ean="(\d{8,14})"[^>]*>([\s\S]*?)(?=data-ean=|<\/details>)/g)) {
      const ean = m[1].replace(/^0(?=\d{13}$)/, "");
      const sz = (m[2].match(/class="text-small-em"[^>]*>([^<]+)</) || m[2].match(/>\s*(\d+\s?(?:ml|g|gr|l|τμχ|x\s?\d+\s?ml)[^<]{0,20})</i) || [])[1];
      if (!d.variants.some(v => v.ean === ean)) d.variants.push({ ean, size: sz ? sizeNorm(sz) : null });
    }
  }
  // Πολλαπλά μεγέθη/αποχρώσεις: <vch-package-size-selector options='[{description:"200 ml", ean}]' default-option="200 ml">
  const opts = attrJson(html, "options");
  if (Array.isArray(opts)) for (const o of opts) {
    const ean = String(o.ean || "").replace(/\D/g, "").replace(/^0(?=\d{13}$)/, "");
    if (!ean) continue;
    const sz = o.description ? sizeNorm(o.description) : null;
    const v = d.variants.find(x => x.ean === ean);
    if (v) { if (!v.size && sz) v.size = sz; } else d.variants.push({ ean, size: sz });
  }
  const defOpt = (html.match(/\sdefault-option="([^"]+)"/) || [])[1];
  const media = attrJson(html, "variant-media-items") || {};
  for (const ean of Object.keys(media)) if (/^\d{8,14}$/.test(ean) && !d.variants.some(v => v.ean === ean)) d.variants.push({ ean, size: null });
  const ldG = String(prod.gtin13 || prod.sku || "").replace(/\D/g, "");
  const dataEan = (html.match(/data-ean="(\d{8,14})"/) || [])[1];
  d.gtin = (dataEan || ldG || (d.variants[0] || {}).ean || "").replace(/^0(?=\d{13}$)/, "") || null;
  if (!d.gtin) { const slug = String(url).replace(/\/+$/, "").split("/").pop() || ""; if (slug) d.gtin = "VCH-" + slug.replace(/[^A-Za-z0-9]/g, "").slice(0, 80); }
  d.eans = [...new Set([d.gtin, ...d.variants.map(v => v.ean)].filter(Boolean))];
  d.sizes = [...new Set(d.variants.map(v => v.size).filter(Boolean))];
  const cur = d.variants.find(v => v.ean === d.gtin) || (defOpt && d.variants.find(v => v.size === sizeNorm(defOpt))) || d.variants[0];
  if (cur && cur.ean && !dataEan && d.variants.length > 1) { d.gtin = cur.ean; d.eans = [...new Set([d.gtin, ...d.eans])]; }
  if (cur && cur.size) d.size = cur.size;
  if (d.sizes.length) d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", ");

  // Εικόνες: carousel της τρέχουσας παραλλαγής + 1073px ανά παραλλαγή από το gallery
  const carousel = attrJson(html, "images") || [];
  for (const im of carousel) { const u = abs(host, cleanImg(unesc(im.src))); if (u && !/video|\.mp4/i.test(u) && !d.images.includes(u)) d.images.push(u); }
  for (const [ean, groups] of Object.entries(media)) {
    const first = Array.isArray(groups) && Array.isArray(groups[0]) ? groups[0] : [];
    const big = first.find(x => String(x.width) === "1073") || first[0];
    if (big && big.url) { const u = abs(host, cleanImg(unesc(big.url))); const v = d.variants.find(x => x.ean === ean); if (v) v.packshot = u; if (u && !d.images.includes(u)) d.images.push(u); }
  }
  if (!d.images.length && prod.image) d.images.push(abs(host, cleanImg(String(prod.image))));
  d.imageLarge = (cur && cur.packshot) || d.images[0] || null;

  // Claims (Υποαλλεργικό κ.λπ.)
  for (const m of html.matchAll(/<li[^>]*class="[^"]*vchy-safety-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) { const t = oneLine(m[1].replace(/<svg[\s\S]*?<\/svg>/g, "")); if (t && !d.keyFacts.includes(t)) d.keyFacts.push(t); }

  // Accordions: Περιγραφή / Εφαρμογή & προφυλάξεις / Σύνθεση / Περιβαλλοντική Επίδραση
  for (const m of html.matchAll(/<details[^>]*class="[^"]*vchy-details[^"]*"[^>]*>([\s\S]*?)<\/details>/gi)) {
    const block = m[1];
    const head = oneLine((block.match(/<summary[\s\S]*?<\/summary>/i) || [""])[0].replace(/<svg[\s\S]*?<\/svg>/g, ""));
    const body = text(block.replace(/<summary[\s\S]*?<\/summary>/i, "").replace(/<svg[\s\S]*?<\/svg>/g, ""));
    if (!head || !body) continue;
    const key = /Περιγραφ/i.test(head) ? "Περιγραφή" : /Εφαρμογ|Χρήση|Πώς/i.test(head) ? "Χρήση" : /Σύνθεση|Συστατικ/i.test(head) ? "Συστατικά" : /Περιβαλλοντ/i.test(head) ? "Περιβαλλοντική επίδραση" : head;
    if (!d.tabs[key]) d.tabs[key] = body;
  }
  if (!d.tabs["Χρήση"] && howto && Array.isArray(howto.step)) {
    const steps = howto.step.map(s => oneLine(s.text || "")).filter(Boolean);
    if (steps.length) d.tabs["Χρήση"] = steps.length > 1 ? steps.map((s, i) => `Βήμα ${i + 1}: ${s}`).join("\n") : steps[0];
  }
  const ingr = (prod.additionalProperty || []).find(p => /ingredient/i.test(p.name || ""));
  if (ingr && ingr.value) { d.inci = oneLine(ingr.value); if (!d.tabs["Συστατικά"]) d.tabs["Συστατικά"] = "INCI: " + d.inci; else if (!d.tabs["Συστατικά"].includes(d.inci.slice(0, 40))) d.tabs["Συστατικά"] += "\nINCI: " + d.inci; }

  // Περιγραφή: accordion «Περιγραφή» (πλήρης), αλλιώς meta description του JSON-LD
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || oneLine(prod.description || "") || null;
  d.shortDescription = d.subtitle || (prod.description ? oneLine(prod.description) : null);
  d.advantages = [];
  if (d.line) d.attributes["Σειρά"] = d.line;
  if (d.category) d.attributes["Κατηγορία vichy.gr"] = d.category;
  if (d.keyFacts.length) d.attributes["Δερματολογικά"] = d.keyFacts.join(" · ");
  return d;
}

// Σελίδα προϊόντος = έχει JSON-LD Product με gtin13 ή τον επιλογέα μεγέθους
export const isVichyProductPage = html => /"@type"\s*:\s*"Product"/.test(html) && (/"gtin13"/.test(html) || /vchy-package-size-selector/.test(html));
