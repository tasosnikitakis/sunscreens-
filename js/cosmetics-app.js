// Catalog page logic for cosmetics (Vichy / La Roche-Posay / CeraVe)

const catalogEl = document.getElementById("catalog");
const searchEl = document.getElementById("search");
const brandNavEl = document.getElementById("brand-nav");
const noResultsEl = document.getElementById("no-results");
const resultCountEl = document.getElementById("result-count");

const brandOrder = Object.keys(COSMETICS_BRANDS).filter(k => COSMETICS_PRODUCTS.some(p => p.brand === k));

function parseCosmetic(p) {
  const name = p.name;
  // Volume - cosmetics names use F50ML / 200ML / J50ML / T300ML etc.
  const volMatch = name.match(/(?:^|[\s\/\-])(?:[FJTBSPK])?(\d+(?:[.,]\d+)?)\s*(ml|gr|g|kg)\b/i);
  let volume = volMatch ? `${volMatch[1]}${volMatch[2].toLowerCase()}` : null;
  // Heuristic for ingredient highlights
  const tags = [];
  if (/spf\s*\d+/i.test(name)) tags.push("SPF");
  if (/anti[- ]?age|retinol|liftactiv|neovadiol/i.test(name)) tags.push("Anti-Age");
  if (/cleans|wash|micell|mic\s+wat/i.test(name)) tags.push("Καθαρισμός");
  if (/serum|booster/i.test(name)) tags.push("Serum");
  if (/eye|yx\b|eye\s*cont/i.test(name)) tags.push("Μάτια");
  if (/cream|crm|crema/i.test(name)) tags.push("Κρέμα");
  if (/lotion|emulsion/i.test(name)) tags.push("Lotion");
  if (/balm|lipikar/i.test(name)) tags.push("Balm");
  if (/mask|μάσκα/i.test(name)) tags.push("Mask");
  if (/shampoo|conditioner|dercos/i.test(name)) tags.push("Μαλλιά");
  if (/deod|deo/i.test(name)) tags.push("Deodorant");
  if (/men|homme/i.test(name)) tags.push("Ανδρικό");
  if (/kids|baby|enfant|bebe|infant|pediatr/i.test(name)) tags.push("Παιδικό");
  if (/sensit|sens\b/i.test(name)) tags.push("Ευαίσθητο");
  if (/oily|oilyskin|oil\s*ctrl/i.test(name)) tags.push("Λιπαρό");
  if (/acne|effaclar/i.test(name)) tags.push("Ακμή");
  if (/hyalu|hyaluron/i.test(name)) tags.push("Υαλουρονικό");
  if (/cica/i.test(name)) tags.push("Cicaplast");
  return { volume, tags: [...new Set(tags)] };
}

function brandPalette(accent) {
  return { accent, accentDark: shade(accent, -20) };
}

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

function makeCard(p) {
  const brand = COSMETICS_BRANDS[p.brand];
  const parsed = parseCosmetic(p);
  const accent = brand.accent;
  const initials = brand.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const localUrl = p.barcode ? getLocalImageUrl(p.barcode) : null;

  const card = document.createElement("a");
  card.href = `product.html?id=${encodeURIComponent(p.id)}`;
  card.className = "product-card group block bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-slate-300";
  card.dataset.search = (p.name + " " + brand.name + " " + (p.line || "") + " " + parsed.tags.join(" ")).toLowerCase();
  card.dataset.line = p.line || "";

  const imgWrap = document.createElement("div");
  imgWrap.className = "aspect-square relative overflow-hidden";
  imgWrap.innerHTML = `
    <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-3xl"
         style="--accent:${accent};--accent-dark:${shade(accent, -20)}">
      ${initials}
    </div>
  `;
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

  // Price badge
  const price = document.createElement("div");
  price.className = "absolute top-2 right-2 px-2 py-0.5 text-xs font-bold rounded-md bg-white/95 text-slate-800 shadow-sm";
  price.textContent = fmtPrice(p.price);
  imgWrap.appendChild(price);

  // Line badge (top-left)
  if (p.line) {
    const lineBadge = document.createElement("div");
    lineBadge.className = "absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md text-white shadow";
    lineBadge.style.background = accent;
    lineBadge.textContent = p.line;
    imgWrap.appendChild(lineBadge);
  }

  card.appendChild(imgWrap);

  const body = document.createElement("div");
  body.className = "p-4";
  body.innerHTML = `
    <div class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:${accent}">${brand.name}</div>
    <h3 class="text-sm font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[2.5rem]">${escapeHtml(p.name)}</h3>
    <div class="mt-2 flex flex-wrap gap-1">
      ${parsed.tags.slice(0, 3).map(t => `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${t}</span>`).join("")}
      ${parsed.volume ? `<span class="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">${parsed.volume}</span>` : ""}
    </div>
  `;
  card.appendChild(body);
  return card;
}

function buildCatalog() {
  brandOrder.forEach(brandKey => {
    const brand = COSMETICS_BRANDS[brandKey];
    const products = COSMETICS_PRODUCTS.filter(p => p.brand === brandKey);
    if (!products.length) return;

    const section = document.createElement("section");
    section.id = `brand-${brandKey}`;
    section.className = "brand-anchor mb-14";
    section.dataset.brand = brandKey;

    // Group by line
    const lineMap = new Map();
    for (const p of products) {
      const line = p.line || "Άλλα";
      if (!lineMap.has(line)) lineMap.set(line, []);
      lineMap.get(line).push(p);
    }
    const lines = [...lineMap.entries()].sort((a, b) => b[1].length - a[1].length);

    section.innerHTML = `
      <div class="flex items-end justify-between gap-3 mb-5 pb-3 border-b-2" style="border-color:${brand.accent}">
        <div>
          <h2 class="text-2xl sm:text-3xl font-bold tracking-tight" style="color:${brand.accent}">${brand.name}</h2>
          <p class="text-sm text-slate-500 mt-1">${brand.tagline}</p>
        </div>
        <div class="text-sm text-slate-400 font-medium whitespace-nowrap">${products.length} προϊόντα</div>
      </div>
    `;

    lines.forEach(([lineName, lineProducts]) => {
      const sub = document.createElement("div");
      sub.className = "mb-8";
      sub.dataset.line = lineName;
      sub.innerHTML = `
        <div class="flex items-baseline justify-between gap-3 mb-3">
          <h3 class="text-lg font-semibold text-slate-800">${escapeHtml(lineName)}</h3>
          <span class="text-xs text-slate-400">${lineProducts.length} προϊόντα</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" data-grid></div>
      `;
      const grid = sub.querySelector("[data-grid]");
      lineProducts.forEach(p => grid.appendChild(makeCard(p)));
      section.appendChild(sub);
    });

    catalogEl.appendChild(section);
  });
}

function applySearch(term) {
  const t = term.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll("section[data-brand]").forEach(sec => {
    let secVisible = 0;
    sec.querySelectorAll("div[data-line]").forEach(lineGroup => {
      let lineVisible = 0;
      lineGroup.querySelectorAll(".product-card").forEach(card => {
        const match = !t || card.dataset.search.includes(t);
        card.style.display = match ? "" : "none";
        if (match) lineVisible++;
      });
      lineGroup.style.display = lineVisible ? "" : "none";
      secVisible += lineVisible;
    });
    sec.style.display = secVisible ? "" : "none";
    visible += secVisible;
  });
  noResultsEl.classList.toggle("hidden", visible > 0);
  resultCountEl.textContent = t ? `${visible} αποτελέσματα` : `${COSMETICS_PRODUCTS.length} προϊόντα συνολικά`;
}

buildBrandNav();
buildCatalog();
applySearch("");

let searchTimer;
searchEl.addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(e.target.value), 120);
});
