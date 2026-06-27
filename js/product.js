// Product detail page — supports 4 catalogs (sunscreens + cosmetics + seasonal + vican)

const root = document.getElementById("product-root");
const params = new URLSearchParams(location.search);
const productId = params.get("id");
const productBarcode = params.get("barcode");
const typeHint = params.get("type"); // "cosmetic" | "seasonal" | "vican" | (default: sunscreen)

const _COSMETICS_PRODUCTS = typeof COSMETICS_PRODUCTS !== "undefined" ? COSMETICS_PRODUCTS : [];
const _COSMETICS_BRANDS   = typeof COSMETICS_BRANDS   !== "undefined" ? COSMETICS_BRANDS   : {};
const _SEASONAL_PRODUCTS  = typeof SEASONAL_PRODUCTS  !== "undefined" ? SEASONAL_PRODUCTS  : [];
const _SEASONAL_BRANDS    = typeof SEASONAL_BRANDS    !== "undefined" ? SEASONAL_BRANDS    : {};
const _SEASONAL_SECTIONS  = typeof SEASONAL_SECTIONS  !== "undefined" ? SEASONAL_SECTIONS  : {};
const _VICAN_PRODUCTS     = typeof VICAN_PRODUCTS     !== "undefined" ? VICAN_PRODUCTS     : [];
const _VICAN_SECTIONS     = typeof VICAN_SECTIONS     !== "undefined" ? VICAN_SECTIONS     : {};
const _VICAN_BRAND        = (typeof window !== "undefined" && window.VICAN_BRAND) || { name: "Vican", accent: "#0ea5e9" };

// Resolve product across all catalogs.
function findProduct(id, hint, barcode) {
  if (hint === "vican" && barcode) {
    const p = _VICAN_PRODUCTS.find(x => x.barcode === barcode);
    if (p) return { product: p, brands: { vican: _VICAN_BRAND }, catalog: "vican" };
  }
  if (hint === "seasonal") {
    const p = _SEASONAL_PRODUCTS.find(x => x.id === id);
    if (p) return { product: p, brands: _SEASONAL_BRANDS, catalog: "seasonal" };
  }
  if (hint === "cosmetic") {
    const p = _COSMETICS_PRODUCTS.find(x => x.id === id);
    if (p) return { product: p, brands: _COSMETICS_BRANDS, catalog: "cosmetic" };
  }
  if (id) {
    let p = PRODUCTS.find(x => x.id === id);
    if (p) return { product: p, brands: BRANDS, catalog: "sunscreen" };
    p = _COSMETICS_PRODUCTS.find(x => x.id === id);
    if (p) return { product: p, brands: _COSMETICS_BRANDS, catalog: "cosmetic" };
    p = _SEASONAL_PRODUCTS.find(x => x.id === id);
    if (p) return { product: p, brands: _SEASONAL_BRANDS, catalog: "seasonal" };
  }
  if (barcode) {
    const p = _VICAN_PRODUCTS.find(x => x.barcode === barcode);
    if (p) return { product: p, brands: { vican: _VICAN_BRAND }, catalog: "vican" };
  }
  return null;
}

const found = (productId || productBarcode) ? findProduct(productId, typeHint, productBarcode) : null;

// Update navbar active state + back link
(function updateNav() {
  const cat = found && found.catalog;
  document.querySelectorAll("#nav-tabs a").forEach(a => {
    const tab = a.dataset.tab;
    const active = (tab === "cosmetic" && cat === "cosmetic") ||
                   (tab === "seasonal" && cat === "seasonal") ||
                   (tab === "vican" && cat === "vican") ||
                   (tab === "sunscreen" && (!cat || cat === "sunscreen"));
    a.className = active
      ? "px-3 sm:px-4 py-1.5 rounded-lg text-sm font-bold bg-slate-900 text-white transition flex items-center gap-1.5"
      : "px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition flex items-center gap-1.5";
  });
  const backLink = document.getElementById("back-link");
  const backText = document.getElementById("back-link-text");
  if (cat === "cosmetic") {
    backLink.href = "cosmetics.html";
    backText.textContent = "Πίσω στα καλλυντικά";
  } else if (cat === "seasonal") {
    backLink.href = "seasonal.html";
    backText.textContent = "Πίσω στα εποχιακά";
  } else if (cat === "vican") {
    backLink.href = "vican.html";
    backText.textContent = "Πίσω στον κατάλογο Vican";
  } else {
    backLink.href = "index.html";
    backText.textContent = "Πίσω στα αντηλιακά";
  }
})();

if (!found) {
  root.innerHTML = `
    <div class="text-center py-20">
      <h2 class="text-2xl font-bold text-slate-700">Δεν βρέθηκε το προϊόν</h2>
      <p class="mt-2 text-slate-500">Ίσως ο σύνδεσμος είναι σπασμένος ή το προϊόν έχει αφαιρεθεί.</p>
      <a href="index.html" class="mt-6 inline-block px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium">Επιστροφή στον κατάλογο</a>
    </div>
  `;
} else {
  render(found);
}

function render({ product: p, brands, catalog }) {
  const isCosmetic = catalog === "cosmetic";
  const isSeasonal = catalog === "seasonal";
  const isVican = catalog === "vican";
  const brand = isVican ? _VICAN_BRAND : (brands[p.brand] || { name: p.brand, accent: "#64748b" });
  const parsed = (!isCosmetic && !isSeasonal && !isVican) ? parseProduct(p) : null;
  // Enrichment: prefer official name + description if we have it.
  let enrich = {};
  if (isCosmetic) enrich = (window.COSMETICS_ENRICHMENT || {})[p.barcode] || {};
  else if (isSeasonal) enrich = (window.SEASONAL_OVERRIDES || {})[p.barcode]
                               || (window.SEASONAL_ENRICHMENT || {})[p.barcode]
                               || {};
  else if (isVican) enrich = { name: p.name, description: p.description, source: "vican.gr", url: p.url };
  const displayName = enrich.name || p.name;
  document.title = `${displayName} — ${brand.name}`;

  let catalogList = PRODUCTS;
  if (isCosmetic) catalogList = _COSMETICS_PRODUCTS;
  else if (isSeasonal) catalogList = _SEASONAL_PRODUCTS;
  else if (isVican) catalogList = _VICAN_PRODUCTS;

  // Related: same line for cosmetics/seasonal; same section for vican; same brand otherwise.
  const related = isVican
    ? catalogList.filter(x => x.section === p.section && x.barcode !== p.barcode).slice(0, 6)
    : (isCosmetic || isSeasonal)
      ? catalogList.filter(x => x.brand === p.brand && x.line === p.line && x.id !== p.id).slice(0, 6)
      : catalogList.filter(x => x.brand === p.brand && x.id !== p.id).slice(0, 6);
  const fallbackRelated = (isCosmetic || isSeasonal) && related.length < 6
    ? catalogList.filter(x => x.brand === p.brand && x.line !== p.line && x.id !== p.id).slice(0, 6 - related.length)
    : [];

  const homeUrl = isCosmetic ? "cosmetics.html" : isSeasonal ? "seasonal.html" : isVican ? "vican.html" : "index.html";
  const homeLabel = isCosmetic ? "Καλλυντικά" : isSeasonal ? "Εποχιακά" : isVican ? "Vican" : "Αντηλιακά";

  const isEnrichable = isCosmetic || isSeasonal || isVican;
  const sectionInfo = isSeasonal ? _SEASONAL_SECTIONS[p.section] : isVican ? _VICAN_SECTIONS[p.section] : null;

  root.innerHTML = `
    <nav class="text-sm text-slate-500 mb-6 flex flex-wrap gap-1.5 items-center">
      <a href="${homeUrl}" class="hover:text-amber-600">${homeLabel}</a>
      ${(isSeasonal || isVican) && sectionInfo ? `<span>›</span><a href="${homeUrl}#section-${p.section}" class="hover:text-amber-600" style="color:${sectionInfo.accent}">${escapeHtml(sectionInfo.name)}</a>` : ""}
      ${!isVican ? `<span>›</span><a href="${homeUrl}#brand-${p.brand}" class="hover:text-amber-600" style="color:${brand.accent}">${escapeHtml(brand.name)}</a>` : ""}
      ${isEnrichable && p.line ? `<span>›</span><span class="text-slate-700">${escapeHtml(p.line)}</span>` : ""}
      <span>›</span>
      <span class="text-slate-700">${escapeHtml(displayName)}</span>
    </nav>

    <div class="grid md:grid-cols-2 gap-8 lg:gap-12">
      <div>
        <div class="relative aspect-square rounded-3xl overflow-hidden bg-white border border-slate-200 shadow-sm">
          <div id="ph" class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-6xl"
               style="--accent:${brand.accent};--accent-dark:${shade(brand.accent, -25)}">
            ${brand.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()}
          </div>
          <img id="hero-img" class="product-img absolute inset-0 w-full h-full p-6 opacity-0 transition-opacity" alt="${escapeHtml(displayName)}">
        </div>

        ${!isEnrichable ? `
        <div class="mt-4 flex flex-wrap gap-2">
          ${parsed.spf ? `<span class="px-3 py-1 rounded-full text-sm font-bold text-white" style="background:${brand.accent}">SPF ${parsed.spf}</span>` : ""}
          ${parsed.isNew ? `<span class="px-3 py-1 rounded-full text-sm font-bold bg-emerald-500 text-white">ΝΕΟ 2026</span>` : ""}
          ${parsed.isPromo ? `<span class="px-3 py-1 rounded-full text-sm font-bold bg-rose-500 text-white">PROMO</span>` : ""}
        </div>
        ` : `
        <div class="mt-4 flex flex-wrap gap-2">
          ${p.line ? `<span class="px-3 py-1 rounded-full text-sm font-bold text-white" style="background:${brand.accent}">${escapeHtml(p.line)}</span>` : ""}
          ${(isSeasonal || isVican) && sectionInfo ? `<span class="px-3 py-1 rounded-full text-sm font-bold text-white" style="background:${sectionInfo.accent}">${sectionInfo.icon} ${escapeHtml(sectionInfo.name)}</span>` : ""}
        </div>
        `}
      </div>

      <div>
        <div class="inline-block text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md mb-3" style="background:${brand.accent}1a;color:${brand.accent}">
          ${escapeHtml(brand.name)}${isEnrichable && p.line ? " · " + escapeHtml(p.line) : ""}
        </div>
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">${escapeHtml(displayName)}</h1>

        <div class="mt-5 flex items-baseline gap-3">
          <span class="text-3xl font-bold text-slate-900">${p.price > 0 ? fmtPrice(p.price) : "—"}</span>
          <span class="text-sm text-slate-500">χονδρική τιμή${isCosmetic && p.vat ? ` (ΦΠΑ ${p.vat}%)` : ""}</span>
        </div>

        <p class="mt-6 text-slate-700 leading-relaxed" id="description">${
          isCosmetic
            ? (enrich.description ? escapeHtml(enrich.description) : cosmeticDescription(p, brand))
            : isSeasonal
              ? (enrich.description ? escapeHtml(enrich.description) : seasonalDescription(p, brand, sectionInfo))
              : isVican
                ? escapeHtml(p.description || `Προϊόν Vican στην κατηγορία ${(sectionInfo && sectionInfo.name) || p.section}.`)
                : sunscreenDescription(p, parsed)
        }</p>

        <dl class="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          ${p.id ? `<dt class="text-slate-500">Κωδικός</dt><dd class="font-medium text-slate-800">${escapeHtml(p.id)}</dd>` : ""}
          <dt class="text-slate-500">Barcode (EAN)</dt>
          <dd class="font-mono text-slate-800">${escapeHtml(p.barcode)}</dd>
          ${isEnrichable ? `
            ${p.line ? `<dt class="text-slate-500">Γραμμή / Κατηγορία</dt><dd class="font-medium text-slate-800">${escapeHtml(p.line)}</dd>` : ""}
            ${(isSeasonal || isVican) && sectionInfo ? `<dt class="text-slate-500">Ενότητα</dt><dd class="font-medium text-slate-800">${escapeHtml(sectionInfo.name)}</dd>` : ""}
            ${p.vat ? `<dt class="text-slate-500">ΦΠΑ</dt><dd class="font-medium text-slate-800">${p.vat}%</dd>` : ""}
          ` : `
            ${parsed.spf ? `<dt class="text-slate-500">Δείκτης προστασίας</dt><dd class="font-medium text-slate-800">SPF ${parsed.spf}</dd>` : ""}
            ${parsed.volume ? `<dt class="text-slate-500">Συσκευασία</dt><dd class="font-medium text-slate-800">${parsed.volume}</dd>` : ""}
            ${parsed.types.length ? `<dt class="text-slate-500">Τύπος</dt><dd class="font-medium text-slate-800">${parsed.types.join(", ")}</dd>` : ""}
            ${parsed.areas.length ? `<dt class="text-slate-500">Περιοχή</dt><dd class="font-medium text-slate-800">${parsed.areas.join(", ")}</dd>` : ""}
            ${parsed.audience.length ? `<dt class="text-slate-500">Χαρακτηριστικά</dt><dd class="font-medium text-slate-800">${parsed.audience.join(", ")}</dd>` : ""}
          `}
          <dt class="text-slate-500">Εταιρία</dt>
          <dd class="font-medium text-slate-800">${escapeHtml(brand.name)}</dd>
        </dl>

        <div id="obf-extra" class="mt-6"></div>
      </div>
    </div>

    ${(related.length + fallbackRelated.length) ? `
      <section class="mt-16">
        <h2 class="text-xl font-bold text-slate-800 mb-4">
          ${isEnrichable && p.line
            ? `Άλλα από <span style="color:${brand.accent}">${escapeHtml(p.line)}</span>`
            : `Άλλα από ${escapeHtml(brand.name)}`}
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" id="related"></div>
      </section>
    ` : ""}
  `;

  // Hero image: local manifest first, then remote URL (vican), OBF fallback
  const heroImg = document.getElementById("hero-img");
  const ph = document.getElementById("ph");
  const heroLocal = getLocalImageUrl(p.barcode);
  const heroFallback = heroLocal || (isVican ? p.image : null);
  if (heroFallback) {
    heroImg.onload = () => { heroImg.style.opacity = "1"; ph.style.opacity = "0"; };
    heroImg.src = heroFallback;
  }
  fetchOBF(p.barcode).then(data => {
    if (!heroFallback && data) {
      const url = data.image_front_url || data.image_url;
      if (url) {
        heroImg.onload = () => { heroImg.style.opacity = "1"; ph.style.opacity = "0"; };
        heroImg.src = url;
      }
    }
    renderOBFExtra(data);
  });

  // Related products
  const relWrap = document.getElementById("related");
  if (relWrap) {
    [...related, ...fallbackRelated].forEach(r => relWrap.appendChild(miniCard(r, brand, catalog)));
  }
}

function renderOBFExtra(data) {
  const wrap = document.getElementById("obf-extra");
  if (!data) return;
  const blocks = [];
  if (data.ingredients_text && data.ingredients_text.trim()) {
    blocks.push(`
      <details class="mt-3 p-4 rounded-xl bg-slate-100">
        <summary class="cursor-pointer font-semibold text-slate-800">Συστατικά (INCI)</summary>
        <p class="mt-2 text-sm text-slate-700 leading-relaxed">${escapeHtml(data.ingredients_text)}</p>
      </details>
    `);
  }
  if (data.product_name && data.product_name.trim()) {
    blocks.unshift(`
      <div class="text-sm text-slate-500">
        <span class="font-semibold text-slate-700">Επίσημο όνομα προϊόντος:</span> ${escapeHtml(data.product_name)}
      </div>
    `);
  }
  if (blocks.length) wrap.innerHTML = `<div class="border-t pt-4">${blocks.join("")}</div>`;
}

function miniCard(p, brand, catalog) {
  const a = document.createElement("a");
  const typeParam = catalog === "cosmetic" ? "&type=cosmetic"
                  : catalog === "seasonal" ? "&type=seasonal"
                  : catalog === "vican"    ? "&type=vican"
                  : "";
  a.href = catalog === "vican"
    ? `product.html?barcode=${encodeURIComponent(p.barcode)}${typeParam}`
    : `product.html?id=${encodeURIComponent(p.id)}${typeParam}`;
  a.className = "product-card block bg-white rounded-xl overflow-hidden border border-slate-200";

  const localUrl = p.barcode ? getLocalImageUrl(p.barcode) : null;
  const remoteUrl = localUrl || (catalog === "vican" ? p.image : null);
  const initials = brand.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const isSunscreen = catalog === "sunscreen";
  const parsed = isSunscreen ? parseProduct(p) : null;

  const wrap = document.createElement("div");
  wrap.className = "aspect-square relative";
  wrap.innerHTML = `
    <div class="placeholder-bg absolute inset-0 flex items-center justify-center text-white font-bold text-xl"
         style="--accent:${brand.accent};--accent-dark:${shade(brand.accent, -20)}">
      ${initials}
    </div>
    ${remoteUrl ? `<img src="${remoteUrl}" loading="lazy" decoding="async" alt="${escapeHtml(p.name)}" class="absolute inset-0 w-full h-full object-contain p-2 bg-white" onerror="this.remove()">` : ""}
    ${isSunscreen && parsed && parsed.spf ? `<span class="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-bold rounded text-white" style="background:${brand.accent}">SPF ${parsed.spf}</span>` : ""}
  `;
  a.appendChild(wrap);

  const body = document.createElement("div");
  body.className = "p-2";
  body.innerHTML = `
    <p class="text-xs text-slate-700 line-clamp-2 leading-tight min-h-[2rem]">${escapeHtml(p.name)}</p>
    <p class="text-xs font-bold text-slate-900 mt-1">${p.price > 0 ? fmtPrice(p.price) : "—"}</p>
  `;
  a.appendChild(body);

  if (!localUrl) {
    fetchOBF(p.barcode).then(data => {
      const url = data && (data.image_front_url || data.image_url);
      if (!url) return;
      wrap.insertAdjacentHTML("beforeend",
        `<img src="${url}" loading="lazy" alt="${escapeHtml(p.name)}" class="absolute inset-0 w-full h-full object-contain p-2 bg-white">`);
    });
  }
  return a;
}

// ===== Description builders =====

function sunscreenDescription(p, parsed) {
  const intros = {
    apivita: "Από τη γραμμή Bee Sun Safe της APIVITA, εμπνευσμένη από την προστατευτική δύναμη της μέλισσας και τη φύση της Ελλάδας.",
    bioderma: "Από τη Photoderm της Bioderma με αποκλειστική τεχνολογία Cellular Bioprotection™ για ολοκληρωμένη προστασία σε κυτταρικό επίπεδο.",
    frezyderm: "Ελληνικής παραγωγής από τη Frezyderm, με ασφαλή & καινοτόμα φίλτρα και εξειδικευμένες συνθέσεις για κάθε ανάγκη.",
    freshline: "Από τη Fresh Line, εμπνευσμένη από την αρχαία ελληνική παράδοση καλλωπισμού με φυσικά συστατικά.",
    heliodor: "Από τη γραμμή Heliodor της Pharmasept, με δερματολογικά ελεγμένη σύνθεση & υψηλή φωτοπροστασία.",
    korres: "Από τη γραμμή αντηλιακών Korres με βιοενεργά συστατικά όπως Γιαούρτι, Κόκκινο Αμπέλι & Αιγαίο Bronze.",
    laroche: "Από τη La Roche-Posay Anthelios με τεχνολογία UVMune 400 για ολοκληρωμένη προστασία από UVB, UVA short & long.",
    vichy: "Από τη Vichy με Capital Soleil / Idéal Soleil, ενισχυμένο με αντιοξειδωτικά και Vichy Mineralizing Water.",
    cerave: "Από τη CeraVe, με 3 βασικά κεραμίδια & υαλουρονικό για ενίσχυση του δερματικού φραγμού.",
    luxurious: "Από τη Luxurious Suncare, ελληνική γκάμα με ολοκληρωμένη φροντίδα για πρόσωπο, σώμα και μαλλιά.",
    aderma: "Από τη γραμμή Protect / Epitheliale της A-Derma με Βρώμη Realba® για πολύ ευαίσθητο δέρμα.",
    avene: "Από την Avène με Θερμομεταλλικό Νερό Avène — καταπραϋντικό και αντι-ερεθιστικό.",
    ducray: "Από τη γραμμή Melascreen της Ducray, ειδικά για δέρμα με τάση δυσχρωμιών και υπερμελάγχρωσης.",
    svr: "Από τη γραμμή Sun Secure της SVR — υψηλή προστασία με δερματολογική σύνθεση.",
    isdin: "Από την ISDIN με τις γραμμές Fotoprotector & Fotoultra — κορυφαία ισπανική φωτοπροστασία."
  };
  const bits = [intros[p.brand] || `Προϊόν από τη γκάμα της ${BRANDS[p.brand].name}.`];
  if (parsed.spf) {
    if (parseInt(parsed.spf) >= 50) bits.push(`Πολύ υψηλή αντηλιακή προστασία (SPF ${parsed.spf}) ενάντια σε UVB και UVA ακτινοβολία.`);
    else if (parseInt(parsed.spf) >= 30) bits.push(`Υψηλή αντηλιακή προστασία (SPF ${parsed.spf}).`);
    else bits.push(`Αντηλιακή προστασία SPF ${parsed.spf}.`);
  }
  if (parsed.types.length) bits.push(`Σε υφή ${parsed.types.join(" / ").toLowerCase()}${parsed.volume ? ", συσκευασία " + parsed.volume : ""}.`);
  else if (parsed.volume) bits.push(`Συσκευασία ${parsed.volume}.`);
  if (parsed.audience.includes("Παιδικό")) bits.push("Κατάλληλο για παιδιά — ήπια & ασφαλής σύνθεση.");
  if (parsed.audience.includes("Ευαίσθητο δέρμα")) bits.push("Ειδικά για ευαίσθητο δέρμα.");
  if (parsed.audience.includes("Anti-Aging")) bits.push("Δράση κατά της φωτογήρανσης και των ρυτίδων.");
  if (parsed.audience.includes("Κατά πανάδων")) bits.push("Στοχευμένη δράση κατά των πανάδων και των δυσχρωμιών.");
  if (parsed.audience.includes("Λιπαρό/Μικτό")) bits.push("Ιδανικό για λιπαρό ή μικτό δέρμα — έλεγχος λιπαρότητας και ματ αποτέλεσμα.");
  if (parsed.audience.includes("Με χρώμα")) bits.push("Με χρωματισμό για ενιαία όψη και κάλυψη ατελειών.");
  if (parsed.audience.includes("Dry Touch")) bits.push("Λεπτόρρευστη υφή Dry Touch — απορροφάται γρήγορα χωρίς λιπαρότητα.");
  if (parsed.audience.includes("Sport")) bits.push("Ανθεκτικό σε ιδρώτα & νερό — κατάλληλο για αθλητικές δραστηριότητες.");
  if (parsed.audience.includes("Βρεγμένο δέρμα")) bits.push("Εφαρμόζεται και σε βρεγμένο δέρμα.");
  if (parsed.audience.includes("Οικογενειακό")) bits.push("Οικογενειακή συσκευασία — για όλη την οικογένεια.");
  return bits.join(" ");
}

function seasonalDescription(p, brand, sectionInfo) {
  const sectionIntros = {
    slimming: "Συμπλήρωμα/προϊόν αδυνατίσματος για ολοκληρωμένη φροντίδα σώματος.",
    insectrepel: "Εποχιακό προϊόν για προστασία ή ανακούφιση κατά τις θερινές δραστηριότητες.",
    rodenticide: "Επαγγελματικό δόλωμα κατά τρωκτικών/εντόμων."
  };
  const bits = [];
  if (sectionInfo) bits.push(sectionIntros[p.section] || `Από την κατηγορία "${sectionInfo.name}".`);
  bits.push(`Προϊόν της σειράς ${brand.name}${p.line ? " (" + p.line + ")" : ""}.`);
  return bits.join(" ");
}

function cosmeticDescription(p, brand) {
  const brandIntros = {
    vichy: "Από τη Vichy, με την αποκλειστική θερμομεταλλική σύνθεση Vichy Mineralizing Water εμπλουτισμένη με 15 ιχνοστοιχεία.",
    laroche: "Από τη La Roche-Posay με δερματολογικά ελεγμένη σύνθεση και την La Roche-Posay Thermal Spring Water.",
    cerave: "Από τη CeraVe, με 3 βασικά κεραμίδια και την τεχνολογία MVE για ενίσχυση του δερματικού φραγμού επί 24 ώρες."
  };
  const lineNotes = {
    "Liftactiv": "Από τη γραμμή Liftactiv — anti-aging με βιταμίνη C και ρετινόλη.",
    "Neovadiol": "Από τη Neovadiol — εξειδικευμένη anti-aging φροντίδα για ώριμο δέρμα.",
    "Mineral 89": "Από τη Mineral 89 — daily booster με υαλουρονικό οξύ και 89% θερμομεταλλικό νερό Vichy.",
    "Purete Thermale": "Από τη Purete Thermale — προϊόντα καθαρισμού & demaquillage.",
    "Vichy Homme": "Από τη γραμμή Vichy Homme για άνδρες.",
    "Dercos": "Από τη γραμμή Dercos — εξειδικευμένη φροντίδα τριχωτής κεφαλής & μαλλιών.",
    "Dermablend": "Από τη γραμμή Dermablend — υψηλής κάλυψης corrective makeup.",
    "Capital Soleil": "Από τη Capital Soleil — αντηλιακή και αντι-φωτογηραντική προστασία.",
    "Effaclar": "Από τη γραμμή Effaclar — λιπαρό δέρμα με τάση ακμής.",
    "Toleriane": "Από τη γραμμή Toleriane — εξαιρετικά ευαίσθητο δέρμα.",
    "Toleriane Makeup": "Από τη Toleriane Makeup — υποαλλεργικό makeup για ευαίσθητο δέρμα.",
    "Cicaplast": "Από τη Cicaplast — επανορθωτική φροντίδα με Panthenol και Madecassoside.",
    "Lipikar": "Από τη Lipikar — ξηρό προς ατοπικό δέρμα.",
    "LIPIKAR": "Από τη Lipikar — ξηρό προς ατοπικό δέρμα.",
    "Hyalu B5": "Από τη Hyalu B5 — anti-aging φόρμουλα με υαλουρονικό οξύ και Β5.",
    "Mela B3": "Από τη Mela B3 — στοχευμένη φροντίδα κατά των πανάδων και δυσχρωμιών με Melasyl™.",
    "Retinol LRP": "Από τη γραμμή Retinol — pure retinol για ανανέωση επιδερμίδας.",
    "Anthelios": "Από την Anthelios — υψηλή αντηλιακή προστασία UVMune 400.",
    "Pure Vitamin C": "Από τη Pure Vitamin C — antioxidant brightening με 10% καθαρή Βιταμίνη C.",
    "Hyaluronic Acid Serum": "Hydrating serum με υαλουρονικό για ενυδάτωση και αναπλήρωση.",
    "Hydrating Cleanser": "Καθαρισμός χωρίς να αφυδατώνει — με κεραμίδια και υαλουρονικό.",
    "Hydrating Sunscreen": "Αντηλιακή προστασία με ενυδάτωση 24 ωρών.",
    "Moisturizing Cream + Lotion": "Πλούσια ενυδάτωση επί 24 ώρες με 3 κεραμίδια.",
    "Facial Moisturizers": "Καθημερινή ενυδάτωση προσώπου με κεραμίδια.",
    "Skin Renewal Anti-Aging": "Anti-aging φροντίδα με ρετινόλη και κεραμίδια.",
    "SA": "Με σαλικυλικό οξύ — απολέπιση και smoothing για τραχύ δέρμα.",
    "Acne": "Στοχευμένη φροντίδα για δέρμα με τάση ακμής."
  };
  const bits = [];
  bits.push(brandIntros[p.brand] || `Προϊόν από τη γκάμα της ${brand.name}.`);
  if (p.line && lineNotes[p.line]) bits.push(lineNotes[p.line]);
  else if (p.line) bits.push(`Από τη γραμμή ${p.line}.`);
  return bits.join(" ");
}
