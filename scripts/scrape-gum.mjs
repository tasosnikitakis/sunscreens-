#!/usr/bin/env node
// scripts/scrape-gum.mjs
// GUM (Sunstar) = www.sunstargum.com/gr-el — Adobe AEM + CIF, ελληνικά, χωρίς EAN/τιμές. Λίστα από το /gr-el/sitemap.xml
// (σελίδες /proionta/<κατηγορία>/<προϊόν>.html, εκτός /lysi/ = σελίδες λύσεων). Σελίδα: h1 (role=name), περιγραφή (role=description),
// data-layer (xdm:productCategory / productSolution / productSubBrand), teaser «ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ & ΟΦΕΛΗ» (λίστα) + τα υπόλοιπα teasers/κείμενα
// μέχρι το carousel σχετικών προϊόντων, εικόνες από το data-gallery-items. Ο κωδικός GUM (π.χ. 6070, 1312, 690) βγαίνει από το όνομα της
// φωτογραφίας («6070EMEA-…», «P2400-…») και χρησιμοποιείται για τις τιμές του Medica («GUM 1312 TRAV-LER …»).
// Κλειδί: "GU-<slug>"· μεγέθη/τύποι οικογενειών (Trav-ler, Soft-Picks, Bi-Direction, Easy-Flossers) ως variants από το FAMILIES.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-gum.mjs [--cache=<dir>] [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/gum-site.json");
const BASE = "https://www.sunstargum.com";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "1000"));
const CACHE = opt("cache", null);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "\n• ").replace(/<\/(p|li|div|h\d|ul)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();

export const CAT_GR = { "odontopastes": "Οδοντόπαστες", "odontovourtses": "Οδοντόβουρτσες", "mesodontia-vourtsakia": "Μεσοδόντια βουρτσάκια",
  "odontoglyfides-kaoutsouk": "Οδοντογλυφίδες καουτσούκ (Soft-Picks)", "nima": "Οδοντικό νήμα", "stomatika-dialymata": "Στοματικά διαλύματα",
  "gel-kai-spray": "Gel & spray", "axesouar": "Αξεσουάρ" };

// οικογένειες με πολλά μεγέθη σε μία σελίδα → variants (κωδικός GUM, ετικέτα). Οι κωδικοί είναι αυτοί του τιμοκαταλόγου.
export const FAMILIES = {
  "mesodontia-vourtsakia-gum-trav-ler": [["1312", "0,6 mm κυλινδρικό"], ["1314", "0,8 mm κωνικό"], ["1414", "1,1 mm κωνικό"], ["1618", "2,0 mm κυλινδρικό"]],
  "gum-soft-picks-original": [["632", "Regular x40"], ["634", "Large x40"], ["636", "Extra Large x40"]],
  "gum-soft-picks-pro-mesodontios-katharismos": [["689", "Small x30"], ["690M", "Medium x30"], ["690L", "Large x30"]],
  "mesodontia-vourtsakia-gum-bi-direction": [["BIFINE", "Fine — κόκκινο x6"], ["2314", "Medium 0,9 mm κωνικό — μπλε x6"]],
  "odontiko-nima-gum-easy-flossers": [["890x30", "30 τεμ."], ["890x50", "50 τεμ."], ["890x90", "90 τεμ."]]
};

async function fetchText(url) {
  for (let t = 0; t < 3; t++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, signal: AbortSignal.timeout(60000) });
    if (r.ok) return r.text();
    await sleep(4000 * (t + 1));
  }
  throw new Error("HTTP failed " + url);
}

export function extractGumDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  const h = html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/g, "");
  d.title = oneLine((h.match(/<span role="name">([\s\S]*?)<\/span>/) || [])[1] || "").replace(/®/g, "").replace(/\s*\|.*$/, "").replace(/^ΟΔΟΝΤΟΒΟΥΡΤΣΙ?Α(?=\s)/, "Οδοντόβουρτσα").replace(/^ΟΔΟΝΤΙΚΟ ΝΗΜΑ(?=\s)/, "Οδοντικό νήμα").replace(/^ΜΕΣΟΔΟΝΤΙΑ(?=\s)/, "Μεσοδόντια").replace(/\*/g, "").replace(/Οδοντοκρεμα/g, "Οδοντόκρεμα").replace(/\s+/g, " ").trim();
  const desc = text((h.match(/role="description">([\s\S]*?)<\/div>\s*<\/section>/) || [])[1] || "");
  if (desc) d.tabs["Περιγραφή"] = desc;
  const dl = decodeAll((html.match(/data-cmp-data-layer="(\{&#34;product-[\s\S]*?)"/) || [])[1] || "");
  const dlv = k => (dl.match(new RegExp(`"xdm:${k}":"([^"]*)"`)) || [])[1] || null;
  d.productCategory = dlv("productCategory"); d.solution = dlv("productSolution"); d.subBrand = dlv("productSubBrand");
  d.sku = (h.match(/<strong role="sku">([^<]+)/) || [])[1] || null;
  // teasers / κείμενα μέχρι τα σχετικά προϊόντα
  const i = h.indexOf("productteaserhighlights"), j = h.indexOf("productcarousel", i > 0 ? i : 0);
  if (i > 0) {
    const seg = h.slice(i, j > i ? j : undefined).replace(/data-cmp-data-layer="[^"]*"|data-[a-z-]+="[^"]*"/g, "");
    const parts = seg.split(/<h[23][^>]*class="cmp-(?:teaser__title|title__text)"[^>]*>([\s\S]*?)<\/h[23]>/);
    for (let k = 1; k < parts.length; k += 2) {
      const head = oneLine(parts[k]); const body = text(parts[k + 1] || "").split("\n").filter(l => l && !/^(Label|Μάθετε|Τι άλλο μπορείτε|ΔΕΙΤΕ|Ανακαλύψτε|ΑΓΟΡΑΣΕ|<|"|\{)/i.test(l) && !/[<>{}]|&#34;/.test(l)).join("\n");
      if (!head && !body) continue;
      if (/ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ|ΟΦΕΛΗ/i.test(head)) { d.tabs["Οφέλη"] = [d.tabs["Οφέλη"], body].filter(Boolean).join("\n"); continue; }
      if (/^Μάθετε|^$/.test(head) && body.length < 80) continue;
      const block = [head, body].filter(Boolean).join("\n");
      d.tabs["Πληροφορίες"] = [d.tabs["Πληροφορίες"], block].filter(Boolean).join("\n");
    }
  }
  if (d.tabs["Οφέλη"]) d.advantages = d.tabs["Οφέλη"].split("\n").map(l => l.replace(/^•\s*/, "")).filter(l => l.length > 4);
  // εικόνες + κωδικοί
  const gal = decodeAll((html.match(/data-gallery-items="([^"]*)"/) || [])[1] || "[]");
  let items = []; try { items = JSON.parse(gal); } catch {}
  for (const it of items) { const p = String(it.path || "").replace(/\\u003d/g, "=").replace(/\\u0026/g, "&").split("?")[0]; if (p) d.images.push(BASE + p + "?width=1200&preferwebp=true&quality=85"); }
  d.codes = [...new Set(items.map(it => (String(it.label || "").match(/^P?(\d{3,4})(?=[A-Z]|-|_)/) || [])[1]).filter(Boolean))];
  d.code = d.codes[0] || null;
  d.imageLarge = d.images[0] || null;
  const cat = (url.match(/\/proionta\/([^/]+)\//) || [])[1];
  d.catSlug = cat; d.category = CAT_GR[cat] || d.productCategory || cat; d.categories = [d.category]; d.line = d.category;
  d.attributes["Κατηγορία"] = d.category;
  if (d.subBrand) d.attributes["Σειρά"] = d.subBrand.split(",")[0].trim();
  if (d.code) d.attributes["Κωδικός GUM"] = d.code;
  const sz = d.title.match(/(\d+)\s?(ml|g|m)\b/i);
  d.size = sz ? sz[1] + sz[2].toLowerCase() : null; d.sizes = d.size ? [d.size] : [];
  d.description = (desc || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.description ? d.description.slice(0, 220) : null;
  d.handle = url.replace(/\.html$/, "").split("/").pop();
  // κλειδί από τον κωδικό GUM (μοναδικός ανά προϊόν· το όνομα «GUM ActiVital» είναι ίδιο σε οδοντόβουρτσα/πάστα/διάλυμα)
  d.gtin = d.code ? `GU-gum${d.code}` : "GU-" + d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 50);
  d.eans = [d.gtin];
  const fam = FAMILIES[d.handle];
  if (fam) { d.variants = fam.map(([code, size]) => ({ ean: `GU-gum${code}`, size, code })); d.eans = d.variants.map(v => v.ean); d.gtin = d.eans[0]; d.sizes = d.variants.map(v => v.size); d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", "); }
  return d;
}

async function main() {
  const sm = await fetchText(`${BASE}/gr-el/sitemap.xml`);
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /\/gr-el\/proionta\/[^/]+\/[^/]+\.html$/.test(u) && !/\/lysi\//.test(u));
  console.log(`sunstargum.com/gr-el: ${urls.length} σελίδες προϊόντων`);
  if (CACHE) await fs.mkdir(CACHE, { recursive: true });
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const cf = CACHE && path.join(CACHE, crypto.createHash("md5").update(u + "\n").digest("hex").slice(0, 12) + ".html");
    let html; try { html = await fs.readFile(cf, "utf8"); } catch { html = await fetchText(u); if (cf) await fs.writeFile(cf, html, "utf8"); await sleep(DELAY_MS); }
    const d = extractGumDetails(html, u);
    if (!d.title) { console.log(`[${i + 1}] χωρίς τίτλο — παραλείπεται ${u}`); continue; }
    out.push({ url: u, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${i + 1}/${urls.length}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.code || "-").padEnd(5)} ${(d.size || "-").padEnd(6)} | ${d.title}`);
  }
  // ίδιος κωδικός σε δύο σελίδες (π.χ. 4101 = Sonic Daily ανταλλακτική / Sonic Sensitive) → + κατηγορία από το slug
  const seen = {}; for (const p of out) { if (seen[p.gtin] && !p.details.variants.length) { p.gtin = p.details.gtin = p.gtin + p.details.handle.replace(/[^A-Za-z]/g, "").slice(-12); p.details.eans = [p.gtin]; } seen[p.gtin] = 1; }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
