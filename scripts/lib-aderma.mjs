// scripts/lib-aderma.mjs
// Δομή σελίδας προϊόντος aderma.gr / ducray.com (Pierre Fabre "Elea" template — ίδιο για όλα τα brands του ομίλου),
// χαρτογραφημένη από samples/aderma-sample.html:
//
//   p.c-product__range                  EXOMEGA ALLERGO                      (σειρά)
//   h1.c-product__title                 EXOMEGA ALLERGO Αποστειρωμένο Μαλακτικό βάλσαμο
//   p.u-text-color--highlight > span    "Θρέφει - Καταπραΰνει από τον κνησμό*" (υπότιτλος-claims)
//   data-tracking item_id / socialez-product-id   GTIN (14ψήφιο με 0 μπροστά / 13ψήφιο)
//   p.u-body-m-caption (πρώτο στο infos)  σύντομη περιγραφή
//   li.c-product__advantage             πλεονεκτήματα (bullets)
//   input[name=variant_volume] + label  μεγέθη (200ml / 40ml), checked = τρέχον
//   p.c-product__key-feature            Μπορεί να χρησιμοποιηθεί για / Τμήμα για το Σώμα / Τύπος δέρματος / Ανάγκες / Χώρα παρασκευής
//   #product-information-content .c-rich-text-editor   πλήρης περιγραφή
//     + h3 "Οφέλη" / "Οφέλη της υφής" / "Άρωμα της σύνθεσης" με <p>
//   div.c-product__application          h3 "Συχνότητα χρήσης" / "Βήμα 1…" + p
//   h2 "Συστατικά": c-card-article (βασικά συστατικά) + accordion "Αναλυτική σύνθεση" (INCI)
//   εικόνες: media-pierre-fabre.wedia-group.com/…/pf_square/<id>?t=resize&width=800&height=800
//   breadcrumbs: c-breadcrumb (Αρχική › κατηγορία › υποκατηγορία › προϊόν)

import { decodeHtml, htmlToText, innerOfClass, balancedInner } from "./lib-frezyderm.mjs";

// Το template γράφει μέρος των επικεφαλίδων με named entities (&alpha;&nu;…) που
// ο γενικός decodeHtml δεν ξέρει — αποκωδικοποιούμε πριν από κάθε εξαγωγή κειμένου.
const GREEK_ENTITIES = { Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε", Zeta: "Ζ", Eta: "Η", Theta: "Θ", Iota: "Ι", Kappa: "Κ", Lambda: "Λ", Mu: "Μ", Nu: "Ν", Xi: "Ξ", Omicron: "Ο", Pi: "Π", Rho: "Ρ", Sigma: "Σ", Tau: "Τ", Upsilon: "Υ", Phi: "Φ", Chi: "Χ", Psi: "Ψ", Omega: "Ω",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ", sigmaf: "ς", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  reg: "®", trade: "™", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", deg: "°", euro: "€", nbsp: " " };
const decodeNamed = s => String(s || "").replace(/&([A-Za-z]+);/g, (m, n) => GREEK_ENTITIES[n] ?? m);
const text = s => htmlToText(decodeNamed(s));
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
const gtin13 = g => { const d = String(g || "").replace(/\D/g, ""); return d.length === 14 && d[0] === "0" ? d.slice(1) : (d.length === 13 ? d : null); };

// Footnotes ("* Κατατεθειμένη ευρεσιτεχνία", "** Δοκιμή ex-vivo") και περιβαλλοντικά
// boilerplate που μπαίνουν μέσα στα κείμενα του template.
const DROP = [
  /^\*{1,3}\s*\S/, /^Πληροφορίες για vegan/i, /^Συσκευασία που/i, /^(Μη )?ανακυκλώσιμη συσκευασία/i,
  /^Υφή$/i, /^Περιβάλλον$/i, /^Playing YouTube/i, /^You have rejected/i,
  /^["'«»\s.\/|·-]*$/                                                  // γραμμές μόνο με εισαγωγικά/σημεία στίξης
];
function cleanText(t) {
  return String(t || "").split("\n").map(l => l.trim()).filter(l => !DROP.some(re => re.test(l)))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractAdermaDetails(rawHtml, url = "") {
  const html = String(rawHtml || "").replace(/<!--[\s\S]*?-->/g, "");
  const d = { attributes: {}, tabs: {}, keyFacts: [] };

  const range = html.match(/<p[^>]*class="[^"]*\bc-product__range\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  if (range) d.line = oneLine(range[1]);
  const t = html.match(/<h1[^>]*class="[^"]*\bc-product__title\b[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (t) d.title = oneLine(t[1]);

  // Το klorane.com βάζει στην ίδια κλάση και badges προϊόντος («Μόνιμος», «Συλλέκτης») — τα αγνοούμε.
  const BADGE = /^(Μόνιμος|Μόνιμο|Συλλέκτης|Νέο|Νέα|New|Nouveau|Permanent|Collector|Édition limitée|Limited edition|Best seller|Bestseller)$/i;
  const hl = [...html.matchAll(/<p[^>]*class="[^"]*u-text-color--highlight[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)].find(m => { const t = oneLine(m[1]).replace(/\*+/g, "").trim(); return t && !BADGE.test(t); });
  if (hl) {
    const raw = oneLine(hl[1]).replace(/\*+/g, "").trim();
    // το <p> επαναλαμβάνει τα ίδια spans (desktop/mobile) → κρατάμε κάθε φράση μία φορά· badges εκτός
    const BADGE_WORD = /^(Μόνιμος|Μόνιμο|Συλλέκτης|Νέο|Νέα|New|Nouveau|Permanent|Collector)\s+/i;
    const parts = [...new Set(raw.replace(BADGE_WORD, "").split(/\s+-\s+/).map(x => x.trim().replace(BADGE_WORD, "")).filter(x => x.length > 2 && !BADGE.test(x)))];
    d.subtitle = parts.join(" - ");
    d.keyFacts.push(...parts);
  }

  // GTIN: πρώτα από το URL (η σελίδα περιέχει item_id και για cross-sell προϊόντα)
  const id = url.match(/-(\d{13})-[a-z0-9]+\/?$/i) || html.match(/"item_id"\s*:\s*"(\d{13,14})"/) || html.match(/socialez-product-id="(\d{13,14})"/);
  if (id) d.gtin = gtin13(id[1]);
  // <title> = "KERACNYL PP+ Καταπραϋντική κρέμα κατά των ατελειών | Ducray" — πλήρες όνομα
  // (σειρά + προϊόν), ενώ το h1 μπορεί να είναι μόνο "Κρέμα κατά των ατελειών".
  const tt = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (tt) { const ft = oneLine(tt[1]).replace(/\s*[|–-]\s*(Ducray|A-?Derma|Avène|Klorane|René Furterer|Pierre Fabre)\s*$/i, "").trim(); if (ft) d.fullTitle = ft; }

  const infos = innerOfClass(html, "c-product__infos") || html;
  const short = infos.match(/<p[^>]*class="[^"]*u-body-m-caption[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  if (short) d.shortDescription = cleanText(text(short[1]));
  d.advantages = [...infos.matchAll(/<li[^>]*class="[^"]*\bc-product__advantage\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)].map(m => cleanText(htmlToText(m[1]))).filter(Boolean);

  // Μεγέθη: labels των radios variant_volume ("200ml", "40ml"), checked = η τρέχουσα σελίδα
  const sizes = [];
  for (const m of html.matchAll(/<input[^>]*name="variant_volume"[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi)) {
    const checked = /\schecked\b/.test(m[0].slice(0, m[0].indexOf(">")));
    const label = oneLine(m[2].replace(/<span[^>]*u-hidden-visually[^>]*>[\s\S]*?<\/span>/gi, ""));
    if (label) sizes.push({ label, checked });
  }
  if (sizes.length) { d.sizes = sizes.map(s => s.label); d.size = (sizes.find(s => s.checked) || sizes[0]).label; if (sizes.length > 1) d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", "); }
  const packaging = html.match(/<p[^>]*class="[^"]*u-body-xs-regular[^"]*"[^>]*aria-hidden="true"[^>]*>([\s\S]*?)<\/p>/i);
  if (packaging) { const p = oneLine(packaging[1]); if (p && !/^\d/.test(p)) d.attributes["Μορφή"] = p; }

  // Βασικά χαρακτηριστικά (key features)
  for (const m of html.matchAll(/<p[^>]*class="[^"]*\bc-product__key-feature\b[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)) {
    const title = (m[1].match(/key-feature-title[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
    const value = (m[1].match(/key-feature-value[^>]*>([\s\S]*?)<\/span>/i) || [])[1];
    if (!title) continue;
    let k = oneLine(title), v = value ? oneLine(value) : "";
    const country = k.match(/^Χώρα παρασκευής\s+(.+)$/i);
    if (country && !v) { k = "Χώρα παρασκευής"; v = country[1]; }
    if (k && v) d.attributes[k] = v;
  }

  // Πλήρης περιγραφή + ενότητες οφελών
  const info = innerOfClass(html, "c-product__information-wrapper");
  if (info) {
    const rich = innerOfClass(info, "c-rich-text-editor");
    if (rich) d.description = cleanText(text(rich));
    const parts = info.split(/(?=<h3\b)/i);
    for (const part of parts) {
      const h = part.match(/^<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
      if (!h) continue;
      const title = oneLine(h[1]);
      const body = cleanText(text(part.slice(h[0].length)));
      if (title && body && !/[;?]$/.test(title)) d.tabs[title] = body;
    }
  }

  // Εφαρμογή: Συχνότητα χρήσης + Βήματα → μία ενότητα "Χρήση"
  const steps = [];
  for (const m of html.matchAll(/<div[^>]*class="[^"]*\bc-product__application\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const title = (m[1].match(/application-title[^>]*>([\s\S]*?)<\/h3>/i) || [])[1];
    const body = (m[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1];
    if (title && body) steps.push(`${oneLine(title)}: ${oneLine(body)}`);
  }
  if (steps.length) d.tabs["Χρήση"] = steps.join("\n");

  // Συστατικά: κάρτες βασικών συστατικών + INCI ("Αναλυτική σύνθεση") από accordion
  const ingredients = [];
  const compo = innerOfClass(html, "c-composition__ingredients") || "";
  for (const m of compo.matchAll(/<div[^>]*class="[^"]*\bc-card-article\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi)) {
    const title = (m[1].match(/c-card-article__title[^>]*>([\s\S]*?)<\/h3>/i) || [])[1];
    const text = (m[1].match(/c-card-article__text[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
    if (title) ingredients.push(oneLine(title) + (text ? ` — ${oneLine(text)}` : ""));
  }
  const accordions = {};
  for (const m of html.matchAll(/<button[^>]*c-accordion__trigger[^>]*>([\s\S]*?)<\/button>/gi)) {
    const title = oneLine(m[1].replace(/<span[^>]*c-accordion__trigger-icon[\s\S]*?<\/span>/gi, ""));
    const after = html.slice(m.index + m[0].length);
    const panel = after.match(/<div[^>]*c-accordion__panel\b[^>]*>/i);
    if (!panel) continue;
    const inner = balancedInner(after, panel.index + panel[0].length);
    if (title && inner) accordions[title] = cleanText(text(inner));
  }
  const inci = Object.entries(accordions).find(([k]) => /Αναλυτική σύνθεση|INCI|Ingredients/i.test(k));
  if (inci && inci[1]) d.inci = inci[1].replace(/\s+/g, " ").replace(/\s*Συνιστάται στον καταναλωτή.*$/i, "").trim();
  if (ingredients.length || d.inci) d.tabs["Συστατικά"] = [...ingredients, d.inci ? `INCI: ${d.inci}` : ""].filter(Boolean).join("\n");
  // Μικρές επικεφαλίδες του composition block ("0% συντηρητικά", "Βέλτιστη ανοχή") = claims
  for (const [k] of Object.entries(accordions)) if (k.length <= 40 && !/[;?]$/.test(k) && !/Αναλυτική σύνθεση|Rhealba/i.test(k) && !d.keyFacts.includes(k)) d.keyFacts.push(k);

  // Breadcrumbs → κατηγορία
  const bc = innerOfClass(html, "c-breadcrumb");
  if (bc) {
    const items = [...bc.matchAll(/<(?:a|span)[^>]*class="[^"]*c-breadcrumb__(?:link|text)[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span)>/gi)].map(m => oneLine(m[1])).filter(Boolean);
    d.breadcrumbs = items;
    const mid = items.slice(1, -1).filter(s => !/^Σειρές προϊόντων$/i.test(s));
    if (mid.length) d.category = mid.join(" › ");
  }

  // Εικόνες: pf_square 800×800 (packshots), με σειρά εμφάνισης στη gallery
  const seen = new Set(), images = [];
  for (const m of html.matchAll(/https:\/\/media-pierre-fabre\.wedia-group\.com\/api\/wedia\/dam\/transform\/([a-z0-9]+)\/pf_square\/[^"'\s]+/gi)) {
    const id = m[1]; if (seen.has(id)) continue; seen.add(id);
    images.push(`https://media-pierre-fabre.wedia-group.com/api/wedia/dam/transform/${id}/pf_square/${id}?t=resize&width=800&height=800`);
  }
  if (images.length) { d.images = images; d.imageLarge = images[0]; }
  return d;
}

// Το ίδιο template χρησιμοποιούν όλα τα brands της Pierre Fabre (Ducray, Avène, Klorane…).
export const extractPierreFabreDetails = extractAdermaDetails;
