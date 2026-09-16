// Frezyderm catalog page logic — groups by SECTION → products
// Data: FREZYDERM_SUPPLIER (barcodes + wholesale)
// Enrichment: FREZYDERM_OVERRIDES (matched from frezyderm.gr)
// Section labels: FREZYDERM_SECTION_LABELS

const catalogEl = document.getElementById("catalog");
const searchEl = document.getElementById("search");
const sectionNavEl = document.getElementById("section-nav");
const noResultsEl = document.getElementById("no-results");
const resultCountEl = document.getElementById("result-count");

const OVERRIDES = window.FREZYDERM_OVERRIDES || {};
const SUPPLEMENTAL = window.FREZYDERM_SUPPLEMENTAL || {};
const SECTION_LABELS = window.FREZYDERM_SECTION_LABELS || {};

// Αν υπάρχει σελίδα στο frezyderm.gr (OVERRIDES) χρησιμοποιούμε ΜΟΝΟ αυτή —
// ποτέ μείγμα με δεδομένα φαρμακείου. Το SUPPLEMENTAL (φαρμακεία) είναι
// fallback αποκλειστικά για προϊόντα χωρίς σελίδα brand.
function enrichmentFor(barcode) {
  const o = OVERRIDES[barcode];
  if (o) {
    return {
      name: o.name || null, subtitle: o.subtitle || null, description: o.description || null, image: o.image || null,
      url: o.url || null, source: "frezyderm.gr", section: o.section || null,
      claims: o.claims || [], highlights: o.highlights || [], attributes: o.attributes || {}, sections: o.sections || {},
      matchType: o.matchType || null, review: !!o.review, noFrezydermPage: false
    };
  }
  const s = SUPPLEMENTAL[barcode] || {};
  return {
    name: s.name || null, subtitle: null, description: s.description || null, image: s.image || null,
    url: s.url || null, source: s.source || null, section: s.section || null,
    claims: [], highlights: [], attributes: {}, sections: {}, matchType: null, review: false, noFrezydermPage: true
  };
}

function fmtPriceLocal(n) { return n > 0 ? n.toFixed(2).replace(".", ",") + " €" : "—"; }
function escapeText(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function slugForId(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function sectionOf(p) {
  const e = enrichmentFor(p.barcode);
  return (e && e.section) || "diafora";
}

function labelFor(section) {
  return SECTION_LABELS[section] || { name: section, icon: "📦", accent: "#64748b" };
}

function displayName(p) {
  const e = enrichmentFor(p.barcode);
  return prettifyFrezydermName((e && e.name) || p.name || p.barcode);
}

function buildSectionNav(byS) {
  const order = Object.keys(byS).sort((a, b) => byS[b].length - byS[a].length);
  order.forEach(secKey => {
    const sec = labelFor(secKey);
    const count = byS[secKey].length;
    const a = document.createElement("a");
    a.href = `#section-${secKey}`;
    a.className = "section-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 text-white text-sm font-medium hover:bg-white/35 backdrop-blur";
    a.innerHTML = `
      <span>${sec.icon}</span>
      <span>${escapeText(sec.name)}</span>
      <span class="text-white/75">(${count})</span>
    `;
    sectionNavEl.appendChild(a);
  });
}

function makeCard(p) {
  const enrich = enrichmentFor(p.barcode);
  const section = sectionOf(p);
  const label = labelFor(section);
  const accent = label.accent;
  const card = document.createElement("a");
  card.href = `product.html?barcode=${encodeURIComponent(p.barcode)}&type=frezyderm`;
  card.className = "product-card group block bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-slate-300";
  const blob = (p.name + " " + (enrich.name || "") + " " + (enrich.subtitle || "") + " " + (enrich.description || "") + " " + (enrich.claims || []).join(" ") + " " + (p.barcode || "")).toLowerCase();
  card.dataset.search = blob;
  const qualityInit = frezydermDescriptionQuality(enrich.description);
  card.dataset.needsReview = qualityInit.ok ? "0" : "1";
  card.dataset.noPage = enrich.noFrezydermPage ? "1" : "0";

  const localUrl = p.barcode ? getLocalImageUrl(p.barcode) : null;
  const remoteUrl = localUrl || enrich.image || null;
  // "Όλα ΟΚ" = επίσημη σελίδα + πλήρης περιγραφή + εικόνα
  card.dataset.allOk = (!enrich.noFrezydermPage && qualityInit.ok && !enrich.review && !!remoteUrl) ? "1" : "0";
  card.dataset.barcode = p.barcode;
  const initials = "FZ";

  const imgWrap = document.createElement("div");
  imgWrap.className = "aspect-square relative overflow-hidden";
  imgWrap.innerHTML = `
    <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-3xl"
         style="--accent:${accent};--accent-dark:${shade(accent, -20)}">
      ${initials}
    </div>
    ${remoteUrl ? `<img src="${remoteUrl}" loading="lazy" decoding="async" alt="${escapeText(displayName(p))}" class="absolute inset-0 w-full h-full object-contain p-3 bg-white" onerror="this.remove()">` : ""}
    <div class="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold rounded-md bg-white/95 text-slate-800 shadow-sm">${fmtPriceLocal(p.wholesale)}</div>
    ${enrich.noFrezydermPage ? `<div class="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-slate-800/95 text-white shadow-sm" title="Δεν βρέθηκε σελίδα στο frezyderm.gr">Χωρίς Σελίδα</div>` : (enrich.review ? `<div class="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-amber-500/95 text-white shadow-sm" title="Match confidence < 6">Match?</div>` : "")}
    ${(() => { const q = frezydermDescriptionQuality(enrich.description); if (q.ok) return ""; const tip = q.reasons.map(frezReasonLabel).join(" · "); const showAny = enrich.noFrezydermPage || enrich.review; return `<div class="absolute ${showAny ? "top-8" : "top-2"} left-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-rose-500/95 text-white shadow-sm" title="${escapeText(tip)}">🔍 Περιγραφή</div>`; })()}
  `;
  card.appendChild(imgWrap);

  const body = document.createElement("div");
  body.className = "p-4";
  body.innerHTML = `
    <div class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:${accent}">${escapeText(label.name)}</div>
    <h3 class="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">${escapeText(displayName(p))}</h3>
    ${enrich.subtitle ? `<p class="mt-1 text-xs text-slate-500 line-clamp-2">${escapeText(enrich.subtitle)}</p>` : ""}
    <div class="mt-2 text-[10px] uppercase tracking-wide text-slate-500 font-medium">EAN ${escapeText(p.barcode)}</div>
  `;
  card.appendChild(body);

  return card;
}

function buildCatalog() {
  const byS = {};
  for (const p of FREZYDERM_SUPPLIER) {
    const s = sectionOf(p);
    if (!byS[s]) byS[s] = [];
    byS[s].push(p);
  }
  const order = Object.keys(byS).sort((a, b) => byS[b].length - byS[a].length);

  buildSectionNav(byS);

  order.forEach(secKey => {
    const sec = labelFor(secKey);
    const products = byS[secKey];

    const section = document.createElement("section");
    section.id = `section-${secKey}`;
    section.className = "section-anchor mb-16 scroll-mt-32";
    section.dataset.section = secKey;

    section.innerHTML = `
      <div class="flex items-end justify-between gap-3 mb-5 pb-3 border-b-2" style="border-color:${sec.accent}">
        <div class="flex items-center gap-3">
          <span class="text-3xl sm:text-4xl">${sec.icon}</span>
          <div>
            <h2 class="text-2xl sm:text-3xl font-bold tracking-tight" style="color:${sec.accent}">${escapeText(sec.name)}</h2>
          </div>
        </div>
        <div class="text-sm text-slate-400 font-medium whitespace-nowrap">${products.length} προϊόντα</div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" data-grid></div>
    `;
    const grid = section.querySelector("[data-grid]");
    products.forEach(p => grid.appendChild(makeCard(p)));
    catalogEl.appendChild(section);
  });
}

const QUALITY_LABEL = {
  ok:         "όλα ΟΚ",
  issue:      "με κάποιο θέμα",
  complete:   "με πλήρη περιγραφή",
  incomplete: "με ανεπαρκή περιγραφή",
  nopage:     "χωρίς σελίδα frezyderm.gr"
};

function passesQuality(card, mode) {
  if (mode === "ok")         return card.dataset.allOk === "1";
  if (mode === "issue")      return card.dataset.allOk !== "1";
  if (mode === "complete")   return card.dataset.needsReview === "0";
  if (mode === "incomplete") return card.dataset.needsReview === "1";
  if (mode === "nopage")     return card.dataset.noPage === "1";
  return true;
}

function applySearch(term) {
  const t = term.trim().toLowerCase();
  const qualityEl = document.getElementById("filter-quality");
  const mode = qualityEl ? qualityEl.value : "all";
  let visible = 0;
  document.querySelectorAll("section[data-section]").forEach(sec => {
    let secVisible = 0;
    sec.querySelectorAll(".product-card").forEach(card => {
      const show = (!t || card.dataset.search.includes(t)) && passesQuality(card, mode);
      card.style.display = show ? "" : "none";
      if (show) secVisible++;
    });
    sec.style.display = secVisible ? "" : "none";
    visible += secVisible;
  });
  noResultsEl.classList.toggle("hidden", visible > 0);
  const suffix = QUALITY_LABEL[mode] ? ` ${QUALITY_LABEL[mode]}` : "";
  resultCountEl.textContent = (t || mode !== "all") ? `${visible} προϊόντα${suffix}` : `${FREZYDERM_SUPPLIER.length} προϊόντα συνολικά`;
  const exportBtn = document.getElementById("export-filtered");
  if (exportBtn) { exportBtn.disabled = visible === 0; exportBtn.querySelector("[data-count]").textContent = visible; }
}

// Export των ορατών (φιλτραρισμένων) προϊόντων σε XLSX — ίδιες στήλες με το frezyderm-catalog.xlsx
function exportFiltered() {
  const visible = new Set([...document.querySelectorAll(".product-card")].filter(c => c.style.display !== "none").map(c => c.dataset.barcode));
  const products = FREZYDERM_SUPPLIER.filter(p => visible.has(p.barcode));
  const { headers, rows } = CatalogExport.buildRows({
    products, enrichmentFor, sectionLabels: SECTION_LABELS,
    prettify: prettifyFrezydermName, fallbackDesc: p => `Προϊόν Frezyderm — ${p.name}`,
    tabColumns: ["Κατάλληλο για", "Χρήση", "Δράση – Ενεργά συστατικά"], categoryAttr: "Κατηγορία frezyderm.gr"
  });
  const mode = (document.getElementById("filter-quality") || {}).value || "all";
  CatalogExport.download(`frezyderm-${mode}-${rows.length}.xlsx`, headers, rows, "Frezyderm");
}

buildCatalog();
applySearch("");

let searchTimer;
searchEl.addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(e.target.value), 120);
});
const filterQuality = document.getElementById("filter-quality");
if (filterQuality) filterQuality.addEventListener("change", () => applySearch(searchEl.value));
const exportFilteredBtn = document.getElementById("export-filtered");
if (exportFilteredBtn) exportFilteredBtn.addEventListener("click", exportFiltered);
