#!/usr/bin/env node
// scripts/scrape-lanes.mjs
// Lanes (Γρ. Σαράντης) = www.laneshealth.gr — WordPress (GenerateBlocks), post type «product» στο REST, ελληνικά, χωρίς EAN.
// Λίστα + κείμενα: /wp-json/wp/v2/product?_embed (τίτλος, excerpt, content, product_category, featured media).
// Content: <h2>/<h3> επικεφαλίδες → ενότητες: Περιγραφή / Ιδιότητες (→ Οφέλη) / Συνιστάται σε (→ Ενδείξεις) / Σύνθεση (→ Συστατικά) /
//   Πίνακας Διατροφικής Ανάλυσης (→ Συστατικά) / Συνιστώμενη ημερήσια δόση + Χρήση (→ Χρήση) / Μορφή – Συσκευασία / Προειδοποιήσεις.
// Κλειδί: "LA-<slug>". Τιμές με js/lanes-manual-matches.json.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/scrape-lanes.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToText } from "./lib-frezyderm.mjs";
import { decodeAll } from "./lib-lrp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "js/lanes-site.json");
const BASE = "https://www.laneshealth.gr";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const text = s => htmlToText(decodeAll(String(s || "").replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d|tr)>/gi, "\n").replace(/<\/t[dh]>/gi, " · "))).replace(/[ \t ]+/g, " ").replace(/ · \n/g, "\n").replace(/\s*·\s*$/gm, "").replace(/\s*\n\s*/g, "\n").trim();
const oneLine = s => text(s).replace(/\s+/g, " ").trim();
const getJson = async u => { const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90000) }); if (!r.ok) throw new Error(`HTTP ${r.status} ${u}`); return r.json(); };
const SEC = [[/^Περιγραφή/i, "Περιγραφή"], [/^Ιδιότητες|^Οφέλη|^Δράση/i, "Οφέλη"], [/^Συνιστάται|^Ενδείξεις|^Κατάλληλο/i, "Ενδείξεις"], [/^Σύνθεση|^Συστατικά/i, "Συστατικά"], [/Διατροφικής Ανάλυσης|Διατροφικ/i, "Διατροφική ανάλυση"], [/ημερήσια δόση|Δοσολογία|^Χρήση|^Τρόπος/i, "Χρήση"], [/^Μορφή|^Συσκευασία/i, "Συσκευασία"], [/Προειδοποιήσεις|Προσοχή|Προφυλάξεις/i, "Προφυλάξεις"]];

export function extractLanesDetails(p, catNames) {
  const d = { attributes: {}, tabs: {}, keyFacts: [], images: [], variants: [], advantages: [] };
  d.title = decodeAll(p.title.rendered).replace(/^LanesPropolCare/, "Lanes PropolCare ").replace(/\s+/g, " ").replace(/^Laneshealth\s*-\s*Tabs New\s*/i, "Lanes ").trim();
  d.subtitle = oneLine(p.excerpt && p.excerpt.rendered) || null;
  let html = String(p.content.rendered || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  // πίνακας διατροφικής ανάλυσης: μία γραμμή ανά <tr>
  html = html.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_, r) => "<p>" + [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => oneLine(c[1])).filter(Boolean).join(" · ") + "</p>").replace(/<\/?(table|tbody|thead|figure)[^>]*>/g, "");
  const parts = html.split(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/);
  const out = {};
  for (let i = 1; i < parts.length; i += 2) {
    const head = oneLine(parts[i]); const body = text(parts[i + 1] || "");
    if (!body) continue;
    const key = (SEC.find(([re]) => re.test(head)) || [])[1] || head;
    out[key] = [out[key], body].filter(Boolean).join("\n");
  }
  if (out["Διατροφική ανάλυση"]) { out["Συστατικά"] = [out["Συστατικά"], "Διατροφική ανάλυση:\n" + out["Διατροφική ανάλυση"]].filter(Boolean).join("\n\n"); delete out["Διατροφική ανάλυση"]; }
  // «Λαμβάνετε 2 δισκία την ημέρα» + «1 δισκίο σε νερό» → Χρήση
  if (out["Προφυλάξεις"]) out["Προφυλάξεις"] = out["Προφυλάξεις"].split("\n").filter(l => !/^(Παράγεται για|Υπεύθυνος Κυκλοφορίας|Γραμμή επικοινωνίας|Διανομέας Κύπρου|Τηλ\. Κέντρου)/i.test(l)).join("\n");
  if (out["Συσκευασία"]) {
    // «• 200 ταμπλέτες σε γυάλινο μπουκάλι / • 400 …» ή «50 ή 100 κάψουλες» → ένα μέγεθος ανά γραμμή· σύντομη ετικέτα μέχρι το «σε …»
    const full = out["Συσκευασία"].replace(/κάψουλες κάψουλες/g, "κάψουλες");
    const lines = full.split("\n").map(l => l.replace(/^[•·\-]\s*/, "").replace(/\.$/, "").trim()).filter(Boolean);
    const short = l => l.replace(/\s+σε\s+(γυάλινο|πλαστικό|κουτί|blister|συσκευασία).*$/i, "").replace(/\s+e$/, "").trim();
    // πολλά μεγέθη μόνο όταν είναι κουκκίδες «• N …» (όχι λίστα περιεχομένου ενός κουτιού, π.χ. THE ACTIVE Club: 30 μαλακές + 30 σκληρές)
    const bullets = full.split("\n").filter(l => /^\s*[•·]\s*\d/.test(l));
    let sizes = bullets.length > 1 ? bullets.map(l => short(l.replace(/^\s*[•·]\s*/, "").replace(/\.$/, ""))) : [short(lines[0] || "")].filter(Boolean);
    const alt = (lines[0] || "").match(/^(\d+)\s+ή\s+(\d+)\s+(.+)$/);
    if (alt) sizes = [`${alt[1]} ${short(alt[3])}`, `${alt[2]} ${short(alt[3])}`];
    d.sizes = sizes.length ? sizes : [short(lines[0] || "")].filter(Boolean);
    d.size = d.sizes[0] || null;
    d.attributes["Συσκευασία"] = lines.join(" / ");
    delete out["Συσκευασία"];
  }
  d.tabs = out;
  if (!d.tabs["Περιγραφή"] && d.subtitle) d.tabs["Περιγραφή"] = d.subtitle;
  if (d.tabs["Οφέλη"]) d.advantages = d.tabs["Οφέλη"].split("\n").filter(l => l.length > 10);
  for (const l of (d.tabs["Περιγραφή"] || "").split("\n")) if (/χωρίς (ζάχαρη|γλουτένη|λακτόζη)|vegan|κατάλληλο για χορτοφάγους/i.test(l) && l.length < 90) d.keyFacts.push(l.replace(/\.$/, ""));
  if (d.keyFacts.length) d.tabs["Χαρακτηριστικά"] = d.keyFacts.join("\n");
  d.categories = (p.product_category || []).map(id => catNames.get(id)).filter(Boolean); d.category = d.categories.join(" | ") || null;
  if (d.category) d.attributes["Κατηγορίες laneshealth.gr"] = d.category;
  const fm = p._embedded && p._embedded["wp:featuredmedia"] && p._embedded["wp:featuredmedia"][0];
  const img = fm && (fm.source_url || (fm.media_details && fm.media_details.sizes && fm.media_details.sizes.full && fm.media_details.sizes.full.source_url));
  if (img) d.images.push(img);
  d.imageLarge = d.images[0] || null;
  d.sizes = d.sizes || (d.size ? [d.size] : []);
  d.flavour = ((d.subtitle || "").match(/με (?:υπέροχη |έντονη )?γεύση ([^.,]+?)(?:\.|,|$)/i) || [])[1] || null;
  d.description = (d.tabs["Περιγραφή"] || "").replace(/\s+/g, " ").trim() || null;
  d.shortDescription = d.subtitle;
  d.handle = decodeURIComponent(p.slug);
  const key = d.handle.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").slice(0, 60) || String(p.id);
  d.gtin = "LA-" + (key.length >= 4 ? key : key + p.id); d.eans = [d.gtin];
  if (d.sizes.length > 1) { d.variants = d.sizes.map(z => ({ ean: d.gtin + (z.match(/^\d+/) || [""])[0], size: z })); d.eans = d.variants.map(v => v.ean); d.gtin = d.eans[0]; }
  return d;
}

async function main() {
  const all = [];
  for (let pg = 1; pg < 10; pg++) { let a; try { a = await getJson(`${BASE}/wp-json/wp/v2/product?per_page=50&page=${pg}&_embed=wp:featuredmedia`); } catch { break; } all.push(...a); if (a.length < 50) break; }
  const cats = await getJson(`${BASE}/wp-json/wp/v2/product_category?per_page=100&_fields=id,name`).catch(() => []);
  const catNames = new Map(cats.map(c => [c.id, decodeAll(c.name)]));
  console.log(`laneshealth.gr: ${all.length} προϊόντα (REST), ${catNames.size} κατηγορίες`);
  const out = [];
  for (const p of all) {
    const d = extractLanesDetails(p, catNames);
    out.push({ url: p.link, section: "p", name: d.title, description: (d.description || "").slice(0, 700), longDescription: d.description, subtitle: d.subtitle, details: d, image: d.images[0] || null, gtin: d.gtin });
    console.log(`${d.images.length ? "img+" : "img-"} ${Object.keys(d.tabs).length}tabs ${d.gtin.slice(0, 34).padEnd(34)} ${(d.size || "-").slice(0, 22).padEnd(22)} | ${d.title}`);
  }
  // ίδιο κλειδί → αριθμός· ίδιο όνομα → συσκευασία στο όνομα
  const seen = {}; for (const p of out) { if (seen[p.gtin]) { p.gtin = p.details.gtin = p.gtin.slice(0, 60) + "x" + (++seen[p.gtin]); p.details.eans = [p.gtin]; } else seen[p.gtin] = 1; }
  const byName = {}; for (const p of out) (byName[p.name.toLowerCase().replace(/\s+/g, "")] ||= []).push(p);
  for (const g of Object.values(byName)) if (g.length > 1) {
    const sameSize = new Set(g.map(p => p.details.size)).size < g.length;
    for (const p of g) { const tag = sameSize && p.details.flavour ? p.details.flavour : p.details.size; if (tag) p.details.fullTitle = `${p.name} ${tag}`; }
  }
  await fs.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`\nDone. products=${out.length}. Έγραψε ${path.relative(ROOT, OUT_FILE)}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
