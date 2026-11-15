#!/usr/bin/env node
// scripts/scrape-bepanthol.mjs
// Bepanthol (Bayer) = www.bepanthol.gr/el — Drupal + Cohesion, ελληνικά, χωρίς EAN/τιμές. Το site μπλοκάρει απλά HTTP requests
// («Your bot have been rated as a harmful activity», 403) → ανάγνωση με Playwright (Chromium) σαν κανονικός browser, με παύση 2.5s.
// Λίστα: crawl από το /el/proionta/ (κατηγορίες → σελίδες προϊόντων). Σελίδα: h1.product-title, εισαγωγή (πριν τις ενότητες),
// ενότητες anchor-link-content (data-anchor-link = ΠΕΡΙΓΡΑΦΗ / ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ, με «Συστατικά:» μέσα στις οδηγίες), εικόνα .product-image.
// Οι παραπομπές βιβλιογραφίας (<sup>1-15</sup>) αφαιρούνται. Κλειδί "BP-<slug>"· τιμές (Medica) με js/bepanthol-manual-matches.json.
// Χρήση: node scripts/scrape-bepanthol.mjs [--cache=<dir>]   (οι σελίδες cache είναι HTML από τον browser)

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/bepanthol-site.json");
const BASE = "https://www.bepanthol.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const CACHE = opt("cache", null);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "\n• ").replace(/<\/(p|li|div|h\d|ul)>/gi, "\n"))).replace(/®/g, "").replace(/BepantheneEye/g, "Bepanthene Eye").replace(/Bepanthol(?=[A-ZΑ-Ω])/g, "Bepanthol ").replace(/[ \t ]+/g, " ").replace(/ ([.,;:])/g, "$1").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
const CAT_GR = { "xhro-euaisthito-derma": "Bepanthol Derma — Ξηρό ευαίσθητο δέρμα", "mama-kai-mwro": "Μαμά & μωρό", "ekzema": "Έκζεμα", "epoulosi-pligon": "Επούλωση πληγών",
  "peripoihsh-proswpou": "Περιποίηση προσώπου", "frontida-xeilion": "Φροντίδα χειλιών", "peripoihsh-swmatos": "Περιποίηση σώματος", "euaisthito-se-erethismous-derma": "Ευαίσθητο σε ερεθισμούς δέρμα",
  "kshrofthalmia": "Ξηροφθαλμία", "peripoiisi-tattoo": "Περιποίηση tattoo", "xhro-kai-eyaisthito-derma": "Ξηρό & ευαίσθητο δέρμα", "dry-skin-body-lotions": "Bepanthol Derma — Ξηρό ευαίσθητο δέρμα" };

// μεγέθη που η σελίδα δεν αναφέρει αλλά πωλούνται ξεχωριστά (τιμοκατάλογος)
const FAMILIES = { "bepanthol-galaktwma-swmatos": ["200ml", "400ml"] };

export function extractBepantholDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  let h = html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/g, "");
  const i = h.indexOf("<main"); h = h.slice(i > 0 ? i : 0);
  const end = h.search(/Με περισσότερα από 75 χρόνια|>\s*Βιβλιογραφία\s*</); if (end > 0) h = h.slice(0, end);
  d.title = oneLine((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/\s+/g, " ").replace(/^BepantheneEye/, "Bepanthene Eye").trim();
  // ενότητες: <div … data-anchor-link="ΠΕΡΙΓΡΑΦΗ|ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ|ΕΠΙΣΚΟΠΗΣΗ|ΠΛΗΡΟΦΟΡΙΕΣ ΠΡΟΪΟΝΤΟΣ|…" …>
  const clean = t => t.split("\n").filter(l => l && !/[<>{}]|":|^(LGR No|Βιβλιογραφία|Collapse|Expand)/i.test(l)).join("\n").trim();
  const parts = h.split(/<div[^>]*data-anchor-link="([^"]+)"[^>]*>/);
  const intro = clean(text(parts[0].slice(Math.max(0, parts[0].search(/<h1/))).replace(/<h1[\s\S]*?<\/h1>/, ""))).split("\n").filter(l => l !== d.title && !/^(Βρείτε|Αγοράστε|Που θα το βρω|Σημεία πώλησης)/i.test(l));
  // Derma: οι πρώτες γραμμές «400 ml / 200 ml» είναι τα διαθέσιμα μεγέθη
  const sizeLines = []; while (intro.length && /^\d+\s?(ml|g)$/i.test(intro[0])) sizeLines.push(intro.shift().replace(/\s/g, ""));
  if (intro.length) d.tabs["Περιγραφή"] = intro.join("\n");
  const add = (k, v) => { v = (v || "").trim(); if (v) d.tabs[k] = [d.tabs[k], v].filter(Boolean).join("\n"); };
  const route = (key, body) => {   // «Οδηγίες χρήσης» / «Συστατικά:» μέσα σε άλλη ενότητα → δικές τους ενότητες
    const segs = body.split(/\n(?=Οδηγίες χρήσης?:?\s*$|Οδηγίες χρήση\s*$|Συστατικά:?\s*$|Συστατικά:\s)/m);
    for (const sg of segs) {
      if (/^Οδηγίες χρήσ/i.test(sg)) add("Χρήση", sg.replace(/^[^\n]*\n?/, ""));
      else if (/^Συστατικά:?/i.test(sg)) add("Συστατικά", sg.replace(/^Συστατικά:?\s*/i, ""));
      else add(key, sg);
    }
  };
  for (let k = 1; k < parts.length; k += 2) {
    const raw = parts[k].trim(), label = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();   // χωρίς τόνους
    let body = clean(text(parts[k + 1].replace(/<h3[^>]*>[\s\S]*?<\/h3>/, "")));
    if (/ΟΔΗΓΙΕΣ|ΧΡΗΣΗ/.test(label)) {
      body = body.replace(/^•[^\n]*:\s*$/gm, "").replace(/\n{2,}/g, "\n");   // τίτλοι accordion
      const m = body.split(/\n?Συστατικά:\s*\n?/);
      add("Χρήση", m[0]); if (m.length > 1) add("Συστατικά", m.slice(1).join("\n"));
    } else if (/ΠΕΡΙΓΡΑΦΗ|ΕΠΙΣΚΟΠΗΣΗ|ΛΕΠΤΟΜΕΡΕΙΕΣ/.test(label)) route("Περιγραφή", body);
    else if (/ΠΛΗΡΟΦΟΡΙΕΣ|ΔΡΑΣΗ/.test(label)) route("Δράση", body);
    else if (/ΣΥΣΚΕΥΑΣΙΑ/.test(label)) route("Συσκευασία", body);
    else if (/ΣΥΣΤΑΤΙΚΑ/.test(label)) add("Συστατικά", body);
    else if (/ΜΕΓΕΘΗ/.test(label)) { route("_sizes", body); delete d.tabs["_sizes"]; }   // μόνο τα Συστατικά/Οδηγίες που βρίσκονται μέσα
    else route(raw[0].toUpperCase() + raw.slice(1).toLowerCase(), body);
  }
  if (d.tabs["Συστατικά"]) d.tabs["Συστατικά"] = d.tabs["Συστατικά"].split("\n").filter(l => !/^Διατίθεται σε/i.test(l) || (d.tabs["Συσκευασία"] = l, false)).join("\n");
  d.sizesFromPage = sizeLines;
  for (const k of Object.keys(d.tabs)) if (!d.tabs[k]) delete d.tabs[k];
  for (const l of (d.tabs["Περιγραφή"] || "").split("\n")) if (l.length < 90 && /ελεγμένη|Χωρίς|Κατάλληλ|αποδεδειγμένα|Vegan/i.test(l)) d.keyFacts.push(l.replace(/\.$/, ""));
  if (d.keyFacts.length) { d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n"); d.advantages = d.keyFacts; }
  for (const m of h.matchAll(/<img[^>]+class="[^"]*product-image[^"]*"[^>]*>|<img[^>]+src="(\/sites\/[^"]+)"[^>]*class="[^"]*image[^"]*"/g)) {
    const src = (m[0].match(/src="([^"]+)"/) || [])[1]; if (src && !/logo|icon/i.test(src)) { const u = src.startsWith("http") ? src : BASE + src; if (!d.images.includes(u)) d.images.push(u); }
  }
  if (!d.images.length) for (const m of h.matchAll(/src="(\/sites\/[^"]+\.(?:png|jpe?g|webp))"/g)) if (!/logo|icon|footer/i.test(m[1])) { d.images.push(BASE + m[1]); break; }
  d.imageLarge = d.images[0] || null;
  const segs = url.replace(BASE, "").split("/").filter(Boolean).filter(s => s !== "el");
  d.catSlug = segs[1] || null; d.category = CAT_GR[d.catSlug] || d.catSlug; d.categories = [d.category]; d.line = d.category;
  if (d.category) d.attributes["Κατηγορία"] = d.category;
  const sz = d.title.match(/(\d+)\s?(ml|g|gr)\b/i) || (d.tabs["Συσκευασία"] || "").match(/(\d+)\s?(ml|g|gr)\b/i);
  d.size = sz ? sz[1] + sz[2].toLowerCase().replace("gr", "g") : null; d.sizes = d.size ? [d.size] : [];
  if (d.size) d.attributes["Συσκευασία"] = d.size;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.description ? d.description.slice(0, 220) : null;
  d.handle = segs[segs.length - 1];
  d.gtin = "BP-" + d.handle.replace(/^bepanthol(r)?-|^bepanthene-/, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 50); d.eans = [d.gtin];
  if (FAMILIES[d.handle]) d.sizesFromPage = FAMILIES[d.handle];
  if (d.sizesFromPage.length > 1) {   // Derma γαλακτώματα 200 / 400 ml → μία κάρτα ανά μέγεθος
    d.sizes = [...d.sizesFromPage].sort((x, y) => parseInt(x) - parseInt(y)); d.size = d.sizes[0];
    d.variants = d.sizes.map(z => ({ ean: d.gtin.slice(0, 44) + z.replace(/[^0-9]/g, ""), size: z.replace(/(\d)(ml|g)/, "$1 $2") }));
    d.eans = d.variants.map(v => v.ean); d.gtin = d.eans[0]; d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", ");
  } else if (!d.size && d.sizesFromPage.length) { d.size = d.sizesFromPage[0]; d.sizes = [d.size]; d.attributes["Συσκευασία"] = d.size; }
  delete d.sizesFromPage;
  return d;
}

async function main() {
  const { chromium } = require("playwright");
  const b = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] }).catch(() => chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--disable-blink-features=AutomationControlled"] }));
  const c = await b.newContext({ locale: "el-GR", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" });
  const p = await c.newPage();
  if (CACHE) await fs.mkdir(CACHE, { recursive: true });
  const norm = u => { u = u.split("#")[0].replace("/proionta/", "/el/proionta/").replace("/el/el/", "/el/"); return u.endsWith("/") ? u : u + "/"; };
  const get = async u => {
    const cf = CACHE && path.join(CACHE, crypto.createHash("md5").update(u).digest("hex").slice(0, 12) + ".html");
    try { return await fs.readFile(cf, "utf8"); } catch {}
    await p.goto(u, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => null); await sleep(2500);
    const html = await p.content(); if (cf) await fs.writeFile(cf, html, "utf8"); return html;
  };
  const seen = new Set(), queue = [BASE + "/el/proionta/"], pages = [];
  while (queue.length) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    const html = await get(u);
    for (const m of html.matchAll(/href="((?:https:\/\/www\.bepanthol\.gr)?\/(?:el\/)?(?:proionta|products|bepanthen-range)\/[^"#?]+)"/g)) { const n = norm(m[1].startsWith("http") ? m[1] : BASE + m[1]); if (!seen.has(n) && !queue.includes(n)) queue.push(n); }
    if (/class="[^"]*product-title/.test(html)) pages.push([u, html]);
  }
  await b.close();
  const out = [], byTitle = new Set();
  for (const [u, html] of pages) {
    const d = extractBepantholDetails(html, u);
    if (!d.title || byTitle.has(d.title)) continue; byTitle.add(d.title);
    out.push({ url: u, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).join(",").padEnd(40)} ${(d.category || "-").slice(0, 26).padEnd(26)} | ${d.title}`);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} (από ${seen.size} σελίδες). Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
