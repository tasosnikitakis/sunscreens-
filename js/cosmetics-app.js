// Cosmetics catalog page logic

const catalogEl = document.getElementById("catalog");
const searchEl = document.getElementById("search");
const brandNavEl = document.getElementById("brand-nav");
const noResultsEl = document.getElementById("no-results");
const resultCountEl = document.getElementById("result-count");

const brandOrder = Object.keys(COSMETICS_BRANDS).filter(k => COSMETICS_PRODUCTS.some(p => p.brand === k));

function fmtPriceLocal(n) { return n.toFixed(2).replace(".", ",") + " €"; }

function escapeText(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

function buildBrandNav() {
  brandOrder.forEach(key => {
    const brand = COSMETICS_BRANDS[key];
    const count = COSMETICS_PRODUCTS.filter(p => p.brand === key).length;
    const a = document.createElement("a");
    a.href = `#brand-${key}`;
    a.className = "brand-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 text-white text-sm font-medium hover:bg-white/35 backdrop-blur";
    a.innerHTML = `
      <span class="w-2 h-2 rounded-full" style="background:${brand.accent}"></span>
      <span>${brand.name}</span>
      <span class="text-white/75">(${count})</span>
    `;
    brandNavEl.appendChild(a);
  });
}

function makeCard(p, accent) {
  const card = document.createElement("a");
  card.href = `product.html?id=${encodeURIComponent(p.id)}&type=cosmetic`;
  card.className = "product-card group block bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-slate-300";
  const searchBlob = (p.name + " " + p.rawName + " " + p.line + " " + p.barcode + " " + p.id).toLowerCase();
  card.dataset.search = searchBlob;

  const imgWrap = document.createElement("div");
  imgWrap.className = "aspect-square relative overflow-hidden";

  const initials = COSMETICS_BRANDS[p.brand].name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  imgWrap.innerHTML = `
    <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-3xl"
         style="--accent:${accent};--accent-dark:${shade(accent, -20)}">
      ${initials}
    </div>
  `;

  const localUrl = getLocalImageUrl(p.barcode);
  if (localUrl) {
    const img = document.createElement("img");
    img.src = localUrl;
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = p.name;
    img.className = "absolute inset-0 w-full h-full object-contain p-3 bg-white";
    img.onerror = () => { img.remove(); };
    imgWrap.appendChild(img);
  }

  const price = document.createElement("div");
  price.className = "absolute top-2 right-2 px-2 py-0.5 text-xs font-bold rounded-md bg-white/95 text-slate-800 shadow-sm";
  price.textContent = fmtPriceLocal(p.price);
  imgWrap.appendChild(price);

  const lineTag = document.createElement("div");
  lineTag.className = "absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold rounded-md text-white shadow-sm uppercase tracking-wide";
  lineTag.style.background = accent;
  lineTag.textContent = p.line;
  imgWrap.appendChild(lineTag);

  card.appendChild(imgWrap);

  const body = document.createElement("div");
  body.className = "p-4";
  body.innerHTML = `
    <div class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:${accent}">${escapeText(COSMETICS_BRANDS[p.brand].name)}</div>
    <h3 class="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">${escapeText(p.name)}</h3>
    <div class="mt-2 text-[10px] uppercase tracking-wide text-slate-500 font-medium">${escapeText(p.id)}</div>
  `;
  card.appendChild(body);

  return card;
}

function buildCatalog() {
  brandOrder.forEach(key => {
    const brand = COSMETICS_BRANDS[key];
    const products = COSMETICS_PRODUCTS.filter(p => p.brand === key);
    if (!products.length) return;

    // Group by product line
    const byLine = new Map();
    for (const p of products) {
      if (!byLine.has(p.line)) byLine.set(p.line, []);
      byLine.get(p.line).push(p);
    }
    const lineNames = [...byLine.keys()].sort();

    const section = document.createElement("section");
    section.id = `brand-${key}`;
    section.className = "brand-anchor mb-16";
    section.dataset.brand = key;

    section.innerHTML = `
      <div class="flex items-end justify-between gap-3 mb-5 pb-3 border-b-2" style="border-color:${brand.accent}">
        <div>
          <h2 class="text-2xl sm:text-3xl font-bold tracking-tight" style="color:${brand.accent}">${escapeText(brand.name)}</h2>
          <p class="text-sm text-slate-500 mt-1">${escapeText(brand.tagline)}</p>
        </div>
        <div class="text-sm text-slate-400 font-medium whitespace-nowrap">${products.length} προϊόντα</div>
      </div>
    `;

    // Product-line index pills
    const linesNav = document.createElement("div");
    linesNav.className = "mb-6 flex flex-wrap gap-1.5";
    lineNames.forEach(ln => {
      const a = document.createElement("a");
      a.href = `#line-${key}-${slugForId(ln)}`;
      a.className = "px-2.5 py-1 text-xs font-medium rounded-md border bg-white hover:shadow transition";
      a.style.borderColor = brand.accent + "55";
      a.style.color = brand.accent;
      a.textContent = `${ln} (${byLine.get(ln).length})`;
      linesNav.appendChild(a);
    });
    section.appendChild(linesNav);

    // One sub-section per product line
    lineNames.forEach(ln => {
      const lineSection = document.createElement("div");
      lineSection.id = `line-${key}-${slugForId(ln)}`;
      lineSection.className = "mb-9 scroll-mt-32";
      lineSection.dataset.line = ln;
      lineSection.innerHTML = `
        <div class="flex items-baseline justify-between mb-3">
          <h3 class="text-lg sm:text-xl font-semibold text-slate-800">
            <span class="text-slate-400 font-normal mr-1">/</span>${escapeText(ln)}
          </h3>
          <div class="text-xs text-slate-400">${byLine.get(ln).length} προϊόντα</div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" data-grid></div>
      `;
      const grid = lineSection.querySelector("[data-grid]");
      byLine.get(ln).forEach(p => grid.appendChild(makeCard(p, brand.accent)));
      section.appendChild(lineSection);
    });

    catalogEl.appendChild(section);
  });
}

function slugForId(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function applySearch(term) {
  const t = term.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll("section[data-brand]").forEach(sec => {
    let secVisible = 0;
    sec.querySelectorAll("[data-line]").forEach(lineDiv => {
      let lineVisible = 0;
      lineDiv.querySelectorAll(".product-card").forEach(card => {
        const match = !t || card.dataset.search.includes(t);
        card.style.display = match ? "" : "none";
        if (match) lineVisible++;
      });
      lineDiv.style.display = lineVisible ? "" : "none";
      secVisible += lineVisible;
    });
    sec.style.display = secVisible ? "" : "none";
    visible += secVisible;
  });
  noResultsEl.classList.toggle("hidden", visible > 0);
  resultCountEl.textContent = t ? `${visible} αποτελέσματα` : `${COSMETICS_PRODUCTS.length} προϊόντα συνολικά`;
}

// Init
buildBrandNav();
buildCatalog();
applySearch("");

let searchTimer;
searchEl.addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(e.target.value), 120);
});
