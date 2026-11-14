#!/usr/bin/env node
// scripts/scrape-caudalie.mjs
// Caudalie Ελλάδα = gr.caudalie.com — Nuxt 3 (SSR) πάνω από Magento, ελληνικά, με EAN (code_ean).
// Λίστα: /sitemap.xml → /p/<SKU>/<slug>.html. Δεδομένα από το payload <script id="__NUXT_DATA__"> (scripts/lib-nuxt.mjs),
//   state["$spdp-product"]: name, description.html, caudalie_application_advice / caudalie_tips_application (Χρήση),
//   ingredients (INCI), active_ingredients_labels (ενεργά συστατικά με περιγραφή), caudalie_formula_list_labels (χαρακτηριστικά),
//   product_what/who/when/how_label, caudalie_range_label (σειρά), contenance_label (μέγεθος), caudalie_faq_*, media_gallery,
//   categories/breadcrumbs. ConfigurableProduct (πολλά μεγέθη): η σελίδα δίνει μόνο το EAN του πρώτου μεγέθους → ξανά η σελίδα με
//   ?<attribute_uid>=<value uid> για κάθε άλλο μέγεθος (configurable_product_options_selection.variant).
// ΕΚΤΟΣ: σετ / duo / trio / gift sets / «essentials» (κατηγορία «Limited editions & gift sets», URL «vir-…»).
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-caudalie.mjs [--limit=5] [--delay=1000]

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";
import { nuxtData } from "./lib-nuxt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/caudalie-site.json");
const BASE = "https://gr.caudalie.com";
const args = process.argv.slice(2);
const opt = (k, def) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : def; };
const LIMIT = parseInt(opt("limit", "0")) || Infinity;
const DELAY_MS = parseInt(opt("delay", "1000"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => htmlToText(decodeAll(String(s || "").replace(/\r/g, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|tr|h\d)>/gi, "\n").replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "$1"))).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
async function fetchText(url) {
  for (let t = 0; t < 3; t++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(60000) });
    if (res.status === 429 || res.status >= 500) { await sleep(5000 * (t + 1)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  throw new Error("HTTP retry limit");
}
const productOf = html => { const r = nuxtData(html); return r && r.state && r.state["$spdp-product"]; };
const eanOf = s => (String(s || "").match(/\d{13}/) || [])[0] || null;
const SET_RE = /\b(duo|trio|kit|gift|coffret|essentials|ritual|routine|collection|box)\b|\bset$/i;   // «Beauty Elixir Prep, Set, Glow» = βασικό προϊόν
const sizeNorm = s => String(s || "").replace(/mL\b/g, "ml").replace(/γρ\b/g, "g").replace(/\s+/g, " ").trim();

export function extractCaudalieDetails(p, url) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = decodeAll(p.name || "").replace(/\s+/g, " ").trim();
  d.typename = p.__typename;
  const desc = text(p.description && p.description.html);
  if (desc) d.tabs["Περιγραφή"] = desc;
  // ενεργά συστατικά (label: περιγραφή) → Οφέλη
  const act = (p.active_ingredients_labels || []).filter(a => a && a.label).map(a => `${a.label}: ${oneLine(a.description || "")}`.replace(/:\s*$/, ""));
  if (act.length) { d.advantages = act; d.tabs["Ενεργά συστατικά"] = act.join("\n"); }
  const res = [1, 2, 3, 4].map(i => [p[`caudalie_visible_result_value_${i}`], p[`caudalie_visible_result_label_${i}`]]).filter(([v, l]) => v && l).map(([v, l]) => `${oneLine(v)} ${oneLine(l)}`);
  if (res.length) d.tabs["Αποτελέσματα"] = [...res, oneLine(p.caudalie_clinical_results_legal || "")].filter(Boolean).join("\n");
  const use = [text(p.caudalie_application_advice), text(p.caudalie_tips_application)].filter(Boolean);
  if (use.length) d.tabs["Χρήση"] = use.join("\n\n");
  const inci = oneLine(p.ingredients); if (inci) d.tabs["Συστατικά"] = inci;
  const faq = []; for (let i = 1; i <= 15; i++) { const q = oneLine(p[`caudalie_faq_question_${i}`]), a = text(p[`caudalie_faq_answer_${i}`]); if (q && a) faq.push(`${q}\n${a}`); }
  if (faq.length) d.tabs["Συχνές ερωτήσεις"] = faq.join("\n\n");
  d.keyFacts = [...new Map((p.caudalie_formula_list_labels || []).map(f => oneLine(f.label)).filter(Boolean).map(k => [k.toLowerCase(), k])).values()];
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  const A = (k, v) => { v = oneLine(v); if (v) d.attributes[k] = v; };
  A("Για ποιον", p.product_who_label); A("Πότε", p.product_when_label); A("Υφή", p.product_how_label); A("Ανάγκη", p.product_what_label);
  A("Σειρά", p.caudalie_range_label);
  d.line = d.series = oneLine(p.caudalie_range_label) || null;
  const cats = [...new Set([...(p.categories || []).map(c => oneLine(c.name)), ...(p.breadcrumbs || []).map(b => oneLine(b.name))])].filter(c => c && !/^Όλα τα προϊόντα$|^Ανάγκες$|^Σειρές$|^Τα νέα μας|^Νέο$/i.test(c));
  d.categories = cats; d.category = cats.join(" | ") || null; d.breadcrumbs = (p.breadcrumbs || []).map(b => oneLine(b.name));
  if (d.category) d.attributes["Κατηγορίες gr.caudalie.com"] = d.category;
  const gal = [...(p.media_gallery || []), ...((p.configurable_product_options_selection || {}).media_gallery || [])].filter(m => m && m.url && !m.disabled).sort((a, b) => (a.position || 0) - (b.position || 0)).map(m => String(m.url).split("?")[0]);
  const thumb = p.thumbnail && p.thumbnail.url ? String(p.thumbnail.url).split("?")[0] : null;
  d.images = [...new Set([thumb, ...gal].filter(Boolean))].map(u => u + "?w=1200&auto=format,compress");
  d.imageLarge = d.images[0] || null;
  d.size = sizeNorm(p.contenance_label) || null; d.sizes = d.size ? [d.size] : [];
  if (d.size) d.attributes["Συσκευασία"] = d.size;
  d.isSet = (p.categories || []).some(c => /gift sets|limited editions/i.test(c.name || "")) || SET_RE.test(d.title) || /\/p\/vir-/i.test(url);
  d.sku = p.sku; d.gtin = eanOf(p.code_ean) || eanOf(p.configurable_product_options_selection?.variant?.code_ean); d.eans = d.gtin ? [d.gtin] : [];
  d.subtitle = oneLine(p.meta_description) || null;
  d.description = desc.replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = String(url).replace(/\.html$/, "").split("/").pop();
  return d;
}

async function main() {
  const sm = await fetchText(BASE + "/sitemap.xml");
  const urls = [...new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()).filter(u => /\/p\/[^/]+\/[^/]+\.html$/.test(u)))];
  console.log(`gr.caudalie.com: ${urls.length} σελίδες προϊόντων στο sitemap`);
  const out = []; let err = 0, sets = 0; const cap = Math.min(urls.length, LIMIT);
  for (let i = 0; i < cap; i++) {
    const url = urls[i];
    try {
      const html = await fetchText(url);
      const p = productOf(html);
      if (!p || !p.name) { console.log(`[${i + 1}/${cap}] skip (χωρίς δεδομένα) ${url}`); await sleep(DELAY_MS); continue; }
      const d = extractCaudalieDetails(p, url);
      if (d.isSet) { sets++; console.log(`[${i + 1}/${cap}] set  | ${d.title}`); await sleep(DELAY_MS); continue; }
      // μεγέθη: πρώτο από τη σελίδα, τα υπόλοιπα με ?<attribute_uid>=<value uid>
      const opt0 = (p.configurable_options || [])[0];
      if (p.__typename === "ConfigurableProduct" && opt0 && (opt0.values || []).length) {
        const first = p.configurable_product_options_selection?.variant;
        const firstName = oneLine(first?.name || "");
        for (const v of opt0.values) {
          let ean = null, vname = null;
          if (first && (firstName.endsWith(v.label) || opt0.values.length === 1)) { ean = eanOf(first.code_ean); vname = firstName; }
          else {
            await sleep(DELAY_MS);
            try { const vp = productOf(await fetchText(`${url}?${opt0.attribute_uid}=${encodeURIComponent(v.uid)}`)); const vv = vp?.configurable_product_options_selection?.variant; ean = eanOf(vv?.code_ean); vname = oneLine(vv?.name || ""); } catch (e) { console.log(`  ! μέγεθος ${v.label}: ${e.message}`); }
          }
          if (ean) d.variants.push({ ean, size: sizeNorm(v.label), name: vname });
        }
        d.variants = d.variants.filter((v, k, a) => a.findIndex(x => x.ean === v.ean) === k);   // το site δίνει μερικές φορές ίδιο EAN και στο refill
        if (d.variants.length) {
          d.gtin = d.variants[0].ean; d.eans = d.variants.map(v => v.ean);
          d.sizes = d.variants.map(v => v.size); d.size = d.sizes[0]; d.attributes["Διαθέσιμα μεγέθη"] = d.sizes.join(", "); delete d.attributes["Συσκευασία"];
          if (d.variants.length === 1) { d.attributes["Συσκευασία"] = d.size; d.variants = []; }
        }
      }
      if (!d.gtin) { err++; console.log(`[${i + 1}/${cap}] χωρίς EAN ${url}`); await sleep(DELAY_MS); continue; }
      out.push({ url, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
      console.log(`[${i + 1}/${cap}] ${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${String(d.eans.length).padStart(2)}sz ${(d.size || "-").padEnd(8)} ${(d.line || "-").slice(0, 22).padEnd(22)} | ${d.title}`);
    } catch (ex) { err++; console.log(`[${i + 1}/${cap}] ERR ${url} ${ex.message}`); }
    await sleep(DELAY_MS);
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length} sets=${sets} errors=${err}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
