// scripts/lib-beiersdorf.mjs
// Σελίδα προϊόντος των sites της Beiersdorf (πλατφόρμα NiveaX / Sitecore: liposan.gr, nivea.gr, eucerin.gr, hansaplast…).
// Χαρτογράφηση από samples/liposan-sample.html:
//   URL: /products/<slug>-<article id 17 ψηφίων>.html — τα 13 πρώτα ψηφία του article id είναι το EAN-13
//        (40060000805740044 → 4006000080574, έγκυρο check digit)
//   <h1 class="nx-product-stage__headline">, JSON-LD BreadcrumbList (Προϊόντα › σειρά › υποκατηγορία › προϊόν),
//   <section data-test="productStage" data-subcategory="…">
//   Επιλογέας παραλλαγών: <nav class="nx-pas__navigation"> <a href="/products/…-<article>.html" class="nx-pas__list-item [--active]">
//        <div class="nx-pas__attribute nx-pas__attribute--size|--spf|--color" data-text="4.80 g">
//   Gallery: .nx-product-stage__slider <img src='https://img.nivea.com/…png'>  (χωρίς ?mw= = πλήρες μέγεθος)
//   Οφέλη: <h5 class="nx-benefit__label">…</h5>  (icons + labels)
//   Περιγραφή: .nx-product-information__description, προειδοποίηση .nx-warning-text__description,
//        <p class="nx-product-information__article-number">Αριθμός αντικειμένου 85040 (…)</p>
//   Ειδικά συστατικά: section data-test="specialIngredients" (.nx-special-ingredient__headline)
//   Συστατικά: <p class="nx-ingredients__section"><strong>Δεν περιλαμβάνει</strong> … / <strong>Περιλαμβάνεται:</strong> INCI
//   Λοιπές ενότητες: <section … data-anchor-text="…"> (π.χ. Χρήση) → tabs με τον τίτλο της ενότητας
//   <meta name="description"> → σύντομη περιγραφή

import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const text = s => htmlToText(decodeAll(s)).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
const stripSvg = s => String(s || "").replace(/<svg[\s\S]*?<\/svg>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
const abs = (host, p) => !p ? null : /^https?:/i.test(p) ? p : `https://${host}${p.startsWith("/") ? "" : "/"}${p}`;
const baseImg = u => String(u || "").replace(/&amp;/g, "&").split("?")[0];

// EAN από article id (17 ψηφία: EAN-13 + 4) — έλεγχος check digit
export function eanFromArticle(id) {
  const d = String(id || "").replace(/\D/g, "");
  if (d.length < 13) return null;
  const e = d.slice(0, 13);
  let s = 0; for (let i = 0; i < 12; i++) s += (+e[i]) * (i % 2 === 0 ? 1 : 3);
  return ((10 - s % 10) % 10) === +e[12] ? e : null;
}
const articleFromUrl = u => (String(u || "").match(/-(\d{14,20})\.html/) || [])[1] || null;
const sizeNorm = s => oneLine(s).replace(/\s+/g, "").toLowerCase().replace(/^(\d+(?:[.,]\d+)?)(ml|g|gr|l)$/, (m, n, un) => n.replace(",", ".").replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") + un.replace("gr", "g"));

function jsonLd(html) {
  const out = [];
  for (const b of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(b[1].trim()); (Array.isArray(j) ? j : [j]).forEach(x => out.push(x)); } catch {}
  }
  return out;
}
function sectionsByAnchor(html) {
  const out = [];
  for (const m of html.matchAll(/<section\b([^>]*data-anchor-text="([^"]*)"[^>]*)>([\s\S]*?)<\/section>/gi)) {
    out.push({ attrs: m[1], title: oneLine(m[2]), html: m[3] });
  }
  return out;
}

export function extractBeiersdorfDetails(html, url) {
  const host = (() => { try { return new URL(url).host; } catch { return "www.liposan.gr"; } })();
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const h1 = html.match(/<h1[^>]*nx-product-stage__headline[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  d.title = h1 ? oneLine(h1[1]) : null;

  const bc = jsonLd(html).find(n => n["@type"] === "BreadcrumbList");
  if (bc && Array.isArray(bc.itemListElement)) {
    d.breadcrumbs = bc.itemListElement.map(x => oneLine(x.name || "")).filter(Boolean);
    const mid = d.breadcrumbs.slice(1, -1);          // χωρίς «Προϊόντα» και το ίδιο το προϊόν
    if (mid[0]) d.line = mid[0];
    d.category = mid.join(" › ") || null;
    const last = d.breadcrumbs[d.breadcrumbs.length - 1];
    if (!d.title && last) d.title = last;
  }
  const sub = (html.match(/data-subcategory="([^"]*)"/) || [])[1];
  if (sub && oneLine(sub)) d.subcategory = oneLine(sub);
  d.fullTitle = d.title || "";

  // Παραλλαγές από τον επιλογέα (μέγεθος / SPF / χρώμα) — κάθε <a> οδηγεί σε δική της σελίδα/article id
  const art = articleFromUrl(url);
  const myEan = eanFromArticle(art);
  for (const nav of html.matchAll(/<nav[^>]*nx-pas__navigation[^>]*>([\s\S]*?)<\/nav>/gi)) {
    for (const a of nav[1].matchAll(/<a[^>]*href="([^"]+)"[^>]*class="([^"]*nx-pas__list-item[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const ean = eanFromArticle(articleFromUrl(a[1]));
      if (!ean) continue;
      const kind = (a[3].match(/nx-pas__attribute--([a-z]+)/) || [])[1] || "attr";
      const val = oneLine((a[3].match(/data-text="([^"]*)"/) || [])[1] || a[3]);
      let v = d.variants.find(x => x.ean === ean);
      if (!v) { v = { ean, size: null, url: abs(host, a[1]), active: /--active/.test(a[2]) }; d.variants.push(v); }
      if (kind === "size") v.size = /\d\s?(ml|g|gr|l)\b/i.test(val) ? sizeNorm(val) : null;   // "1 St" (τεμάχιο) δεν είναι μέγεθος
      else if (kind === "spf") v.spf = val;
      else if (val) v.label = v.label ? `${v.label} / ${val}` : val;
    }
  }
  d.gtin = myEan || (d.variants.find(v => v.active) || d.variants[0] || {}).ean || null;
  if (!d.gtin) { const slug = String(url).replace(/\/+$/, "").split("/").pop() || ""; if (slug) d.gtin = "BDF-" + slug.replace(/[^A-Za-z0-9]/g, "").slice(0, 80); }
  if (art) d.articleId = art;
  // Η σελίδα περιγράφει ΜΟΝΟ το δικό της article id· οι άλλες παραλλαγές έχουν δική τους σελίδα → δεν τις
  // βγάζουμε ως variants (θα σκανάρονται ξεχωριστά), κρατάμε μόνο τα στοιχεία της τρέχουσας.
  const cur = d.variants.find(v => v.ean === d.gtin) || d.variants.find(v => v.active);
  const others = d.variants.filter(v => v.ean !== d.gtin);
  d.variants = cur ? [{ ean: cur.ean, size: cur.size || null }] : [];
  if (cur && cur.size) d.size = cur.size;
  if (cur && cur.spf) d.attributes["SPF"] = cur.spf;
  if (cur && cur.label) d.attributes["Παραλλαγή"] = cur.label;
  if (others.length) d.attributes["Άλλα μεγέθη/εκδόσεις"] = others.map(o => [o.size, o.spf, o.label].filter(Boolean).join(" ") || o.ean).join(", ");
  d.eans = [d.gtin].filter(Boolean);
  d.sizes = d.size ? [d.size] : [];
  // Μέγεθος και από τον τίτλο αν λείπει
  if (!d.size) { const m = (d.title || "").match(/\b(\d{1,4}(?:[.,]\d+)?)\s?(ml|g|gr|l)\b/i); if (m) { d.size = sizeNorm(m[0]); d.sizes = [d.size]; } }

  // Εικόνες gallery (πλήρες png χωρίς ?mw=)
  const slider = html.match(/nx-product-stage__slider[\s\S]*?(?=<!--Alpaca-PH-E:product-image-gallery-->|<h1)/i);
  const imgSrc = slider ? slider[0] : html;
  for (const m of imgSrc.matchAll(/<img[^>]+src=['"]([^'"]+)['"]/gi)) {
    const u = baseImg(m[1]);
    if (/img\.nivea\.com|\/-\/media\//i.test(u) && !/logo|icon|flag|sprite/i.test(u) && !d.images.includes(u)) d.images.push(abs(host, u));
  }
  if (!d.images.length) { const og = (html.match(/property="og:image"\s+content="([^"]+)"/) || [])[1]; if (og) d.images.push(baseImg(og)); }
  d.imageLarge = d.images[0] || null;

  // Οφέλη (labels)
  for (const m of html.matchAll(/<h5[^>]*nx-benefit__label[^>]*>([\s\S]*?)<\/h5>/gi)) { const t = oneLine(m[1]); if (t && !d.keyFacts.includes(t)) d.keyFacts.push(t); }

  // Ενότητες
  const secs = sectionsByAnchor(html);
  const descBlock = (html.match(/<div[^>]*nx-product-information__description[^>]*>([\s\S]*?)<\/div>/i) || [])[1];
  const warn = (html.match(/<p[^>]*nx-warning-text__description[^>]*>([\s\S]*?)<\/p>/i) || [])[1];
  const artNo = (html.match(/<p[^>]*nx-product-information__article-number[^>]*>([\s\S]*?)<\/p>/i) || [])[1];
  if (descBlock) d.tabs["Περιγραφή"] = text(stripSvg(descBlock));
  if (warn) d.tabs["Προειδοποίηση"] = text(stripSvg(warn));
  if (artNo) d.attributes["Αριθμός προϊόντος"] = oneLine(artNo).replace(/^Αριθμός αντικειμένου\s*/i, "");
  const specials = [];
  for (const m of html.matchAll(/<(h[2-6])[^>]*nx-special-ingredient__(?:headline|title|name)[^>]*>([\s\S]*?)<\/\1>/gi)) { const t = oneLine(m[2]); if (t && !specials.includes(t)) specials.push(t); }
  if (!specials.length) { const sec = secs.find(s => /test="specialIngredients"/.test(s.attrs)); if (sec) for (const m of sec.html.matchAll(/<(h[3-6]|strong)[^>]*>([\s\S]*?)<\/\1>/gi)) { const t = oneLine(m[2]); if (t && t.length < 60 && !specials.includes(t)) specials.push(t); } }
  if (specials.length) d.attributes["Βασικά συστατικά"] = specials.join(", ");
  const ingrParts = [];
  for (const m of html.matchAll(/<p[^>]*nx-ingredients__section[^>]*>([\s\S]*?)<\/p>/gi)) { const t = oneLine(stripSvg(m[1])).replace(/\s*:\s*/, ": "); if (t) ingrParts.push(t); }
  if (ingrParts.length) {
    d.tabs["Συστατικά"] = ingrParts.join("\n");
    const inci = ingrParts.find(p => /^Περιλαμβάνεται/i.test(p)); if (inci) d.inci = inci.replace(/^Περιλαμβάνεται:?\s*/i, "");
    const free = ingrParts.find(p => /^Δεν περιλαμβάνει/i.test(p)); if (free) d.attributes["Χωρίς"] = free.replace(/^Δεν περιλαμβάνει:?\s*/i, "");
  }
  for (const s of secs) {
    if (!s.title || /Οφέλη|Μάθετε περισσότερα|Κατάλογος συστατικών|Ειδικά συστατικά|Περισσότερα προϊόντα|Μπορεί να σας αρέσει|συμβουλές/i.test(s.title)) continue;
    const body = text(stripSvg(s.html).replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, ""));
    if (body && body.length > 20 && !d.tabs[s.title]) d.tabs[s.title] = body;
  }
  const meta = (html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [])[1];
  d.shortDescription = meta ? oneLine(meta) : null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || d.shortDescription || null;
  d.subtitle = d.shortDescription || null;
  if (d.line) d.attributes["Σειρά"] = d.line;
  if (d.category) d.attributes[`Κατηγορία ${host.replace(/^www\./, "")}`] = d.category;
  if (d.keyFacts.length) d.attributes["Οφέλη"] = d.keyFacts.join(" · ");
  return d;
}

// Σελίδα προϊόντος = product stage με headline και article id στο URL
export const isBeiersdorfProductPage = (html, url) => /nx-product-stage__headline/.test(html) && (!url || /-\d{14,20}\.html/.test(url));
