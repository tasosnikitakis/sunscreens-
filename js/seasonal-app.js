// Seasonal catalog page logic — groups by SECTION → BRAND → products

const catalogEl = document.getElementById("catalog");
const searchEl = document.getElementById("search");
const sectionNavEl = document.getElementById("section-nav");
const noResultsEl = document.getElementById("no-results");
const resultCountEl = document.getElementById("result-count");

function fmtPriceLocal(n) { return n > 0 ? n.toFixed(2).replace(".", ",") + " €" : "—"; }
function escapeText(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function slugForId(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

// Pick the most readable name: enrichment > supplier-cleaned > rawName
function displayName(p) {
  const enrich = (window.SEASONAL_ENRICHMENT || {})[p.barcode];
  return (enrich && enrich.name) || p.name || p.rawName || "";
}

function buildSectionNav() {
  Object.keys(SEASONAL_SECTIONS).forEach(key => {
    const sec = SEASONAL_SECTIONS[key];
    const count = SEASONAL_PRODUCTS.filter(p => p.section === key).length;
    if (!count) return;
    const a = document.createElement("a");
    a.href = `#section-${key}`;
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
  const brand = SEASONAL_BRANDS[p.brand] || { name: p.brand, accent: "#64748b" };
  const card = document.createElement("a");
  card.href = `product.html?id=${encodeURIComponent(p.id)}&type=seasonal`;
  card.className = "product-card group block bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-slate-300";
  const enrich = (window.SEASONAL_ENRICHMENT || {})[p.barcode] || {};
  const blob = (p.name + " " + p.rawName + " " + (enrich.name || "") + " " + (enrich.description || "") + " " + (p.line || "") + " " + p.barcode + " " + p.id).toLowerCase();
  card.dataset.search = blob;

  const accent = brand.accent;
  const initials = brand.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const localUrl = p.barcode ? getLocalImageUrl(p.barcode) : null;

  const imgWrap = document.createElement("div");
  imgWrap.className = "aspect-square relative overflow-hidden";
  imgWrap.innerHTML = `
    <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-3xl"
         style="--accent:${accent};--accent-dark:${shade(accent, -20)}">
      ${initials}
    </div>
    ${localUrl ? `<img src="${localUrl}" loading="lazy" decoding="async" alt="${escapeText(displayName(p))}" class="absolute inset-0 w-full h-full object-contain p-3 bg-white" onerror="this.remove()">` : ""}
    ${p.line ? `<div class="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-md text-white shadow" style="background:${accent}">${escapeText(p.line)}</div>` : ""}
    <div class="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold rounded-md bg-white/95 text-slate-800 shadow-sm">${fmtPriceLocal(p.price)}</div>
  `;
  card.appendChild(imgWrap);

  const body = document.createElement("div");
  body.className = "p-4";
  body.innerHTML = `
    <div class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:${accent}">${escapeText(brand.name)}</div>
    <h3 class="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">${escapeText(displayName(p))}</h3>
    <div class="mt-2 text-[10px] uppercase tracking-wide text-slate-500 font-medium">${escapeText(p.id)}</div>
  `;
  card.appendChild(body);

  return card;
}

function buildCatalog() {
  Object.keys(SEASONAL_SECTIONS).forEach(secKey => {
    const sec = SEASONAL_SECTIONS[secKey];
    const products = SEASONAL_PRODUCTS.filter(p => p.section === secKey);
    if (!products.length) return;

    const byBrand = new Map();
    for (const p of products) {
      if (!byBrand.has(p.brand)) byBrand.set(p.brand, []);
      byBrand.get(p.brand).push(p);
    }
    const brandOrder = [...byBrand.keys()].sort((a, b) => byBrand.get(b).length - byBrand.get(a).length);

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
            <p class="text-sm text-slate-500 mt-1">${escapeText(sec.tagline)}</p>
          </div>
        </div>
        <div class="text-sm text-slate-400 font-medium whitespace-nowrap">${products.length} προϊόντα</div>
      </div>
    `;

    // Brand pill index
    const brandsNav = document.createElement("div");
    brandsNav.className = "mb-6 flex flex-wrap gap-1.5";
    brandOrder.forEach(brandKey => {
      const b = SEASONAL_BRANDS[brandKey] || { name: brandKey, accent: "#64748b" };
      const a = document.createElement("a");
      a.href = `#section-${secKey}-brand-${slugForId(brandKey)}`;
      a.className = "px-2.5 py-1 text-xs font-medium rounded-md border bg-white hover:shadow transition";
      a.style.borderColor = b.accent + "55";
      a.style.color = b.accent;
      a.textContent = `${b.name} (${byBrand.get(brandKey).length})`;
      brandsNav.appendChild(a);
    });
    section.appendChild(brandsNav);

    // One sub-section per brand within this category
    brandOrder.forEach(brandKey => {
      const b = SEASONAL_BRANDS[brandKey] || { name: brandKey, accent: "#64748b" };
      const subEl = document.createElement("div");
      subEl.id = `section-${secKey}-brand-${slugForId(brandKey)}`;
      subEl.className = "mb-9 scroll-mt-32";
      subEl.dataset.brand = brandKey;
      subEl.innerHTML = `
        <div class="flex items-baseline justify-between mb-3">
          <h3 class="text-lg sm:text-xl font-semibold" style="color:${b.accent}">
            <span class="text-slate-400 font-normal mr-1">/</span>${escapeText(b.name)}
          </h3>
          <div class="text-xs text-slate-400">${byBrand.get(brandKey).length} προϊόντα</div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" data-grid></div>
      `;
      const grid = subEl.querySelector("[data-grid]");
      byBrand.get(brandKey).forEach(p => grid.appendChild(makeCard(p)));
      section.appendChild(subEl);
    });

    catalogEl.appendChild(section);
  });
}

function applySearch(term) {
  const t = term.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll("section[data-section]").forEach(sec => {
    let secVisible = 0;
    sec.querySelectorAll("[data-brand]").forEach(brandDiv => {
      let brandVisible = 0;
      brandDiv.querySelectorAll(".product-card").forEach(card => {
        const match = !t || card.dataset.search.includes(t);
        card.style.display = match ? "" : "none";
        if (match) brandVisible++;
      });
      brandDiv.style.display = brandVisible ? "" : "none";
      secVisible += brandVisible;
    });
    sec.style.display = secVisible ? "" : "none";
    visible += secVisible;
  });
  noResultsEl.classList.toggle("hidden", visible > 0);
  resultCountEl.textContent = t ? `${visible} αποτελέσματα` : `${SEASONAL_PRODUCTS.length} προϊόντα συνολικά`;
}

// Init
buildSectionNav();
buildCatalog();
applySearch("");

let searchTimer;
searchEl.addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(e.target.value), 120);
});
