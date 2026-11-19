#!/usr/bin/env node
// scripts/fetch-brand-logos.mjs
// Κατεβάζει το λογότυπο κάθε brand (js/brands.js) από το επίσημο site → images/logos/<key>.<ext> και γράφει το js/brand-logos.js
// (window.BRAND_LOGOS = { key: "images/logos/…" }) για τη σελίδα «Εταιρίες» (brands.html).
// Υποψήφια: <img>/<svg> με «logo» στο class/id/alt/src (πρώτα μέσα στο header/nav), μετά apple-touch-icon / μεγάλο icon, τέλος og:image.
// LOGO_SRC: σελίδα ή απευθείας URL εικόνας ανά brand (διανομείς, sites χωρίς καθαρό logo). Sites που μπλοκάρουν → Playwright.
// Χρήση (cloud: NODE_USE_ENV_PROXY=1): node scripts/fetch-brand-logos.mjs [--only=key,key] [--force]
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { looksLikeImage } from "./sync-brand-images.mjs";
import { loadWindowFile } from "./lib-frezyderm.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "images/logos");
const MAP_FILE = path.join(ROOT, "js/brand-logos.js");
const args = process.argv.slice(2);
const ONLY = ((args.find(a => a.startsWith("--only=")) || "").slice(7) || "").split(",").filter(Boolean);
const FORCE = args.includes("--force");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// σελίδα (ή εικόνα) από την οποία παίρνουμε το λογότυπο, όταν δεν είναι η αρχική του cfg.host
export const LOGO_SRC = {
  ducray: "https://www.ducray.com/gr-gr",
  klorane: "https://www.klorane.com/gr-el", avene: "https://www.eau-thermale-avene.gr/", vichy: "https://www.vichy.gr/", liposan: "https://www.liposan.gr/", nivea: "https://www.nivea.gr/",
  hansaplast: "https://www.hansaplast.gr/", intermed: "https://intermed.com.gr/assets/intermed_logo-925f68ab0f1153cc8e7f8fb5a2a659cb6171d162c42cd0cfc6131119d9fc06cd.png", uriage: "https://www.uriage.com/GR/el/", helenvita: "https://www.helenvita.com/",
  cerave: "https://www.cerave.gr/", mustela: "https://www.mustela.com.gr/", healthaid: "https://www.healthaid.co.uk/cdn/shop/files/healthaid-logo-459x161.png?width=459",
  powerhealth: "https://www.powerhealth.gr/", quest: "https://www.douni.gr/media/1391/logo_quest_blue.jpg?mode=pad&width=350&height=250&bgcolor=fff", vitabiotics: "https://www.vitabiotics.gr/", superfoods: "https://superfoods.eu/el/", caudalie: "https://gr.caudalie.com/",
  bioderma: "https://www.bioderma.gr/", sebamed: "https://www.intramed-pharma.gr/wp-content/uploads/2019/09/Logo-sebamed-E-N_VH.png", froika: "https://www.froika.com/", mollers: "https://www.mollersomega3.com/",
  lanes: "https://www.laneshealth.gr/", eubos: "https://www.eubos.gr/", vencil: "https://www.vencil.gr/", curaprox: "https://www.curaprox.gr/",
  pforal: "https://www.pierrefabre-oralcare.com/gr-gr", tepe: "https://www.placcontrol.gr/wp-content/uploads/2021/09/tepelogo_thin.png", gum: "https://www.sunstargum.com/gr-el/",
  podia: "https://www.podiafootcare.com/", bepanthol: "https://www.bepanthol.gr/el/", eviol: "https://eviol.gr/wp-content/uploads/2025/08/EVIOL-logo-blue_2-350x100.png",
  nuk: "https://www.nuk.gr/static/version1793172922/frontend/Mapa/nuk/default/images/logo_nuk.png",
  // chicco: το chicco.it απορρίπτει (403) το UA «browser» του script· το logo.svg κατέβηκε με curl → images/logos/chicco.svg
  chicco: "https://www.chicco.it/on/demandware.static/Sites-Chicco-Italy-Site/-/default/dw1ab986ad/images/logo.svg",
  lactacyd: "https://s3.eu-west-3.amazonaws.com/perrigo.com/lactacyd-gr-assets/inline-images/logo-lactacyd-1%201.png?VersionId=Mm.c2ODyFThI9qmtle2nFollWNxI2Ej2",
  elladent: "https://www.elladent.gr/image/data/New-final-logo-black.png",
  physiomer: "https://s3.eu-west-3.amazonaws.com/perrigo.com/dev-centralbrandmasterr-assets/inline-images/Physiomer_logo.png?VersionId=cmenuoYUNV8VWOOrbRrkaMG2zCFM8c4o",
  neilmed: "https://www.sinusrinse.gr/wp-content/themes/nemesys/assets/images/LOGO_SINUSRINSE_NEILMED_V3.png",
  bausch: "https://www.bausch.gr/siteassets/img/logo-crop.svg",
  // alcon: το λογότυπο του site είναι λευκό (footer) → images/logos/alcon.png = ίδιο αρχείο χρωματισμένο #003595 με ImageMagick
  // (convert alcon-logo-see2.png -fill '#003595' -colorize 100 alcon.png)· μην το ξανατρέξετε με --only=alcon.
  alcon: "https://www.myalcon.com/gr/sites/g/files/rbvwei3081/files/alcon-logo-see2.png",
  zwitter: "https://zwitter.gr/wp-content/uploads/2024/09/ZWITTER-LOGO.png",
  helenvision: "https://helenvision.gr/wp-content/uploads/2025/12/LOGO-HELENVISION-400x107.webp",
  sostar: "https://www.sostar.gr/",
  medisei: "https://www.medisei.gr/el/",
  isdin: "https://isdin.gr/",
  altion: "https://www.altion.gr/",
  karabinis: "https://karabinismedical.gr/wp-content/uploads/2023/04/logo-karabinis.svg",
  // Από το pharm24.gr (σελίδα μαρκών, αρχεία πλήρους μεγέθους) όταν το επίσημο site δεν δίνει καθαρό λογότυπο ή δεν είναι διαθέσιμο.
  // Μετά τη λήψη: convert <αρχείο>[0] -background white -flatten -fuzz 6% -trim +repage -bordercolor white -border 6 images/logos/<key>.png
  frezyderm: "https://cdn.pharm24.gr/images/FREZYDERM__LOGO.jpg",
  lamberts: "https://cdn.pharm24.gr/images/manufacturers/lamberts-logo.gif",
  aderma: "https://cdn.pharm24.gr/images/manufacturers/ADERMA_.jpg",
  korres: "https://cdn.pharm24.gr/images/korreslogopharm24.jpg",
  apivita: "https://cdn.pharm24.gr/images/newlogoapivoita.jpg",
  centrum: "https://cdn.pharm24.gr/images/manufacturers/centrum.png",
  gehwol: "https://cdn.pharm24.gr/images/manufacturers/gehwol.jpg",
  corega: "https://cdn.pharm24.gr/images/manufacturers/adcdascdsdsavsacsz.jpg",
  sensodyne: "https://cdn.pharm24.gr/images/manufacturers/sensodyned.png",
  hydrovit: "https://cdn.pharm24.gr/images/manufacturers/HydroVitlogo.jpg",
  lrp: "https://cdn.pharm24.gr/images/LRPLogo_New_.jpg",
  pharmasept: "https://cdn.pharm24.gr/images/manufacturers/PHARMASEPT_LOGO.png",
  solgar: "https://cdn.pharm24.gr/images/manufacturers/solgarLogoPharm24_.jpg",
  unipharma: "https://cdn.pharm24.gr/images/manufacturers/unipharm.jpg"
};
const BROWSER = new Set(["bepanthol"]);
// χωρίς λογότυπο του ίδιου του brand στη διαθέσιμη πηγή (διανομέας/φαρμακείο) → η σελίδα «Εταιρίες» δείχνει τα αρχικά του brand
const NO_LOGO = new Set([]);   // (gehwol, corega, sensodyne, hydrovit: πλέον από το pharm24.gr)
// προτιμώμενη λέξη στο όνομα αρχείου/alt (όταν η σελίδα έχει πολλά logos, π.χ. διανομείς)
const HINT = { sebamed: /sebamed/i, gehwol: /gehwol/i, corega: /corega/i, sensodyne: /sensodyne/i, quest: /quest/i, pforal: /elgydium|pierre|oral/i, altion: /altion/i };

const abs = (u, base) => { try { return new URL(u.replace(/&amp;/g, "&"), base).href; } catch { return null; } };
async function getHtml(url, useBrowser) {
  if (!useBrowser) {
    try { const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "el-GR,el;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(40000) }); if (r.ok) return { html: await r.text(), base: r.url }; } catch {}
  }
  const { chromium } = require("playwright");
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--disable-blink-features=AutomationControlled"] });
  try { const c = await b.newContext({ locale: "el-GR", userAgent: UA }); const p = await c.newPage(); await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); await p.waitForTimeout(3000); return { html: await p.content(), base: p.url(), page: p, browser: b }; }
  catch (e) { await b.close(); throw e; }
}
async function getBuf(url, ctx) {
  if (ctx && ctx.page) {
    const r = await ctx.page.evaluate(async u => { const res = await fetch(u, { headers: { Accept: "image/svg+xml,image/png,image/webp,image/*;q=0.8" } }); const ab = await res.arrayBuffer(); let s = ""; const b = new Uint8Array(ab); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return { ok: res.ok, ct: res.headers.get("content-type") || "", b64: btoa(s) }; }, url);
    if (!r.ok) throw new Error("HTTP"); return { buf: Buffer.from(r.b64, "base64"), ct: r.ct };
  }
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/svg+xml,image/png,image/webp,image/*;q=0.8" }, signal: AbortSignal.timeout(40000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`); return { buf: Buffer.from(await r.arrayBuffer()), ct: r.headers.get("content-type") || "" };
}
const extOf = (ct, u) => /svg/.test(ct) || /\.svg(\?|$)/i.test(u) ? "svg" : /png/.test(ct) ? "png" : /webp/.test(ct) ? "webp" : /gif/.test(ct) ? "gif" : /avif/.test(ct) ? "avif" : "jpg";

export function logoCandidates(html, base, hint) {
  const h = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/g, "");
  const top = (h.match(/<header[\s\S]*?<\/header>/i) || [""])[0] + (h.match(/<nav[\s\S]*?<\/nav>/i) || [""])[0];
  const out = [];
  const imgRe = /<img\b[^>]*>/gi;
  for (const scope of [top, h]) for (const m of scope.matchAll(imgRe)) {
    const tag = m[0]; const src = (tag.match(/\b(?:data-src|src)="([^"]+)"/i) || [])[1]; if (!src || src.startsWith("data:")) continue;
    const blob = tag.toLowerCase(); if (!/logo|brand/.test(blob)) continue;
    if (hint && !hint.test(tag)) continue;
    out.push({ type: "img", url: abs(src, base), score: (scope === top ? 2 : 0) + (/\.svg/i.test(src) ? 1 : 0) });
  }
  if (!hint) {
    for (const m of (top || h).matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)) { const s = m[0]; if (/logo|brand/i.test(s.slice(0, 400)) && s.length > 300) { out.push({ type: "svg", svg: s, score: 3 }); break; } }
    const parentLogo = (top || h).match(/<a[^>]*class="[^"]*logo[^"]*"[^>]*>\s*(<svg[\s\S]*?<\/svg>)/i); if (parentLogo) out.push({ type: "svg", svg: parentLogo[1], score: 4 });
    for (const m of h.matchAll(/<link[^>]+rel="(?:apple-touch-icon|icon)"[^>]*>/gi)) { const href = (m[0].match(/href="([^"]+)"/) || [])[1]; const sz = parseInt((m[0].match(/sizes="(\d+)/) || [])[1] || "0"); if (href && (sz >= 120 || /apple/.test(m[0]))) out.push({ type: "img", url: abs(href, base), score: -2 }); }
  }
  return out.filter(c => c.type === "svg" || c.url).sort((a, b) => b.score - a.score);
}

// Στιγμιότυπο του στοιχείου-λογοτύπου στη σελίδα (Playwright): το καλύτερο <img>/<svg>/<a> με «logo» ψηλά στη σελίδα → διάφανο PNG.
// Δουλεύει και για sprites, CSS backgrounds και λογότυπα που σχεδιάζονται με JavaScript.
async function screenshotLogo(page, hint) {
  await page.addStyleTag({ content: `[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],#onetrust-banner-sdk,#onetrust-consent-sdk,.didomi-popup-container,#didomi-host,#CybotCookiebotDialog,#usercentrics-root,[class*=newsletter-popup i],[class*=modal-backdrop i]{display:none!important;visibility:hidden!important}` }).catch(() => {});
  await page.waitForTimeout(800);
  const handle = await page.evaluateHandle((hintSrc) => {
    const hint = hintSrc ? new RegExp(hintSrc, "i") : null;
    const attrs = el => [el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className, el.id, el.getAttribute("alt"), el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("src"), el.getAttribute("data-src")].filter(Boolean).join(" ");
    const up = (el, n) => { let s = ""; for (let e = el, i = 0; e && i < n; e = e.parentElement, i++) s += " " + attrs(e) + (e.tagName === "A" ? " href=" + e.getAttribute("href") : ""); return s; };
    const els = [...document.querySelectorAll("img, svg, a")];
    let best = null, bestScore = -1e9;
    for (const el of els) {
      if (el.tagName.toLowerCase() === "svg" && el.closest("svg") !== el) continue;
      const r = el.getBoundingClientRect(); if (r.width < 30 || r.height < 12 || r.width > 520 || r.height > 220 || r.top > 260 || r.bottom < 0) continue;
      const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
      const a = up(el, 4).toLowerCase();
      let score = 0;
      if (/logo/.test(attrs(el).toLowerCase())) score += 6; else if (/logo/.test(a)) score += 4;
      if (hint && hint.test(up(el, 4))) score += 6;
      if (/href=(\/|https?:\/\/[^\/]+\/?)(\s|$|el\/|gr-|#)/.test(a)) score += 3;
      if (el.closest("header, nav, [class*=header i]")) score += 2;
      if (el.tagName === "A" && !el.querySelector("img, svg")) score -= 10;
      if (/icon|search|cart|basket|user|account|menu|burger|close|arrow|flag|location|spotscan|social|facebook|instagram/.test(attrs(el).toLowerCase())) score -= 8;
      score -= r.top / 100; score -= r.left / 1500;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    if (best && best.tagName === "A") best = best.querySelector("img, svg") || best;
    return bestScore >= 3 ? best : null;
  }, hint ? hint.source : null);
  const el = handle.asElement(); if (!el) return null;
  return await el.screenshot({ omitBackground: true, type: "png" });
}

async function main() {
  const w = await loadWindowFile(path.join(ROOT, "js/brands.js"));
  const B = w.BRAND_CATALOGS;
  await fs.mkdir(OUT_DIR, { recursive: true });
  let map = {}; try { const t = await fs.readFile(MAP_FILE, "utf8"); map = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch {}
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--disable-blink-features=AutomationControlled"] });
  for (const key of Object.keys(B)) {
    if (ONLY.length && !ONLY.includes(key)) continue;
    if (map[key] && !FORCE) { try { await fs.access(path.join(ROOT, map[key])); console.log(`${key.padEnd(12)} skip`); continue; } catch {} }
    if (NO_LOGO.has(key)) { delete map[key]; console.log(`${key.padEnd(12)} — χωρίς πηγή λογοτύπου (αρχικά)`); continue; }
    const src = LOGO_SRC[key] || `https://${B[key].host}/`;
    const ctx = await browser.newContext({ locale: "el-GR", userAgent: UA, viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    try {
      if (/\.(png|svg|jpe?g|webp)(\?|$)/i.test(src)) {
        const { buf, ct } = await getBuf(src); const ext = extOf(ct, src); const rel = `images/logos/${key}.${ext}`;
        await fs.writeFile(path.join(ROOT, rel), buf); map[key] = rel; console.log(`${key.padEnd(12)} OK direct`); continue;
      }
      await page.goto(src, { waitUntil: "domcontentloaded", timeout: 60000 }); await page.waitForTimeout(key === "apivita" ? 9000 : 3500);
      const png = await screenshotLogo(page, HINT[key]);
      if (!png || png.length < 400) { console.log(`${key.padEnd(12)} MISS`); continue; }
      for (const ext of ["svg", "png", "webp", "jpg", "gif", "avif"]) { try { await fs.unlink(path.join(OUT_DIR, `${key}.${ext}`)); } catch {} }
      const rel = `images/logos/${key}.png`; await fs.writeFile(path.join(ROOT, rel), png); map[key] = rel;
      console.log(`${key.padEnd(12)} OK screenshot ${png.length}b`);
    } catch (e) { console.log(`${key.padEnd(12)} ERR ${String(e.message).split("\n")[0]}`); }
    finally { await ctx.close(); }
  }
  await browser.close();
  await fs.writeFile(MAP_FILE, "// Auto-generated (scripts/fetch-brand-logos.mjs): λογότυπα brands για τη σελίδα «Εταιρίες».\nwindow.BRAND_LOGOS = " + JSON.stringify(map, null, 2) + ";\n", "utf8");
  console.log(`\n${Object.keys(map).length}/${Object.keys(B).length} λογότυπα. Έγραψε ${path.relative(ROOT, MAP_FILE)}.`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error("FATAL:", e); process.exit(1); });
