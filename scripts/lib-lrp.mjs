// scripts/lib-lrp.mjs
// Σελίδα προϊόντος larocheposay.gr (πλατφόρμα L'Oréal / Sitecore + Vue).
// Τα δεδομένα δεν είναι σε JSON-LD Product αλλά σε HTML-escaped JSON μέσα σε
// attributes Vue components (χαρτογραφημένο από samples/lrp-sample.html):
//   <product-description-head pfd-title="…" pfd-description="…" product-id="CA024786">
//   <product-description :recommendation-list='["<strong>Προστατεύει…</strong> …", …]'   οφέλη (bullets)
//                        :volumes-detail='[{size,variantEANId,packshot}]'            μεγέθη/EAN/packshot ανά παραλλαγή
//   <product-viewer-v2 :product-packshots='[{"0":thumb,"1024":large,alt}]'          εικόνες
//   <how-to-apply :label-data='{"LabelDetails":[{LabelTitle,LabelDescription}]}'     χρήση (ΠΟΣΟΤΗΤΑ/ΠΟΤΕ/ΠΟΥ/…)
//   <… :key-ingredients-array='[{Title,Description}]' other-ingredient="AQUA / WATER • …">  συστατικά + INCI
//   JSON-LD BreadcrumbList (σειρά), HowTo (βήματα χρήσης)· <title> "Όνομα | La Roche-Posay"
// Τα κείμενα έχουν HTML named entities (&Epsilon;…) και <strong> → καθαρίζονται.

import { htmlToText } from "./lib-frezyderm.mjs";

const GREEK = { Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε", Zeta: "Ζ", Eta: "Η", Theta: "Θ", Iota: "Ι", Kappa: "Κ", Lambda: "Λ", Mu: "Μ", Nu: "Ν", Xi: "Ξ", Omicron: "Ο", Pi: "Π", Rho: "Ρ", Sigma: "Σ", Tau: "Τ", Upsilon: "Υ", Phi: "Φ", Chi: "Χ", Psi: "Ψ", Omega: "Ω",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ", sigmaf: "ς", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  bull: "•", reg: "®", trade: "™", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", deg: "°", euro: "€", nbsp: " ", quot: "\"", apos: "'", lt: "<", gt: ">", amp: "&" };

// Αποκωδικοποίηση entities (και διπλά κωδικοποιημένων: &amp;Epsilon;)
export function decodeAll(s) {
  let out = String(s || "");
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([A-Za-z]+);/g, (m, n) => GREEK[n] ?? m);
    if (out === prev) break;
  }
  return out;
}
const text = s => htmlToText(decodeAll(s)).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();

// Τιμή attribute (με ή χωρίς ':'), HTML-unescaped. JSON attributes → JSON.parse.
function attr(html, name, nth = 0) {
  const re = new RegExp(`\\s:?${name.replace(/[-]/g, "\\-")}=(?:"([^"]*)"|'([^']*)')`, "g");
  const ms = [...html.matchAll(re)];
  const m = ms[nth];
  return m ? decodeAll(m[1] ?? m[2]) : null;
}
function jsonAttr(html, name, nth = 0) {
  const v = attr(html, name, nth);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}
function jsonLd(html) {
  const out = [];
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(b[1].trim()); (Array.isArray(j) ? j : [j]).forEach(x => out.push(x)); } catch {}
  }
  return out;
}
const abs = (host, p) => !p ? null : /^https?:/i.test(p) ? p : `https://${host}${p.startsWith("/") ? "" : "/"}${p}`;
// Το packshot path έχει crop παραμέτρους (?cx=…&cw=600) → το "1024" είναι χωρίς crop
const cleanImg = u => u ? u.replace(/\?.*$/, "") : u;

export function extractLrpDetails(html, url) {
  const host = (() => { try { return new URL(url).host; } catch { return "www.larocheposay.gr"; } })();
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [] };

  // Τίτλος: <title> "Effaclar Duo (+) Spf 30 Κρέμα Για Σημάδια Ακμής | La Roche-Posay"
  const tt = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (tt) {
    const t = oneLine(tt[1]).replace(/\s*\|\s*La Roche[- ]Posay.*$/i, "").replace(/\bSpf\b/g, "SPF").replace(/\bUv\b/g, "UV").trim();
    if (t) d.fullTitle = t;
  }
  const pfdTitle = attr(html, "pfd-title");
  if (pfdTitle) d.title = oneLine(pfdTitle);
  const pfd = attr(html, "pfd-description");
  if (pfd) d.shortDescription = oneLine(pfd);
  d.productId = attr(html, "product-id") || null;

  // Σειρά / breadcrumbs
  for (const n of jsonLd(html)) {
    if (n["@type"] === "BreadcrumbList") {
      d.breadcrumbs = (n.itemListElement || []).map(x => oneLine(x.name || "")).filter(Boolean);
      if (d.breadcrumbs.length >= 2) d.line = d.breadcrumbs[1];
      d.category = d.breadcrumbs.slice(1, -1).join(" › ") || null;
    }
    if (n["@type"] === "HowTo" && Array.isArray(n.step)) d.howToSteps = n.step.map(s => oneLine(s.text || "")).filter(Boolean);
  }

  // Παραλλαγές (μεγέθη) με EAN + packshot
  const vols = jsonAttr(html, "volumes-detail") || jsonAttr(html, "variant-detail") || [];
  d.variants = vols.map(v => ({ ean: String(v.variantEANId || v.ean || "").replace(/\D/g, "") || null, size: oneLine(v.size || "").replace(/\s+/g, "") || null, packshot: abs(host, cleanImg(v.packshot)), checked: !!v.checked })).filter(v => v.ean);
  const upc = jsonAttr(html, "upc-list") || [];
  const init = jsonAttr(html, "initial-data");
  d.gtin = (init && String(init.DefaultEAN || "").replace(/\D/g, "")) || (d.variants.find(v => v.checked) || d.variants[0] || {}).ean || (upc[0] ? String(upc[0]).replace(/\D/g, "") : null) || null;
  // Νέα προϊόντα χωρίς EAN στο site: κλειδί από το Sitecore product-id ("LRP-CA024786"), ώστε να μπαίνουν στον κατάλογο
  if (!d.gtin) { const slug = String(url).replace(/\/+$/, "").split("/").pop() || d.productId || ""; if (slug) d.gtin = "LRP-" + slug.replace(/[^A-Za-z0-9]/g, "").slice(0, 80); }
  d.eans = [...new Set([d.gtin, ...d.variants.map(v => v.ean), ...upc.map(x => String(x).replace(/\D/g, ""))].filter(Boolean))];
  d.sizes = [...new Set(d.variants.map(v => v.size).filter(Boolean))];
  const cur = d.variants.find(v => v.checked) || d.variants[0];
  if (cur && cur.size) d.size = cur.size;
  if (d.sizes.length) d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", ");

  // Εικόνες
  const packs = jsonAttr(html, "product-packshots") || [];
  for (const p of packs) { const u = abs(host, cleanImg(p["1024"] || p["0"])); if (u && !d.images.includes(u)) d.images.push(u); }
  for (const v of d.variants) if (v.packshot && !d.images.includes(v.packshot)) d.images.push(v.packshot);
  d.imageLarge = (cur && cur.packshot) || d.images[0] || null;

  // Οφέλη (bullets) → highlights + ενότητα "Οφέλη"
  const rec = jsonAttr(html, "recommendation-list") || [];
  d.advantages = rec.map(x => oneLine(x)).filter(Boolean);
  const recTitle = attr(html, "recommendation-title");
  if (d.advantages.length) d.tabs["Οφέλη"] = (recTitle ? oneLine(recTitle) + ":\n" : "") + d.advantages.map(b => "• " + b).join("\n");

  // Χρήση: how-to-apply labels (ΠΟΣΟΤΗΤΑ/ΠΟΤΕ/ΠΟΥ/ΣΥΜΒΟΥΛΗ) ή βήματα HowTo
  const lab = jsonAttr(html, "label-data");
  const labels = (lab && lab.LabelDetails) || [];
  const useLines = labels.map(l => { const t = oneLine(l.LabelTitle || ""), v = oneLine(l.LabelDescription || ""); return v ? (t ? `${t}: ${v}` : v) : null; }).filter(Boolean);
  if (!useLines.length && d.howToSteps) useLines.push(...d.howToSteps.map((s, i) => `Βήμα ${i + 1}: ${s}`));
  if (useLines.length) d.tabs["Χρήση"] = useLines.join("\n");

  // Συστατικά: βασικά (Title + Description) + INCI
  const keys = jsonAttr(html, "key-ingredients-array") || [];
  const keyLines = keys.map(k => { const t = oneLine(k.Title || ""), v = oneLine(k.Description || ""); return t ? (v ? `${t}: ${v}` : t) : null; }).filter(Boolean);
  const inci = attr(html, "other-ingredient");
  if (inci) d.inci = oneLine(inci).replace(/\s*•\s*/g, " • ").replace(/\s*\.\s*$/, "");
  const ingr = [...keyLines, d.inci ? "INCI: " + d.inci : null].filter(Boolean);
  if (ingr.length) d.tabs["Συστατικά"] = ingr.join("\n");
  if (keyLines.length) d.keyIngredients = keys.map(k => oneLine(k.Title || "")).filter(Boolean);

  // Περιγραφή: σύντομη περιγραφή + οφέλη (το site δεν έχει ξεχωριστό μεγάλο κείμενο)
  const descParts = [d.shortDescription, ...d.advantages].filter(Boolean);
  d.description = descParts.join(" ").replace(/\s+/g, " ").trim() || null;
  d.subtitle = d.shortDescription || null;
  if (d.line) d.attributes["Σειρά"] = d.line;
  if (d.keyIngredients && d.keyIngredients.length) d.attributes["Βασικά συστατικά"] = d.keyIngredients.join(", ");
  return d;
}

// Σελίδα προϊόντος = έχει το component της περιγραφής
export const isLrpProductPage = html => /<product-description-head\b/i.test(html);
