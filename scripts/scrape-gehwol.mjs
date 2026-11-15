#!/usr/bin/env node
// scripts/scrape-gehwol.mjs
// GEHWOL (Eduard Gerlach) — αντιπρόσωπος Naturapharm = naturapharm.gr — WordPress + Beaver Builder, ελληνικά, χωρίς EAN/τιμές.
// Λίστα από το REST: /wp-json/wp/v2/b2c-products (κρέμες, λάδια, ποδόλουτρα — ταξινομία katigoria_proiontos: Classic / Med / Fusskraft /
// Soft Feet / Gerlasan – Gerlavit) + /wp-json/wp/v2/products (επιθέματα ποδιών). Gerlasan & Gerlavit = μάρκες της ίδιας εταιρίας (Eduard Gerlach).
// Σελίδα: «Διατίθεται σε: 75ml 125ml» (μεγέθη → variants), «Κωδικός Προϊόντος 11. 40. 805 …», accordion «Περιγραφή προϊόντος /
// Συστατικά / Οδηγίες χρήσης», εικόνα fl-photo. Κλειδί "GW-<slug>" (+ μέγεθος). Τιμές (Medica) με js/gehwol-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-gehwol.mjs [--cache=<dir>] [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/gehwol-site.json");
const BASE = "https://naturapharm.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "1000"));
const CACHE = opt("cache", null);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "\n• ").replace(/<\/(p|li|div|h\d|ul)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
const LINE_GR = { "gehwol-classic": "GEHWOL Classic", "gehwol-med": "GEHWOL med", "gehwol-fusskraft": "GEHWOL Fusskraft", "gehwol-soft-feet": "GEHWOL Fusskraft Soft Feet", "gerlasan-gerlavit": "Gerlasan & Gerlavit" };
const SEC = [[/Περιγραφή/i, "Περιγραφή"], [/Συστατικ/i, "Συστατικά"], [/Οδηγίες|Χρήση|Εφαρμογή/i, "Χρήση"], [/Προειδοποι|Προσοχή/i, "Προφυλάξεις"]];

async function fetchText(url) {
  for (let t = 0; t < 3; t++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, signal: AbortSignal.timeout(60000) });
    const b = await r.text();
    if (r.ok && !/imunify-bot-check/i.test(b.slice(0, 3000))) return b;
    await sleep(5000 * (t + 1));
  }
  throw new Error("HTTP failed " + url);
}

export function extractGehwolDetails(html, p, kind) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = decodeAll(p.title.rendered).replace(/^GΕHWOL/, "GEHWOL").replace(/\s+/g, " ").trim();
  const h = html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/g, "");
  const avail = oneLine((h.match(/<p>\s*Διατίθεται σε:?([\s\S]*?)<\/p>/) || [])[1] || "");
  d.sizes = [...avail.matchAll(/(\d+(?:[.,]\d+)?)\s?(ml|g|gr|τεμ\.?|τμχ|ζεύγ\w*|τεμάχια)/gi)].map(m => m[1].replace(",", ".") + " " + m[2].toLowerCase().replace(/^gr$/, "g"));
  if (!d.sizes.length && avail) d.sizes = [avail];
  const codeTxt = decodeAll(((h.match(/Κωδικός Προϊόντος([\s\S]*?)(?:<a href="#"|fl-accordion|<\/p>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div id="description)/) || [])[1] || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const coded = [...codeTxt.matchAll(/(\d{2})\.\s?(\d{2})\.\s?(\d{3})\s*((?:Mini|Small|Medium|Large|Δεξί|Αριστερό)(?:\s*\(\d+\s?mm\))?)?/g)].map(m => ({ code: `${m[1]}.${m[2]}.${m[3]}`, label: m[4] || null }));
  d.codes = coded.map(c => c.code);
  // επιθέματα: «Περιεχόμενο συσκευασίας: 2 τεμάχια» + μεγέθη από τις ετικέτες των κωδικών (Small / Medium / Large, Δεξί / Αριστερό)
  const pack = oneLine((h.match(/Περιεχόμενο συσκευασίας:?([\s\S]*?)Κωδικός/) || [])[1] || "").replace(/τεμάχιo/, "τεμάχιο");
  if (pack) d.attributes["Περιεχόμενο συσκευασίας"] = pack;
  if (!d.sizes.length && coded.length > 1 && coded.every(c => c.label)) d.sizes = coded.map(c => c.label);
  else if (!d.sizes.length && pack) d.sizes = [pack.replace(/\s*\(.*$/, "")];
  if (d.codes.length) d.attributes["Κωδικός GEHWOL"] = d.codes.join(", ");
  // accordion
  for (const m of h.matchAll(/class="fl-accordion-button-label"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="fl-accordion-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const head = oneLine(m[1]); const body = text(m[2]); if (!body) continue;
    const key = (SEC.find(([re]) => re.test(head)) || [])[1] || head;
    d.tabs[key] = [d.tabs[key], body].filter(Boolean).join("\n");
  }
  if (!d.tabs["Περιγραφή"]) { const t = text(p.content.rendered); if (t) d.tabs["Περιγραφή"] = t; }
  // σύντομες γραμμές της περιγραφής (h3 «Απορροφάται εύκολα.») και των οδηγιών («Κατάλληλο για διαβητικούς.», «Vegan») → χαρακτηριστικά
  for (const k of ["Περιγραφή", "Χρήση"]) for (const l of (d.tabs[k] || "").split("\n")) if (l.length < 70 && !/^•/.test(l) && /\.$|^Vegan$|Κατάλληλ|Συμβατ|ελεγμένο/i.test(l)) d.keyFacts.push(l.replace(/\.$/, ""));
  d.keyFacts = [...new Set(d.keyFacts)].slice(0, 10);
  if (d.keyFacts.length) { d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n"); d.advantages = d.keyFacts; }
  // εικόνα: η φωτογραφία του προϊόντος (fl-photo) — όχι λογότυπα/banners/σχετικά προϊόντα (-300x300)
  for (const m of h.matchAll(/<img[^>]+class="fl-photo-img[^"]*"[^>]+src="([^"]+)"/g)) if (!/logo|espa|banner|-\d{2,3}x\d{2,3}\./i.test(m[1]) && !d.images.includes(m[1])) d.images.push(m[1]);
  d.imageLarge = d.images[0] || null;
  const cls = (p.class_list || []).find(c => /^katigoria_proiontos-/.test(c));
  d.catSlug = kind === "pads" ? "epithemata" : (cls || "").replace("katigoria_proiontos-", "");
  d.line = kind === "pads" ? "Επιθέματα ποδιών" : (LINE_GR[d.catSlug] || "GEHWOL"); d.series = d.line; d.category = d.line; d.categories = [d.line];
  d.attributes["Σειρά"] = d.line;
  d.size = d.sizes[0] || null;
  if (d.sizes.length > 1) d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", "); else if (d.size) d.attributes["Συσκευασία"] = d.size;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.description ? d.description.slice(0, 220) : null;
  d.handle = decodeURIComponent(p.slug);
  const key = d.handle.replace(/^gehwol-(gehwol-)?/, "").replace(/^(gerlasan|gerlavit)-/, "$1").normalize("NFD").replace(/[^A-Za-z0-9]/g, "").slice(0, 40) || String(p.id);
  d.gtin = "GW-" + key; d.eans = [d.gtin];
  if (d.sizes.length > 1) {
    const tag = z => /\d/.test(z) && !/Mini|Small|Medium|Large/.test(z) ? z.replace(/[^0-9]/g, "") : ({ "Δεξί": "R", "Αριστερό": "L" }[z] || z.replace(/\s*\(.*$/, "").replace(/[^A-Za-z]/g, ""));
    d.variants = d.sizes.map((z, i) => ({ ean: d.gtin + tag(z), size: pack && !/\d\s?(ml|g)/.test(z) ? `${z} — ${pack.replace(/\s*\(.*$/, "")}` : z, code: d.codes[i] || null }));
    d.eans = d.variants.map(v => v.ean); d.gtin = d.eans[0];
  }
  return d;
}

async function main() {
  const list = [];
  for (const [rest, kind] of [["b2c-products", "care"], ["products", "pads"]]) {
    const a = JSON.parse(await fetchText(`${BASE}/wp-json/wp/v2/${rest}?per_page=100&_fields=id,slug,link,title,content,class_list`));
    for (const p of a) if (/gehwol|gΕhwol|gerlasan|gerlavit/i.test(p.title.rendered + p.slug)) list.push([p, kind]);
    await sleep(DELAY_MS);
  }
  console.log(`naturapharm.gr: ${list.length} προϊόντα GEHWOL / Gerlasan / Gerlavit`);
  if (CACHE) await fs.mkdir(CACHE, { recursive: true });
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const [p, kind] = list[i];
    const cf = CACHE && path.join(CACHE, crypto.createHash("md5").update(p.link).digest("hex").slice(0, 12) + ".html");
    let html; try { html = await fs.readFile(cf, "utf8"); } catch { html = await fetchText(p.link); if (cf) await fs.writeFile(cf, html, "utf8"); await sleep(DELAY_MS); }
    const d = extractGehwolDetails(html, p, kind);
    out.push({ url: p.link, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${i + 1}/${list.length}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.sizes.join("/") || "-").padEnd(18)} ${(d.codes.join("/") || "-").padEnd(22)} | ${d.title.slice(0, 70)}`);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
