// Vican catalog page logic — groups by SECTION → products

const catalogEl = document.getElementById("catalog");
const searchEl = document.getElementById("search");
const sectionNavEl = document.getElementById("section-nav");
const noResultsEl = document.getElementById("no-results");
const resultCountEl = document.getElementById("result-count");

function fmtPriceLocal(n) { return n > 0 ? n.toFixed(2).replace(".", ",") + " €" : "—"; }
function escapeText(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function slugForId(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function buildSectionNav() {
  Object.keys(VICAN_SECTIONS).forEach(key => {
    const sec = VICAN_SECTIONS[key];
    const count = VICAN_PRODUCTS.filter(p => p.section === key).length;
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
  const accent = (VICAN_SECTIONS[p.section] && VICAN_SECTIONS[p.section].accent) || "#0ea5e9";
  const card = document.createElement("a");
  card.href = `product.html?barcode=${encodeURIComponent(p.barcode)}&type=vican`;
  card.className = "product-card group block bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-slate-300";
  const blob = (p.name + " " + (p.description || "") + " " + (p.barcode || "")).toLowerCase();
  card.dataset.search = blob;

  const localUrl = p.barcode ? getLocalImageUrl(p.barcode) : null;
  const remoteUrl = localUrl || p.image || null;
  const initials = "VC";

  const imgWrap = document.createElement("div");
  imgWrap.className = "aspect-square relative overflow-hidden";
  imgWrap.innerHTML = `
    <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-3xl"
         style="--accent:${accent};--accent-dark:${shade(accent, -20)}">
      ${initials}
    </div>
    ${remoteUrl ? `<img src="${remoteUrl}" loading="lazy" decoding="async" alt="${escapeText(p.name)}" class="absolute inset-0 w-full h-full object-contain p-3 bg-white" onerror="this.remove()">` : ""}
    <div class="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold rounded-md bg-white/95 text-slate-800 shadow-sm">${fmtPriceLocal(p.price)}</div>
  `;
  card.appendChild(imgWrap);

  const body = document.createElement("div");
  body.className = "p-4";
  body.innerHTML = `
    <div class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:${accent}">${escapeText((VICAN_SECTIONS[p.section] && VICAN_SECTIONS[p.section].name) || p.section)}</div>
    <h3 class="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">${escapeText(p.name)}</h3>
    <div class="mt-2 text-[10px] uppercase tracking-wide text-slate-500 font-medium">EAN ${escapeText(p.barcode)}</div>
  `;
  card.appendChild(body);

  return card;
}

function buildCatalog() {
  Object.keys(VICAN_SECTIONS).forEach(secKey => {
    const sec = VICAN_SECTIONS[secKey];
    const products = VICAN_PRODUCTS.filter(p => p.section === secKey);
    if (!products.length) return;

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
            <p class="text-sm text-slate-500 mt-1">${escapeText(sec.tagline || "")}</p>
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

function applySearch(term) {
  const t = term.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll("section[data-section]").forEach(sec => {
    let secVisible = 0;
    sec.querySelectorAll(".product-card").forEach(card => {
      const match = !t || card.dataset.search.includes(t);
      card.style.display = match ? "" : "none";
      if (match) secVisible++;
    });
    sec.style.display = secVisible ? "" : "none";
    visible += secVisible;
  });
  noResultsEl.classList.toggle("hidden", visible > 0);
  resultCountEl.textContent = t ? `${visible} αποτελέσματα` : `${VICAN_PRODUCTS.length} προϊόντα συνολικά`;
}

buildSectionNav();
buildCatalog();
applySearch("");

let searchTimer;
searchEl.addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(e.target.value), 120);
});
