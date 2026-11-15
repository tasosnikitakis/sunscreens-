#!/usr/bin/env node
// scripts/scrape-placcontrol.mjs
// TePe & Plac Control (αντιπρόσωπος στην Ελλάδα: TePe, Apagard/Apadent/Apapro (Sangi), Forhans, Megasonex, Brush Baby, Plac Aid,
// Epic, ProxySoft, bioXtra, Protexin, Durimplant…) = www.placcontrol.gr — WordPress + Elementor, ελληνικά, χωρίς EAN/τιμές στις σελίδες.
// Οι σελίδες HTML έχουν anti-bot (SiteGround «One moment, please…») → διαβάζουμε το περιεχόμενο από το REST: /wp-json/wp/v2/pages.
// Προϊόντα = σελίδες-παιδιά των κατηγοριών /proionta/<κατηγορία>/ (μόνο λιανικές κατηγορίες· εκτός είδη οδοντιατρείου, αφίσες, βιβλία,
// εκμαγεία, stands, marketing). Κείμενο: ό,τι υπάρχει πριν από τα toggles = Περιγραφή· toggles «ΠΕΡΙΓΡΑΦΗ / ΠΡΟΣΘΕΤΕΣ ΠΛΗΡΟΦΟΡΙΕΣ /
// ΣΥΣΤΑΤΙΚΑ / ΟΔΗΓΙΕΣ ΧΡΗΣΗΣ / ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ» → ενότητες. Εικόνα: φωτογραφία συσκευασίας (PIM/front/packshot) ή η πρώτη μεγάλη εικόνα.
// Κλειδί: "TP-<slug>". Τιμές (Medica) με js/tepe-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-placcontrol.mjs [--cache=<dir>] [--delay=1500]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/tepe-site.json");
const BASE = "https://www.placcontrol.gr";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const DELAY_MS = parseInt(opt("delay", "1500"));
const CACHE = opt("cache", null);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// λιανικές κατηγορίες → ελληνική ονομασία
export const CATEGORIES = {
  "odontovourtses": "Οδοντόβουρτσες", "mesodontia-vourtsakia": "Μεσοδόντια βουρτσάκια", "odontoglyfides-odontika-nimata": "Οδοντογλυφίδες & οδοντικά νήματα",
  "odontokremes": "Οδοντόκρεμες", "stomatika-dialymata": "Στοματικά διαλύματα", "xirostomia-kakosmia": "Ξηροστομία & κακοσμία",
  "gia-vrefi-kai-paidia": "Για βρέφη και παιδιά", "ilektrika-proionta": "Ηλεκτρικά προϊόντα", "proionta-gia-odontostoixies": "Προϊόντα για οδοντοστοιχίες",
  "proionta-xylitolis": "Προϊόντα ξυλιτόλης", "apokalyptika-plakas": "Αποκαλυπτικά πλάκας", "frontida-emfyteumaton": "Φροντίδα εμφυτευμάτων",
  "proionta-idroxyapatiti": "Προϊόντα υδροξυαπατίτη"
};
// σελίδες εκτός /proionta/ που είναι προϊόντα (id → κατηγορία) και σελίδες προϊόντων χωρίς κείμενο → κείμενο από τη σελίδα-παρουσίαση
const EXTRA_PAGES = { 9201: "ilektrika-proionta", 6687: "odontokremes" };   // SMILLE Sonic Brush, APADENT Perio
const CONTENT_FROM = { 6571: 6573 };
const TITLE_FIX = { 9201: "SMILLE Sonic Brush — Ηχητική οδοντόβουρτσα", 6687: "APADENT Perio Οδοντόκρεμα" };                                           // TePe Choice → /tepe-choice/
// σκληρότητες ινών ως ξεχωριστά προϊόντα (ο τιμοκατάλογος τα έχει με διαφορετικό EAN)
const HARDNESS = { "tepe-nova": ["x-soft", "soft", "medium"], "tepe-select-compact": ["x-soft", "soft", "medium"] };
const SEC = [[/^ΠΕΡΙΓΡΑΦΗ/i, "Περιγραφή"], [/ΠΡΟΣΘΕΤΕΣ ΠΛΗΡΟΦΟΡΙΕΣ|ΠΛΗΡΟΦΟΡΙΕΣ|ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ|ΟΦΕΛΗ|ΠΛΕΟΝΕΚΤΗΜΑΤΑ/i, "Χαρακτηριστικά"],
  [/ΣΥΣΤΑΤΙΚΑ|ΣΥΝΘΕΣΗ|INGREDIENTS/i, "Συστατικά"], [/ΧΡΗΣΗ|ΟΔΗΓΙΕΣ|ΤΡΟΠΟΣ/i, "Χρήση"], [/ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ|FAQ/i, "Συχνές ερωτήσεις"],
  [/ΠΡΟΕΙΔΟΠΟΙΗΣ|ΠΡΟΣΟΧΗ/i, "Προφυλάξεις"], [/ΣΥΣΚΕΥΑΣΙΑ|ΜΕΓΕΘ|ΔΙΑΘΕΣΙΜ/i, "Συσκευασία"]];
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d|tr)>/gi, "\n"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
const BAD_IMG = /logo|icon|usp|graph|model|banner|bg[-_]|background|placeholder|qr|flag|award|sticker|-\d{2,3}x\d{2,3}\.|elementor\/thumbs|\.svg|\.gif|hand|lifestyle|mood|person|woman|man[-_]|girl|boy|smile[-_]/i;
const GOOD_IMG = /PIM|front|packshot|pack|product|PR_|_PR|tube|bottle|box|retail|blister/i;

async function getJson(url) {
  for (let t = 0; t < 4; t++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" }, signal: AbortSignal.timeout(60000) });
    const body = await r.text();
    if (r.ok && /^\s*[\[{]/.test(body)) return JSON.parse(body);
    await sleep(5000 * (t + 1));   // 429 / anti-bot σελίδα → αναμονή
  }
  throw new Error("REST failed " + url);
}

export function extractPlacDetails(p, catSlug) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = TITLE_FIX[p.id] || decodeAll(p.title.rendered).replace(/\s+/g, " ").replace(/^Βrush/, "Brush").trim();
  let c = String(p.content.rendered || "").replace(/<(script|style|noscript)[\s\S]*?<\/\1>/g, "");
  // toggles / accordions του Elementor
  const toggles = [];
  c = c.replace(/<div[^>]*class="elementor-tab-title[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="elementor-tab-content[^"]*"[^>]*>([\s\S]*?)<\/div>(?=\s*<\/div>|\s*<div[^>]*class="elementor-(?:toggle|accordion)-item)/g, (_, h, b) => { toggles.push([oneLine(h), text(b)]); return ""; });
  for (const [h, b] of toggles) {
    if (!b) continue;
    const key = (SEC.find(([re]) => re.test(h)) || [])[1] || (h.length < 40 ? h[0] + h.slice(1).toLowerCase() : "Πληροφορίες");
    d.tabs[key] = [d.tabs[key], b].filter(Boolean).join("\n");
  }
  // υπόλοιπο κείμενο (πριν/εκτός toggles) → εισαγωγή
  const lines = text(c).split("\n").map(l => l.trim()).filter(l => l && !/^(A choice that matters|Smile with us|www\.|ΤΗΛ\.|Made in)/i.test(l));
  const seenL = new Set();
  const intro = lines.filter(l => l !== d.title && l.length > 2 && !/^(Media:|Share:|Συστατικά:?|ΣΑΣ ΣΥΝΙΣΤΟΥΜΕ:?|Αναλυτικές πληροφορίες:?)$/i.test(l)).filter(l => { const k = l.toLowerCase().replace(/\s+/g, " "); if (seenL.has(k)) return false; seenL.add(k); return true; })
    .filter((l, i, arr) => !(arr[i + 1] && arr[i + 1].replace(/\s+/g, " ").startsWith(l.replace(/\s+/g, " ").replace(/[.\s]+$/, ""))))
    .filter((l, i, arr) => !(i > 0 && arr[i - 1].replace(/\s+/g, " ").startsWith(l.replace(/\s+/g, " ").replace(/[.\s]+$/, ""))));   // πρώτη πρόταση που επαναλαμβάνεται στην επόμενη παράγραφο
  if (intro.length) {
    const long = intro.filter(l => l.length > 60);
    const short = intro.filter(l => l.length <= 60 && l.length > 3);
    if (long.length) d.tabs["Περιγραφή"] = [long.join("\n"), d.tabs["Περιγραφή"]].filter(Boolean).join("\n");
    if (short.length) d.keyFacts = short.slice(0, 12);
  }
  if (d.keyFacts.length && !d.tabs["Χαρακτηριστικά"]) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  if (d.tabs["Χαρακτηριστικά"]) d.advantages = d.tabs["Χαρακτηριστικά"].split("\n").filter(l => l.length > 3 && l.length < 140);
  // εικόνες
  const imgs = [...String(p.content.rendered || "").matchAll(/<img[^>]+?src="([^"]+)"[^>]*>/g)].map(m => m[1]).filter(u => /\/wp-content\/uploads\//.test(u));
  const full = [...new Set(imgs.map(u => u.replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "")))];
  const good = full.filter(u => GOOD_IMG.test(u) && !/model|usp|graph/i.test(u));
  const ok = full.filter(u => !BAD_IMG.test(u));
  d.images = [...new Set([...(p._featured ? [p._featured] : []), ...good, ...ok])];
  d.imageCandidates = full;
  // EAN στο όνομα αρχείου της φωτογραφίας συσκευασίας (π.χ. «5-206880-000412-PLACAID_MANGO_100ml.jpg», «7350121253933_front.jpg»)
  const eanOk = e => { const n = e.split("").map(Number); const sum = n.slice(0, 12).reduce((s, x, i) => s + x * (i % 2 ? 3 : 1), 0); return (10 - sum % 10) % 10 === n[12]; };
  for (const u of d.images) { const m = decodeURIComponent(u.split("/").pop()).replace(/-(?=\d)/g, "").match(/(?:^|\D)(\d{13})(?!\d)/); if (m && eanOk(m[1])) { d.ean = m[1]; break; } }
  d.imageLarge = d.images[0] || null;
  // μέγεθος από τον τίτλο / το κείμενο
  const all = [d.title, ...Object.values(d.tabs)].join("\n");
  const sz = d.title.match(/(\d+(?:[.,]\d+)?)\s?(ml|cc|g|gr|τεμ\.?|τμχ)\b/i) || all.match(/(?:Συσκευασία|Περιεχόμενο|Διατίθεται|σωληνάριο|φιάλη|μπουκάλι|tube)[^\n]{0,40}?(\d{2,4})\s?(ml|g|gr)\b/i);
  d.size = sz ? (sz[1].replace(",", ".") + sz[2].toLowerCase().replace("gr", "g").replace("cc", "ml")) : null;
  d.sizes = d.size ? [d.size] : [];
  if (d.size) d.attributes["Συσκευασία"] = d.size;
  d.category = CATEGORIES[catSlug] || catSlug; d.categories = [d.category]; d.line = d.category; d.catSlug = catSlug;
  d.attributes["Κατηγορία placcontrol.gr"] = d.category;
  d.brand = /tepe/i.test(d.title) ? "TePe" : (d.title.match(/^(APAGARD|APADENT|APAPRO|Forhans|MEGASONEX|Brush ?Baby|Plac ?Aid|Epic|ProxySoft|bioXtra|Protexin|Durimplant|Tenders|OraFresh|SmileGoods|Young|ProTech|Sonic)/i) || [])[1] || null;
  if (!d.brand) for (const b of ["Forhans", "MEGASONEX", "Epic", "Plac Aid", "APAGARD", "Brush Baby"]) if (new RegExp(b.replace(" ", " ?"), "i").test(d.title)) { d.brand = b; break; }
  if (d.brand) d.attributes["Μάρκα"] = d.brand.replace(/^Brush ?Baby$/i, "Brush Baby").replace(/^Plac ?Aid$/i, "Plac Aid");
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.description ? d.description.slice(0, 220) : null;
  d.handle = decodeURIComponent(p.slug || String(p.link).replace(/\/+$/, "").split("/").pop());
  const key = d.handle.replace(/^tepe-/, "").normalize("NFD").replace(/[^A-Za-z0-9]/g, "").slice(0, 60) || String(p.id);
  d.gtin = d.ean || ("TP-" + (key.length >= 4 ? key : key + p.id)); d.eans = [d.gtin];
  // μεγέθη μεσοδοντίων «0.6 mm – Μπλε» (xsoft, Angle) → μία κάρτα ανά μέγεθος· σκληρότητες (Nova, Select Compact) → μία ανά σκληρότητα
  const mm = [...String(d.tabs["Συσκευασία"] || "").matchAll(/(\d\.\d+)\s?mm\s*[–-]\s*([Α-ΩA-Zα-ωάέήίόύώa-z]+)/g)];
  const base = "TP-" + key.slice(0, 40);
  if (mm.length > 1) d.variants = mm.map(m => ({ ean: base + m[1].replace(".", ""), size: `${m[1]} mm ${m[2]}` }));
  else if (HARDNESS[d.handle]) d.variants = HARDNESS[d.handle].map(h => ({ ean: (h === "soft" && d.ean) ? d.ean : base + h.replace("-", ""), size: h }));
  if (d.variants.length) { d.eans = d.variants.map(v => v.ean); d.gtin = d.eans[0]; d.sizes = d.variants.map(v => v.size); d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", "); }
  return d;
}

async function main() {
  const pages = [];
  for (let pg = 1; pg < 6; pg++) { let a; try { a = await getJson(`${BASE}/wp-json/wp/v2/pages?per_page=100&page=${pg}&_fields=id,parent,link,slug,title,featured_media`); } catch { break; } pages.push(...a); if (a.length < 100) break; await sleep(DELAY_MS); }
  const catOf = new Map(pages.filter(p => /\/proionta\/[^/]+\/?$/.test(p.link)).map(p => [p.id, String(p.link).replace(/\/+$/, "").split("/").pop()]));
  for (const [id, cat] of Object.entries(EXTRA_PAGES)) { const p = pages.find(x => x.id === +id); if (p) catOf.set("x" + id, cat), p.parent = "x" + id; }
  const prods = pages.filter(p => catOf.has(p.parent) && CATEGORIES[catOf.get(p.parent)] && !/\/en\//.test(p.link));
  console.log(`placcontrol.gr: ${pages.length} σελίδες, ${prods.length} προϊόντα σε λιανικές κατηγορίες`);
  if (CACHE) await fs.mkdir(CACHE, { recursive: true });
  const out = [];
  for (let i = 0; i < prods.length; i++) {
    const p = prods[i];
    let full; const cf = CACHE && path.join(CACHE, `${p.id}.json`);
    try { full = JSON.parse(await fs.readFile(cf, "utf8")); } catch {
      full = await getJson(`${BASE}/wp-json/wp/v2/pages/${p.id}?_fields=id,parent,link,slug,title,content,featured_media`); await sleep(DELAY_MS);
      if (full.featured_media) { try { const m = await getJson(`${BASE}/wp-json/wp/v2/media/${full.featured_media}?_fields=source_url`); full._featured = m.source_url; } catch {} await sleep(DELAY_MS); }
      if (CONTENT_FROM[p.id] && !String(full.content.rendered || "").trim()) { const o = await getJson(`${BASE}/wp-json/wp/v2/pages/${CONTENT_FROM[p.id]}?_fields=content`); full.content = o.content; await sleep(DELAY_MS); }
      if (cf) await fs.writeFile(cf, JSON.stringify(full), "utf8");
    }
    const txt = String(full.content.rendered || "").replace(/<[^>]+>/g, "").trim();
    if (!txt && !full._featured) { console.log(`[${i + 1}/${prods.length}] κενή σελίδα — παραλείπεται: ${p.link}`); continue; }
    const d = extractPlacDetails(full, catOf.get(p.parent));
    out.push({ url: p.link, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`[${i + 1}/${prods.length}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${(d.size || "-").padEnd(7)} ${(d.brand || "-").padEnd(10)} | ${d.title}`);
  }
  // ίδιο προϊόν σε δύο σελίδες (παλιά + νέα, «Μέντα»/«Mint», «Μάνγκο»/«Mango») → κρατάμε αυτή με EAN στη φωτογραφία, αλλιώς με το περισσότερο κείμενο
  const tSize = t => (t.match(/(\d+)\s?(ml|cc|g)\b/i) || [])[1] || "";
  const nkey = t => t.toLowerCase().replace(/mint/g, "μέντα").replace(/mango/g, "μάνγκο").replace(/\d+\s?(ml|cc|g)\b/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zα-ω0-9]/g, "");
  const byName = {}; for (const p of out) (byName[nkey(p.name)] ||= []).push(p);
  for (const g of Object.values(byName)) {
    const sizes = new Set(g.map(p => tSize(p.name)).filter(Boolean));
    const bySize = {}; for (const p of g) (bySize[tSize(p.name) || (sizes.size === 1 ? [...sizes][0] : "")] ||= []).push(p);
    for (const h of Object.values(bySize)) if (h.length > 1) {
      h.sort((a, b) => (!!b.details.ean - !!a.details.ean) || (JSON.stringify(b.details.tabs).length - JSON.stringify(a.details.tabs).length));
      for (const p of h.slice(1)) p.details.duplicateOf = h[0].url;
    }
  }
  const dups = out.filter(p => p.details.duplicateOf); for (const p of dups) console.log(`  διπλή σελίδα: ${p.url} → ${p.details.duplicateOf}`);
  out.splice(0, out.length, ...out.filter(p => !p.details.duplicateOf));
  const seen = {}; for (const p of out) { if (seen[p.gtin]) { p.gtin = p.details.gtin = p.gtin + "x" + (++seen[p.gtin]); p.details.eans = [p.gtin]; } else seen[p.gtin] = 1; }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} (εκτός ${dups.length} διπλές). Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
