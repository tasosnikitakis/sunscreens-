// Generic brand catalog page (Frezyderm, Lamberts, A-Derma, …).
// Το brand επιλέγεται από <body data-brand="…"> και το μητρώο js/brands.js.
// Data: <BRAND>_SUPPLIER (barcodes + χονδρική) · <BRAND>_OVERRIDES (brand site) ·
// <BRAND>_SUPPLEMENTAL (fallback φαρμακείων) · <BRAND>_SECTION_LABELS.

const BRAND = (window.BRAND_CATALOGS || {})[document.body.dataset.brand];
if (!BRAND) throw new Error("brand-app: άγνωστο data-brand στο <body>");
const BU = window.BRAND_CATALOGS_UTIL;
const DATA = BU.data(BRAND);
const SUPPLIER = DATA.supplier;
const SECTION_LABELS = DATA.sections;

const catalogEl = document.getElementById("catalog");
const searchEl = document.getElementById("search");
const sectionNavEl = document.getElementById("section-nav");
const noResultsEl = document.getElementById("no-results");
const resultCountEl = document.getElementById("result-count");

function enrichmentFor(barcode) { return BU.enrichmentFor(BRAND, barcode, DATA); }
function fmtPriceLocal(n) { return n > 0 ? n.toFixed(2).replace(".", ",") + " €" : "—"; }
function escapeText(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function sectionOf(p) { return enrichmentFor(p.barcode).section || "diafora"; }
function labelFor(section) { return SECTION_LABELS[section] || { name: section, icon: "📦", accent: "#64748b" }; }
function displayName(p) { return BU.prettify(enrichmentFor(p.barcode).name || p.name || p.barcode, BRAND); }

function buildSectionNav(byS) {
  const order = Object.keys(byS).sort((a, b) => byS[b].length - byS[a].length);
  order.forEach(secKey => {
    const sec = labelFor(secKey);
    const a = document.createElement("a");
    a.href = `#section-${secKey}`;
    a.className = "section-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 text-white text-sm font-medium hover:bg-white/35 backdrop-blur";
    a.innerHTML = `<span>${sec.icon}</span><span>${escapeText(sec.name)}</span><span class="text-white/75">(${byS[secKey].length})</span>`;
    sectionNavEl.appendChild(a);
  });
}

function makeCard(p) {
  const enrich = enrichmentFor(p.barcode);
  const label = labelFor(sectionOf(p));
  const accent = label.accent;
  const card = document.createElement("a");
  card.href = `product.html?barcode=${encodeURIComponent(p.barcode)}&type=${BRAND.key}`;
  card.className = "product-card group block bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-slate-300";
  card.dataset.search = (p.name + " " + (enrich.name || "") + " " + (enrich.subtitle || "") + " " + (enrich.description || "") + " " + (enrich.claims || []).join(" ") + " " + (p.barcode || "")).toLowerCase();

  const localUrl = p.barcode ? getLocalImageUrl(p.barcode) : null;
  const remoteUrl = localUrl || enrich.image || null;
  const quality = frezydermDescriptionQuality(enrich.description);
  card.dataset.needsReview = quality.ok ? "0" : "1";
  card.dataset.noPage = enrich.noBrandPage ? "1" : "0";
  // "Όλα ΟΚ" = επίσημη σελίδα + πλήρης περιγραφή + εικόνα
  card.dataset.allOk = (!enrich.noBrandPage && quality.ok && !enrich.review && !!remoteUrl) ? "1" : "0";
  card.dataset.barcode = p.barcode;

  const topBadge = enrich.noBrandPage
    ? `<div class="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-slate-800/95 text-white shadow-sm" title="Δεν βρέθηκε σελίδα στο ${escapeText(BRAND.host)}">Χωρίς Σελίδα</div>`
    : enrich.review
      ? `<div class="absolute top-2 left-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-amber-500/95 text-white shadow-sm" title="Match για έλεγχο">Match?</div>`
      : "";
  const descBadge = quality.ok ? "" :
    `<div class="absolute ${topBadge ? "top-8" : "top-2"} left-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded bg-rose-500/95 text-white shadow-sm" title="${escapeText(quality.reasons.map(frezReasonLabel).join(" · "))}">🔍 Περιγραφή</div>`;

  const imgWrap = document.createElement("div");
  imgWrap.className = "aspect-square relative overflow-hidden";
  imgWrap.innerHTML = `
    <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-3xl" style="--accent:${accent};--accent-dark:${shade(accent, -20)}">${BRAND.initials}</div>
    ${remoteUrl ? `<img src="${remoteUrl}" loading="lazy" decoding="async" alt="${escapeText(displayName(p))}" class="absolute inset-0 w-full h-full object-contain p-3 bg-white" onerror="this.remove()">` : ""}
    <div class="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold rounded-md bg-white/95 text-slate-800 shadow-sm">${fmtPriceLocal(p.wholesale)}</div>
    ${topBadge}${descBadge}
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
  for (const p of SUPPLIER) { const s = sectionOf(p); (byS[s] = byS[s] || []).push(p); }
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
          <div><h2 class="text-2xl sm:text-3xl font-bold tracking-tight" style="color:${sec.accent}">${escapeText(sec.name)}</h2></div>
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
  nopage:     `χωρίς σελίδα ${BRAND.host}`
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
  resultCountEl.textContent = (t || mode !== "all") ? `${visible} προϊόντα${suffix}` : `${SUPPLIER.length} προϊόντα συνολικά`;
  const exportBtn = document.getElementById("export-filtered");
  if (exportBtn) { exportBtn.disabled = visible === 0; exportBtn.querySelector("[data-count]").textContent = visible; }
}

// Export των ορατών (φιλτραρισμένων) προϊόντων σε XLSX — ίδιες στήλες με το <brand>-catalog.xlsx
function exportFiltered() {
  const visible = new Set([...document.querySelectorAll(".product-card")].filter(c => c.style.display !== "none").map(c => c.dataset.barcode));
  const { headers, rows } = CatalogExport.buildRows({
    products: SUPPLIER.filter(p => visible.has(p.barcode)), enrichmentFor, sectionLabels: SECTION_LABELS,
    prettify: n => BU.prettify(n, BRAND), fallbackDesc: p => BRAND.fallbackDesc.replace("{name}", p.name),
    tabColumns: BRAND.exportSections
  });
  const mode = (document.getElementById("filter-quality") || {}).value || "all";
  CatalogExport.download(`${BRAND.key}-${mode}-${rows.length}.xlsx`, headers, rows, BRAND.sheetName);
}

buildCatalog();
applySearch("");

let searchTimer;
searchEl.addEventListener("input", e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => applySearch(e.target.value), 120); });
const filterQuality = document.getElementById("filter-quality");
if (filterQuality) filterQuality.addEventListener("change", () => applySearch(searchEl.value));
const exportFilteredBtn = document.getElementById("export-filtered");
if (exportFilteredBtn) exportFilteredBtn.addEventListener("click", exportFiltered);
