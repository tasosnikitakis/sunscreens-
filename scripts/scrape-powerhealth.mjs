#!/usr/bin/env node
// scripts/scrape-powerhealth.mjs
// Power Health (ελληνική εταιρία) = www.powerhealth.gr — WordPress + WPBakery, custom post type «proionta» (όχι REST, όχι EAN).
// Λίστα: /proionta-sitemap.xml. Σελίδα (samples/powerhealth-sample.html):
//   .prointaTitle h3 (όνομα), .prointaUSP h4 (μορφή/γεύση), .wpb_text_column.spacer (περιγραφή),
//   tabs WPBakery (.vc_tta-panel με .vc_tta-title-text): ΣΥΝΘΕΣΗ / ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ — μέσα «Χωρίς», «Κατάλληλο για…»,
//   «Περιεχόμενο» (μέγεθος), προειδοποιήσεις, «Αρ. Γνωστ. ΕΟΦ»· εικόνα .vc_single_image-img (og:image).
// Κατηγορίες: οι σελίδες /proionta-category/* φορτώνουν τα προϊόντα με Ajax Load More → χάρτης από
// scratch (Playwright) στο --catmap=<json> αν δοθεί· αλλιώς η ενότητα βγαίνει από όνομα/κείμενο στο match.
// Κλειδί (χωρίς EAN): "PH-<slug>". Οι τιμές μπαίνουν από τον τιμοκατάλογο με manual matches.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-powerhealth.mjs [--limit=5] [--delay=600] [--catmap=path]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/powerhealth-site.json");
const BASE = "https://www.powerhealth.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "600"));
const CATMAP = opt("catmap", "");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/<sup>\s*ο\s*<\/sup>/gi, "°").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function extractPowerhealthDetails(html, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = oneLine((html.match(/prointaTitle"\s*>\s*<div class="wpb_wrapper">\s*<h\d[^>]*>([\s\S]*?)<\/h\d>/) || [])[1] || "") || null;
  d.form = oneLine((html.match(/prointaUSP"\s*>\s*<div class="wpb_wrapper">\s*<h\d[^>]*>([\s\S]*?)<\/h\d>/) || [])[1] || "") || null;
  const desc = (html.match(/<div class="wpb_text_column wpb_content_element\s+spacer"\s*>\s*<div class="wpb_wrapper">([\s\S]*?)<\/div>\s*<\/div>/) || [])[1];
  if (desc) d.tabs["Περιγραφή"] = text(desc);
  for (const m of html.matchAll(/<div class="vc_tta-panel[^"]*" id="[^"]+"[^>]*>\s*<div class="vc_tta-panel-heading">[\s\S]*?<span class="vc_tta-title-text">([\s\S]*?)<\/span>[\s\S]*?<div class="vc_tta-panel-body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g)) {
    const k = oneLine(m[1]).toUpperCase(); let body = m[2];
    if (/ΣΥΝΘΕΣΗ|ΣΥΣΤΑΤΙΚ/.test(k)) d.tabs["Συστατικά"] = text(body);
    else if (/ΟΔΗΓΙΕΣ|ΧΡΗΣΗ/.test(k)) {
      const t = text(body);
      // «Χωρίς», «Περιεχόμενο», «Κατάλληλο…», προειδοποιήσεις, ΕΟΦ μέσα στο ίδιο tab → χωριστά πεδία
      const lines = t.split("\n"); const use = [], warn = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim(); if (!l) continue;
        if (/^Χωρίς$/i.test(l) && lines[i + 1]) { d.attributes["Χωρίς"] = lines[++i].replace(/\.$/, ""); continue; }
        if (/^Χωρίς\s+\S/.test(l) && l.length < 120) { d.attributes["Χωρίς"] = l.replace(/^Χωρίς\s*:?\s*/, "").replace(/\.$/, ""); continue; }
        if (/^Περιεχόμενο$/i.test(l) && lines[i + 1]) { d.attributes["Περιεχόμενο"] = lines[++i].replace(/\.$/, ""); continue; }
        if (/^Περιεχόμενο\s*:?\s+\S/i.test(l)) { d.attributes["Περιεχόμενο"] = l.replace(/^Περιεχόμενο\s*:?\s*/i, ""); continue; }
        if (/^(Κατάλληλο|Με γλυκαντικά|Χωρίς ζάχαρη|Vegan)/i.test(l) && l.length < 80) { d.keyFacts.push(l.replace(/\.$/, "")); continue; }
        if (/[AΑ]ρ\.?\s*Γνωστ/i.test(l)) { d.attributes["Γνωστοποίηση ΕΟΦ"] = l.replace(/^.*?ΕΟΦ:?\s*/i, ""); continue; }
        if (/δεν υπόκειται σε διαδικασία αδειοδότησης/i.test(l) && l.length < 80) continue;
        if (use.length && /(Να μη γίνεται υπέρβαση|Φυλάσσεται|Συμβουλευτείτε|Κλείνετε|Κέντρου Δηλητηριάσεων|δεν πρέπει να χρησιμοποιούνται)/i.test(l)) warn.push(l); else use.push(l);
      }
      if (use.length) d.tabs["Χρήση"] = use.join("\n");
      if (warn.length) d.tabs["Προφυλάξεις"] = warn.join("\n");
    } else { const v = text(body); if (v) d.tabs[oneLine(m[1])] = v; }
  }
  if (d.attributes["Χωρίς"]) d.keyFacts.unshift("Χωρίς " + d.attributes["Χωρίς"].replace(/^χωρίς\s*/i, "").toLowerCase());
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  if (d.form) d.attributes["Μορφή"] = d.form;
  const img = (html.match(/<img[^>]*src="(https:\/\/www\.powerhealth\.gr\/wp-content\/uploads\/[^"]+)"[^>]*class="vc_single_image-img/) || html.match(/class="vc_single_image-img[^"]*"[^>]*src="([^"]+)"/) || html.match(/property="og:image" content="([^"]+)"/) || [])[1];
  if (img) d.images.push(img);
  d.imageLarge = d.images[0] || null;
  d.size = d.attributes["Περιεχόμενο"] || null; d.sizes = d.size ? [d.size] : [];
  const first = (d.tabs["Περιγραφή"] || "").split("\n")[0] || "";
  d.subtitle = d.form || (first.length <= 160 ? first : null);
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = first.length <= 200 ? first : null;
  d.handle = String(url).replace(/\/+$/, "").split("/").pop();
  const key = d.handle.replace(/[^A-Za-z0-9]/g, "").slice(0, 70);
  d.gtin = "PH-" + (key.length >= 4 ? key : key + "item"); d.eans = [d.gtin];
  return d;
}

async function main() {
  const sm = await fetchText(BASE + "/proionta-sitemap.xml");
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/\/?$/, "/")).filter(u => /\/proionta\/[^/]+\/$/.test(u)))];
  let cats = {}; if (CATMAP) { try { const m = JSON.parse(await fs.readFile(CATMAP, "utf8")); for (const { title, links } of Object.values(m)) for (const l of links) (cats[l.replace(/\/?$/, "/")] ||= []).push(title); } catch (e) { console.log("catmap:", e.message); } }
  console.log(`powerhealth.gr: ${urls.length} σελίδες, κατηγορίες για ${Object.keys(cats).length}`);
  const out = []; let err = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i].replace(/\/?$/, "/");
    try {
      const html = await fetchText(url);
      const d = extractPowerhealthDetails(html, url);
      if (!d.title) { console.log(`[${i + 1}/${cap}] skip (χωρίς τίτλο) ${url}`); continue; }
      d.categories = cats[url] || []; d.category = d.categories.join(" | ") || null; d.line = d.categories[0] || null;
      if (d.category) d.attributes["Κατηγορία powerhealth.gr"] = d.category;
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").slice(0, 22).padEnd(22)} ${(d.line || "-").slice(0, 18).padEnd(18)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  // ίδιο όνομα σε δύο σελίδες (π.χ. Vitamin C 1000mg αναβράζον / δισκία) → μέγεθος στο όνομα
  const byName = {}; for (const p of out) (byName[p.name.toLowerCase().trim()] ||= []).push(p);
  for (const g of Object.values(byName)) if (g.length > 1) for (const p of g) p.details.fullTitle = `${p.name} ${p.details.size || ""}`.trim();
  const seen = {}; for (const p of out) { if (seen[p.gtin]) { p.gtin = p.details.gtin = p.gtin.slice(0, 60) + "x" + (++seen[p.gtin]); p.details.eans = [p.gtin]; } else seen[p.gtin] = 1; }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
