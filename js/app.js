// Catalog homepage logic

const catalogEl = document.getElementById("catalog");
const searchEl = document.getElementById("search");
const brandNavEl = document.getElementById("brand-nav");
const noResultsEl = document.getElementById("no-results");
const resultCountEl = document.getElementById("result-count");

const brandOrder = Object.keys(BRANDS).filter(k => PRODUCTS.some(p => p.brand === k));

function buildBrandNav() {
  brandOrder.forEach(key => {
    const brand = BRANDS[key];
    const count = PRODUCTS.filter(p => p.brand === key).length;
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

function makeCard(p) {
  const brand = BRANDS[p.brand];
  const parsed = parseProduct(p);
  const accent = brand.accent;

  const card = document.createElement("a");
  card.href = `product.html?id=${encodeURIComponent(p.id)}`;
  card.className = "product-card group block bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-slate-300";
  card.dataset.search = (p.name + " " + brand.name + " " + (parsed.spf || "") + " " + parsed.types.join(" ") + " " + parsed.audience.join(" ")).toLowerCase();

  const imgWrap = document.createElement("div");
  imgWrap.className = "aspect-square relative overflow-hidden";

  // Placeholder (always present, hidden if image loads)
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-3xl";
  placeholder.style.setProperty("--accent", accent);
  placeholder.style.setProperty("--accent-dark", shade(accent, -20));
  placeholder.textContent = brand.name.split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
  imgWrap.appendChild(placeholder);

  // Image (loaded async)
  const img = document.createElement("img");
  img.className = "product-img loading absolute inset-0 w-full h-full p-3";
  img.alt = p.name;
  img.loading = "lazy";
  img.style.display = "none";
  imgWrap.appendChild(img);

  // Badges
  const badges = document.createElement("div");
  badges.className = "absolute top-2 left-2 flex flex-col gap-1";
  if (parsed.spf) {
    badges.innerHTML += `<span class="px-2 py-0.5 text-xs font-bold rounded-md text-white shadow" style="background:${accent}">SPF ${parsed.spf}</span>`;
  }
  if (parsed.isNew) {
    badges.innerHTML += `<span class="px-2 py-0.5 text-xs font-bold rounded-md text-white shadow bg-emerald-500">ΝΕΟ</span>`;
  }
  imgWrap.appendChild(badges);

  // Price badge
  const price = document.createElement("div");
  price.className = "absolute top-2 right-2 px-2 py-0.5 text-xs font-bold rounded-md bg-white/95 text-slate-800 shadow-sm";
  price.textContent = fmtPrice(p.price);
  imgWrap.appendChild(price);

  card.appendChild(imgWrap);

  const body = document.createElement("div");
  body.className = "p-4";
  body.innerHTML = `
    <div class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:${accent}">${brand.name}</div>
    <h3 class="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">${escapeHtml(p.name)}</h3>
    <div class="mt-2 flex flex-wrap gap-1">
      ${parsed.types.slice(0,2).map(t => `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${t}</span>`).join("")}
      ${parsed.volume ? `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${parsed.volume}</span>` : ""}
    </div>
  `;
  card.appendChild(body);

  // Lazy load OBF image when card is visible
  observeCard(card, () => loadImageFor(p, img, placeholder));

  return card;
}

function loadImageFor(p, img, placeholder) {
  resolveImageUrl(p.barcode).then(url => {
    if (!url) return; // keep placeholder
    img.onload = () => {
      img.classList.remove("loading");
      img.style.display = "";
      placeholder.style.opacity = "0";
    };
    img.onerror = () => { /* keep placeholder */ };
    img.src = url;
  });
}

const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const cb = entry.target._onVisible;
      if (cb) cb();
      io.unobserve(entry.target);
    }
  });
}, { rootMargin: "150px" });

function observeCard(card, cb) {
  card._onVisible = cb;
  io.observe(card);
}

function buildCatalog() {
  brandOrder.forEach(key => {
    const brand = BRANDS[key];
    const products = PRODUCTS.filter(p => p.brand === key);
    if (!products.length) return;

    const section = document.createElement("section");
    section.id = `brand-${key}`;
    section.className = "brand-anchor mb-14";
    section.dataset.brand = key;

    section.innerHTML = `
      <div class="flex items-end justify-between gap-3 mb-3 pb-3 border-b-2" style="border-color:${brand.accent}">
        <div>
          <h2 class="text-2xl sm:text-3xl font-bold tracking-tight" style="color:${brand.accent}">${brand.name}</h2>
          <p class="text-sm text-slate-500 mt-1">${brand.tagline}</p>
        </div>
        <div class="text-sm text-slate-400 font-medium whitespace-nowrap">${products.length} προϊόντα</div>
      </div>
      ${brand.discount ? `
      <div class="mb-5 rounded-xl p-3 sm:p-4 flex flex-wrap items-center gap-x-4 gap-y-2"
           style="background:${brand.accent}14;border-left:4px solid ${brand.accent}">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 sm:w-5 sm:h-5" style="color:${brand.accent}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/>
          </svg>
          <span class="text-xs sm:text-sm font-semibold uppercase tracking-wider" style="color:${brand.accent}">
            Έκπτωση επί τιμολογίου
          </span>
        </div>
        <div class="text-lg sm:text-xl font-bold text-slate-800">${brand.discount}</div>
        ${brand.discountNote ? `<div class="text-xs text-slate-500 italic">(${brand.discountNote})</div>` : ""}
        <div class="text-xs text-slate-500 ml-auto hidden sm:block">για αρχική παραγγελία &gt; 40 τμχ</div>
      </div>
      ` : ""}
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
  document.querySelectorAll("section[data-brand]").forEach(sec => {
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
  resultCountEl.textContent = t ? `${visible} αποτελέσματα` : `${PRODUCTS.length} προϊόντα συνολικά`;
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
