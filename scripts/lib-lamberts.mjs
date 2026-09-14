// scripts/lib-lamberts.mjs
// Δομή σελίδας προϊόντος lamberts.gr (WooCommerce, theme "flipnewmedia"),
// χαρτογραφημένη από samples/lamberts-vitamin-b12.html:
//
//   .breadcrumbs_wrap               Home / Προιόντα / Βιταμίνες / Βιταμίνες B / Vitamin B12 1000μg
//   .product_image .slider-for      <a href="…/uploads/…png" data-toggle="lightbox"> (εικόνες πλήρους ανάλυσης)
//   img.dietary-icon[alt]           Vegetarian / Vegan / Gluten Free / Dairy Free
//   h2.product_title                Vitamin B12 1000μg
//   h4.sub-title                    Υψηλής ισχύος Βιταμίνη Β12 για περιπτώσεις ανεπάρκειας…
//   .product_full_description       πρώτες παράγραφοι (ορατές)
//   span.hide-row.short-desc        υπόλοιπες παράγραφοι ("Διαβάστε περισσότερα") + κανονιστικά (ΕΟΦ)
//   .expandable-section             .expandable-header (Απόδοση & Συστατικά / Χρήση / Προφυλάξεις /
//                                   Μορφή & Συσκευασία) + .expandable-content (κείμενο ή πίνακας)
//   table.shop_attributes           (κενός)
//   #sxetika-prod                   "Σχετικά Προϊόντα" — ό,τι ακολουθεί ΔΕΝ αφορά το προϊόν

import { decodeHtml, htmlToText, innerOfClass, balancedInner } from "./lib-frezyderm.mjs";

const oneLine = s => htmlToText(s).replace(/\s+/g, " ").trim();

const DIETARY_LABEL = {
  "vegetarian": "Κατάλληλο για χορτοφάγους",
  "vegan": "Vegan",
  "gluten free": "Χωρίς γλουτένη",
  "dairy free": "Χωρίς γαλακτοκομικά",
  "lactose free": "Χωρίς λακτόζη",
  "soy free": "Χωρίς σόγια",
  "sugar free": "Χωρίς ζάχαρη",
  "non gmo": "Χωρίς ΓΤΟ",
  "yeast free": "Χωρίς μαγιά",
  "halal": "Halal",
  "kosher": "Kosher"
};

// Κανονιστικές γραμμές στο τέλος της περιγραφής — φεύγουν από το κείμενο
// (ο αριθμός ΕΟΦ κρατιέται ως στοιχείο).
const REGULATORY_LINE = [
  /^\*+\s*ΚΑΝ\.?\s*Ε\.?Ε\.?/i,
  /Αριθμ[όο]ς Γνωστοπο[ίι]ησης/i,
  /δεν υπ[όο]κειται σε διαδικασ[ίι]α αδειοδ[όο]τησης/i,
  /^\*+\s*$/,
  /^(Λιγ[όο]τερα|Διαβ[άα]στε περισσ[όο]τερα|Read (more|less))$/i   // κείμενο των links "Διαβάστε περισσότερα / Λιγότερα"
];

// Πίνακας → γραμμές "κελί | κελί | κελί" (τα <p> μέσα στα κελιά δεν σπάνε γραμμή)
function tableAwareText(html) {
  const prepared = html.replace(/<table[\s\S]*?<\/table>/gi, tbl =>
    tbl.replace(/<\/?p[^>]*>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<\/t[dh]>/gi, " | ").replace(/<\/tr>/gi, "\n")
  );
  return htmlToText(prepared)
    .split("\n").map(l => l.replace(/\s*\|\s*$/, "").replace(/\s*\|\s*/g, " | ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export function extractLambertsDetails(rawHtml) {
  const html = String(rawHtml || "").replace(/<!--[\s\S]*?-->/g, "");
  const main = html.split(/id=["']sxetika-prod["']/)[0];
  const d = {};

  const t = main.match(/<h2[^>]*class=["'][^"']*\bproduct_title\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i);
  if (t) d.title = oneLine(t[1]);
  const st = main.match(/<h4[^>]*class=["'][^"']*\bsub-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i);
  if (st) d.subtitle = oneLine(st[1]);

  // Πλήρης περιγραφή: ορατές παράγραφοι + "Διαβάστε περισσότερα"
  const full = innerOfClass(main, "product_full_description");
  const more = innerOfClass(main, "short-desc", "span");
  const attributes = {};
  const kept = [];
  for (const raw of [full, more].filter(Boolean).map(htmlToText).join("\n\n").split("\n")) {
    const s = raw.trim();
    if (!s) { kept.push(""); continue; }
    const eof = s.match(/Αρ\.?\s*Πρωτ\.?\s*Γνωστ\.?\s*ΕΟΦ\s*:?\s*([0-9][0-9\/.\-]*)/i);
    if (eof) { attributes["Αρ. Γνωστ. ΕΟΦ"] = eof[1]; continue; }
    if (REGULATORY_LINE.some(re => re.test(s))) continue;
    kept.push(s);
  }
  const description = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (description) d.description = description;

  // Expandable sections
  d.tabs = {};
  const hdr = /<div[^>]*class=["'][^"']*\bexpandable-header\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*\bexpandable-content\b[^"']*["'][^>]*>/gi;
  for (const m of main.matchAll(hdr)) {
    const title = oneLine(m[1].replace(/<span[\s\S]*?<\/span>/gi, "")).replace(/\s*\+\s*$/, "");
    const inner = balancedInner(main, m.index + m[0].length);
    const text = inner ? tableAwareText(inner) : "";
    if (title && text) d.tabs[title] = text;
  }
  for (const k of Object.keys(d.tabs)) {
    if (/Μορφ[ήη]\s*&\s*Συσκευασ[ίι]α|Form\s*&\s*Packaging/i.test(k)) { d.size = d.tabs[k].replace(/\s+/g, " ").trim(); delete d.tabs[k]; }
  }

  // Εικονίδια διατροφής → ιδιότητες
  const facts = [];
  for (const m of main.matchAll(/<img[^>]*\bdietary-icon\b[^>]*>/gi)) {
    const alt = (m[0].match(/alt=["']([^"']+)["']/i) || [])[1];
    if (!alt) continue;
    const label = DIETARY_LABEL[alt.trim().toLowerCase()] || alt.trim();
    if (!facts.includes(label)) facts.push(label);
  }
  if (facts.length) d.keyFacts = facts;

  // Breadcrumb → κατηγορία (χωρίς Home / Προϊόντα / το ίδιο το προϊόν)
  const bc = main.match(/breadcrumbs_wrap["'][^>]*>([\s\S]*?)<\/div>/i);
  if (bc) {
    const parts = oneLine(bc[1]).split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean)
      .filter(s => !/^(home|αρχική|προ[ιϊ][όο]ντα|products)$/i.test(s));
    if (parts.length > 1) parts.pop();          // το τελευταίο είναι το προϊόν
    if (parts.length) d.category = parts.join(" › ");
  }

  // Εικόνες πλήρους ανάλυσης (lightbox)
  const images = [...main.matchAll(/<a[^>]*href=["']([^"']+\/wp-content\/uploads\/[^"']+)["'][^>]*data-toggle=["']lightbox["']/gi)].map(m => decodeHtml(m[1]));
  if (images.length) { d.images = [...new Set(images)]; d.imageLarge = d.images[0]; }

  if (Object.keys(attributes).length) d.attributes = attributes;
  return d;
}
