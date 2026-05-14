// Bestsellers page logic

const top10El = document.getElementById("top10-grid");
const perBrandEl = document.getElementById("per-brand-grid");

function findProduct(barcode) {
  return PRODUCTS.find(p => p.barcode === barcode);
}

function rankBadge(n) {
  const colors = ["#d4af37", "#c0c0c0", "#cd7f32"]; // gold, silver, bronze
  if (n <= 3) {
    return `<div class="absolute top-2 left-2 z-10 w-9 h-9 rounded-full flex items-center justify-center font-bold text-white shadow-lg" style="background:${colors[n-1]}">#${n}</div>`;
  }
  return `<div class="absolute top-2 left-2 z-10 w-9 h-9 rounded-full flex items-center justify-center font-bold text-slate-700 bg-white shadow ring-2 ring-slate-200">#${n}</div>`;
}

function bestsellerCard(p, rank) {
  const brand = BRANDS[p.brand];
  const parsed = parseProduct(p);
  const accent = brand.accent;
  const initials = brand.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const localUrl = getLocalImageUrl(p.barcode);

  const card = document.createElement("a");
  card.href = `product.html?id=${encodeURIComponent(p.id)}`;
  card.className = "product-card relative group block bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-slate-300";

  card.innerHTML = `
    ${rank ? rankBadge(rank) : ""}
    <div class="aspect-square relative overflow-hidden">
      <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-3xl"
           style="--accent:${accent};--accent-dark:${shade(accent, -20)}">
        ${initials}
      </div>
      ${localUrl ? `<img src="${localUrl}" loading="lazy" decoding="async" alt="${escapeHtml(p.name)}" class="absolute inset-0 w-full h-full object-contain p-3 bg-white" onerror="this.remove()">` : ""}
      ${parsed.spf ? `<span class="absolute bottom-2 left-2 px-2 py-0.5 text-xs font-bold rounded-md text-white shadow" style="background:${accent}">SPF ${parsed.spf}</span>` : ""}
      <span class="absolute top-2 right-2 px-2 py-0.5 text-xs font-bold rounded-md bg-white/95 text-slate-800 shadow-sm">${fmtPrice(p.price)}</span>
    </div>
    <div class="p-4">
      <div class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:${accent}">${brand.name}</div>
      <h3 class="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">${escapeHtml(p.name)}</h3>
      <div class="mt-2 flex flex-wrap gap-1">
        ${parsed.types.slice(0, 2).map(t => `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${t}</span>`).join("")}
        ${parsed.volume ? `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${parsed.volume}</span>` : ""}
      </div>
    </div>
  `;
  return card;
}

function perBrandCard(p, brand) {
  const parsed = parseProduct(p);
  const accent = brand.accent;
  const initials = brand.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const localUrl = getLocalImageUrl(p.barcode);

  const card = document.createElement("a");
  card.href = `product.html?id=${encodeURIComponent(p.id)}`;
  card.className = "product-card block bg-white rounded-2xl overflow-hidden border-2 hover:shadow-lg transition";
  card.style.borderColor = accent + "33";

  card.innerHTML = `
    <div class="flex">
      <div class="relative w-1/3 flex-shrink-0 aspect-square">
        <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-2xl"
             style="--accent:${accent};--accent-dark:${shade(accent, -20)}">
          ${initials}
        </div>
        ${localUrl ? `<img src="${localUrl}" loading="lazy" decoding="async" alt="${escapeHtml(p.name)}" class="absolute inset-0 w-full h-full object-contain p-2 bg-white" onerror="this.remove()">` : ""}
      </div>
      <div class="p-4 flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-semibold uppercase tracking-wide" style="color:${accent}">${brand.name}</span>
          ${parsed.spf ? `<span class="px-1.5 py-0.5 text-[10px] font-bold rounded text-white" style="background:${accent}">SPF ${parsed.spf}</span>` : ""}
        </div>
        <h3 class="text-sm font-semibold text-slate-800 leading-snug line-clamp-3 min-h-[3rem]">${escapeHtml(p.name)}</h3>
        <div class="mt-2 flex items-center justify-between gap-2">
          <span class="text-base font-bold text-slate-900">${fmtPrice(p.price)}</span>
          ${parsed.volume ? `<span class="text-xs text-slate-500">${parsed.volume}</span>` : ""}
        </div>
      </div>
    </div>
  `;
  return card;
}

// Render Top 10
BESTSELLERS.topOverall.forEach((barcode, i) => {
  const p = findProduct(barcode);
  if (!p) return;
  top10El.appendChild(bestsellerCard(p, i + 1));
});

// Render per-brand (in the same order as the catalog)
const brandOrder = Object.keys(BRANDS).filter(k => BESTSELLERS.perBrand[k]);
brandOrder.forEach(brandKey => {
  const barcode = BESTSELLERS.perBrand[brandKey];
  const p = findProduct(barcode);
  if (!p) return;
  perBrandEl.appendChild(perBrandCard(p, BRANDS[brandKey]));
});
